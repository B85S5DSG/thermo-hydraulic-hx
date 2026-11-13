function isDarkTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function applyThemeMode(mode) {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = (mode === "auto") ? (prefersDark ? "dark" : "light") : mode;
  document.documentElement.setAttribute("data-theme", resolved);
  ["Auto", "Light", "Dark"].forEach(label => {
    const btn = document.getElementById("btnTheme" + label);
    if (btn) btn.classList.toggle("active", mode === label.toLowerCase());
  });
}

function setThemeMode(mode) {
  localStorage.setItem("hxThemeMode", mode);
  applyThemeMode(mode);
  if (typeof lastCalcData !== "undefined" && lastCalcData) {
    renderAll(lastCalcData);
  } else {
    runCalc();
  }
}

if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem("hxThemeMode") || "auto") === "auto") {
      applyThemeMode("auto");
      if (typeof lastCalcData !== "undefined" && lastCalcData) {
        renderAll(lastCalcData);
      } else {
        runCalc();
      }
    }
  });
}

let unitSystem = "metric"; // "metric" | "imperial"
let pipeMaterialsMap = {};
let calcTimeout = null;

// Unit conversion helpers
const MM_PER_IN = 25.4;
const M_PER_FT = 0.3048;
const W_PER_BTUHR = 0.29307107;
const PA_PER_PSI = 6894.757;
const PA_PER_INH2O = 249.0889;

function cToF(c) { return (c * 9.0 / 5.0) + 32.0; }
function fToC(f) { return (f - 32.0) * 5.0 / 9.0; }

function setUnitSystem(newSys) {
  if (newSys === unitSystem) return;
  const toImp = (newSys === "imperial");

  const convInput = (id, factor, decimals) => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = parseFloat(el.value);
    if (!isNaN(v)) {
      el.value = (toImp ? v / factor : v * factor).toFixed(decimals);
    }
  };

  convInput("inDi", MM_PER_IN, 3);
  convInput("inWall", MM_PER_IN, 3);
  convInput("inL", M_PER_FT, 2);
  convInput("inEps", MM_PER_IN, 5);
  convInput("inV", M_PER_FT, 1);
  convInput("inFinDia", MM_PER_IN, 3);
  convInput("inFinThick", MM_PER_IN, 4);
  convInput("inFinPitch", MM_PER_IN, 3);
  convInput("inShellDi", MM_PER_IN, 3);

  ["inTin", "inTinf", "inShellTin"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = parseFloat(el.value);
    if (!isNaN(v)) {
      el.value = (toImp ? cToF(v) : fToC(v)).toFixed(1);
    }
  });

  unitSystem = newSys;
  document.getElementById("btnMetric").classList.toggle("active", !toImp);
  document.getElementById("btnImperial").classList.toggle("active", toImp);

  document.getElementById("lblDi").textContent = toImp ? "Inner Dia, D_i (in):" : "Inner Dia, D_i (mm):";
  document.getElementById("lblWall").textContent = toImp ? "Wall Thick, t (in):" : "Wall Thick, t (mm):";
  document.getElementById("lblL").textContent = toImp ? "Active Length, L (ft):" : "Active Length, L (m):";
  document.getElementById("lblEps").textContent = toImp ? "Roughness, \u03B5 (in):" : "Roughness, \u03B5 (mm):";
  document.getElementById("lblTin").innerHTML = toImp ? "Inlet Temp, T_in (&deg;F):" : "Inlet Temp, T_in (&deg;C):";
  document.getElementById("lblV").textContent = toImp ? "Duct Air Velocity (ft/s):" : "Duct Air Velocity (m/s):";
  document.getElementById("lblTinf").innerHTML = toImp ? "Ambient Air, T_&infin; (&deg;F):" : "Ambient Air, T_&infin; (&deg;C):";
  document.getElementById("lblFinDia").textContent = toImp ? "Fin Outer Dia, D_fin (in):" : "Fin Outer Dia, D_fin (mm):";
  document.getElementById("lblFinThick").textContent = toImp ? "Fin Thickness, t_fin (in):" : "Fin Thickness, t_fin (mm):";
  document.getElementById("lblFinPitch").textContent = toImp ? "On-Center Spacing (in):" : "On-Center Spacing (mm):";
  document.getElementById("lblShellDi").textContent = toImp ? "Outer Shell ID, D_s (in):" : "Outer Shell ID, D_s (mm):";
  document.getElementById("lblShellTin").innerHTML = toImp ? "Shell Inlet T_s,in (&deg;F):" : "Shell Inlet T_s,in (&deg;C):";

  document.getElementById("optSweepWall").textContent = toImp ? "Pipe Wall Thickness t (in)" : "Pipe Wall Thickness t (mm)";
  document.getElementById("optSweepVair").textContent = toImp ? "External Air Approach Velocity (ft/s)" : "External Air Approach Velocity (m/s)";

  runCalc();
}

function onHxTypeChange() {
  const hxType = document.getElementById("inHxType").value;
  const isShellSide = (hxType === "double_pipe" || hxType === "multi_tube");
  const isMulti = (hxType === "multi_tube");

  document.getElementById("flowDirBox").style.display = isShellSide ? "block" : "none";
  document.getElementById("nTubesBox").style.display = isMulti ? "grid" : "none";
  document.getElementById("airSideSection").style.display = isShellSide ? "none" : "block";
  document.getElementById("shellSideSection").style.display = isShellSide ? "block" : "none";

  const optVair = document.getElementById("optSweepVair");
  if (optVair) {
    optVair.disabled = isShellSide;
    if (isShellSide && document.getElementById("xMode").value === "V_air") {
      document.getElementById("xMode").value = "Re_i";
    }
  }

  document.getElementById("secTitleSecondary").textContent = isShellSide
    ? "Outer Shell Side"
    : "External Air & Shroud";
  document.getElementById("lblSecRow1").textContent = isShellSide
    ? "Shell Outlet Temp:"
    : "Fins & Duct Shroud:";
  document.getElementById("lblSecRow2").textContent = isShellSide
    ? "Shell Pressure Drop:"
    : "Air Pressure Drop:";
  document.getElementById("lblSecRow3").textContent = isShellSide
    ? "Shell Friction (f_o):"
    : "Bundle Loss Coeff:";
  document.getElementById("lblSecRow4").textContent = isShellSide
    ? "Shell Pump Power:"
    : "Fan Elec Power:";

  validateShellDia();
  runCalc();
}

function validateFinDia() {
  const di = parseFloat(document.getElementById("inDi").value) || 0;
  const wall = parseFloat(document.getElementById("inWall").value) || 0;
  const doVal = di + 2.0 * wall;
  const finEl = document.getElementById("inFinDia");
  if (finEl && parseFloat(finEl.value) <= doVal) {
    const margin = (unitSystem === "imperial") ? 0.1 : 2.0;
    finEl.value = (doVal + margin).toFixed(unitSystem === "imperial" ? 3 : 1);
  }
  validateShellDia();
}

function validateShellDia() {
  const hxType = document.getElementById("inHxType").value;
  const nt = (hxType === "multi_tube") ? Math.max(2, parseInt(document.getElementById("inNTubes").value) || 7) : 1;
  const pr = parseFloat(document.getElementById("inPitchRatio")?.value) || 1.25;
  const di = parseFloat(document.getElementById("inDi").value) || 0;
  const wall = parseFloat(document.getElementById("inWall").value) || 0;
  const doVal = di + 2.0 * wall;

  // Approximate TEMA triangular bundle OTL + clearance
  const minShell = (nt === 1)
    ? doVal + ((unitSystem === "imperial") ? 0.25 : 6.0)
    : doVal * pr * Math.sqrt(nt * 1.15) + ((unitSystem === "imperial") ? 0.35 : 8.0);

  const shellEl = document.getElementById("inShellDi");
  if (shellEl && parseFloat(shellEl.value) < minShell) {
    shellEl.value = minShell.toFixed(unitSystem === "imperial" ? 3 : 1);
  }
}

function toggleFinInputs() {
  const enabled = document.getElementById("inUseFins").checked;
  const box = document.getElementById("finControls");
  if (box) box.style.opacity = enabled ? "1.0" : "0.45";
  validateFinDia();
  runCalc();
}

function onFluidChange() {
  const fluid = document.getElementById("inFluid").value.toLowerCase();
  const isOil = ["xom", "dow", "t66", "t72", "syl", "s800", "pbb", "pcl", "phe", "phr", "pmr"].some(k => fluid.includes(k));
  document.getElementById("inEta").value = isOil ? "82" : "72";
  runCalc();
}

function onShellFluidChange() {
  const fluid = document.getElementById("inShellFluid").value.toLowerCase();
  const isOil = ["xom", "dow", "t66", "t72", "syl", "s800", "pbb", "pcl", "phe", "phr", "pmr"].some(k => fluid.includes(k));
  document.getElementById("inShellEta").value = isOil ? "82" : "72";
  runCalc();
}

function onPumpStyleChange(side) {
  const isShell = (side === "shell");
  const style = document.getElementById(isShell ? "inShellPumpType" : "inPumpType").value;
  const etaEl = document.getElementById(isShell ? "inShellEta" : "inEta");
  if (style === "positive_displacement") {
    etaEl.value = "82";
  } else if (style === "centrifugal") {
    etaEl.value = "72";
  } else {
    const fluid = document.getElementById(isShell ? "inShellFluid" : "inFluid").value.toLowerCase();
    const isOil = ["xom", "dow", "t66", "t72", "syl", "s800", "pbb", "pcl", "phe", "phr", "pmr"].some(k => fluid.includes(k));
    etaEl.value = isOil ? "82" : "72";
  }
  runCalc();
}

function runCalc() {
  clearTimeout(calcTimeout);
  calcTimeout = setTimeout(() => fetchFromBackend(false), 60);
}

function downloadHistoryCsv() {
  window.location.href = "/api/download-csv";
}

async function fetchFromBackend(saveSnapshot) {
  const isImp = (unitSystem === "imperial");
  const lenFactor = isImp ? MM_PER_IN : 1.0;

  const di_mm = (parseFloat(document.getElementById("inDi").value) || 25.0) * lenFactor;
  const wall_mm = (parseFloat(document.getElementById("inWall").value) || 2.0) * lenFactor;
  const L_m = (parseFloat(document.getElementById("inL").value) || 2.0) * (isImp ? M_PER_FT : 1.0);
  const eps_mm = (parseFloat(document.getElementById("inEps").value) || 0.0015) * lenFactor;

  const tin_val = parseFloat(document.getElementById("inTin").value) || 80.0;
  const tinf_val = parseFloat(document.getElementById("inTinf").value) || 20.0;
  const shell_tin_val = parseFloat(document.getElementById("inShellTin").value) || 20.0;

  const payload = {
    hx_type: document.getElementById("inHxType").value,
    flow_direction: document.getElementById("inFlowDir").value,
    n_tubes: Math.max(1, parseInt(document.getElementById("inNTubes").value) || 7),
    pitch_ratio: parseFloat(document.getElementById("inPitchRatio")?.value) || 1.25,
    mat: document.getElementById("inMat").value || "cu",
    Di: di_mm / 1000.0,
    wall: wall_mm / 1000.0,
    L: L_m,
    eps_mm: eps_mm,
    fluid: document.getElementById("inFluid").value || "Water",
    flow_val: parseFloat(document.getElementById("inFlow").value) || 10.0,
    flow_unit: document.getElementById("inFlowUnit").value,
    Tin: isImp ? fToC(tin_val) : tin_val,
    eta_pct: parseFloat(document.getElementById("inEta").value) || 72.0,
    inner_pump_type: document.getElementById("inPumpType").value || "auto",
    V_air: (parseFloat(document.getElementById("inV").value) || 0.0) * (isImp ? M_PER_FT : 1.0),
    Tinf: isImp ? fToC(tinf_val) : tinf_val,
    eta_fan_pct: parseFloat(document.getElementById("inEtaFan").value) || 65.0,
    use_fins: document.getElementById("inUseFins").checked,
    fin_dia_mm: (parseFloat(document.getElementById("inFinDia").value) || 55.0) * lenFactor,
    fin_thick_mm: (parseFloat(document.getElementById("inFinThick").value) || 0.5) * lenFactor,
    fin_pitch_mm: (parseFloat(document.getElementById("inFinPitch").value) || 3.0) * lenFactor,
    duct_margin_pct: parseFloat(document.getElementById("inDuctMargin").value) || 15.0,
    shell_Di_mm: (parseFloat(document.getElementById("inShellDi").value) || 45.0) * lenFactor,
    shell_fluid: document.getElementById("inShellFluid").value || "Water",
    shell_flow_val: parseFloat(document.getElementById("inShellFlow").value) || 15.0,
    shell_flow_unit: document.getElementById("inShellFlowUnit").value,
    shell_Tin: isImp ? fToC(shell_tin_val) : shell_tin_val,
    eta_shell_pct: parseFloat(document.getElementById("inShellEta").value) || 72.0,
    shell_pump_type: document.getElementById("inShellPumpType").value || "auto",
    x_mode: document.getElementById("xMode").value,
    save_snapshot: !!saveSnapshot
  };

  try {
    const res = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return;
    const data = await res.json();

    if (saveSnapshot) {
      const msg = document.getElementById("saveMsg");
      msg.style.display = "inline-block";
      setTimeout(() => { msg.style.display = "none"; }, 2500);
    }

    updateUIAndPlots(payload, data.current, data.sweep, data.crit_flow);
  } catch (err) {
    console.error("Calculation error:", err);
  }
}

function fmtHeat(watts, isImp) {
  if (isImp) return (watts / W_PER_BTUHR).toFixed(0) + " BTU/hr";
  return watts.toFixed(1) + " W";
}

function fmtPower(watts, isImp) {
  if (isImp) return (watts / 745.69987).toFixed(3) + " hp (" + watts.toFixed(1) + " W)";
  return watts.toFixed(2) + " W";
}

function fmtTemp(c, isImp) {
  return isImp ? cToF(c).toFixed(2) + " \u00B0F" : c.toFixed(2) + " \u00B0C";
}

function fmtDeltaT(dc, isImp) {
  return isImp ? (dc * 9.0 / 5.0).toFixed(2) + " \u00B0F" : dc.toFixed(2) + " \u00B0C";
}

function fmtDim(mm, isImp) {
  return isImp ? (mm / MM_PER_IN).toFixed(2) + "\"" : mm.toFixed(1) + " mm";
}

// Generate concentric 30-degree triangular tube centers for multi-tube bundles
function generateTriangularBundleCenters(nTubes, pitchPx) {
  const centers = [{ x: 0, y: 0 }];
  if (nTubes <= 1) return centers;

  // Generate hex-ring lattice points up to sufficient radius
  const maxRing = Math.ceil(Math.sqrt(nTubes)) + 3;
  const candidates = [];
  const dx = pitchPx;
  const dy = pitchPx * Math.sin(Math.PI / 3);

  for (let row = -maxRing; row <= maxRing; row++) {
    for (let col = -maxRing; col <= maxRing; col++) {
      if (row === 0 && col === 0) continue;
      const x = (col + (Math.abs(row) % 2 === 1 ? 0.5 : 0)) * dx;
      const y = row * dy;
      const r2 = x * x + y * y;
      candidates.push({ x, y, r2 });
    }
  }

  // Sort strictly by radial distance from center so bundle forms a circular OTL
  candidates.sort((a, b) => a.r2 - b.r2);
  for (let i = 0; i < nTubes - 1 && i < candidates.length; i++) {
    centers.push({ x: candidates[i].x, y: candidates[i].y });
  }
  return centers;
}

function renderCrossSectionSchematic(req, cur) {
  const svg = document.getElementById("hxSchematicSvg");
  if (!svg) return;

  const isImp = (unitSystem === "imperial");
  const isShellSide = (req.hx_type === "double_pipe" || req.hx_type === "multi_tube");
  const W = 380, H = 210;
  const cx = 132, cy = 105; // Shift circle left to give clean room for right-side dimension leaders
  const maxDrawR = 84;

  const Di_mm = req.Di * 1000.0;
  const Do_mm = cur.Do * 1000.0;

  // Material color palette
  const matColors = {
    cu: { fill: "#d97706", stroke: "#92400e", fin: "#f59e0b" },
    al: { fill: "#94a3b8", stroke: "#475569", fin: "#cbd5e1" },
    ss: { fill: "#64748b", stroke: "#334155", fin: "#94a3b8" },
  };
  const mc = matColors[req.mat] || matColors.cu;

  let parts = [];

  // Subtle CAD grid background
  parts.push(`<defs>
    <pattern id="cadGrid" width="15" height="15" patternUnits="userSpaceOnUse">
      <path d="M 15 0 L 0 0 0 15" fill="none" stroke="${isDarkTheme() ? "#1e293b" : "#f1f5f9"}" stroke-width="1"/>
    </pattern>
  </defs>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#cadGrid)"/>`);

  if (isShellSide) {
    const nt = (req.hx_type === "multi_tube") ? Math.max(1, cur.n_tubes || req.n_tubes) : 1;
    const Ds_mm = cur.D_shell_i * 1000.0;
    const shellWall_mm = Math.max(2.0, Ds_mm * 0.045);
    const outerBoundary_mm = Ds_mm + 2.0 * shellWall_mm;

    const pxPerMm = (maxDrawR * 2.0) / outerBoundary_mm;
    const rShellOut = (outerBoundary_mm / 2.0) * pxPerMm;
    const rShellIn = (Ds_mm / 2.0) * pxPerMm;
    const rTubeOut = Math.max(2.2, (Do_mm / 2.0) * pxPerMm);
    const rTubeIn = Math.max(1.2, (Di_mm / 2.0) * pxPerMm);

    // 1. Outer Shell Wall & Shell Fluid Annulus
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${rShellOut.toFixed(1)}" fill="${isDarkTheme() ? "#94a3b8" : "#475569"}" stroke="#1e293b" stroke-width="1.2"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${rShellIn.toFixed(1)}" fill="${isDarkTheme() ? "#0c4a6e" : "#e0f2fe"}" stroke="#0284c7" stroke-width="1"/>`);

    // 2. Inner Tubes (1 for double_pipe, N for multi_tube)
    const pitch_mm = Do_mm * (req.pitch_ratio || 1.25);
    const pitchPx = pitch_mm * pxPerMm;
    const centers = generateTriangularBundleCenters(nt, pitchPx);

    // Sync input box if solver enforced a larger minimum TEMA shell diameter
    const shellInput = document.getElementById("inShellDi");
    if (shellInput && Math.abs((parseFloat(shellInput.value) || 0) - (isImp ? Ds_mm / MM_PER_IN : Ds_mm)) > 0.2) {
      shellInput.value = isImp ? (Ds_mm / MM_PER_IN).toFixed(3) : Ds_mm.toFixed(1);
    }

    // Keep tubes strictly separated (never overlapping) inside rShellIn
    let maxRCenter = 0;
    centers.forEach(pt => {
      const dist = Math.hypot(pt.x, pt.y);
      if (dist > maxRCenter) maxRCenter = dist;
    });
    const maxAllowCenter = Math.max(rTubeOut * 1.15, rShellIn - rTubeOut - 1.5);
    const fitScale = (maxRCenter > maxAllowCenter && maxRCenter > 0) ? (maxAllowCenter / maxRCenter) : 1.0;

    centers.forEach(pt => {
      const tx = cx + pt.x * fitScale;
      const ty = cy + pt.y * fitScale;
      parts.push(`<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${rTubeOut.toFixed(1)}" fill="${mc.fill}" stroke="${mc.stroke}" stroke-width="0.8"/>`);
      parts.push(`<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${rTubeIn.toFixed(1)}" fill="#3b82f6"/>`);
    });

    // 3. Centerlines
    parts.push(`<line x1="${cx - rShellOut - 6}" y1="${cy}" x2="${cx + rShellOut + 6}" y2="${cy}" stroke="#94a3b8" stroke-width="0.7" stroke-dasharray="4,3"/>`);
    parts.push(`<line x1="${cx}" y1="${cy - rShellOut - 6}" x2="${cx}" y2="${cy + rShellOut + 6}" stroke="#94a3b8" stroke-width="0.7" stroke-dasharray="4,3"/>`);

    // 4. Right-Side Dimension Callouts
    const dimX = 248;
    // Shell ID dimension
    parts.push(`<line x1="${cx}" y1="${cy - rShellIn}" x2="${dimX + 12}" y2="${cy - rShellIn}" stroke="${isDarkTheme() ? "#e2e8f0" : "#0f172a"}" stroke-width="0.8" stroke-dasharray="2,2"/>`);
    parts.push(`<line x1="${cx}" y1="${cy + rShellIn}" x2="${dimX + 12}" y2="${cy + rShellIn}" stroke="${isDarkTheme() ? "#e2e8f0" : "#0f172a"}" stroke-width="0.8" stroke-dasharray="2,2"/>`);
    parts.push(`<line x1="${dimX}" y1="${cy - rShellIn}" x2="${dimX}" y2="${cy + rShellIn}" stroke="${isDarkTheme() ? "#e2e8f0" : "#0f172a"}" stroke-width="1.1"/>`);
    parts.push(`<polygon points="${dimX},${cy - rShellIn} ${dimX - 3},${cy - rShellIn + 5} ${dimX + 3},${cy - rShellIn + 5}" fill="${isDarkTheme() ? "#f1f5f9" : "#0f172a"}"/>`);
    parts.push(`<polygon points="${dimX},${cy + rShellIn} ${dimX - 3},${cy + rShellIn - 5} ${dimX + 3},${cy + rShellIn - 5}" fill="${isDarkTheme() ? "#f1f5f9" : "#0f172a"}"/>`);

    parts.push(`<text x="${dimX + 8}" y="${cy - 22}" font-size="10.5" font-weight="700" fill="${isDarkTheme() ? "#f1f5f9" : "#0f172a"}">Ds = ${fmtDim(Ds_mm, isImp)}</text>`);
    parts.push(`<text x="${dimX + 8}" y="${cy - 6}" font-size="10" fill="${isDarkTheme() ? "#60a5fa" : "#1d4ed8"}" font-weight="600">Di = ${fmtDim(Di_mm, isImp)}</text>`);
    parts.push(`<text x="${dimX + 8}" y="${cy + 9}" font-size="10" fill="${isDarkTheme() ? "#fbbf24" : "#92400e"}" font-weight="600">Do = ${fmtDim(Do_mm, isImp)}</text>`);
    if (nt > 1) {
      parts.push(`<text x="${dimX + 8}" y="${cy + 25}" font-size="10" fill="${isDarkTheme() ? "#94a3b8" : "#475569"}">N = ${nt} tubes</text>`);
      parts.push(`<text x="${dimX + 8}" y="${cy + 39}" font-size="10" fill="${isDarkTheme() ? "#94a3b8" : "#475569"}">PT = ${fmtDim(pitch_mm, isImp)}</text>`);
    } else {
      parts.push(`<text x="${dimX + 8}" y="${cy + 25}" font-size="10" fill="${isDarkTheme() ? "#94a3b8" : "#475569"}">Gap = ${fmtDim((Ds_mm - Do_mm) / 2.0, isImp)}</text>`);
    }

    document.getElementById("schematicScaleLbl").textContent = `1 px = ${(1 / pxPerMm).toFixed(2)} mm`;
    document.getElementById("schematicLegend").innerHTML = `
      <span><span class="legend-dot" style="background:#3b82f6;"></span>Tube Fluid</span>
      <span><span class="legend-dot" style="background:${mc.fill};"></span>Tube Wall</span>
      <span><span class="legend-dot" style="background:#e0f2fe; border:1px solid #0284c7;"></span>Shell Fluid</span>
    `;

    // Update companion summary cards
    document.getElementById("lblGeomStat1").textContent = "Active Shell ID (Ds)";
    document.getElementById("valGeomStat1").textContent = fmtDim(Ds_mm, isImp);
    document.getElementById("lblGeomStat2").textContent = nt > 1 ? `Bundle (${nt} Tubes)` : "Single Inner Tube";
    document.getElementById("valGeomStat2").textContent = `${fmtDim(Di_mm, isImp)} ID / ${fmtDim(Do_mm, isImp)} OD`;
    document.getElementById("lblGeomStat3").textContent = "Shell Free Area";
    document.getElementById("valGeomStat3").textContent = `${(cur.free_space_pct || 0).toFixed(1)}% free`;

  } else {
    // FINNED PIPE IN SHROUDED DUCT
    const finDia_mm = req.use_fins ? (cur.eff_fin_dia_mm || req.fin_dia_mm) : Do_mm;
    const shroud_mm = cur.H_duct_mm || (finDia_mm * (1 + req.duct_margin_pct / 100.0));
    const pxPerMm = (maxDrawR * 2.0) / shroud_mm;

    const rShroud = (shroud_mm / 2.0) * pxPerMm;
    const rFin = (finDia_mm / 2.0) * pxPerMm;
    const rTubeOut = Math.max(3.0, (Do_mm / 2.0) * pxPerMm);
    const rTubeIn = Math.max(1.5, (Di_mm / 2.0) * pxPerMm);

    // 1. Shroud Duct Cross-Section (Square/Circular shroud envelope)
    parts.push(`<rect x="${(cx - rShroud).toFixed(1)}" y="${(cy - rShroud).toFixed(1)}" width="${(rShroud * 2).toFixed(1)}" height="${(rShroud * 2).toFixed(1)}" rx="6" fill="${isDarkTheme() ? "#082f49" : "#f0f9ff"}" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="5,3"/>`);

    // 2. Radial Fin Disc (if enabled)
    if (req.use_fins) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${rFin.toFixed(1)}" fill="${mc.fin}" fill-opacity="0.35" stroke="${mc.stroke}" stroke-width="1.1"/>`);
    }

    // 3. Pipe Wall & Inner Fluid Bore
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${rTubeOut.toFixed(1)}" fill="${mc.fill}" stroke="${mc.stroke}" stroke-width="1"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${rTubeIn.toFixed(1)}" fill="#3b82f6"/>`);

    // 4. Centerlines
    parts.push(`<line x1="${cx - rShroud - 6}" y1="${cy}" x2="${cx + rShroud + 6}" y2="${cy}" stroke="#94a3b8" stroke-width="0.7" stroke-dasharray="4,3"/>`);
    parts.push(`<line x1="${cx}" y1="${cy - rShroud - 6}" x2="${cx}" y2="${cy + rShroud + 6}" stroke="#94a3b8" stroke-width="0.7" stroke-dasharray="4,3"/>`);

    // 5. Dimension Callouts
    const dimX = 248;
    parts.push(`<line x1="${cx + rShroud}" y1="${cy - rShroud}" x2="${dimX + 12}" y2="${cy - rShroud}" stroke="#0284c7" stroke-width="0.8" stroke-dasharray="2,2"/>`);
    parts.push(`<line x1="${cx + rShroud}" y1="${cy + rShroud}" x2="${dimX + 12}" y2="${cy + rShroud}" stroke="#0284c7" stroke-width="0.8" stroke-dasharray="2,2"/>`);
    parts.push(`<line x1="${dimX}" y1="${cy - rShroud}" x2="${dimX}" y2="${cy + rShroud}" stroke="#0284c7" stroke-width="1.1"/>`);
    parts.push(`<polygon points="${dimX},${cy - rShroud} ${dimX - 3},${cy - rShroud + 5} ${dimX + 3},${cy - rShroud + 5}" fill="#0284c7"/>`);
    parts.push(`<polygon points="${dimX},${cy + rShroud} ${dimX - 3},${cy + rShroud - 5} ${dimX + 3},${cy + rShroud - 5}" fill="#0284c7"/>`);

    parts.push(`<text x="${dimX + 8}" y="${cy - 22}" font-size="10.5" font-weight="700" fill="${isDarkTheme() ? "#38bdf8" : "#0284c7"}">Duct = ${fmtDim(shroud_mm, isImp)}</text>`);
    if (req.use_fins) {
      parts.push(`<text x="${dimX + 8}" y="${cy - 6}" font-size="10" fill="${isDarkTheme() ? "#fcd34d" : "#b45309"}" font-weight="600">Dfin = ${fmtDim(finDia_mm, isImp)}</text>`);
    }
    parts.push(`<text x="${dimX + 8}" y="${cy + 9}" font-size="10" fill="${isDarkTheme() ? "#fbbf24" : "#92400e"}" font-weight="600">Do = ${fmtDim(Do_mm, isImp)}</text>`);
    parts.push(`<text x="${dimX + 8}" y="${cy + 24}" font-size="10" fill="${isDarkTheme() ? "#60a5fa" : "#1d4ed8"}" font-weight="600">Di = ${fmtDim(Di_mm, isImp)}</text>`);

    document.getElementById("schematicScaleLbl").textContent = `1 px = ${(1 / pxPerMm).toFixed(2)} mm`;
    document.getElementById("schematicLegend").innerHTML = `
      <span><span class="legend-dot" style="background:#3b82f6;"></span>Liquid</span>
      <span><span class="legend-dot" style="background:${mc.fill};"></span>Pipe Wall</span>
      ${req.use_fins ? `<span><span class="legend-dot" style="background:${mc.fin};"></span>Radial Fin</span>` : ""}
      <span><span class="legend-dot" style="background:#f0f9ff; border:1px dashed #0284c7;"></span>Air Duct</span>
    `;

    document.getElementById("lblGeomStat1").textContent = "Shroud Duct Width";
    document.getElementById("valGeomStat1").textContent = fmtDim(shroud_mm, isImp);
    document.getElementById("lblGeomStat2").textContent = req.use_fins ? "Fin / Pipe OD" : "Bare Pipe OD";
    document.getElementById("valGeomStat2").textContent = req.use_fins
      ? `${fmtDim(finDia_mm, isImp)} / ${fmtDim(Do_mm, isImp)}`
      : fmtDim(Do_mm, isImp);
    document.getElementById("lblGeomStat3").textContent = "Radial Clearance";
    document.getElementById("valGeomStat3").textContent = fmtDim((shroud_mm - finDia_mm) / 2.0, isImp);
  }

  svg.innerHTML = parts.join("");
}

function updateUIAndPlots(req, cur, sweep, critFlow) {
  const isImp = (unitSystem === "imperial");
  const isShellSide = (req.hx_type === "double_pipe" || req.hx_type === "multi_tube");

  // Render live to-scale cross-section schematic
  renderCrossSectionSchematic(req, cur);

  document.getElementById("outTout").textContent = fmtTemp(cur.Tout, isImp);
  document.getElementById("outDT").textContent = fmtDeltaT(cur.Tout - req.Tin, isImp);
  document.getElementById("outQ").textContent = fmtHeat(cur.Q, isImp);
  document.getElementById("outUA").textContent = isImp
    ? ((cur.UA / W_PER_BTUHR) * (5.0 / 9.0)).toFixed(2) + " BTU/hr\u00B7\u00B0F"
    : cur.UA.toFixed(2) + " W/K";

  const qNetEl = document.getElementById("outQnet");
  qNetEl.innerHTML = fmtHeat(cur.Q_net, isImp) + (cur.Q_net < 0 ? " <span style='color:#dc2626;font-size:12px;'>(NET HEATING)</span>" : "");
  document.getElementById("outEff").textContent = cur.eff_net.toFixed(2) + "%";
  const parasiticPct = cur.Q > 1e-6 ? (cur.P_tot_elec / cur.Q) * 100.0 : 0.0;
  document.getElementById("outCOPsys").textContent = parasiticPct < 0.1 ? parasiticPct.toFixed(3) + "%" : parasiticPct.toFixed(2) + "%";
  document.getElementById("outPtotSummary").textContent = cur.P_tot_elec.toFixed(1) + " W";

  const badge = document.getElementById("pumpBadge");
  const isPD = cur.pumpInfo.pumpType.toLowerCase().includes("positive");
  badge.className = "pump-badge" + (isPD ? " pd" : "");
  badge.innerHTML = "<b>Active Inner Pump:</b> " + cur.pumpInfo.pumpType + "<br>" + cur.pumpInfo.desc;

  const shellBadge = document.getElementById("shellPumpBadge");
  if (shellBadge) {
    if (isShellSide && cur.shellPumpInfo) {
      const shellIsPD = cur.shellPumpInfo.pumpType.toLowerCase().includes("positive");
      shellBadge.className = "pump-badge" + (shellIsPD ? " pd" : "");
      shellBadge.style.display = "block";
      shellBadge.innerHTML =
        "<b>Active Shell Pump:</b> " + cur.shellPumpInfo.pumpType + "<br>" + cur.shellPumpInfo.desc;
    } else {
      shellBadge.style.display = "none";
    }
  }

  document.getElementById("outPumpType").textContent = isPD ? "Pos. Displacement" : "Centrifugal Impeller";
  document.getElementById("outVisc").textContent = cur.pumpInfo.nu_cSt.toFixed(2) + " cSt";
  document.getElementById("outEtaAct").textContent = (cur.pumpInfo.eta_actual * 100).toFixed(1) + "%";
  document.getElementById("outDP").textContent = isImp
    ? (cur.dP / PA_PER_PSI).toFixed(3) + " psi"
    : (cur.dP >= 1000 ? (cur.dP / 1000).toFixed(2) + " kPa" : cur.dP.toFixed(1) + " Pa");
  document.getElementById("outF").textContent = cur.f_darcy.toFixed(4);
  document.getElementById("outPhyd").textContent = fmtPower(cur.P_hyd, isImp);
  document.getElementById("outPpump").textContent = fmtPower(cur.P_pump, isImp);

  if (isShellSide) {
    const sDia = isImp ? ((cur.D_shell_i * 1000) / MM_PER_IN).toFixed(2) + "in" : (cur.D_shell_i * 1000).toFixed(1) + "mm";
    document.getElementById("outFinSummary").textContent = fmtTemp(cur.Tout_shell, isImp) + " (Ds=" + sDia + ")";
    document.getElementById("outDPair").textContent = isImp
      ? (cur.dP_air / PA_PER_PSI).toFixed(3) + " psi"
      : (cur.dP_air >= 1000 ? (cur.dP_air / 1000).toFixed(2) + " kPa" : cur.dP_air.toFixed(1) + " Pa");
  } else {
    if (req.use_fins) {
      const finDiaDisp = isImp ? ((cur.eff_fin_dia_mm || req.fin_dia_mm) / MM_PER_IN).toFixed(2) + "in" : (cur.eff_fin_dia_mm || req.fin_dia_mm).toFixed(1) + "mm";
      document.getElementById("outFinSummary").innerHTML =
        cur.n_fins + " fins (D=" + finDiaDisp + ", &eta;=" + (cur.eta_fin * 100).toFixed(0) + "%)";
    } else {
      document.getElementById("outFinSummary").textContent = "Bare Pipe (Shrouded)";
    }
    document.getElementById("outDPair").textContent = isImp
      ? (cur.dP_air / PA_PER_INH2O).toFixed(3) + " inH2O"
      : cur.dP_air.toFixed(1) + " Pa";
  }

  document.getElementById("outCD").textContent = cur.CD.toFixed(3);
  document.getElementById("outPfan").textContent = fmtPower(cur.P_fan, isImp);
  document.getElementById("outReO").textContent = Math.round(cur.Re_o).toLocaleString();
  document.getElementById("outNuO").textContent = cur.Nu_o.toFixed(1);
  document.getElementById("outHo").textContent = isImp
    ? (cur.h_o * 0.176110).toFixed(1) + " BTU/hr\u00B7ft\u00B2\u00B7\u00B0F"
    : cur.h_o.toFixed(1) + " W/m\u00B2K";

  document.getElementById("outDo").textContent = isImp
    ? ((cur.Do * 1000.0) / MM_PER_IN).toFixed(3) + " in"
    : (cur.Do * 1000.0).toFixed(1) + " mm";
  document.getElementById("outReI").textContent = Math.round(cur.Re_i).toLocaleString();
  document.getElementById("outRegI").textContent = cur.Re_i < 2300 ? "Laminar" : (cur.Re_i < 3000 ? "Transitional" : "Turbulent");
  document.getElementById("outNuI").textContent = cur.Nu_i.toFixed(1);
  document.getElementById("outHi").textContent = isImp
    ? (cur.h_i * 0.176110).toFixed(0) + " BTU/hr\u00B7ft\u00B2\u00B0F"
    : cur.h_i.toFixed(0) + " W/m\u00B2K";

  const rFactor = isImp ? (W_PER_BTUHR * (9.0 / 5.0)) : 1.0;
  const rUnit = isImp ? " (\u00B0F\u00B7hr/BTU)" : " (K/W)";
  document.getElementById("lblRi").textContent = "Inner Film R_i" + rUnit + ":";
  document.getElementById("lblRw").textContent = "Pipe Wall R_w" + rUnit + ":";
  document.getElementById("lblRo").textContent = "Outer Film R_o" + rUnit + ":";
  document.getElementById("outRi").textContent = (cur.R_i * rFactor).toFixed(4);
  document.getElementById("outRw").textContent = (cur.R_wall * rFactor).toFixed(5);
  document.getElementById("outRo").textContent = (cur.R_o * rFactor).toFixed(4);

  let xDisp = [...sweep.x];
  let curX = 0;
  let xTitle = "";
  let curNu = cur.Nu_i;
  let transLine = null;

  if (req.x_mode === "Re_i") {
    xTitle = "Internal Tube Reynolds Number (Re_Di)";
    curX = cur.Re_i;
    curNu = cur.Nu_i;
    transLine = { val: 2300, label: "Re_Di = 2300 (Laminar -> Turbulent)" };
    document.getElementById("titleG3").textContent = "Internal Tube Nusselt Number (Nu_Di)";
  } else if (req.x_mode === "Flow") {
    const unitLbl = req.flow_unit.toUpperCase();
    xTitle = "Total Inner Volumetric Flow Rate (" + unitLbl + ")";
    curX = req.flow_val;
    curNu = cur.Nu_i;
    transLine = { val: critFlow, label: "Re_Di = 2300 (" + critFlow.toFixed(1) + " " + unitLbl + ")" };
    document.getElementById("titleG3").textContent = "Internal Tube Nusselt Number (Nu_Di)";
  } else if (req.x_mode === "Wall") {
    xTitle = isImp ? "Pipe Wall Thickness t (in)" : "Pipe Wall Thickness t (mm)";
    xDisp = sweep.x.map(v => isImp ? v / MM_PER_IN : v);
    curX = isImp ? (req.wall * 1000.0) / MM_PER_IN : (req.wall * 1000.0);
    curNu = cur.Nu_o;
    document.getElementById("titleG3").textContent = "Outer Film Nusselt Number (Nu_o)";
  } else if (req.x_mode === "V_air") {
    xTitle = isImp ? "External Air Velocity (ft/s)" : "External Air Velocity (m/s)";
    xDisp = sweep.x.map(v => isImp ? v / M_PER_FT : v);
    curX = isImp ? req.V_air / M_PER_FT : req.V_air;
    curNu = cur.Nu_o;
    document.getElementById("titleG3").textContent = "External Air Nusselt Number (Nu_o)";
  } else {
    xTitle = "Outer Reynolds Number (Re_o)";
    curX = cur.Re_o;
    curNu = cur.Nu_o;
    document.getElementById("titleG3").textContent = "Outer Film Nusselt Number (Nu_o)";
  }

  const qDisp = sweep.Q.map(w => isImp ? w / W_PER_BTUHR : w);
  const qNetDisp = sweep.Q_net.map(w => isImp ? w / W_PER_BTUHR : w);
  const curQDisp = isImp ? cur.Q / W_PER_BTUHR : cur.Q;
  const curQNetDisp = isImp ? cur.Q_net / W_PER_BTUHR : cur.Q_net;

  const toutDisp = sweep.Tout.map(c => isImp ? cToF(c) : c);
  const curToutDisp = isImp ? cToF(cur.Tout) : cur.Tout;

  document.getElementById("titleG2").textContent = isImp
    ? "Inner Fluid Outlet Temperature T_out (\u00B0F)"
    : "Inner Fluid Outlet Temperature T_out (\u00B0C)";

  const maxX = xDisp[xDisp.length - 1];
  const xScale = getNiceScale(0, maxX, 6);

  plotGraph("cG1", xDisp, qDisp, xScale, xTitle, isImp ? "Heat Rate (BTU/hr)" : "Heat Rate (W)", isDarkTheme() ? "#38bdf8" : "#0066cc", curX, curQDisp, transLine, qNetDisp, isDarkTheme() ? "#4ade80" : "#16a34a", curQNetDisp);
  plotDualAxisGraph("cG4", xDisp, sweep.eff, sweep.P_pump, sweep.P_tot, xScale, xTitle, "Net Eff (%)", "Power (W)", isDarkTheme() ? "#4ade80" : "#16a34a", isDarkTheme() ? "#c084fc" : "#9333ea", isDarkTheme() ? "#facc15" : "#ca8a04", curX, cur.eff_net, cur.P_pump, cur.P_tot_elec, transLine);
  plotGraph("cG2", xDisp, toutDisp, xScale, xTitle, isImp ? "Outlet Temp (\u00B0F)" : "Outlet Temp (\u00B0C)", isDarkTheme() ? "#f87171" : "#d9534f", curX, curToutDisp, transLine);
  plotGraph("cG3", xDisp, sweep.Nu, xScale, xTitle, "Nusselt (Nu)", isDarkTheme() ? "#fb923c" : "#e67e22", curX, curNu, transLine);
}

function getNiceScale(minVal, maxVal, targetTicks) {
  let range = maxVal - minVal;
  if (range <= 1e-9) range = 1.0;
  const rawStep = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let niceNorm = 1;
  if (norm > 5) niceNorm = 10;
  else if (norm > 2.5) niceNorm = 5;
  else if (norm > 2) niceNorm = 2.5;
  else if (norm > 1) niceNorm = 2;
  const step = niceNorm * mag;
  const niceMin = Math.floor(minVal / step) * step;
  const niceMax = Math.ceil(maxVal / step) * step;
  const ticks = Math.max(1, Math.round((niceMax - niceMin) / step));
  return { min: niceMin, max: niceMax, step: step, ticks: ticks };
}

function formatTick(v) {
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(0) + "k";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function plotGraph(canvasId, xArr, yArr, xScale, xTitle, yTitle, lineColor, curX, curY, transX, y2Arr, y2Color, curY2) {
  const c = document.getElementById(canvasId);
  if (!c || !c.getContext) return;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  const pL = 62, pR = 20, pT = 16, pB = 36;
  const gW = W - pL - pR;
  const gH = H - pT - pB;

  let minDataY = yArr[0], maxDataY = yArr[0];
  for (let i = 1; i < yArr.length; i++) {
    if (yArr[i] < minDataY) minDataY = yArr[i];
    if (yArr[i] > maxDataY) maxDataY = yArr[i];
  }
  if (y2Arr) {
    for (let m = 0; m < y2Arr.length; m++) {
      if (y2Arr[m] < minDataY) minDataY = y2Arr[m];
      if (y2Arr[m] > maxDataY) maxDataY = y2Arr[m];
    }
  }
  if (minDataY > 0 && minDataY < maxDataY * 0.25) minDataY = 0;
  const yScale = getNiceScale(minDataY, maxDataY * 1.05, 5);

  ctx.strokeStyle = isDarkTheme() ? "#334155" : "#e2e8f0";
  ctx.fillStyle = isDarkTheme() ? "#94a3b8" : "#475569";
  ctx.font = "11px Arial";
  ctx.lineWidth = 1;

  for (let j = 0; j <= yScale.ticks; j++) {
    const yVal = yScale.min + j * yScale.step;
    const yPos = pT + gH - ((yVal - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
    ctx.beginPath(); ctx.moveTo(pL, yPos); ctx.lineTo(pL + gW, yPos); ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(formatTick(yVal), pL - 6, yPos + 4);
  }

  for (let k = 0; k <= xScale.ticks; k++) {
    const xVal = xScale.min + k * xScale.step;
    const xPos = pL + ((xVal - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    ctx.beginPath(); ctx.moveTo(xPos, pT); ctx.lineTo(xPos, pT + gH); ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(formatTick(xVal), xPos, pT + gH + 14);
  }

  ctx.fillStyle = isDarkTheme() ? "#f1f5f9" : "#0f172a";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(xTitle, pL + gW / 2, H - 5);

  ctx.save();
  ctx.translate(14, pT + gH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yTitle, 0, 0);
  ctx.restore();

  if (transX && transX.val > xScale.min && transX.val < xScale.max) {
    const tx = pL + ((transX.val - xScale.min) / (xScale.max - xScale.min)) * gW;
    ctx.save();
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(tx, pT); ctx.lineTo(tx, pT + gH); ctx.stroke();
    ctx.restore();
  }

  const drawSeries = (arr, color, dashed) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i < xArr.length; i++) {
      const px = pL + ((xArr[i] - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
      const py = pT + gH - ((arr[i] - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  };

  drawSeries(yArr, lineColor, false);
  if (y2Arr) drawSeries(y2Arr, y2Color, true);

  const drawMarker = (xVal, yVal, color) => {
    if (xVal < xScale.min || xVal > xScale.max) return;
    const mx = pL + ((xVal - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    const my = pT + gH - ((yVal - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = isDarkTheme() ? "#111827" : "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  drawMarker(curX, curY, lineColor);
  if (y2Arr && curY2 !== undefined) drawMarker(curX, curY2, y2Color);
}

function plotDualAxisGraph(canvasId, xArr, effArr, pPumpArr, pTotArr, xScale, xTitle, y1Title, y2Title, c1, c2, c3, curX, curEff, curPpump, curPtot, transX) {
  const c = document.getElementById(canvasId);
  if (!c || !c.getContext) return;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  const pL = 52, pR = 54, pT = 16, pB = 36;
  const gW = W - pL - pR;
  const gH = H - pT - pB;

  const y1Scale = getNiceScale(Math.min(0, ...effArr), 105, 5);
  const maxP = Math.max(1, ...pTotArr, ...pPumpArr);
  const y2Scale = getNiceScale(0, maxP * 1.1, 5);

  ctx.strokeStyle = isDarkTheme() ? "#334155" : "#e2e8f0";
  ctx.font = "11px Arial";
  ctx.lineWidth = 1;

  for (let j = 0; j <= y1Scale.ticks; j++) {
    const yVal = y1Scale.min + j * y1Scale.step;
    const yPos = pT + gH - ((yVal - y1Scale.min) / (y1Scale.max - y1Scale.min || 1)) * gH;
    ctx.beginPath(); ctx.moveTo(pL, yPos); ctx.lineTo(pL + gW, yPos); ctx.stroke();
    ctx.fillStyle = c1;
    ctx.textAlign = "right";
    ctx.fillText(formatTick(yVal), pL - 6, yPos + 4);
  }

  for (let j = 0; j <= y2Scale.ticks; j++) {
    const yVal = y2Scale.min + j * y2Scale.step;
    const yPos = pT + gH - ((yVal - y2Scale.min) / (y2Scale.max - y2Scale.min || 1)) * gH;
    ctx.fillStyle = c2;
    ctx.textAlign = "left";
    ctx.fillText(formatTick(yVal), pL + gW + 6, yPos + 4);
  }

  for (let k = 0; k <= xScale.ticks; k++) {
    const xVal = xScale.min + k * xScale.step;
    const xPos = pL + ((xVal - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    ctx.beginPath(); ctx.moveTo(xPos, pT); ctx.lineTo(xPos, pT + gH); ctx.stroke();
    ctx.fillStyle = isDarkTheme() ? "#94a3b8" : "#475569";
    ctx.textAlign = "center";
    ctx.fillText(formatTick(xVal), xPos, pT + gH + 14);
  }

  ctx.fillStyle = isDarkTheme() ? "#f1f5f9" : "#0f172a";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(xTitle, pL + gW / 2, H - 5);

  const drawCurve = (arr, yScale, color, dashed) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i < xArr.length; i++) {
      const px = pL + ((xArr[i] - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
      const py = pT + gH - ((arr[i] - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  };

  drawCurve(effArr, y1Scale, c1, false);
  drawCurve(pPumpArr, y2Scale, c2, true);
  drawCurve(pTotArr, y2Scale, c3, true);
}

async function populatePipeMaterials() {
  try {
    const res = await fetch("/api/materials");
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById("inMat");
    if (!select) return;
    select.innerHTML = "";

    data.materials.forEach(m => {
      pipeMaterialsMap[m.id] = m;
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === "cu") opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const selected = pipeMaterialsMap[select.value];
      const epsInput = document.getElementById("inEps");
      if (selected && epsInput) {
        epsInput.value = (unitSystem === "imperial")
          ? (selected.eps_mm / MM_PER_IN).toFixed(5)
          : selected.eps_mm;
      }
      runCalc();
    });
  } catch (err) {
    console.error("Failed to load pipe materials:", err);
  }
}

async function populateIncompressibleFluids() {
  try {
    const res = await fetch("/api/fluids");
    if (!res.ok) return;
    const data = await res.json();

    ["inFluid", "inShellFluid"].forEach(selectId => {
      const select = document.getElementById(selectId);
      if (!select) return;
      select.innerHTML = "";

      data.fluids.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = f.label;
        if (f.id === "Water") opt.selected = true;
        select.appendChild(opt);
      });
    });
  } catch (err) {
    console.error("Failed to load incompressible fluids:", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  applyThemeMode(localStorage.getItem("hxThemeMode") || "auto");
  await Promise.all([
    populatePipeMaterials(),
    populateIncompressibleFluids()
  ]);
  fetchFromBackend(false);
});
