import math
from ..incompressible_fluids import get_fluid_props, get_air_film_props
from ..solids import get_pipe_k
from ..hydraulics import get_pump_characteristics, calc_darcy_friction, get_cylinder_drag_coeff

def calc_annular_fin_efficiency(h_o: float, k_fin: float, r1: float, r2: float, t_fin: float) -> float:
    """Schmidt approximation for radial annular fin efficiency."""
    if r2 <= r1 + 1e-6 or h_o <= 1e-6 or k_fin <= 1e-6 or t_fin <= 1e-6:
        return 1.0
    r2c = r2 + 0.5 * t_fin
    m = math.sqrt((2.0 * h_o) / (k_fin * t_fin))
    phi = (r2c - r1) * (1.0 + 0.35 * math.log(r2c / r1))
    m_phi = m * phi
    if m_phi < 1e-5:
        return 1.0
    return math.tanh(m_phi) / m_phi

def solve_pipe(Di: float, wall: float, L: float, eps_m: float, mat: str, fluid: str,
               Q_m3s: float, Tin: float, V_air: float, Tinf: float, eta_base: float, eta_fan: float,
               use_fins: bool = True, fin_dia_m: float = 0.055, fin_thick_m: float = 0.0005,
               fin_pitch_m: float = 0.003, duct_margin_pct: float = 15.0) -> dict:
    Do = Di + 2.0 * wall
    k_pipe = get_pipe_k(mat)
    R_wall = math.log(Do / Di) / (2.0 * math.pi * k_pipe * L)
    A_cross = math.pi * Di * Di / 4.0
    V_i = Q_m3s / A_cross

    # Enforce fin diameter > pipe OD
    eff_fin_dia = max(Do + 0.001, fin_dia_m) if use_fins else Do
    r1 = 0.5 * Do
    r2 = 0.5 * eff_fin_dia

    if use_fins:
        safe_pitch = max(fin_thick_m + 0.0002, fin_pitch_m)
        n_fins = max(1, int(math.floor(L / safe_pitch)))
        L_base = max(0.0, L - n_fins * fin_thick_m)
        A_base = math.pi * Do * L_base
        A_fin = n_fins * (0.5 * math.pi * (eff_fin_dia**2 - Do**2) + math.pi * eff_fin_dia * fin_thick_m)
        A_air_tot = A_base + A_fin
        # Shrouded duct height = (1 + margin) * fin outer diameter
        H_duct = eff_fin_dia * (1.0 + duct_margin_pct / 100.0)
        A_duct = H_duct * L
        A_blocked = (Do * L) + n_fins * fin_thick_m * (eff_fin_dia - Do)
        A_min = max(0.15 * A_duct, A_duct - A_blocked)
        blockage_ratio = A_blocked / A_duct
    else:
        n_fins = 0
        A_base = math.pi * Do * L
        A_fin = 0.0
        A_air_tot = A_base
        H_duct = Do * (1.0 + duct_margin_pct / 100.0)
        A_duct = H_duct * L
        A_min = max(0.15 * A_duct, A_duct - Do * L)
        blockage_ratio = (Do * L) / A_duct

    V_air_duct = V_air * A_duct
    V_max = V_air * (A_duct / A_min) if V_air > 0 else 0.0

    T_bulk = Tin
    T_so = Tin * 0.7 + Tinf * 0.3
    Tout, Q, UA = Tin, 0.0, 0.0
    Re_i, Nu_i, h_i, R_i = 0.0, 3.66, 0.0, 0.0
    Re_o, Nu_o, h_o, R_o = 0.0, 0.3, 0.0, 0.0
    eta_fin, eta_surf = 1.0, 1.0
    fprops = {}
    aprops = {}

    P_out = 101325.0
    f_darcy = 0.0
    dP = 0.0
    P_in = P_out
    P_avg = P_out

    for _ in range(8):
        fprops = get_fluid_props(fluid, T_bulk, P_avg)
        Re_i = (V_i * Di) / fprops["nu"]

        if Re_i < 2300.0:
            Gz = (Di / L) * Re_i * fprops["Pr"]
            Nu_i = 3.66 + (0.0668 * Gz) / (1.0 + 0.04 * math.pow(Gz, 2.0 / 3.0))
        else:
            Re_turb = max(2300.0, Re_i)
            f_smooth = math.pow(0.790 * math.log(Re_turb) - 1.64, -2.0)
            Nu_gn = ((f_smooth / 8.0) * (Re_turb - 1000.0) * fprops["Pr"]) / (
                1.0 + 12.7 * math.sqrt(f_smooth / 8.0) * (math.pow(fprops["Pr"], 2.0 / 3.0) - 1.0)
            )
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
        Re_o = (V_max * Do) / aprops["nu"]

        if use_fins:
            # Briggs & Young correlation for radial high-fin tubes in cross-flow
            s_clear = max(0.0002, (L / n_fins) - fin_thick_m)
            fin_h = max(0.0005, r2 - r1)
            if Re_o > 1.0:
                Nu_o = (
                    0.134
                    * math.pow(Re_o, 0.681)
                    * math.pow(aprops["Pr"], 1.0 / 3.0)
                    * math.pow(s_clear / fin_h, 0.2)
                    * math.pow(s_clear / fin_thick_m, 0.1134)
                )
            else:
                Nu_o = 0.3
            h_o = (Nu_o * aprops["k"]) / Do
            eta_fin = calc_annular_fin_efficiency(h_o, k_pipe, r1, r2, fin_thick_m)
            eta_surf = 1.0 - (A_fin / A_air_tot) * (1.0 - eta_fin)
        else:
            t1 = 0.62 * math.pow(Re_o, 0.5) * math.pow(aprops["Pr"], 1.0 / 3.0)
            t2 = math.pow(1.0 + math.pow(0.4 / aprops["Pr"], 2.0 / 3.0), 0.25)
            t3 = math.pow(1.0 + math.pow(Re_o / 282000.0, 0.625), 0.8)
            Nu_o = 0.3 + (t1 / t2) * t3
            h_o = (Nu_o * aprops["k"]) / Do
            eta_fin = 1.0
            eta_surf = 1.0

        R_o = 1.0 / (max(1e-6, eta_surf * h_o * A_air_tot))

        UA = 1.0 / (R_i + R_wall + R_o)
        C_rate = fprops["rho"] * Q_m3s * fprops["cp"]

        if C_rate > 1e-9:
            NTU = UA / C_rate
            Tout = Tinf + (Tin - Tinf) * math.exp(-NTU)
            Q = C_rate * (Tin - Tout)
        else:
            Tout, Q = Tinf, 0.0

        f_darcy = calc_darcy_friction(Re_i, max(0.0, eps_m / Di))
        dP = f_darcy * (L / Di) * (0.5 * fprops["rho"] * V_i * V_i)
        P_in = P_out + dP
        P_avg = P_out + 0.5 * dP

        T_bulk = 0.5 * (Tin + Tout)
        T_so = Tinf + Q * R_o

    pump_info = get_pump_characteristics(fluid, fprops["nu"], eta_base)
    P_hyd = Q_m3s * dP
    P_pump = P_hyd / max(0.05, pump_info["eta_actual"])

    # Shrouded duct air-side pressure drop & fan power
    # Shrouded duct air-side pressure drop (bundle drag + shroud entrance/exit dynamic losses)
    q_duct = 0.5 * aprops["rho"] * V_air * V_air
    q_max = 0.5 * aprops["rho"] * V_max * V_max
    K_shroud = 1.5  # Inlet contraction + exit dynamic head dump

    if use_fins:
        s_clear = max(0.0002, (L / n_fins) - fin_thick_m)
        Eu = (
            18.93
            * math.pow(max(10.0, Re_o), -0.316)
            * math.pow(eff_fin_dia / Do, -0.927)
            * math.pow(s_clear / Do, -0.515)
        )
        dP_air = (Eu * q_max) + (K_shroud * q_duct)
        CD = Eu
    else:
        CD = get_cylinder_drag_coeff(Re_o)
        dP_air = (CD * blockage_ratio * q_max) + (K_shroud * q_duct)

    P_fan = (V_air_duct * dP_air) / max(0.05, eta_fan)

    P_tot_elec = P_pump + P_fan
    Q_net = Q - P_tot_elec
    eff_net = ((Q - P_tot_elec) / Q) * 100.0 if Q > 1e-6 else 0.0
    cop_sys = (Q / P_tot_elec) if P_tot_elec > 1e-9 else 9999.0

    return {
        "Do": Do, "Re_i": Re_i, "Nu_i": Nu_i, "h_i": h_i,
        "Re_o": Re_o, "Nu_o": Nu_o, "h_o": h_o,
        "R_i": R_i, "R_wall": R_wall, "R_o": R_o,
        "UA": UA, "Tout": Tout, "Q": Q, "Q_net": Q_net,
        "f_darcy": f_darcy, "dP": dP, "P_in": P_in, "P_out": P_out,
        "P_hyd": P_hyd, "P_pump": P_pump,
        "pumpInfo": pump_info, "CD": CD, "dP_air": dP_air,
        "P_fan": P_fan, "P_tot_elec": P_tot_elec,
        "eff_net": eff_net, "cop_sys": cop_sys,
        "nu_i": fprops["nu"], "nu_o": aprops["nu"],
        "n_fins": n_fins, "eff_fin_dia_mm": eff_fin_dia * 1000.0,
        "A_air_tot": A_air_tot, "eta_fin": eta_fin, "eta_surf": eta_surf,
        "H_duct_mm": H_duct * 1000.0, "V_air_cfm": V_air_duct * 2118.88
    }