import os, csv, math
from datetime import datetime
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .models import CalcRequest
from .solids import list_pipe_materials
from .incompressible_fluids import list_incompressible_fluids
from .exchangers import solve_pipe, solve_double_pipe

app = FastAPI(title="Thermo-Hydraulic Heat Exchanger API")
DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
os.makedirs(DATA_DIR, exist_ok=True)
HISTORY_CSV = os.path.join(DATA_DIR, "calculation_history.csv")

def to_m3s(val: float, unit: str) -> float:
    if unit == "lpm": return val / 60000.0
    if unit == "gpm": return val * 0.003785411784 / 60.0
    return val * 0.0283168466 / 60.0

def log_calculation_to_disk(req: CalcRequest, cur: dict) -> str:
    file_exists = os.path.isfile(HISTORY_CSV)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(HISTORY_CSV, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Timestamp", "HX_Type", "Material", "Fluid", "Pump_Type", "Di_m", "Wall_m", "Length_m", "Flow", "Flow_Unit", "Tin_C", "Tout_C", "Q_W", "P_pump_W", "P_sec_W", "Q_net_W", "Net_Eff_Pct", "System_COP"])
        writer.writerow([timestamp, req.hx_type, req.mat, req.fluid, cur["pumpInfo"]["pumpType"], req.Di, req.wall, req.L, req.flow_val, req.flow_unit, req.Tin, round(cur["Tout"], 3), round(cur["Q"], 2), round(cur["P_pump"], 3), round(cur.get("P_fan", 0.0), 3), round(cur["Q_net"], 2), round(cur["eff_net"], 2), round(cur["cop_sys"], 2)])
    return HISTORY_CSV

@app.get("/api/materials")
def api_materials():
    return {"materials": list_pipe_materials()}

@app.get("/api/fluids")
def api_fluids():
    return {"fluids": list_incompressible_fluids()}

@app.get("/api/download-csv")
def download_csv():
    if not os.path.isfile(HISTORY_CSV):
        with open(HISTORY_CSV, "w", encoding="utf-8") as f:
            f.write("Timestamp,HX_Type,Material,Fluid,Pump_Type,Di_m,Wall_m,Length_m,Flow,Flow_Unit,Tin_C,Tout_C,Q_W,P_pump_W,P_sec_W,Q_net_W,Net_Eff_Pct,System_COP\n")
    return FileResponse(HISTORY_CSV, media_type="text/csv", filename="calculation_history.csv")

@app.post("/api/calculate")
def calculate(req: CalcRequest):
    eps_m = req.eps_mm * 1e-3
    eta_base = req.eta_pct / 100.0
    eta_fan = req.eta_fan_pct / 100.0
    eta_shell = req.eta_shell_pct / 100.0
    Q_m3s = to_m3s(req.flow_val, req.flow_unit)
    Q_shell_m3s = to_m3s(req.shell_flow_val, req.shell_flow_unit)
    unit_factor = Q_m3s / max(1e-12, req.flow_val)
    inner_style = req.inner_pump_type if req.inner_pump_type != "auto" else req.pump_style
    shell_style = req.shell_pump_type if req.shell_pump_type != "auto" else req.shell_pump_style
    is_shell = req.hx_type in ("double_pipe", "multi_tube")
    nt = req.n_tubes if req.hx_type == "multi_tube" else 1
    A_cross_total = nt * (math.pi * req.Di * req.Di / 4.0)
    def run_solver(Di_v=req.Di, wall_v=req.wall, Q_i_v=Q_m3s, V_air_v=req.V_air, Q_o_v=Q_shell_m3s):
        if is_shell:
            return solve_double_pipe(Di=Di_v, wall=wall_v, L=req.L, eps_m=eps_m, mat=req.mat, fluid_i=req.fluid, Q_i_m3s=Q_i_v, Tin_i=req.Tin, eta_i_base=eta_base, D_shell_i=req.shell_Di_mm * 1e-3, fluid_o=req.shell_fluid, Q_o_m3s=Q_o_v, Tin_o=req.shell_Tin, eta_o_base=eta_shell, flow_direction=req.flow_direction, n_tubes=nt, pitch_ratio=req.pitch_ratio, pump_style_i=inner_style, pump_style_o=shell_style)
        return solve_pipe(Di=Di_v, wall=wall_v, L=req.L, eps_m=eps_m, mat=req.mat, fluid=req.fluid, Q_m3s=Q_i_v, Tin=req.Tin, V_air=V_air_v, Tinf=req.Tinf, eta_base=eta_base, eta_fan=eta_fan, use_fins=req.use_fins, fin_dia_mm=req.fin_dia_mm, fin_thick_mm=req.fin_thick_mm, fin_pitch_mm=req.fin_pitch_mm, duct_margin_pct=req.duct_margin_pct, pump_style=inner_style)
    cur = run_solver()
    saved_path = log_calculation_to_disk(req, cur) if req.save_snapshot else None
    steps = 60
    sweep = {"x": [], "Q": [], "Q_net": [], "Tout": [], "Nu_i": [], "Nu": [], "eff": [], "P_pump": [], "P_tot": []}
    crit_flow = ((2300.0 * cur["nu_i"]) / req.Di) * A_cross_total / unit_factor
    for i in range(1, steps + 1):
        frac = i / steps
        if req.x_mode == "Re_i":
            x_val = frac * max(10000.0, cur["Re_i"] * 1.5)
            pt = run_solver(Q_i_v=(x_val * cur["nu_i"] / req.Di) * A_cross_total)
        elif req.x_mode == "Flow":
            x_val = frac * max(req.flow_val * 1.5, crit_flow * 2.0)
            pt = run_solver(Q_i_v=x_val * unit_factor)
        elif req.x_mode == "Wall":
            x_val = frac * max(10.0, req.wall * 1000.0 * 2.5)
            pt = run_solver(wall_v=x_val / 1000.0)
        elif req.x_mode == "V_air" and not is_shell:
            x_val = frac * max(25.0, req.V_air * 1.5)
            pt = run_solver(V_air_v=x_val)
        else:
            x_val = frac * max(10000.0, cur["Re_o"] * 1.5)
            pt = run_solver(Q_o_v=Q_shell_m3s * (x_val / max(1.0, cur["Re_o"]))) if is_shell else run_solver(V_air_v=(x_val * cur["nu_o"]) / cur["Do"])
        sweep["x"].append(x_val); sweep["Q"].append(pt["Q"]); sweep["Q_net"].append(pt["Q_net"]); sweep["Tout"].append(pt["Tout"]); sweep["Nu_i"].append(pt["Nu_i"]); sweep["Nu"].append(pt["Nu_i"]); sweep["eff"].append(pt["eff_net"]); sweep["P_pump"].append(pt["P_pump"]); sweep["P_tot"].append(pt["P_tot_elec"])
    return {"current": cur, "sweep": sweep, "crit_flow": crit_flow, "saved_to": saved_path}

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
