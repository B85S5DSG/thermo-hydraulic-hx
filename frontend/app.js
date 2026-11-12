let calcTimeout = null;
let pipeMaterialsMap = {};
let unitSystem = "metric"; // "metric" or "imperial"

// Conversion constants (SI <-> Imperial)
const MM_PER_IN = 25.4;
const M_PER_FT = 0.3048;
const MS_PER_FTS = 0.3048;
const LPM_PER_GPM = 3.785411784;
const BTUHR_PER_W = 3.41214163;
const PSI_PER_PA = 0.0001450377;
const INH2O_PER_PA = 0.00401463;
const HP_PER_W = 1.0 / 745.699872;
const BTUHFFT2F_PER_WM2K = 0.17611018;
const BTUHRF_PER_WK = 1.8956342;

function cToF(c) { return c * 1.8 + 32.0; }
function fToC(f) { return (f - 32.0) / 1.8; }

function setUnitSystem(newSys) {
  if (newSys === unitSystem) return;

  const isToImp = (newSys === "imperial");
  document.getElementById("btnMetric").classList.toggle("active", !isToImp);
  document.getElementById("btnImperial").classList.toggle("active", isToImp);

  // Convert current input field values in place
  const convField = (id, fn, dec) => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = parseFloat(el.value);
    if (!isNaN(v)) el.value = fn(v).toFixed(dec);
  };

  if (isToImp) {
    convField("inDi", v => v / MM_PER_IN, 3);
    convField("inWall", v => v / MM_PER_IN, 3);
    convField("inL", v => v / M_PER_FT, 2);
    convField("inEps", v => v / MM_PER_IN, 5);
    convField("inTin", cToF, 1);
    convField("inV", v => v / MS_PER_FTS, 1);
    convField("inTinf", cToF, 1);
    convField("inFinDia", v => v / MM_PER_IN, 3);
    convField("inFinThick", v => v / MM_PER_IN, 4);
    convField("inFinPitch", v => v / MM_PER_IN, 3);

    const flowUnitEl = document.getElementById("inFlowUnit");
    if (flowUnitEl && flowUnitEl.value === "lpm") {
      convField("inFlow", v => v / LPM_PER_GPM, 2);
      flowUnitEl.value = "gpm";
    }
  } else {
    convField("inDi", v => v * MM_PER_IN, 2);
    convField("inWall", v => v * MM_PER_IN, 2);
    convField("inL", v => v * M_PER_FT, 2);
    convField("inEps", v => v * MM_PER_IN, 4);
    convField("inTin", fToC, 1);
    convField("inV", v => v * MS_PER_FTS, 1);
    convField("inTinf", fToC, 1);
    convField("inFinDia", v => v * MM_PER_IN, 1);
    convField("inFinThick", v => v * MM_PER_IN, 2);
    convField("inFinPitch", v => v * MM_PER_IN, 2);

    const flowUnitEl = document.getElementById("inFlowUnit");
    if (flowUnitEl && flowUnitEl.value === "gpm") {
      convField("inFlow", v => v * LPM_PER_GPM, 2);
      flowUnitEl.value = "lpm";
    }
  }

  unitSystem = newSys;
  updateLabelsForUnitSystem();
  runCalc();
}

function updateLabelsForUnitSystem() {
  const imp = (unitSystem === "imperial");
  document.getElementById("lblDi").innerHTML = imp ? "Inner Dia, D_i (in):" : "Inner Dia, D_i (mm):";
  document.getElementById("lblWall").innerHTML = imp ? "Wall Thick, t (in):" : "Wall Thick, t (mm):";
  document.getElementById("lblL").innerHTML = imp ? "Active Length, L (ft):" : "Active Length, L (m):";
  document.getElementById("lblEps").innerHTML = imp ? "Roughness, &epsilon; (in):" : "Roughness, &epsilon; (mm):";
  document.getElementById("lblTin").innerHTML = imp ? "Inlet Temp, T_in (&deg;F):" : "Inlet Temp, T_in (&deg;C):";
  document.getElementById("lblV").innerHTML = imp ? "Duct Air Velocity (ft/s):" : "Duct Air Velocity (m/s):";
  document.getElementById("lblTinf").innerHTML = imp ? "Ambient Air, T_&infin; (&deg;F):" : "Ambient Air, T_&infin; (&deg;C):";
  document.getElementById("lblFinDia").innerHTML = imp ? "Fin Outer Dia, D_fin (in):" : "Fin Outer Dia, D_fin (mm):";
  document.getElementById("lblFinThick").innerHTML = imp ? "Fin Thickness, t_fin (in):" : "Fin Thickness, t_fin (mm):";
  document.getElementById("lblFinPitch").innerHTML = imp ? "On-Center Spacing (in):" : "On-Center Spacing (mm):";

  document.getElementById("lblRi").innerHTML = imp ? "Inner Film R_i (&deg;F&middot;hr/BTU):" : "Inner Film R_i (K/W):";
  document.getElementById("lblRw").innerHTML = imp ? "Pipe Wall R_w (&deg;F&middot;hr/BTU):" : "Pipe Wall R_w (K/W):";
  document.getElementById("lblRo").innerHTML = imp ? "Finned Air R_o (&deg;F&middot;hr/BTU):" : "Finned Air R_o (K/W):";

  document.getElementById("optSweepWall").textContent = imp ? "Pipe Wall Thickness t (in)" : "Pipe Wall Thickness t (mm)";
  document.getElementById("optSweepVair").textContent = imp ? "External Air Approach Velocity (ft/s)" : "External Air Approach Velocity (m/s)";
}

function getNiceScale(minVal, maxVal, targetTicks) {
  if (maxVal <= minVal) maxVal = minVal + 10;
  var span = maxVal - minVal;
  var rawStep = span / targetTicks;
  var mag = Math.pow(10, Math.floor(Math.log(rawStep) / Math.LN10));
  var res = rawStep / mag;
  var step = res > 5 ? 10 * mag : res > 2 ? 5 * mag : res > 1 ? 2 * mag : mag;
  var niceMin = Math.floor(minVal / step) * step;
  var niceMax = Math.ceil(maxVal / step) * step;
  var ticks = Math.round((niceMax - niceMin) / step);
  return { min: niceMin, max: niceMax, step: step, ticks: ticks };
}

function formatTick(val) {
  if (Math.abs(val) < 1e-9) return "0";
  if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (Math.abs(val) < 1) return val.toFixed(2);
  if (Math.abs(val) < 10 && Math.abs(val % 1) > 1e-6) return val.toFixed(1);
  return Math.round(val).toString();
}

function onFluidChange() {
  var fluid = document.getElementById("inFluid").value.toLowerCase();
  var etaInput = document.getElementById("inEta");
  var isOil = /oil|xom|t66|t72|s800|syl|dow|pbb|pcl|pcr|phe|phr|plr|pmr/.test(fluid);
  etaInput.value = isOil ? "82" : "72";
  runCalc();
}

function validateFinDia() {
  const imp = (unitSystem === "imperial");
  var Di = parseFloat(document.getElementById("inDi").value) || (imp ? 1.0 : 25.0);
  var wall = parseFloat(document.getElementById("inWall").value) || (imp ? 0.08 : 2.0);
  var Do = Di + 2.0 * wall;
  var minMargin = imp ? 0.08 : 2.0;
  var finInput = document.getElementById("inFinDia");
  if (finInput && parseFloat(finInput.value) <= Do) {
    finInput.value = (Do + minMargin).toFixed(imp ? 3 : 1);
  }
}

function toggleFinInputs() {
  var enabled = document.getElementById("inUseFins").checked;
  var box = document.getElementById("finControls");
  if (box) {
    box.style.opacity = enabled ? "1.0" : "0.45";
    box.style.pointerEvents = enabled ? "auto" : "none";
  }
  validateFinDia();
  runCalc();
}

function runCalc() {
  clearTimeout(calcTimeout);
  calcTimeout = setTimeout(function() { fetchFromBackend(false); }, 60);
}

async function fetchFromBackend(saveSnapshot) {
  validateFinDia();
  const imp = (unitSystem === "imperial");

  const rawDi = parseFloat(document.getElementById("inDi").value);
  const rawWall = parseFloat(document.getElementById("inWall").value);
  const rawL = parseFloat(document.getElementById("inL").value);
  const rawEps = parseFloat(document.getElementById("inEps").value);
  const rawFlow = parseFloat(document.getElementById("inFlow").value);
  const rawFlowUnit = document.getElementById("inFlowUnit").value;
  const rawTin = parseFloat(document.getElementById("inTin").value);
  const rawV = parseFloat(document.getElementById("inV").value);
  const rawTinf = parseFloat(document.getElementById("inTinf").value);
  const rawFinDia = parseFloat(document.getElementById("inFinDia")?.value || (imp ? "2.165" : "55.0"));
  const rawFinThick = parseFloat(document.getElementById("inFinThick")?.value || (imp ? "0.020" : "0.5"));
  const rawFinPitch = parseFloat(document.getElementById("inFinPitch")?.value || (imp ? "0.118" : "3.0"));

  // Convert GPM to LPM cleanly for the backend API
  let apiFlowVal = rawFlow;
  let apiFlowUnit = rawFlowUnit;
  if (rawFlowUnit === "gpm") {
    apiFlowVal = rawFlow * LPM_PER_GPM;
    apiFlowUnit = "lpm";
  }

  // Always send strict SI units to the FastAPI solver
  var payload = {
    mat: document.getElementById("inMat").value,
    Di: imp ? (rawDi * MM_PER_IN) / 1000.0 : rawDi / 1000.0,
    wall: imp ? (rawWall * MM_PER_IN) / 1000.0 : rawWall / 1000.0,
    L: imp ? rawL * M_PER_FT : rawL,
    eps_mm: imp ? rawEps * MM_PER_IN : rawEps,
    fluid: document.getElementById("inFluid").value,
    flow_val: apiFlowVal,
    flow_unit: apiFlowUnit,
    Tin: imp ? fToC(rawTin) : rawTin,
    eta_pct: parseFloat(document.getElementById("inEta").value),
    V_air: imp ? rawV * MS_PER_FTS : rawV,
    Tinf: imp ? fToC(rawTinf) : rawTinf,
    eta_fan_pct: parseFloat(document.getElementById("inEtaFan").value),
    use_fins: document.getElementById("inUseFins") ? document.getElementById("inUseFins").checked : true,
    fin_dia_mm: imp ? rawFinDia * MM_PER_IN : rawFinDia,
    fin_thick_mm: imp ? rawFinThick * MM_PER_IN : rawFinThick,
    fin_pitch_mm: imp ? rawFinPitch * MM_PER_IN : rawFinPitch,
    duct_margin_pct: parseFloat(document.getElementById("inDuctMargin")?.value || "15.0"),
    x_mode: document.getElementById("xMode").value,
    save_snapshot: Boolean(saveSnapshot)
  };

  if (isNaN(payload.Di) || isNaN(payload.wall) || isNaN(payload.L) || isNaN(payload.flow_val) || payload.Di <= 0 || payload.wall <= 0 || payload.L <= 0 || payload.flow_val <= 0) {
    return;
  }

  try {
    var response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return;
    var data = await response.json();
    updateUIAndPlots(payload, data.current, data.sweep, data.crit_flow, data.saved_to, rawFlowUnit);
  } catch (err) {
    console.error("Backend calculation error:", err);
  }
}

function updateUIAndPlots(req, cur, sweep, critFlow, savedTo, displayFlowUnit) {
  const imp = (unitSystem === "imperial");

  var badge = document.getElementById("pumpBadge");
  badge.className = cur.pumpInfo.pumpType.includes("Positive") ? "pump-badge pd" : "pump-badge";
  badge.innerHTML = "<b>Active Pump:</b> " + cur.pumpInfo.pumpType + "<br><span>" + cur.pumpInfo.desc + "</span>";

  var saveMsg = document.getElementById("saveMsg");
  if (savedTo) {
    saveMsg.style.display = "block";
    setTimeout(function() { saveMsg.style.display = "none"; }, 4000);
  }

  // Format KPIs & diagnostics in active unit system
  const dispTout = imp ? cToF(cur.Tout) : cur.Tout;
  const dispDT = imp ? (cur.Tout - req.Tin) * 1.8 : (cur.Tout - req.Tin);
  const dispQ = imp ? cur.Q * BTUHR_PER_W : cur.Q;
  const dispQnet = imp ? cur.Q_net * BTUHR_PER_W : cur.Q_net;
  const dispUA = imp ? cur.UA * BTUHRF_PER_WK : cur.UA;

  document.getElementById("outTout").innerHTML = dispTout.toFixed(2) + (imp ? " &deg;F" : " &deg;C");
  document.getElementById("outDT").innerHTML = dispDT.toFixed(2) + (imp ? " &deg;F" : " &deg;C");
  document.getElementById("outQ").innerHTML = imp ? Math.round(dispQ).toLocaleString() + " BTU/hr" : dispQ.toFixed(1) + " W";
  document.getElementById("outQnet").innerHTML = (imp ? Math.round(dispQnet).toLocaleString() + " BTU/hr" : dispQnet.toFixed(1) + " W") +
    (cur.Q_net < 0 ? " <span style='color:#dc2626;'>(NET HEATING!)</span>" : "");
  document.getElementById("outUA").innerHTML = dispUA.toFixed(2) + (imp ? " BTU/hr&middot;&deg;F" : " W/K");

  document.getElementById("outPumpType").innerHTML = cur.pumpInfo.pumpType;
  document.getElementById("outVisc").innerHTML = cur.pumpInfo.nu_cSt.toFixed(2) + " cSt";
  document.getElementById("outEtaAct").innerHTML = (cur.pumpInfo.eta_actual * 100).toFixed(1) + "% (Base: " + req.eta_pct.toFixed(0) + "%)";

  if (imp) {
    const dpPsi = cur.dP * PSI_PER_PA;
    document.getElementById("outDP").innerHTML = dpPsi >= 0.1 ? dpPsi.toFixed(2) + " psi" : (cur.dP * INH2O_PER_PA).toFixed(2) + " inH2O";
    document.getElementById("outPpump").innerHTML = cur.P_pump >= 74.57 ? (cur.P_pump * HP_PER_W).toFixed(3) + " hp" : cur.P_pump.toFixed(2) + " W";
    document.getElementById("outPhyd").innerHTML = cur.P_hyd >= 74.57 ? (cur.P_hyd * HP_PER_W).toFixed(3) + " hp" : cur.P_hyd.toFixed(2) + " W";
  } else {
    document.getElementById("outDP").innerHTML = cur.dP >= 1000 ? (cur.dP / 1000).toFixed(2) + " kPa" : cur.dP.toFixed(1) + " Pa";
    document.getElementById("outPpump").innerHTML = cur.P_pump.toFixed(2) + " W";
    document.getElementById("outPhyd").innerHTML = cur.P_hyd.toFixed(2) + " W";
  }
  document.getElementById("outF").innerHTML = cur.f_darcy.toFixed(4);

  var finEl = document.getElementById("outFinSummary");
  if (finEl) {
    if (req.use_fins) {
      const fDiaDisp = imp ? (cur.eff_fin_dia_mm / MM_PER_IN).toFixed(2) + "in" : cur.eff_fin_dia_mm.toFixed(1) + "mm";
      const ductDisp = imp ? (cur.H_duct_mm / MM_PER_IN).toFixed(2) + "in" : cur.H_duct_mm.toFixed(1) + "mm";
      finEl.innerHTML = cur.n_fins + " fins (D_fin=" + fDiaDisp + ", &eta;_fin=" + (cur.eta_fin * 100).toFixed(1) + "%, Duct=" + ductDisp + ")";
    } else {
      const ductDisp = imp ? (cur.H_duct_mm / MM_PER_IN).toFixed(2) + "in" : cur.H_duct_mm.toFixed(1) + "mm";
      finEl.innerHTML = "Bare Pipe (Duct=" + ductDisp + ")";
    }
  }

  var ptotEl = document.getElementById("outPtotSummary");
  if (ptotEl) {
    ptotEl.innerHTML = (imp && cur.P_tot_elec >= 74.57)
      ? (cur.P_tot_elec * HP_PER_W).toFixed(3) + " hp"
      : cur.P_tot_elec.toFixed(1) + " W";
  }

  document.getElementById("outDPair").innerHTML = imp ? (cur.dP_air * INH2O_PER_PA).toFixed(3) + " inH2O" : cur.dP_air.toFixed(1) + " Pa";
  document.getElementById("outCD").innerHTML = cur.CD.toFixed(2);
  document.getElementById("outPfan").innerHTML = (imp && cur.P_fan >= 74.57) ? (cur.P_fan * HP_PER_W).toFixed(3) + " hp" : cur.P_fan.toFixed(2) + " W";
  document.getElementById("outEff").innerHTML = cur.eff_net.toFixed(2) + "%";
  document.getElementById("outCOPsys").innerHTML = (cur.cop_sys > 5000 ? "&gt;5000" : cur.cop_sys.toFixed(1));

  document.getElementById("outDo").innerHTML = imp ? ((cur.Do * 1000.0) / MM_PER_IN).toFixed(3) + " in" : (cur.Do * 1000.0).toFixed(1) + " mm";
  document.getElementById("outReI").innerHTML = Math.round(cur.Re_i).toLocaleString();
  document.getElementById("outRegI").innerHTML = cur.Re_i < 2300 ? "Laminar" : (cur.Re_i < 3000 ? "Transitional" : "Turbulent");
  document.getElementById("outNuI").innerHTML = cur.Nu_i.toFixed(1);
  document.getElementById("outHi").innerHTML = imp ? (cur.h_i * BTUHFFT2F_PER_WM2K).toFixed(1) + " BTU/hr&middot;ft2&middot;&deg;F" : cur.h_i.toFixed(1) + " W/m2K";
  document.getElementById("outReO").innerHTML = Math.round(cur.Re_o).toLocaleString();
  document.getElementById("outNuO").innerHTML = cur.Nu_o.toFixed(1);
  document.getElementById("outHo").innerHTML = imp ? (cur.h_o * BTUHFFT2F_PER_WM2K).toFixed(1) + " BTU/hr&middot;ft2&middot;&deg;F" : cur.h_o.toFixed(1) + " W/m2K";

  const rConv = imp ? (1.0 / BTUHRF_PER_WK) : 1.0;
  document.getElementById("outRi").innerHTML = (cur.R_i * rConv).toFixed(4);
  document.getElementById("outRw").innerHTML = (cur.R_wall * rConv).toFixed(5);
  document.getElementById("outRo").innerHTML = (cur.R_o * rConv).toFixed(4);

  // Convert sweep arrays for plotting in the selected unit system
  let plotX = sweep.x.slice();
  let curX = 0, curNu = cur.Nu_i, transLine = null, xTitle = "";

  if (req.x_mode === "Re_i") {
    xTitle = "Internal Fluid Reynolds Number (Re_Di)";
    curX = cur.Re_i;
    curNu = cur.Nu_i;
    transLine = { val: 2300, label: "Re_Di = 2300 (Laminar -> Turbulent)" };
    document.getElementById("titleG3").innerHTML = "Internal Pipe Nusselt Number (Nu_Di)";
  } else if (req.x_mode === "Flow") {
    const isGpm = (displayFlowUnit === "gpm");
    const unitLbl = isGpm ? "GPM" : (req.flow_unit === "lpm" ? "L/min" : "CFM");
    if (isGpm) plotX = plotX.map(v => v / LPM_PER_GPM);
    const dispCrit = isGpm ? critFlow / LPM_PER_GPM : critFlow;
    xTitle = "Internal Volumetric Flow Rate (" + unitLbl + ")";
    curX = isGpm ? (req.flow_val / LPM_PER_GPM) : req.flow_val;
    curNu = cur.Nu_i;
    transLine = { val: dispCrit, label: "Re_Di = 2300 (" + dispCrit.toFixed(1) + " " + unitLbl + ")" };
    document.getElementById("titleG3").innerHTML = "Internal Pipe Nusselt Number (Nu_Di)";
  } else if (req.x_mode === "Wall") {
    if (imp) plotX = plotX.map(v => v / MM_PER_IN);
    xTitle = imp ? "Pipe Wall Thickness t (in)" : "Pipe Wall Thickness t (mm)";
    curX = imp ? (req.wall * 1000.0) / MM_PER_IN : req.wall * 1000.0;
    curNu = cur.Nu_o;
    document.getElementById("titleG3").innerHTML = "External Air Cross-Flow Nusselt Number (Nu_Do)";
  } else if (req.x_mode === "V_air") {
    if (imp) plotX = plotX.map(v => v / MS_PER_FTS);
    xTitle = imp ? "External Air Velocity V (ft/s)" : "External Air Velocity V (m/s)";
    curX = imp ? req.V_air / MS_PER_FTS : req.V_air;
    curNu = cur.Nu_o;
    document.getElementById("titleG3").innerHTML = "External Air Cross-Flow Nusselt Number (Nu_Do)";
  } else {
    xTitle = "External Air Reynolds Number (Re_Do)";
    curX = cur.Re_o;
    curNu = cur.Nu_o;
    document.getElementById("titleG3").innerHTML = "External Air Cross-Flow Nusselt Number (Nu_Do)";
  }

  const plotQ = imp ? sweep.Q.map(v => v * BTUHR_PER_W) : sweep.Q;
  const plotQnet = imp ? sweep.Q_net.map(v => v * BTUHR_PER_W) : sweep.Q_net;
  const plotTout = imp ? sweep.Tout.map(cToF) : sweep.Tout;

  var maxX = plotX[plotX.length - 1];
  var xScale = getNiceScale(0, maxX, 6);

  plotGraph("cG1", plotX, plotQ, xScale, xTitle, imp ? "Heat Rate (BTU/hr)" : "Heat Rate (W)", "#0066cc", curX, dispQ, transLine, plotQnet, "#16a34a", dispQnet);
  plotDualAxisGraph("cG4", plotX, sweep.eff, sweep.P_pump, sweep.P_tot, xScale, xTitle, "Net Eff (%)", "Power (W)", "#16a34a", "#9333ea", "#ca8a04", curX, cur.eff_net, cur.P_pump, cur.P_tot_elec, transLine);
  plotGraph("cG2", plotX, plotTout, xScale, xTitle, imp ? "Outlet Temp (F)" : "Outlet Temp (C)", "#d9534f", curX, dispTout, transLine);
  plotGraph("cG3", plotX, sweep.Nu, xScale, xTitle, "Nusselt (Nu)", "#e67e22", curX, curNu, transLine);
}

function plotGraph(canvasId, xArr, yArr, xScale, xTitle, yTitle, lineColor, curX, curY, transX, y2Arr, y2Color, curY2) {
  var c = document.getElementById(canvasId);
  if (!c || !c.getContext) return;
  var ctx = c.getContext("2d");
  var W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  var pL = 65, pR = 25, pT = 16, pB = 36;
  var gW = W - pL - pR;
  var gH = H - pT - pB;

  var minDataY = yArr[0], maxDataY = yArr[0];
  for (var i = 1; i < yArr.length; i++) {
    if (yArr[i] < minDataY) minDataY = yArr[i];
    if (yArr[i] > maxDataY) maxDataY = yArr[i];
  }
  if (y2Arr) {
    for (var m = 0; m < y2Arr.length; m++) {
      if (y2Arr[m] < minDataY) minDataY = y2Arr[m];
      if (y2Arr[m] > maxDataY) maxDataY = y2Arr[m];
    }
  }
  if (minDataY > 0 && minDataY < maxDataY * 0.25) minDataY = 0;
  var yScale = getNiceScale(minDataY, maxDataY * 1.05, 5);

  ctx.strokeStyle = "#e0e0e0";
  ctx.fillStyle = "#333";
  ctx.font = "11px Arial";
  ctx.lineWidth = 1;

  for (var j = 0; j <= yScale.ticks; j++) {
    var yVal = yScale.min + j * yScale.step;
    var yPos = pT + gH - ((yVal - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
    ctx.beginPath(); ctx.moveTo(pL, yPos); ctx.lineTo(pL + gW, yPos); ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(formatTick(yVal), pL - 8, yPos + 4);
  }

  for (var k = 0; k <= xScale.ticks; k++) {
    var xVal = xScale.min + k * xScale.step;
    var xPos = pL + ((xVal - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    ctx.beginPath(); ctx.moveTo(xPos, pT); ctx.lineTo(xPos, pT + gH); ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(formatTick(xVal), xPos, pT + gH + 14);
  }

  if (yScale.min < 0 && yScale.max > 0) {
    var zeroY = pT + gH - ((0 - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
    ctx.save();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(pL, zeroY); ctx.lineTo(pL + gW, zeroY); ctx.stroke();
    ctx.restore();
  }

  if (transX && transX.val >= xScale.min && transX.val <= xScale.max) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#d9534f";
    ctx.fillStyle = "#d9534f";
    ctx.font = "bold 11px Arial";
    var txPos = pL + ((transX.val - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    ctx.beginPath(); ctx.moveTo(txPos, pT); ctx.lineTo(txPos, pT + gH); ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(transX.label, txPos + 5, pT + 13);
    ctx.restore();
  }

  ctx.font = "bold 11.5px Arial";
  ctx.fillStyle = "#333";
  ctx.textAlign = "center";
  ctx.fillText(xTitle, pL + gW / 2, H - 5);

  ctx.save();
  ctx.translate(15, pT + gH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yTitle, 0, 0);
  ctx.restore();

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (var n = 0; n < xArr.length; n++) {
    var px = pL + ((xArr[n] - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    var py = pT + gH - ((yArr[n] - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
    if (n === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  if (y2Arr) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = y2Color || "#16a34a";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var n2 = 0; n2 < xArr.length; n2++) {
      var px2 = pL + ((xArr[n2] - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
      var py2 = pT + gH - ((y2Arr[n2] - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
      if (n2 === 0) ctx.moveTo(px2, py2);
      else ctx.lineTo(px2, py2);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (curX >= xScale.min && curX <= xScale.max) {
    var cx = pL + ((curX - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    var cy = pT + gH - ((curY - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
    ctx.fillStyle = "#d9534f";
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();

    if (y2Arr && typeof curY2 === "number") {
      var cy2 = pT + gH - ((curY2 - yScale.min) / (yScale.max - yScale.min || 1)) * gH;
      ctx.fillStyle = y2Color || "#16a34a";
      ctx.beginPath(); ctx.arc(cx, cy2, 4.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function plotDualAxisGraph(canvasId, xArr, yLeftArr, yRightArr, yRight2Arr, xScale, xTitle, yLeftTitle, yRightTitle, leftColor, rightColor, right2Color, curX, curYLeft, curYRight, curYRight2, transX) {
  var c = document.getElementById(canvasId);
  if (!c || !c.getContext) return;
  var ctx = c.getContext("2d");
  var W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  var pL = 65, pR = 65, pT = 16, pB = 36;
  var gW = W - pL - pR;
  var gH = H - pT - pB;

  var minL = 0, maxL = 100;
  for (var i = 0; i < yLeftArr.length; i++) {
    if (yLeftArr[i] < minL) minL = yLeftArr[i];
  }
  minL = Math.max(-50, Math.min(0, minL));
  var yScaleL = getNiceScale(minL, maxL, 5);

  var maxR = yRightArr[0];
  for (var r = 0; r < yRightArr.length; r++) {
    if (yRightArr[r] > maxR) maxR = yRightArr[r];
    if (yRight2Arr && yRight2Arr[r] > maxR) maxR = yRight2Arr[r];
  }
  var yScaleR = getNiceScale(0, Math.max(0.1, maxR * 1.05), 5);

  ctx.strokeStyle = "#e0e0e0";
  ctx.font = "11px Arial";
  ctx.lineWidth = 1;

  for (var j = 0; j <= yScaleL.ticks; j++) {
    var yValL = yScaleL.min + j * yScaleL.step;
    var yPos = pT + gH - ((yValL - yScaleL.min) / (yScaleL.max - yScaleL.min || 1)) * gH;
    ctx.beginPath(); ctx.moveTo(pL, yPos); ctx.lineTo(pL + gW, yPos); ctx.stroke();
    ctx.fillStyle = leftColor;
    ctx.textAlign = "right";
    ctx.fillText(formatTick(yValL) + "%", pL - 8, yPos + 4);
  }

  for (var jr = 0; jr <= yScaleR.ticks; jr++) {
    var yValR = yScaleR.min + jr * yScaleR.step;
    var yPosR = pT + gH - ((yValR - yScaleR.min) / (yScaleR.max - yScaleR.min || 1)) * gH;
    ctx.fillStyle = rightColor;
    ctx.textAlign = "left";
    ctx.fillText(formatTick(yValR) + " W", pL + gW + 8, yPosR + 4);
  }

  ctx.fillStyle = "#333";
  for (var k = 0; k <= xScale.ticks; k++) {
    var xVal = xScale.min + k * xScale.step;
    var xPos = pL + ((xVal - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    ctx.beginPath(); ctx.moveTo(xPos, pT); ctx.lineTo(xPos, pT + gH); ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(formatTick(xVal), xPos, pT + gH + 14);
  }

  if (transX && transX.val >= xScale.min && transX.val <= xScale.max) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#d9534f";
    ctx.fillStyle = "#d9534f";
    ctx.font = "bold 11px Arial";
    var txPos = pL + ((transX.val - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    ctx.beginPath(); ctx.moveTo(txPos, pT); ctx.lineTo(txPos, pT + gH); ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(transX.label, txPos + 5, pT + 13);
    ctx.restore();
  }

  ctx.font = "bold 11.5px Arial";
  ctx.fillStyle = "#333";
  ctx.textAlign = "center";
  ctx.fillText(xTitle, pL + gW / 2, H - 5);

  ctx.save();
  ctx.fillStyle = leftColor;
  ctx.translate(15, pT + gH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLeftTitle, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = rightColor;
  ctx.translate(W - 12, pT + gH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(yRightTitle, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(pL, pT, gW, gH);
  ctx.clip();

  ctx.strokeStyle = leftColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (var n = 0; n < xArr.length; n++) {
    var px = pL + ((xArr[n] - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    var pyL = pT + gH - ((yLeftArr[n] - yScaleL.min) / (yScaleL.max - yScaleL.min || 1)) * gH;
    if (n === 0) ctx.moveTo(px, pyL);
    else ctx.lineTo(px, pyL);
  }
  ctx.stroke();

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = rightColor;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (var nr = 0; nr < xArr.length; nr++) {
    var pxr = pL + ((xArr[nr] - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    var pyR = pT + gH - ((yRightArr[nr] - yScaleR.min) / (yScaleR.max - yScaleR.min || 1)) * gH;
    if (nr === 0) ctx.moveTo(pxr, pyR);
    else ctx.lineTo(pxr, pyR);
  }
  ctx.stroke();

  if (yRight2Arr) {
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = right2Color;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (var nr2 = 0; nr2 < xArr.length; nr2++) {
      var pxr2 = pL + ((xArr[nr2] - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
      var pyR2 = pT + gH - ((yRight2Arr[nr2] - yScaleR.min) / (yScaleR.max - yScaleR.min || 1)) * gH;
      if (nr2 === 0) ctx.moveTo(pxr2, pyR2);
      else ctx.lineTo(pxr2, pyR2);
    }
    ctx.stroke();
  }
  ctx.restore();

  if (curX >= xScale.min && curX <= xScale.max) {
    var cx = pL + ((curX - xScale.min) / (xScale.max - xScale.min || 1)) * gW;
    var cyL = pT + gH - ((Math.max(yScaleL.min, curYLeft) - yScaleL.min) / (yScaleL.max - yScaleL.min || 1)) * gH;
    var cyR = pT + gH - ((curYRight - yScaleR.min) / (yScaleR.max - yScaleR.min || 1)) * gH;

    ctx.fillStyle = leftColor;
    ctx.beginPath(); ctx.arc(cx, cyL, 4.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = rightColor;
    ctx.beginPath(); ctx.arc(cx, cyR, 4.5, 0, Math.PI * 2); ctx.fill();

    if (yRight2Arr && typeof curYRight2 === "number") {
      var cyR2 = pT + gH - ((curYRight2 - yScaleR.min) / (yScaleR.max - yScaleR.min || 1)) * gH;
      ctx.fillStyle = right2Color;
      ctx.beginPath(); ctx.arc(cx, cyR2, 4.0, 0, Math.PI * 2); ctx.fill();
    }
  }
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
    const select = document.getElementById("inFluid");
    if (!select) return;
    select.innerHTML = "";

    data.fluids.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.label;
      if (f.id === "Water") opt.selected = true;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load incompressible fluids:", err);
  }
}

async function downloadHistoryCsv() {
  try {
    const res = await fetch("/api/download-csv");
    if (!res.ok) {
      alert("No snapshots logged yet. Click 'Log Snapshot to CSV' first!");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calculation_history.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("CSV download failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    populatePipeMaterials(),
    populateIncompressibleFluids()
  ]);
  updateLabelsForUnitSystem();
  validateFinDia();
  if (typeof fetchFromBackend === "function") {
    fetchFromBackend(false);
  }
});