import math
import re
from CoolProp.CoolProp import PropsSI

def _normalize_coolprop_name(fluid_type: str) -> str:
    if fluid_type in ("water", "Water"):
        return "HEOS::Water"
    m = re.match(r"^(INCOMP::[A-Za-z0-9_]+)-([0-9.]+)%$", fluid_type)
    if m:
        base, pct = m.group(1), float(m.group(2)) / 100.0
        return f"{base}[{pct:.4f}]"
    return fluid_type

def get_fluid_props(fluid_type: str, T_c: float, P_pa: float = 101325.0) -> dict:
    T_k = T_c + 273.15
    backend = _normalize_coolprop_name(fluid_type)

    # For pure water, ensure lookup pressure is slightly above saturation pressure so it stays liquid
    if backend == "HEOS::Water":
        try:
            p_sat = PropsSI("P", "T", min(T_k, 640.0), "Q", 0, "HEOS::Water")
            P_eval = max(P_pa, p_sat + 5000.0)
        except Exception:
            P_eval = max(P_pa, 202650.0)
    else:
        P_eval = max(101325.0, P_pa)

    try:
        t_min = PropsSI("Tmin", backend)
        t_max = PropsSI("Tmax", backend)
        T_eval = max(t_min + 0.5, min(t_max - 0.5, T_k))

        rho = PropsSI("D", "T", T_eval, "P", P_eval, backend)
        cp = PropsSI("C", "T", T_eval, "P", P_eval, backend)
        k = PropsSI("L", "T", T_eval, "P", P_eval, backend)
        mu = PropsSI("V", "T", T_eval, "P", P_eval, backend)

    except Exception as e:
        print(f"[CoolProp Warning] Failed for {backend} at {T_c} C: {e}")
        T_safe = max(274.15, min(390.0, T_k))
        rho = PropsSI("D", "T", T_safe, "P", 202650.0, "HEOS::Water")
        cp = PropsSI("C", "T", T_safe, "P", 202650.0, "HEOS::Water")
        k = PropsSI("L", "T", T_safe, "P", 202650.0, "HEOS::Water")
        mu = PropsSI("V", "T", T_safe, "P", 202650.0, "HEOS::Water")

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