# Standard solid pipe materials: thermal conductivity k (W/m-K) and typical roughness eps (mm)
PIPE_MATERIALS = {
    "cu": {"label": "Copper (Type L/K Drawn)", "k": 401.0, "eps_mm": 0.0015},
    "al6061": {"label": "Aluminum 6061-T6 (Extruded)", "k": 167.0, "eps_mm": 0.0015},
    "al": {"label": "Aluminum (Pure / 1100)", "k": 205.0, "eps_mm": 0.0015},
    "brass": {"label": "Red Brass / Admiralty Brass", "k": 111.0, "eps_mm": 0.0015},
    "cs": {"label": "Carbon Steel (Schedule 40)", "k": 50.2, "eps_mm": 0.045},
    "galv": {"label": "Galvanized Steel", "k": 52.0, "eps_mm": 0.15},
    "ss304": {"label": "Stainless Steel 304", "k": 16.2, "eps_mm": 0.015},
    "ss316": {"label": "Stainless Steel 316", "k": 16.3, "eps_mm": 0.015},
    "ti": {"label": "Titanium (Grade 2)", "k": 21.9, "eps_mm": 0.0015},
    "cupronickel": {"label": "Cupronickel 90/10 (Marine)", "k": 40.0, "eps_mm": 0.0015},
    "cast_iron": {"label": "Cast Iron (Uncoated)", "k": 55.0, "eps_mm": 0.26},
    "pex": {"label": "PEX / Cross-Linked Polyethylene", "k": 0.38, "eps_mm": 0.007},
    "pvc": {"label": "PVC / CPVC (Schedule 40)", "k": 0.19, "eps_mm": 0.0015},
    "hdpe": {"label": "HDPE (SDR 11)", "k": 0.48, "eps_mm": 0.007},
}

def get_pipe_k(mat: str) -> float:
    item = PIPE_MATERIALS.get(mat)
    return item["k"] if item else 16.2
def list_pipe_materials():
    if "PIPE_MATERIALS" in globals():
        m = globals()["PIPE_MATERIALS"]
        if isinstance(m, list): return m
        if isinstance(m, dict):
            return [{"id": k, "label": v.get("label", v.get("name", k)), "k": v.get("k", 16.2), "eps_mm": v.get("eps_mm", 0.0015)} if isinstance(v, dict) else {"id": k, "label": str(k), "k": float(v), "eps_mm": 0.0015} for k, v in m.items()]
    return [
        {"id": "cu", "label": "Copper (C12200) - 401 W/mK", "k": 401.0, "eps_mm": 0.0015},
        {"id": "al", "label": "Aluminum (6061-T6) - 167 W/mK", "k": 167.0, "eps_mm": 0.0015},
        {"id": "ss304", "label": "Stainless Steel 304 - 16.2 W/mK", "k": 16.2, "eps_mm": 0.015},
        {"id": "ss316", "label": "Stainless Steel 316 - 16.3 W/mK", "k": 16.3, "eps_mm": 0.015},
        {"id": "cs", "label": "Carbon Steel (A106) - 50.0 W/mK", "k": 50.0, "eps_mm": 0.045},
        {"id": "ti", "label": "Titanium (Grade 2) - 21.9 W/mK", "k": 21.9, "eps_mm": 0.005},
    ]

if "get_pipe_k" not in globals():
    def get_pipe_k(mat: str) -> float:
        for item in list_pipe_materials():
            if item["id"] == mat: return float(item.get("k", 16.2))
        return 16.2
