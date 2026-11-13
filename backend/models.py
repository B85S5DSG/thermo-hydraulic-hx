from pydantic import BaseModel, Field
from typing import Literal

class CalcRequest(BaseModel):
    hx_type: Literal["finned_pipe", "double_pipe", "multi_tube"] = "finned_pipe"
    flow_direction: Literal["counter", "parallel"] = "counter"
    n_tubes: int = Field(19, ge=1, le=500)
    pitch_ratio: float = Field(1.25, ge=1.05, le=3.0)
    mat: str = "cu"
    Di: float = Field(0.005, gt=0)
    wall: float = Field(0.002, gt=0)
    L: float = Field(2.0, gt=0)
    eps_mm: float = Field(0.0015, ge=0)
    fluid: str = "Water"
    flow_val: float = Field(10.0, gt=0)
    flow_unit: Literal["lpm", "gpm", "cfm"] = "lpm"
    Tin: float = 80.0
    eta_pct: float = Field(72.0, ge=5, le=100)
    inner_pump_type: str = "auto"
    pump_style: str = "auto"
    V_air: float = Field(8.0, ge=0)
    Tinf: float = 20.0
    eta_fan_pct: float = Field(65.0, ge=5, le=100)
    use_fins: bool = True
    fin_dia_mm: float = Field(55.0, gt=0)
    fin_thick_mm: float = Field(0.5, gt=0)
    fin_pitch_mm: float = Field(3.0, gt=0)
    duct_margin_pct: float = Field(15.0, ge=10, le=20)
    shell_Di_mm: float = Field(45.0, gt=0)
    shell_fluid: str = "Water"
    shell_flow_val: float = Field(15.0, gt=0)
    shell_flow_unit: Literal["lpm", "gpm", "cfm"] = "lpm"
    shell_Tin: float = 20.0
    eta_shell_pct: float = Field(72.0, ge=5, le=100)
    shell_pump_type: str = "auto"
    shell_pump_style: str = "auto"
    x_mode: Literal["Re_i", "Flow", "Wall", "V_air", "Re_o"] = "Re_i"
    save_snapshot: bool = False
