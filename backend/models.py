from pydantic import BaseModel, Field
from typing import Literal

class CalcRequest(BaseModel):
    mat: str = "cu"
    Di: float = Field(0.025, gt=0)
    wall: float = Field(0.002, gt=0)
    L: float = Field(2.0, gt=0)
    eps_mm: float = Field(0.0015, ge=0)
    fluid: str = "Water"
    flow_val: float = Field(10.0, gt=0)
    flow_unit: Literal["lpm", "cfm"] = "lpm"
    Tin: float = 80.0
    eta_pct: float = Field(72.0, ge=5, le=100)
    V_air: float = Field(10.0, ge=0)
    Tinf: float = 20.0
    eta_fan_pct: float = Field(65.0, ge=5, le=100)
    # Radial Fin & Shroud Parameters
    use_fins: bool = True
    fin_dia_mm: float = Field(55.0, gt=0)
    fin_thick_mm: float = Field(0.5, gt=0)
    fin_pitch_mm: float = Field(3.0, gt=0)
    duct_margin_pct: float = Field(15.0, ge=5, le=100)
    x_mode: Literal["Re_i", "Flow", "Wall", "V_air", "Re_o"] = "Re_i"
    save_snapshot: bool = False