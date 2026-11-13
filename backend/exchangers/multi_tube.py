
from .double_pipe import solve_double_pipe

def solve_multi_tube(Di: float, wall: float, L: float, eps_m: float, mat: str, fluid_i: str, Q_i_m3s: float, Tin_i: float, eta_i_base: float, D_shell_i: float, fluid_o: str, Q_o_m3s: float, Tin_o: float, eta_o_base: float, flow_direction: str = "counter", n_tubes: int = 19, pitch_ratio: float = 1.25, pump_style_i: str = "auto", pump_style_o: str = "auto") -> dict:
    return solve_double_pipe(
        Di=Di, wall=wall, L=L, eps_m=eps_m, mat=mat,
        fluid_i=fluid_i, Q_i_m3s=Q_i_m3s, Tin_i=Tin_i, eta_i_base=eta_i_base,
        D_shell_i=D_shell_i, fluid_o=fluid_o, Q_o_m3s=Q_o_m3s, Tin_o=Tin_o, eta_o_base=eta_o_base,
        flow_direction=flow_direction, n_tubes=n_tubes, pitch_ratio=pitch_ratio,
        pump_style_i=pump_style_i, pump_style_o=pump_style_o
    )
