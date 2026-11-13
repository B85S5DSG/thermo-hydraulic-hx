import math
from ..incompressible_fluids import get_fluid_props, get_air_film_props
from ..solids import get_pipe_k
from ..hydraulics import get_pump_characteristics, calc_darcy_friction, get_cylinder_drag_coeff

def solve_pipe(Di: float, wall: float, L: float, eps_m: float, mat: str, fluid: str, Q_m3s: float, Tin: float, V_air: float, Tinf: float, eta_base: float, eta_fan: float, use_fins: bool = True, fin_dia_mm: float = 55.0, fin_thick_mm: float = 0.5, fin_pitch_mm: float = 3.0, duct_margin_pct: float = 15.0, pump_style: str = "auto") -> dict:
    Do = Di + 2.0 * wall
    k_pipe = get_pipe_k(mat)
    R_wall = math.log(Do / Di) / (2.0 * math.pi * k_pipe * L)
    A_cross = math.pi * Di * Di / 4.0
    V_i = Q_m3s / max(1e-12, A_cross)
    D_fin = max(Do + 0.002, fin_dia_mm * 1e-3)
    t_fin = max(1e-5, fin_thick_mm * 1e-3)
    S_pitch = max(t_fin + 1e-4, fin_pitch_mm * 1e-3)
    n_fins = int(L / S_pitch) if use_fins else 0
    T_bulk = Tin
    T_so = Tin * 0.7 + Tinf * 0.3
    Tout, Q, UA = Tin, 0.0, 0.0
    Re_i, Nu_i, h_i, R_i = 0.0, 3.66, 0.0, 0.0
    Re_o, Nu_o, h_o, R_o = 0.0, 0.3, 0.0, 0.0
    eta_fin = 1.0
    fprops, aprops = {}, {}
    for _ in range(8):
        fprops = get_fluid_props(fluid, T_bulk)
        Re_i = (V_i * Di) / max(1e-12, fprops["nu"])
        if Re_i < 2300.0:
            Gz = (Di / L) * Re_i * fprops["Pr"]
            Nu_i = 3.66 + (0.0668 * Gz) / (1.0 + 0.04 * math.pow(Gz, 2.0 / 3.0))
        else:
            Re_turb = max(2300.0, Re_i)
            f_smooth = math.pow(0.790 * math.log(Re_turb) - 1.64, -2.0)
            Nu_gn = ((f_smooth / 8.0) * (Re_turb - 1000.0) * fprops["Pr"]) / (1.0 + 12.7 * math.sqrt(f_smooth / 8.0) * (math.pow(fprops["Pr"], 2.0 / 3.0) - 1.0))
            if Re_i < 3000.0:
                w = (Re_i - 2300.0) / 700.0
                GzL = (Di / L) * 2300.0 * fprops["Pr"]
                Nu_lam = 3.66 + (0.0668 * GzL) / (1.0 + 0.04 * math.pow(GzL, 2.0 / 3.0))
                Nu_i = (1.0 - w) * Nu_lam + w * Nu_gn
            else:
                Nu_i = Nu_gn
        h_i = (Nu_i * fprops["k"]) / Di
        R_i = 1.0 / (max(1e-6, h_i) * math.pi * Di * L)
        aprops = get_air_film_props(T_so, Tinf)
        Re_o = (V_air * Do) / max(1e-12, aprops["nu"])
        t1 = 0.62 * math.pow(Re_o, 0.5) * math.pow(aprops["Pr"], 1.0 / 3.0)
        t2 = math.pow(1.0 + math.pow(0.4 / aprops["Pr"], 2.0 / 3.0), 0.25)
        t3 = math.pow(1.0 + math.pow(Re_o / 282000.0, 0.625), 0.8)
        Nu_o = 0.3 + (t1 / t2) * t3
        h_o = (Nu_o * aprops["k"]) / Do
        if use_fins and n_fins > 0:
            r1 = Do / 2.0
            r2c = (D_fin / 2.0) + (t_fin / 2.0)
            L_c = r2c - r1
            m_fin = math.sqrt((2.0 * h_o) / max(1e-6, k_pipe * t_fin))
            mL = m_fin * L_c * math.sqrt(r2c / r1)
            eta_fin = math.tanh(mL) / max(1e-9, mL)
            A_fin_single = 2.0 * math.pi * (r2c * r2c - r1 * r1)
            A_fins_tot = n_fins * A_fin_single
            A_base = math.pi * Do * max(0.0, L - n_fins * t_fin)
            A_eff = A_base + eta_fin * A_fins_tot
            R_o = 1.0 / max(1e-6, h_o * A_eff)
        else:
            eta_fin = 1.0
            R_o = 1.0 / (max(1e-6, h_o) * math.pi * Do * L)
        UA = 1.0 / (R_i + R_wall + R_o)
        C_rate = fprops["rho"] * Q_m3s * fprops["cp"]
        if C_rate > 1e-9:
            NTU = UA / C_rate
            Tout = Tinf + (Tin - Tinf) * math.exp(-NTU)
            Q = C_rate * (Tin - Tout)
        else:
            Tout, Q = Tinf, 0.0
        T_bulk = 0.5 * (Tin + Tout)
        T_so = Tinf + Q * R_o
    pump_info = get_pump_characteristics(fluid, fprops["nu"], eta_base, pump_style=pump_style)
    f_darcy = calc_darcy_friction(Re_i, max(0.0, eps_m / Di))
    dP = (f_darcy * (L / Di) + 1.5) * (0.5 * fprops["rho"] * V_i * V_i)
    P_hyd = Q_m3s * dP
    P_pump = P_hyd / max(0.05, pump_info["eta_actual"])
    CD = get_cylinder_drag_coeff(Re_o)
    if use_fins and n_fins > 0:
        sigma = max(0.15, 1.0 - (t_fin / S_pitch))
        CD = CD * (1.0 + 0.45 * (D_fin / Do) / sigma)
    dP_air = CD * (0.5 * aprops["rho"] * V_air * V_air)
    D_duct = (D_fin if use_fins else Do) * (1.0 + duct_margin_pct / 100.0)
    P_fan = (D_duct * L * V_air * dP_air) / max(0.05, eta_fan)
    P_tot_elec = P_pump + P_fan
    Q_net = Q - P_tot_elec
    eff_net = ((Q - P_tot_elec) / abs(Q)) * 100.0 if abs(Q) > 1e-6 else 0.0
    cop_sys = (abs(Q_net) / P_tot_elec) if P_tot_elec > 1e-9 else 9999.0
    return {"Do": Do, "Re_i": Re_i, "Nu_i": Nu_i, "h_i": h_i, "Re_o": Re_o, "Nu_o": Nu_o, "h_o": h_o, "R_i": R_i, "R_wall": R_wall, "R_o": R_o, "UA": UA, "Tout": Tout, "Q": Q, "Q_net": Q_net, "f_darcy": f_darcy, "dP": dP, "P_hyd": P_hyd, "P_pump": P_pump, "pumpInfo": pump_info, "CD": CD, "dP_air": dP_air, "P_fan": P_fan, "P_tot_elec": P_tot_elec, "eff_net": eff_net, "cop_sys": cop_sys, "n_fins": n_fins, "eta_fin": eta_fin, "eff_fin_dia_mm": (D_fin * 1000.0) if use_fins else (Do * 1000.0), "H_duct_mm": D_duct * 1000.0, "nu_i": fprops["nu"], "nu_o": aprops["nu"]}
