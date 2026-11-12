import os
import csv
import math
from datetime import datetime
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import CoolProp.CoolProp as CP
from .models import CalcRequest
from .solver import solve_pipe
from .solids import PIPE_MATERIALS

app = FastAPI(title="Finned-Tube Cross-Flow Heat Exchanger Calculator API")

DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
os.makedirs(DATA_DIR, exist_ok=True)
HISTORY_CSV = os.path.join(DATA_DIR, "calculation_history.csv")

def log_calculation_to_disk(req: CalcRequest, cur: dict) -> str:
    file_exists = os.path.isfile(HISTORY_CSV)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(HISTORY_CSV, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow([
                "Timestamp", "Material", "Fluid", "Pump_Type", "Di_m", "Wall_m", "Length_m",
                "Flow", "Flow_Unit", "Tin_C", "V_air_ms", "Tinf_C",
                "Tout_C", "Q_ext_W", "P_pump_W", "P_fan_W", "Q_net_W", "Net_Eff_Pct", "System_COP"
            ])
        writer.writerow([
            timestamp, req.mat, req.fluid, cur["pumpInfo"]["pumpType"],
            req.Di, req.wall, req.L, req.flow_val, req.flow_unit, req.Tin, req.V_air, req.Tinf,
            round(cur["Tout"], 3), round(cur["Q"], 2), round(cur["P_pump"], 3),
            round(cur["P_fan"], 3), round(cur["Q_net"], 2), round(cur["eff_net"], 2), round(cur["cop_sys"], 2)
        ])
    return HISTORY_CSV

@app.get("/api/materials")
def get_available_materials():
    """Returns solid pipe materials from solids.py with conductivity (W/m-K) and roughness (mm)."""
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

@app.get("/api/fluids")
def get_available_fluids():
    """Queries CoolProp for pure incompressible liquids and aqueous glycol/brine solutions."""
    fluids = [{"id": "Water", "label": "Water (Liquid H2O)"}]

    name_map = {
        "DowJ": "Dowtherm J (Synthetic Aromatic)",
        "DowJ2": "Dowtherm J2",
        "DowQ": "Dowtherm Q (Heat Transfer Oil)",
        "DowQ2": "Dowtherm Q2",
        "T66": "Therminol 66 (High-Temp Synthetic Oil)",
        "T72": "Therminol 72",
        "S800": "Syltherm 800 (Silicone Heat Transfer Fluid)",
        "XLT": "Syltherm XLT (Low-Temp Silicone Fluid)",
        "XLT2": "Syltherm XLT2",
        "LiqNa": "Liquid Sodium (Na)",
        "NaK": "Sodium-Potassium Eutectic (NaK)",
        "HFE": "3M Novec / HFE-7100 Engineered Fluid",
        "HFE2": "3M Novec / HFE-7200 Engineered Fluid",
        "PBB": "Paratherm BB Heat Transfer Oil",
        "PCL": "Paratherm CL Heat Transfer Oil",
        "PCR": "Paratherm CR Heat Transfer Oil",
        "PHE": "Paratherm HE High-Efficiency Oil",
        "PHR": "Paratherm HR Heat Transfer Oil",
        "PLR": "Paratherm LR Low-Range Oil",
        "PMR": "Paratherm MR Mid-Range Oil",
    }

    ignore_prefixes = ("Example", "Food")
    ignore_exact = {"Air", "Water"}

    try:
        pure_raw = CP.get_global_param_string("incompressible_list_pure").split(",")
        for f in sorted([x.strip() for x in pure_raw if x.strip()]):
            if f in ignore_exact or f.startswith(ignore_prefixes):
                continue
            label = name_map.get(f, f)
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

        if "MITSW" in sol_set:
            fluids.append({"id": "INCOMP::MITSW-3.5%", "label": "Standard Seawater (3.5% salinity)"})

        for f in sorted(sol_set):
            if f in ("MEG", "MPG", "MITSW") or f.startswith(ignore_prefixes):
                continue
            fluids.append({
                "id": f"INCOMP::{f}-30%",
                "label": f"{f} Aqueous Solution (30% mass)"
            })
    except Exception:
        pass

    return {"fluids": fluids}

@app.post("/api/calculate")
def calculate(req: CalcRequest):
    eps_m = req.eps_mm * 1e-3
    fin_dia_m = req.fin_dia_mm * 1e-3
    fin_thick_m = req.fin_thick_mm * 1e-3
    fin_pitch_m = req.fin_pitch_mm * 1e-3
    eta_base = req.eta_pct / 100.0
    eta_fan = req.eta_fan_pct / 100.0
    unit_factor = (1.0 / 60000.0) if req.flow_unit == "lpm" else (0.0283168466 / 60.0)
    Q_m3s = req.flow_val * unit_factor
    A_cross = math.pi * req.Di * req.Di / 4.0

    fin_kwargs = dict(
        use_fins=req.use_fins,
        fin_dia_m=fin_dia_m,
        fin_thick_m=fin_thick_m,
        fin_pitch_m=fin_pitch_m,
        duct_margin_pct=req.duct_margin_pct,
    )

    cur = solve_pipe(req.Di, req.wall, req.L, eps_m, req.mat, req.fluid,
                     Q_m3s, req.Tin, req.V_air, req.Tinf, eta_base, eta_fan, **fin_kwargs)

    saved_path = None
    if req.save_snapshot:
        saved_path = log_calculation_to_disk(req, cur)

    steps = 120
    sweep = {"x": [], "Q": [], "Q_net": [], "Tout": [], "Nu": [], "eff": [], "P_pump": [], "P_tot": []}
    crit_flow = ((2300.0 * cur["nu_i"]) / req.Di) * A_cross / unit_factor

    if req.x_mode in ("Re_i", "Flow"):
        max_x = max(10000.0, cur["Re_i"] * 1.5) if req.x_mode == "Re_i" else max(req.flow_val * 1.5, crit_flow * 2.5)
        for i in range(1, steps + 1):
            x_val = (i / steps) * max_x
            sample_Q = ((x_val * cur["nu_i"] / req.Di) * A_cross) if req.x_mode == "Re_i" else (x_val * unit_factor)
            pt = solve_pipe(req.Di, req.wall, req.L, eps_m, req.mat, req.fluid,
                            sample_Q, req.Tin, req.V_air, req.Tinf, eta_base, eta_fan, **fin_kwargs)
            sweep["x"].append(x_val)
            sweep["Q"].append(pt["Q"])
            sweep["Q_net"].append(pt["Q_net"])
            sweep["Tout"].append(pt["Tout"])
            sweep["Nu"].append(pt["Nu_i"])
            sweep["eff"].append(pt["eff_net"])
            sweep["P_pump"].append(pt["P_pump"])
            sweep["P_tot"].append(pt["P_tot_elec"])
    elif req.x_mode == "Wall":
        max_x = max(15.0, req.wall * 1000.0 * 2.5)
        for i in range(1, steps + 1):
            w_mm = (i / steps) * max_x
            pt = solve_pipe(req.Di, w_mm / 1000.0, req.L, eps_m, req.mat, req.fluid,
                            Q_m3s, req.Tin, req.V_air, req.Tinf, eta_base, eta_fan, **fin_kwargs)
            sweep["x"].append(w_mm)
            sweep["Q"].append(pt["Q"])
            sweep["Q_net"].append(pt["Q_net"])
            sweep["Tout"].append(pt["Tout"])
            sweep["Nu"].append(pt["Nu_o"])
            sweep["eff"].append(pt["eff_net"])
            sweep["P_pump"].append(pt["P_pump"])
            sweep["P_tot"].append(pt["P_tot_elec"])
    else:
        max_V = max(30.0, req.V_air * 1.5)
        max_x = max_V if req.x_mode == "V_air" else (max_V * cur["Do"]) / cur["nu_o"]
        for i in range(1, steps + 1):
            x_val = (i / steps) * max_x
            sample_V = x_val if req.x_mode == "V_air" else (x_val * cur["nu_o"]) / cur["Do"]
            pt = solve_pipe(req.Di, req.wall, req.L, eps_m, req.mat, req.fluid,
                            Q_m3s, req.Tin, sample_V, req.Tinf, eta_base, eta_fan, **fin_kwargs)
            sweep["x"].append(x_val)
            sweep["Q"].append(pt["Q"])
            sweep["Q_net"].append(pt["Q_net"])
            sweep["Tout"].append(pt["Tout"])
            sweep["Nu"].append(pt["Nu_o"])
            sweep["eff"].append(pt["eff_net"])
            sweep["P_pump"].append(pt["P_pump"])
            sweep["P_tot"].append(pt["P_tot_elec"])

    return {
        "current": cur,
        "sweep": sweep,
        "crit_flow": crit_flow,
        "saved_to": saved_path
    }

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")