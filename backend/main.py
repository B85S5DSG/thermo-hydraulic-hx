import os
import csv
import math
from datetime import datetime
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import CoolProp.CoolProp as CP

from .models import CalcRequest
from .incompressible_fluids import get_fluid_props
from .solids import PIPE_MATERIALS
from .exchangers import solve_pipe, solve_double_pipe

app = FastAPI(title="Thermo-Hydraulic Heat Exchanger Calculator")

DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
HISTORY_CSV = os.path.join(DATA_DIR, "calculation_history.csv")


def flow_to_m3s(val: float, unit: str) -> float:
    if unit == "lpm":
        return val / 60000.0
    if unit == "gpm":
        return val * 0.0000630902
    if unit == "cfm":
        return val * 0.00047194745
    return val / 60000.0


def m3s_to_flow(q_m3s: float, unit: str) -> float:
    if unit == "lpm":
        return q_m3s * 60000.0
    if unit == "gpm":
        return q_m3s / 0.0000630902
    if unit == "cfm":
        return q_m3s / 0.00047194745
    return q_m3s * 60000.0


@app.get("/api/fluids")
def get_available_fluids():
    fluids = [{"id": "Water", "label": "Water (Liquid H2O)"}]
    try:
        pure_raw = CP.get_global_param_string("incompressible_list_pure").split(",")
        for f in sorted([x.strip() for x in pure_raw if x.strip()]):
            label = f
            if f.startswith("Dow"):
                label = f"Dowtherm {f[3:]}"
            elif f.startswith("T66") or f.startswith("T59") or f.startswith("T72"):
                label = f"Therminol {f[1:]}"
            elif f == "XOM":
                label = "Mobil Synthetic Lubricant Base (XOM)"
            elif f.startswith("Syl"):
                label = f"Syltherm {f[3:]}"
            fluids.append({"id": f"INCOMP::{f}", "label": label})
    except Exception:
        pass

    try:
        sol_raw = CP.get_global_param_string("incompressible_list_solution").split(",")
        sol_set = {x.strip() for x in sol_raw if x.strip()}
        for base, name in [("MEG", "Ethylene Glycol"), ("MPG", "Propylene Glycol")]:
            if base in sol_set:
                for pct in [20, 30, 40, 50, 60]:
                    fluids.append({
                        "id": f"INCOMP::{base}-{pct}%",
                        "label": f"{name} ({pct}% mass / Water)"
                    })
        for f in sorted(sol_set):
            if f not in ("MEG", "MPG"):
                fluids.append({
                    "id": f"INCOMP::{f}-30%",
                    "label": f"{f} Aqueous Solution (30% mass)"
                })
    except Exception:
        pass

    return {"fluids": fluids}


@app.get("/api/materials")
def get_available_materials():
    return {
        "materials": [
            {
                "id": key,
                "label": f"{val['label']} — k={val['k']} W/m·K",
                "k": val["k"],
                "eps_mm": val["eps_mm"],
            }
            for key, val in PIPE_MATERIALS.items()
        ]
    }


def log_calculation_to_disk(req: CalcRequest, cur: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    file_exists = os.path.isfile(HISTORY_CSV)
    nt = req.n_tubes if req.hx_type == "multi_tube" else 1
    with open(HISTORY_CSV, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow([
                "timestamp", "hx_type", "n_tubes", "flow_direction", "material", "Di_m", "wall_m", "L_m",
                "fluid", "flow_val", "flow_unit", "Tin_C", "Tout_C",
                "Q_extracted_W", "Q_net_W", "P_pump_W", "P_secondary_W",
                "net_eff_pct", "cop_sys", "Re_i", "Re_o"
            ])
        writer.writerow([
            datetime.utcnow().isoformat(),
            req.hx_type, nt, req.flow_direction, req.mat, req.Di, req.wall, req.L,
            req.fluid, req.flow_val, req.flow_unit, req.Tin,
            round(cur["Tout"], 3), round(cur["Q"], 2), round(cur["Q_net"], 2),
            round(cur["P_pump"], 3), round(cur["P_fan"], 3),
            round(cur["eff_net"], 2), round(cur["cop_sys"], 2),
            round(cur["Re_i"], 1), round(cur["Re_o"], 1)
        ])


@app.get("/api/download-csv")
def download_csv():
    if not os.path.isfile(HISTORY_CSV):
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(HISTORY_CSV, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "timestamp", "hx_type", "n_tubes", "flow_direction", "material", "Di_m", "wall_m", "L_m",
                "fluid", "flow_val", "flow_unit", "Tin_C", "Tout_C",
                "Q_extracted_W", "Q_net_W", "P_pump_W", "P_secondary_W",
                "net_eff_pct", "cop_sys", "Re_i", "Re_o"
            ])
    return FileResponse(HISTORY_CSV, media_type="text/csv", filename="calculation_history.csv")


@app.post("/api/calculate")
def calculate(req: CalcRequest):
    Q_m3s = flow_to_m3s(req.flow_val, req.flow_unit)
    eps_m = req.eps_mm / 1000.0
    eta_base = req.eta_pct / 100.0
    eta_fan = req.eta_fan_pct / 100.0

    fin_kwargs = dict(
        use_fins=req.use_fins,
        fin_dia_m=req.fin_dia_mm / 1000.0,
        fin_thick_m=req.fin_thick_mm / 1000.0,
        fin_pitch_m=req.fin_pitch_mm / 1000.0,
        duct_margin_pct=req.duct_margin_pct,
    )

    shell_Q_m3s = flow_to_m3s(req.shell_flow_val, req.shell_flow_unit)
    shell_Di_m = req.shell_Di_mm / 1000.0
    eta_shell = req.eta_shell_pct / 100.0
    active_ntubes = req.n_tubes if req.hx_type == "multi_tube" else 1

    def run_solver(wall_val=req.wall, q_val=Q_m3s, v_air_val=req.V_air):
        if req.hx_type in ("double_pipe", "multi_tube"):
            return solve_double_pipe(
                Di=req.Di,
                wall=wall_val,
                L=req.L,
                eps_m=eps_m,
                mat=req.mat,
                fluid=req.fluid,
                Q_m3s=q_val,
                Tin=req.Tin,
                eta_base=eta_base,
                shell_Di=shell_Di_m,
                shell_fluid=req.shell_fluid,
                shell_Q_m3s=shell_Q_m3s,
                shell_Tin=req.shell_Tin,
                eta_shell_pump=eta_shell,
                flow_direction=req.flow_direction,
                n_tubes=active_ntubes,
                pitch_ratio=req.pitch_ratio,
            )
        return solve_pipe(
            Di=req.Di,
            wall=wall_val,
            L=req.L,
            eps_m=eps_m,
            mat=req.mat,
            fluid=req.fluid,
            Q_m3s=q_val,
            Tin=req.Tin,
            eta_base=eta_base,
            V_air=v_air_val,
            Tinf=req.Tinf,
            eta_fan=eta_fan,
            **fin_kwargs,
        )

    cur = run_solver()

    if req.save_snapshot:
        log_calculation_to_disk(req, cur)

    init_f = get_fluid_props(req.fluid, req.Tin)
    A_i_total = active_ntubes * (math.pi * req.Di * req.Di / 4.0)
    crit_q_m3s = (2300.0 * init_f["nu"] / req.Di) * A_i_total
    crit_flow = m3s_to_flow(crit_q_m3s, req.flow_unit)

    N = 120
    sweep = {"x": [], "Q": [], "Q_net": [], "Tout": [], "Nu": [], "P_pump": [], "P_tot": [], "eff": []}

    if req.x_mode == "Re_i":
        max_re = max(12000.0, cur["Re_i"] * 1.35)
        for s in range(1, N + 1):
            re_target = (max_re / N) * s
            q_s = (re_target * cur["nu_i"] / req.Di) * A_i_total
            pt = run_solver(q_val=q_s)
            sweep["x"].append(pt["Re_i"])
            sweep["Q"].append(pt["Q"])
            sweep["Q_net"].append(pt["Q_net"])
            sweep["Tout"].append(pt["Tout"])
            sweep["Nu"].append(pt["Nu_i"])
            sweep["P_pump"].append(pt["P_pump"])
            sweep["P_tot"].append(pt["P_tot_elec"])
            sweep["eff"].append(pt["eff_net"])

    elif req.x_mode == "Flow":
        max_flow = max(req.flow_val * 1.4, crit_flow * 1.5, 5.0)
        for s in range(1, N + 1):
            f_val = (max_flow / N) * s
            q_s = flow_to_m3s(f_val, req.flow_unit)
            pt = run_solver(q_val=q_s)
            sweep["x"].append(f_val)
            sweep["Q"].append(pt["Q"])
            sweep["Q_net"].append(pt["Q_net"])
            sweep["Tout"].append(pt["Tout"])
            sweep["Nu"].append(pt["Nu_i"])
            sweep["P_pump"].append(pt["P_pump"])
            sweep["P_tot"].append(pt["P_tot_elec"])
            sweep["eff"].append(pt["eff_net"])

    elif req.x_mode == "Wall":
        max_w_mm = max(25.0, (req.wall * 1000.0) * 1.6)
        if req.hx_type in ("double_pipe", "multi_tube"):
            max_do = (req.shell_Di_mm / math.sqrt(active_ntubes * 1.25))
            max_allowed = max(0.5, (max_do - req.Di * 1000.0 - 1.0) / 2.0)
            max_w_mm = min(max_w_mm, max_allowed)
        for s in range(0, N + 1):
            w_mm = 0.2 + ((max_w_mm - 0.2) / N) * s
            pt = run_solver(wall_val=w_mm / 1000.0)
            sweep["x"].append(w_mm)
            sweep["Q"].append(pt["Q"])
            sweep["Q_net"].append(pt["Q_net"])
            sweep["Tout"].append(pt["Tout"])
            sweep["Nu"].append(pt["Nu_o"])
            sweep["P_pump"].append(pt["P_pump"])
            sweep["P_tot"].append(pt["P_tot_elec"])
            sweep["eff"].append(pt["eff_net"])

    elif req.x_mode == "V_air":
        max_v = max(25.0, req.V_air * 1.4)
        for s in range(0, N + 1):
            v_s = (max_v / N) * s
            pt = run_solver(v_air_val=v_s)
            sweep["x"].append(v_s)
            sweep["Q"].append(pt["Q"])
            sweep["Q_net"].append(pt["Q_net"])
            sweep["Tout"].append(pt["Tout"])
            sweep["Nu"].append(pt["Nu_o"])
            sweep["P_pump"].append(pt["P_pump"])
            sweep["P_tot"].append(pt["P_tot_elec"])
            sweep["eff"].append(pt["eff_net"])

    else:  # Re_o
        max_v = max(35.0, req.V_air * 1.5)
        for s in range(1, N + 1):
            v_s = (max_v / N) * s
            pt = run_solver(v_air_val=v_s)
            sweep["x"].append(pt["Re_o"])
            sweep["Q"].append(pt["Q"])
            sweep["Q_net"].append(pt["Q_net"])
            sweep["Tout"].append(pt["Tout"])
            sweep["Nu"].append(pt["Nu_o"])
            sweep["P_pump"].append(pt["P_pump"])
            sweep["P_tot"].append(pt["P_tot_elec"])
            sweep["eff"].append(pt["eff_net"])

    return {"current": cur, "sweep": sweep, "crit_flow": crit_flow}


app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
