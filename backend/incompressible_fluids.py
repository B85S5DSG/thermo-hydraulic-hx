import math, re
import CoolProp.CoolProp as CP
from CoolProp.CoolProp import PropsSI

def _normalize_coolprop_name(fluid_type: str) -> str:
    if fluid_type in ("water", "Water"): return "HEOS::Water"
    m = re.match(r"^(INCOMP::[A-Za-z0-9_]+)-([0-9.]+)%$", fluid_type)
    if m:
        base, pct = m.group(1), float(m.group(2)) / 100.0
        return f"{base}[{pct:.4f}]"
    return fluid_type

def list_incompressible_fluids() -> list:
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
        "XOM": "Mobil Synthetic Lubricant Base (XOM)",
    }
    ignore_prefixes = ("Example", "Food")
    ignore_exact = {"Air", "Water"}
    try:
        pure_raw = CP.get_global_param_string("incompressible_list_pure").split(",")
        for f in sorted([x.strip() for x in pure_raw if x.strip()]):
            if f in ignore_exact or f.startswith(ignore_prefixes): continue
            label = name_map.get(f, f"{f} (CoolProp Incompressible)")
            fluids.append({"id": f"INCOMP::{f}", "label": label})
    except Exception:
        pass
    try:
        sol_raw = CP.get_global_param_string("incompressible_list_solution").split(",")
        sol_set = {x.strip() for x in sol_raw if x.strip()}
        for base, name in [("MEG", "Ethylene Glycol"), ("MPG", "Propylene Glycol")]:
            if base in sol_set:
                for pct in [20, 30, 40, 50, 60]:
                    fluids.append({"id": f"INCOMP::{base}-{pct}%", "label": f"{name} ({pct}% mass / Water)"})
        if "MITSW" in sol_set:
            fluids.append({"id": "INCOMP::MITSW-3.5%", "label": "Standard Seawater (3.5% salinity)"})
        for f in sorted(sol_set):
            if f in ("MEG", "MPG", "MITSW") or f.startswith(ignore_prefixes): continue
            fluids.append({"id": f"INCOMP::{f}-30%", "label": f"{f} Aqueous Brine/Solution (30% mass)"})
    except Exception:
        pass
    return fluids

def get_fluid_props(fluid_type: str, T_c: float) -> dict:
    T_k = T_c + 273.15
    P_pa = 202650.0
    backend = _normalize_coolprop_name(fluid_type)
    try:
        t_min = PropsSI("Tmin", backend)
        t_max = PropsSI("Tmax", backend)
        T_eval = max(t_min + 0.5, min(t_max - 0.5, T_k))
        rho = PropsSI("D", "T", T_eval, "P", P_pa, backend)
        cp = PropsSI("C", "T", T_eval, "P", P_pa, backend)
        k = PropsSI("L", "T", T_eval, "P", P_pa, backend)
        mu = PropsSI("V", "T", T_eval, "P", P_pa, backend)
    except Exception:
        T_safe = max(274.15, min(390.0, T_k))
        rho = PropsSI("D", "T", T_safe, "P", P_pa, "HEOS::Water")
        cp = PropsSI("C", "T", T_safe, "P", P_pa, "HEOS::Water")
        k = PropsSI("L", "T", T_safe, "P", P_pa, "HEOS::Water")
        mu = PropsSI("V", "T", T_safe, "P", P_pa, "HEOS::Water")
    nu = mu / rho
    Pr = (mu * cp) / k
    return {"rho": rho, "cp": cp, "k": k, "mu": mu, "nu": nu, "Pr": Pr}

def get_air_film_props(T_so: float, T_inf: float) -> dict:
    Tf_air = max(200.0, ((T_so + 273.15) + (T_inf + 273.15)) / 2.0)
    P_pa = 101325.0
    try:
        rho_air = PropsSI("D", "T", Tf_air, "P", P_pa, "HEOS::Air")
        cp_air = PropsSI("C", "T", Tf_air, "P", P_pa, "HEOS::Air")
        k_air = PropsSI("L", "T", Tf_air, "P", P_pa, "HEOS::Air")
        mu_air = PropsSI("V", "T", Tf_air, "P", P_pa, "HEOS::Air")
        nu_air = mu_air / rho_air
        Pr_air = (mu_air * cp_air) / k_air
    except Exception:
        k_air = 0.02624 * math.pow(Tf_air / 300.0, 0.86)
        nu_air = 0.00001589 * math.pow(Tf_air / 300.0, 1.69)
        rho_air = 101325.0 / (287.05 * Tf_air)
        Pr_air = 0.701
    return {"k": k_air, "nu": nu_air, "rho": rho_air, "Pr": Pr_air}
