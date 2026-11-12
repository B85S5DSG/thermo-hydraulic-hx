import math
from ht.conv_internal import Nu_conv_internal
from ht.hx import effectiveness_from_NTU, shell_clearance
from fluids.friction import friction_factor
from ..incompressible_fluids import get_fluid_props
from ..solids import get_pipe_k
from ..hydraulics import get_pump_characteristics


def solve_double_pipe(
    Di: float,
    wall: float,
    L: float,
    eps_m: float,
    mat: str,
    fluid: str,
    Q_m3s: float,
    Tin: float,
    eta_base: float,
    shell_Di: float,
    shell_fluid: str,
    shell_Q_m3s: float,
    shell_Tin: float,
    eta_shell_pump: float,
    flow_direction: str = "counter",
    n_tubes: int = 1,
    pitch_ratio: float = 1.25,
    inner_pump_type: str | None = None,
    shell_pump_type: str | None = None,
) -> dict:
    """
    Single Concentric Double-Pipe (n_tubes=1) or Unbaffled Multi-Tube Bundle (n_tubes>1)
    Heat Exchanger solver using prevalidated correlations from `ht`, `fluids`, and `CoolProp`.
    """
    nt = max(1, int(n_tubes))
    Do = Di + 2.0 * wall
    pr = max(1.05, float(pitch_ratio))

    if nt == 1:
        min_shell_Di = Do + 0.002
    else:
        P_T = Do * pr
        d_bundle = Do + P_T * math.sqrt((nt - 1) * 1.15)
        clearance = shell_clearance(d_bundle)
        min_shell_Di = d_bundle + clearance

    D_shell_i = max(shell_Di, min_shell_Di)

    k_pipe = get_pipe_k(mat)
    R_wall = math.log(Do / Di) / (2.0 * math.pi * k_pipe * L * nt)

    A_i_single = math.pi * Di * Di / 4.0
    Q_m3s_tube = Q_m3s / nt
    V_i = Q_m3s_tube / A_i_single

    A_shell_total = (math.pi / 4.0) * (D_shell_i * D_shell_i)
    A_tubes_total = nt * (math.pi / 4.0) * (Do * Do)
    A_o = max(1e-7, A_shell_total - A_tubes_total)
    free_space_pct = (A_o / A_shell_total) * 100.0

    Pw_o = math.pi * (D_shell_i + nt * Do)
    Dh_o = (4.0 * A_o) / Pw_o
    V_o = shell_Q_m3s / A_o

    T_bulk_i = Tin
    T_bulk_o = shell_Tin

    Tout_i, Tout_o, Q, UA = Tin, shell_Tin, 0.0, 0.0
    Re_i, Nu_i, h_i, R_i = 0.0, 3.66, 0.0, 0.0
    Re_o, Nu_o, h_o, R_o = 0.0, 3.66, 0.0, 0.0
    fprops_i, fprops_o = {}, {}

    rel_rough_i = max(0.0, eps_m / Di)
    rel_rough_o = max(0.0, eps_m / Dh_o)
    mode = (flow_direction or "counter").strip().lower()

    for _ in range(8):
        fprops_i = get_fluid_props(fluid, T_bulk_i)
        Re_i = (V_i * Di) / fprops_i["nu"]
        Nu_i = Nu_conv_internal(Re=max(1.0, Re_i), Pr=fprops_i["Pr"], eD=rel_rough_i, Di=Di, x=L)
        h_i = (Nu_i * fprops_i["k"]) / Di
        R_i = 1.0 / (max(1e-6, h_i) * math.pi * Di * L * nt)

        fprops_o = get_fluid_props(shell_fluid, T_bulk_o)
        Re_o = (V_o * Dh_o) / fprops_o["nu"]
        Nu_o = Nu_conv_internal(Re=max(1.0, Re_o), Pr=fprops_o["Pr"], eD=rel_rough_o, Di=Dh_o, x=L)
        h_o = (Nu_o * fprops_o["k"]) / Dh_o
        R_o = 1.0 / (max(1e-6, h_o) * math.pi * Do * L * nt)

        UA = 1.0 / (R_i + R_wall + R_o)

        C_i = fprops_i["rho"] * Q_m3s * fprops_i["cp"]
        C_o = fprops_o["rho"] * shell_Q_m3s * fprops_o["cp"]
        C_min = min(C_i, C_o)
        C_max = max(C_i, C_o)

        if C_min > 1e-9:
            Cr = C_min / C_max
            NTU = UA / C_min
            subtype = "parallel" if mode == "parallel" else "counterflow"
            eps_hx = float(effectiveness_from_NTU(NTU=NTU, Cr=Cr, subtype=subtype))
            Q_max = C_min * (Tin - shell_Tin)
            Q = eps_hx * Q_max
            Tout_i = Tin - (Q / C_i)
            Tout_o = shell_Tin + (Q / C_o)
        else:
            Tout_i, Tout_o, Q = Tin, shell_Tin, 0.0

        T_bulk_i = 0.5 * (Tin + Tout_i)
        T_bulk_o = 0.5 * (shell_Tin + Tout_o)

    pump_info = get_pump_characteristics(fluid, fprops_i["nu"], eta_base, inner_pump_type)
    f_darcy_i = friction_factor(Re=max(1.0, Re_i), eD=rel_rough_i) if Re_i > 1e-6 else 0.0
    dP_i = f_darcy_i * (L / Di) * (0.5 * fprops_i["rho"] * V_i * V_i)
    P_hyd_i = Q_m3s * dP_i
    P_pump_i = P_hyd_i / max(0.05, pump_info["eta_actual"])

    shell_pump_info = get_pump_characteristics(shell_fluid, fprops_o["nu"], eta_shell_pump, shell_pump_type)
    f_darcy_o = friction_factor(Re=max(1.0, Re_o), eD=rel_rough_o) if Re_o > 1e-6 else 0.0
    dP_o = f_darcy_o * (L / Dh_o) * (0.5 * fprops_o["rho"] * V_o * V_o)
    P_hyd_o = shell_Q_m3s * dP_o
    P_pump_o = P_hyd_o / max(0.05, shell_pump_info["eta_actual"])

    Q_abs = abs(Q)
    P_tot_elec = P_pump_i + P_pump_o
    Q_net = Q - P_tot_elec if Q >= 0 else Q + P_tot_elec
    eff_net = ((Q_abs - P_tot_elec) / Q_abs) * 100.0 if Q_abs > 1e-6 else 0.0
    cop_sys = (Q_abs / P_tot_elec) if P_tot_elec > 1e-9 else 9999.0

    return {
        "Do": Do,
        "D_shell_i": D_shell_i,
        "min_shell_Di": min_shell_Di,
        "free_space_pct": free_space_pct,
        "n_tubes": nt,
        "Tout_shell": Tout_o,
        "flow_direction": mode,
        "Re_i": Re_i,
        "Nu_i": Nu_i,
        "h_i": h_i,
        "Re_o": Re_o,
        "Nu_o": Nu_o,
        "h_o": h_o,
        "R_i": R_i,
        "R_wall": R_wall,
        "R_o": R_o,
        "UA": UA,
        "Tout": Tout_i,
        "Q": Q,
        "Q_net": Q_net,
        "f_darcy": f_darcy_i,
        "dP": dP_i,
        "P_hyd": P_hyd_i,
        "P_pump": P_pump_i,
        "pumpInfo": pump_info,
        "shellPumpInfo": shell_pump_info,
        "P_pump_o": P_pump_o,
        "CD": f_darcy_o,
        "dP_air": dP_o,
        "P_fan": P_pump_o,
        "P_tot_elec": P_tot_elec,
        "eff_net": eff_net,
        "cop_sys": cop_sys,
        "nu_i": fprops_i["nu"],
        "nu_o": fprops_o["nu"],
    }
