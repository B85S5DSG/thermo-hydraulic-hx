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
