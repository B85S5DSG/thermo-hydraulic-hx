let unitSystem = "metric"; // "metric" | "imperial"
let pipeMaterialsMap = {};
let calcTimeout = null;

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

  document.getElementById("secTitleSecondary").textContent = isShellSide ? "Outer Shell Side" : "External Air & Shroud";
  document.getElementById("lblSecRow1").textContent = isShellSide ? "Shell Outlet Temp:" : "Fins & Duct Shroud:";
  document.getElementById("lblSecRow2").textContent = isShellSide ? "Shell Pressure Drop:" : "Air Pressure Drop:";
  document.getElementById("lblSecRow3").textContent = isShellSide ? "Shell Friction (f_o):" : "Bundle Loss Coeff:";
  document.getElementById("lblSecRow4").textContent = isShellSide ? "Shell Pump Power:" : "Fan Elec Power:";

  validateShellDia(true);
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
  validateShellDia(true);
}

function validateShellDia(autoFit = false) {
  const hxType = document.getElementById("inHxType").value;
  const nt = (hxType === "multi_tube") ? Math.max(2, parseInt(document.getElementById("inNTubes").value) || 7) : 1;
  const pr = parseFloat(document.getElementById("inPitchRatio")?.value) || 1.25;
  const di = parseFloat(document.getElementById("inDi").value) || 0;
  const wall = parseFloat(document.getElementById("inWall").value) || 0;
  const doVal = di + 2.0 * wall;

  // TEMA OTL Rule of Thumb with standard ~8mm clearance
  const clearance = (unitSystem === "imperial") ? 0.35 : 8.0;
  const minShell = (nt === 1)
    ? doVal + ((unitSystem === "imperial") ? 0.25 : 6.0)
    : doVal * pr * Math.sqrt(nt * 1.15) + clearance;

  const shellEl = document.getElementById("inShellDi");
  if (shellEl) {
    const curVal = parseFloat(shellEl.value);
    // Auto-shrink if autoFit is triggered by bundle changes, or if current shell is physically too small
    if (autoFit || curVal < minShell) {
      shellEl.value = minShell.toFixed(unitSystem === "imperial" ? 3 : 1);
    }
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
}function renderSchematic(payload, cur, isImp) {
  const svg = document.getElementById("hxSchematicSvg");
  if (!svg) return;

  const fmtDim = (mm) => isImp ? (mm / MM_PER_IN).toFixed(2) + " in" : mm.toFixed(1) + " mm";
  const di_mm = payload.Di * 1000.0;
  const do_mm = (cur.Do || (payload.Di + 2 * payload.wall)) * 1000.0;
  const isShell = (payload.hx_type === "double_pipe" || payload.hx_type === "multi_tube");
  const nt = (payload.hx_type === "multi_tube") ? Math.max(1, payload.n_tubes) : 1;

  const outer_mm = isShell
    ? (cur.D_shell_i ? cur.D_shell_i * 1000.0 : payload.shell_Di_mm)
    : (payload.use_fins ? payload.fin_dia_mm : do_mm);
  const shroud_mm = isShell ? outer_mm : outer_mm * (1.0 + (payload.duct_margin_pct || 15.0) / 100.0);

  const cx = 145, cy = 105;
  const maxR = 76;
  const scale = maxR / Math.max(1.0, shroud_mm / 2.0);

  const scaleLbl = document.getElementById("schematicScaleLbl");
  if (scaleLbl) {
    scaleLbl.textContent = scale.toFixed(2) + " px/mm (" + (isShell ? (nt > 1 ? nt + "-Tube Bundle" : "Double-Pipe") : "Shrouded Fin") + ")";
  }

  let html = "";
  if (isShell) {
    const rShell = (outer_mm / 2.0) * scale;
    html += `<circle cx="${cx}" cy="${cy}" r="${rShell + 4}" fill="#64748b" />`;
    html += `<circle cx="${cx}" cy="${cy}" r="${rShell}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />`;

    const rDo = Math.max(2.5, (do_mm / 2.0) * scale);
    const rDi = Math.max(1.2, (di_mm / 2.0) * scale);

    if (nt === 1) {
      html += `<circle cx="${cx}" cy="${cy}" r="${rDo}" fill="#d97706" />`;
      html += `<circle cx="${cx}" cy="${cy}" r="${rDi}" fill="#3b82f6" />`;
    } else {
      const pitch_mm = do_mm * (payload.pitch_ratio || 1.25);
      const pitch_px = pitch_mm * scale;
      const coords = [[0, 0]];
      let ring = 1;
      while (coords.length < nt && ring < 15) {
        const countInRing = ring * 6;
        const radiusPx = ring * pitch_px;
        for (let k = 0; k < countInRing && coords.length < nt; k++) {
          const ang = (2 * Math.PI * k) / countInRing;
          const x = radiusPx * Math.cos(ang);
          const y = radiusPx * Math.sin(ang);
          if (Math.hypot(x, y) + rDo <= rShell - 1) coords.push([x, y]);
        }
        ring++;
      }
      coords.forEach(([dx, dy]) => {
        html += `<circle cx="${cx + dx}" cy="${cy + dy}" r="${rDo}" fill="#d97706" />`;
        html += `<circle cx="${cx + dx}" cy="${cy + dy}" r="${rDi}" fill="#3b82f6" />`;
      });
    }

    // Callout lines & dimension text on right side of SVG
    const lx = 240;
    html += `<line x1="${cx}" y1="${cy - rShell}" x2="${lx - 4}" y2="38" stroke="#0284c7" stroke-width="1" stroke-dasharray="2,2" />`;
    html += `<text x="${lx}" y="41" fill="#0f172a" font-size="11" font-weight="600">Shell ID (D_s): ${fmtDim(outer_mm)}</text>`;

    html += `<line x1="${cx}" y1="${cy - rDo}" x2="${lx - 4}" y2="75" stroke="#d97706" stroke-width="1" stroke-dasharray="2,2" />`;
    html += `<text x="${lx}" y="78" fill="#b45309" font-size="11" font-weight="600">Tube OD (D_o): ${fmtDim(do_mm)}</text>`;

    html += `<line x1="${cx}" y1="${cy}" x2="${lx - 4}" y2="112" stroke="#2563eb" stroke-width="1" stroke-dasharray="2,2" />`;
    html += `<text x="${lx}" y="115" fill="#1d4ed8" font-size="11" font-weight="600">Tube ID (D_i): ${fmtDim(di_mm)}</text>`;

    html += `<text x="${lx}" y="148" fill="#475569" font-size="10.5">Tubes: ${nt} (${payload.flow_direction})</text>`;
    if (cur.free_space_pct !== undefined) {
      html += `<text x="${lx}" y="166" fill="#0d9488" font-size="10.5" font-weight="600">Shell Free Area: ${cur.free_space_pct.toFixed(1)}%</text>`;
    }
  } else {
    const rShroud = (shroud_mm / 2.0) * scale;
    const rFin = (outer_mm / 2.0) * scale;
    const rDo = Math.max(3, (do_mm / 2.0) * scale);
    const rDi = Math.max(1.5, (di_mm / 2.0) * scale);

    html += `<rect x="${cx - rShroud}" y="${cy - rShroud}" width="${rShroud * 2}" height="${rShroud * 2}" rx="6" fill="#f1f5f9" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4,3" />`;
    if (payload.use_fins) {
      html += `<circle cx="${cx}" cy="${cy}" r="${rFin}" fill="#fed7aa" stroke="#ea580c" stroke-width="1.2" />`;
    }
    html += `<circle cx="${cx}" cy="${cy}" r="${rDo}" fill="#d97706" />`;
    html += `<circle cx="${cx}" cy="${cy}" r="${rDi}" fill="#3b82f6" />`;

    const lx = 240;
    html += `<line x1="${cx + rShroud}" y1="${cy - rShroud}" x2="${lx - 4}" y2="35" stroke="#64748b" stroke-width="1" stroke-dasharray="2,2" />`;
    html += `<text x="${lx}" y="38" fill="#334155" font-size="11" font-weight="600">Duct Shroud: ${fmtDim(shroud_mm)}</text>`;

    if (payload.use_fins) {
      html += `<line x1="${cx}" y1="${cy - rFin}" x2="${lx - 4}" y2="70" stroke="#ea580c" stroke-width="1" stroke-dasharray="2,2" />`;
      html += `<text x="${lx}" y="73" fill="#c2410c" font-size="11" font-weight="600">Fin OD (D_fin): ${fmtDim(outer_mm)}</text>`;
    }

    html += `<line x1="${cx}" y1="${cy - rDo}" x2="${lx - 4}" y2="105" stroke="#d97706" stroke-width="1" stroke-dasharray="2,2" />`;
    html += `<text x="${lx}" y="108" fill="#b45309" font-size="11" font-weight="600">Pipe OD (D_o): ${fmtDim(do_mm)}</text>`;

    html += `<line x1="${cx}" y1="${cy}" x2="${lx - 4}" y2="140" stroke="#2563eb" stroke-width="1" stroke-dasharray="2,2" />`;
    html += `<text x="${lx}" y="143" fill="#1d4ed8" font-size="11" font-weight="600">Pipe ID (D_i): ${fmtDim(di_mm)}</text>`;

    html += `<text x="${lx}" y="172" fill="#475569" font-size="10.5">Air V: ${isImp ? (payload.V_air / M_PER_FT).toFixed(1) + " ft/s" : payload.V_air.toFixed(1) + " m/s"}</text>`;
  }

  svg.innerHTML = html;

  const st1 = document.getElementById("valGeomStat1");
  const st2 = document.getElementById("valGeomStat2");
  const st3 = document.getElementById("valGeomStat3");
  if (st1) st1.textContent = isShell ? "D_s = " + fmtDim(outer_mm) : (payload.use_fins ? "D_fin = " + fmtDim(outer_mm) : "Shroud = " + fmtDim(shroud_mm));
  if (st2) st2.textContent = (nt > 1 ? nt + "\u00D7 " : "") + "D_o = " + fmtDim(do_mm);
  if (st3) st3.textContent = (cur.free_space_pct !== undefined) ? cur.free_space_pct.toFixed(1) + "% Free Area" : "D_i = " + fmtDim(di_mm);
}


