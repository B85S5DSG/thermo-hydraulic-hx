import math

def get_pump_characteristics(fluid: str, nu_m2s: float, eta_base: float) -> dict:
    nu_cSt = nu_m2s * 1e6
    f_lower = fluid.lower()

    # Automatically select Positive Displacement for thermal oils or fluids > 5 cSt
    oil_tags = (
        "oil", "xom", "t66", "t72", "s800", "syl", "dow",
        "pbb", "pcl", "pcr", "phe", "phr", "plr", "pmr",
        "xlt", "tco", "td12", "tvp", "tx22", "ty"
    )
    is_viscous_oil = nu_cSt > 5.0 or any(tag in f_lower for tag in oil_tags)

    if is_viscous_oil:
        pump_type = "Positive Displacement (Rotary Gear)"
        slip_loss = 0.04 * ((25.0 - nu_cSt) / 25.0) if nu_cSt < 25.0 else 0.0
        visc_drag = 0.00045 * (nu_cSt - 35.0) if nu_cSt > 35.0 else 0.0
        eta_actual = max(0.20, min(0.92, eta_base - slip_loss - visc_drag))
        desc = (
            f"Positive Displacement rotary gear pump selected for viscous fluid "
            f"(&nu; = {nu_cSt:.1f} cSt). High volumetric efficiency; minimal slip."
        )
    else:
        pump_type = "Centrifugal (Radial Impeller)"
        c_eta = max(0.25, 1.0 - 0.018 * math.pow(nu_cSt - 1.2, 0.75)) if nu_cSt > 1.2 else 1.0
        eta_actual = max(0.15, min(0.90, eta_base * c_eta))
        desc = (
            f"Centrifugal impeller pump selected for low-viscosity liquid "
            f"(&nu; = {nu_cSt:.2f} cSt, viscosity factor C_&eta; = {c_eta*100:.1f}%)."
        )

    return {
        "pumpType": pump_type,
        "desc": desc,
        "nu_cSt": nu_cSt,
        "eta_actual": eta_actual
    }

def calc_darcy_friction(Re_i: float, rel_rough: float) -> float:
    if Re_i <= 1e-6:
        return 0.0
    if Re_i < 2300.0:
        return 64.0 / Re_i
    Re_t = max(2300.0, Re_i)
    term = (rel_rough / 3.7) + (5.74 / math.pow(Re_t, 0.9))
    f_turb = 0.25 / math.pow(math.log10(term), 2.0)
    if Re_i < 3000.0:
        wf = (Re_i - 2300.0) / 700.0
        return (1.0 - wf) * (64.0 / 2300.0) + wf * f_turb
    return f_turb

def get_cylinder_drag_coeff(Re_o: float) -> float:
    if Re_o <= 0.1:
        return 60.0
    if Re_o < 1000.0:
        return 1.18 + 6.8 / math.pow(Re_o, 0.89) + 1.96 / math.pow(Re_o, 0.5)
    if Re_o < 200000.0:
        return 1.15
    return 0.35