import math
from ht.conv_internal import Nu_conv_internal
from ht.hx import effectiveness_from_NTU
from fluids.friction import friction_factor
from ..incompressible_fluids import get_fluid_props
from ..solids import get_pipe_k
from ..hydraulics import get_pump_characteristics

def solve_double_pipe(Di: float, wall: float, L: float, eps_m: float, mat: str, fluid_i: str, Q_i_m3s: float, Tin_i: float, eta_i_base: float, D_shell_i: float, fluid_o: str, Q_o_m3s: float, Tin_o: float, eta_o_base: float, flow_direction: str = "counter", n_tubes: int = 1, pitch_ratio: float = 1.25, pump_style_i: str = "auto", pump_style_o: str = "auto") -> dict:
    n_tubes = max(1, int(n_tubes))
    Do = Di + 2.0 * wall
    min_shell = (Do + 0.004) if n_tubes == 1 else (Do * pitch_ratio * math.sqrt(n_tubes * 1.15) + 0.006)
    D_shell_i = max(D_shell_i, min_shell)
    k_pipe = get_pipe_k(mat)
    R_wall = math.log(Do / Di) / (2.0 * math.pi * k_pipe * L * n_tubes)
    A_i_total = n_tubes * (math.pi * Di * Di / 4.0)
    V_i = Q_i_m3s / max(1e-12, A_i_total)
    A_shell_gross = math.pi * D_shell_i * D_shell_i / 4.0
    A_tubes_outer = n_tubes * (math.pi * Do * Do / 4.0)
    A_o = max(1e-6, A_shell_gross - A_tubes_outer)
    free_space_pct = (A_o / A_shell_gross) * 100.0
    P_wetted = math.pi * (D_shell_i + n_tubes * Do)
    P_heated = math.pi * n_tubes * Do
    Dh_hydraulic = (4.0 * A_o) / P_wetted
    Dh_thermal = (4.0 * A_o) / P_heated
    V_o = Q_o_m3s / A_o
    T_bulk_i, T_bulk_o = Tin_i, Tin_o
    Tout_i, Tout_o, Q, UA = Tin_i, Tin_o, 0.0, 0.0
    Re_i, Nu_i, h_i, R_i = 0.0, 3.66, 0.0, 0.0
    Re_o, Nu_o, h_o, R_o = 0.0, 3.66, 0.0, 0.0
    props_i, props_o = {}, {}
    subtype = "counterflow" if flow_direction == "counter" else "parallel"
    for _ in range(8):
        props_i = get_fluid_props(fluid_i, T_bulk_i)
        props_o = get_fluid_props(fluid_o, T_bulk_o)
        Re_i = max(1e-3, (V_i * Di) / props_i["nu"])
        Nu_i = Nu_conv_internal(Re=Re_i, Pr=props_i["Pr"], eD=max(0.0, eps_m / Di), Di=Di, x=L)
        h_i = (Nu_i * props_i["k"]) / Di
        R_i = 1.0 / (max(1e-6, h_i) * math.pi * Di * L * n_tubes)
        Re_o = max(1e-3, (V_o * Dh_hydraulic) / props_o["nu"])
        Nu_o = Nu_conv_internal(Re=Re_o, Pr=props_o["Pr"], eD=max(0.0, eps_m / Dh_hydraulic), Di=Dh_thermal, x=L)
        h_o = (Nu_o * props_o["k"]) / Dh_thermal
        R_o = 1.0 / (max(1e-6, h_o) * math.pi * Do * L * n_tubes)
        UA = 1.0 / (R_i + R_wall + R_o)
        C_i = props_i["rho"] * Q_i_m3s * props_i["cp"]
        C_o = props_o["rho"] * Q_o_m3s * props_o["cp"]
        C_min, C_max = min(C_i, C_o), max(C_i, C_o)
        if C_min > 1e-9:
            Cr = C_min / C_max
            NTU = UA / C_min
            eff_hx = effectiveness_from_NTU(NTU=NTU, Cr=Cr, subtype=subtype)
            Q = eff_hx * C_min * (Tin_i - Tin_o)
            Tout_i = Tin_i - (Q / C_i)
            Tout_o = Tin_o + (Q / C_o)
        else:
            Tout_i, Tout_o, Q = Tin_i, Tin_o, 0.0
        T_bulk_i = 0.5 * (Tin_i + Tout_i)
        T_bulk_o = 0.5 * (Tin_o + Tout_o)
    pump_i = get_pump_characteristics(fluid_i, props_i["nu"], eta_i_base, pump_style=pump_style_i)
    f_i = friction_factor(Re=Re_i, eD=max(0.0, eps_m / Di))
    dP_i = (f_i * (L / Di) + 1.5 * n_tubes) * (0.5 * props_i["rho"] * V_i * V_i)
    P_hyd_i = Q_i_m3s * dP_i
    P_pump_i = P_hyd_i / max(0.05, pump_i["eta_actual"])
    pump_o = get_pump_characteristics(fluid_o, props_o["nu"], eta_o_base, pump_style=pump_style_o)
    f_o = friction_factor(Re=Re_o, eD=max(0.0, eps_m / Dh_hydraulic))
    dP_o = (f_o * (L / Dh_hydraulic) + 1.5) * (0.5 * props_o["rho"] * V_o * V_o)
    P_hyd_o = Q_o_m3s * dP_o
    P_pump_o = P_hyd_o / max(0.05, pump_o["eta_actual"])
    P_tot_elec = P_pump_i + P_pump_o
    Q_net = abs(Q) - (P_pump_i + P_pump_o)
    eff_net = (Q_net / abs(Q)) * 100.0 if abs(Q) > 1e-6 else 0.0
    cop_sys = (Q_net / P_tot_elec) if P_tot_elec > 1e-9 else 9999.0
    return {"Do": Do, "D_shell_i": D_shell_i, "Dh_shell": Dh_hydraulic, "n_tubes": n_tubes, "free_space_pct": free_space_pct, "Re_i": Re_i, "Nu_i": Nu_i, "h_i": h_i, "Re_o": Re_o, "Nu_o": Nu_o, "h_o": h_o, "R_i": R_i, "R_wall": R_wall, "R_o": R_o, "UA": UA, "Tout": Tout_i, "Tout_shell": Tout_o, "Q": abs(Q), "Q_net": Q_net, "f_darcy": f_i, "dP": dP_i, "P_hyd": P_hyd_i, "P_pump": P_pump_i, "pumpInfo": pump_i, "f_shell": f_o, "dP_shell": dP_o, "P_shell_hyd": P_hyd_o, "P_shell_pump": P_pump_o, "shellPumpInfo": pump_o, "CD": f_o, "dP_air": dP_o, "P_fan": P_pump_o, "P_tot_elec": P_tot_elec, "eff_net": eff_net, "cop_sys": cop_sys, "nu_i": props_i["nu"], "nu_o": props_o["nu"]}
