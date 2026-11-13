# Thermo-Hydraulic Heat Exchanger Calculator (`HX LAB`)

A containerized, web-based thermo-hydraulic heat exchanger calculator and parametric design dashboard built with a Python **FastAPI** backend and an interactive **HTML5/Canvas/SVG** frontend.

This project started as a hands-on mechanical engineering containerization exercise and has evolved into a multi-architecture heat exchanger modeling suite powered by open-source, peer-reviewed thermodynamic, heat-transfer, and fluid-mechanics libraries.

> [!WARNING]
> **Educational & Preliminary Design Use Only:** This project was built as an educational tool to explore containerized scientific computing and heat exchanger modeling. While the underlying thermophysical properties and empirical correlations are sourced from peer-reviewed engineering libraries, results should be independently verified and **must not be used for final industrial or safety-critical production sizing.**

---

## Supported Heat Exchanger Architectures

The solver (`backend/exchangers/`) supports three distinct heat exchanger configurations with live true-to-scale **SVG cross-section schematics** (`px/mm`), thermal resistance network breakdowns ($R_i$, $R_{\text{wall}}$, $R_o$), and 120-point parametric sweeps:

### 1. Shrouded Finned Pipe (Liquid-to-Air Cross-Flow)
* **Configuration:** Internal liquid tube cooled (or heated) by external cross-flow air inside a shrouded rectangular duct.
* **Extended Surfaces:** Toggleable radial annular fins with configurable fin outer diameter ($D_{\text{fin}}$), fin thickness ($t_{\text{fin}}$), on-center fin pitch, and shroud-to-fin clearance percentage.
* **Aero-Hydraulics:** Evaluates bare-cylinder drag or finned-bundle Euler pressure drop alongside shroud entrance/exit dynamic head losses to determine required fan power.

### 2. Concentric Double-Pipe (Liquid-to-Liquid)
* **Configuration:** Single inner pipe ($N_{\text{tubes}} = 1$) inside a concentric outer shell annulus.
* **Stream Orientation:** Supports both **Counter-Flow (Opposing Streams)** and **Parallel-Flow (Co-Current)** configurations via $\varepsilon\text{-NTU}$ effectiveness relations.
* **Hydraulics:** Simultaneously evaluates inner-tube and outer-annulus Reynolds numbers, Darcy friction factors, pressure drops ($\Delta P$), and parasitic pumping power.

### 3. Multi-Tube Concentric Bundle (Parallel Tube-in-Shell)
* **Configuration:** $N$ parallel tubes ($1 \le N_{\text{tubes}} \le 500$) arranged on a triangular pitch ($P_T / D_o$) inside a cylindrical outer shell.
* **TEMA Bundle Sizing:** Automatically computes the minimum outer tube limit (OTL) bundle diameter and TEMA shell-to-bundle clearance (`shell_clearance`), overriding undersized shell diameters and rendering the hexagonal tube lattice to scale in the live SVG cross-section.
* **Flow Splitting & Free-Area Scaling:** Splits total tube-side flow evenly across all $N_{\text{tubes}}$ parallel passes and evaluates shell-side hydraulic diameter ($D_h$) and free-flow area fraction dynamically.

---

## Peer-Reviewed Scientific Libraries

Rather than relying on simplified polynomial curve fits, the backend physics engine delegates fluid property evaluation, heat transfer correlations, and hydraulic resistance calculations to three peer-reviewed Python libraries:

| Library | Role in Physics Engine | Peer-Reviewed Reference & Standards |
| :--- | :--- | :--- |
| **[`CoolProp`](http://www.coolprop.org/)** | **Thermophysical Fluid Properties:** Evaluates density ($\rho$), specific heat ($c_p$), thermal conductivity ($k$), dynamic/kinematic viscosity ($\mu, \nu$), and Prandtl number ($Pr$) across bulk and film temperatures. | **Bell, I. H., Wronski, J., Quoilin, S., & Lemort, V. (2014).** *"Pure and Pseudo-pure Fluid Thermophysical Property Evaluation and the Open-Source Thermophysical Property Library CoolProp."* **Industrial & Engineering Chemistry Research**, 53(6), 2498–2508. Provides NIST-grade Helmholtz-energy formulations (`HEOS::Water`, `HEOS::Air`) and validated incompressible secondary working fluids (`INCOMP::` aqueous ethylene/propylene glycols, seawater, brines, and synthetic thermal oils including Dowtherm, Therminol, Syltherm, and Paratherm). |
| **[`ht`](https://ht.readthedocs.io/)** *(ChEDL)* | **Heat Transfer & Exchanger Sizing:** Computes internal laminar/turbulent pipe Nusselt numbers, external cross-flow convection, radial annular fin efficiency, $\varepsilon\text{-NTU}$ effectiveness (`effectiveness_from_NTU`), and TEMA bundle clearances (`shell_clearance`). | **Bell, C. & Contributors (Chemical Engineering Design Library / ChEDL).** Implements peer-reviewed correlations from **Incropera & DeWitt**, **Gnielinski (1976)**, **Churchill & Bernstein (1977)**, **Briggs & Young (1963)**, **VDI Heat Atlas**, and **TEMA** (Tubular Exchanger Manufacturers Association) standards. |
| **[`fluids`](https://fluids.readthedocs.io/)** *(ChEDL)* | **Fluid Mechanics & Hydraulics:** Computes Darcy-Weisbach friction factors (`friction_factor`) across laminar, transitional, and rough-wall turbulent regimes, entrance/exit loss coefficients, and external aerodynamic drag. | **Bell, C. & Contributors (ChEDL).** Validated against **Crane Technical Paper No. 410**, **Idelchik's Handbook of Hydraulic Resistance**, and **Clamond (2009)** (*Industrial & Engineering Chemistry Research*, exact Colebrook-White solution). |

---

## Key Features & Configurable Parameters

* **Dynamic Working Fluid Catalog (`/api/fluids`):** Automatically populates pure liquid water, aqueous glycol solutions ($20\%$–$60\%$ mass fraction), seawater, liquid metals ($\text{Na}$, $\text{NaK}$), and commercial heat transfer oils directly from CoolProp.
* **Solid Pipe Material Library (`/api/materials`):** Built-in database of 14 engineering metals and polymers (Copper, Aluminum 6061/1100, Admiralty Brass, Carbon Steel, Galvanized Steel, SS 304/316, Titanium Grade 2, Cupronickel 90/10, Cast Iron, PEX, PVC/CPVC, HDPE) with thermal conductivity ($k$) and automatic surface roughness ($\varepsilon$) population.
* **Intelligent Pump Architecture Selection:** Automatically selects between a **Centrifugal (Radial Impeller)** pump with viscosity derating ($C_\eta$) for low-viscosity fluids and a **Positive Displacement (Rotary Gear)** pump with slip/viscous-drag modeling for high-viscosity oils ($\nu > 5\text{ cSt}$).
* **Unit System Switching:** Instantaneous toggle between **Metric (SI)** and **Imperial (US)** units across all inputs, KPI cards, thermal resistances, and sweep plots.
* **Telemetry Logging & Export:** Log calculation snapshots to persistent storage (`data/calculation_history.csv`) and download `.csv` reports directly from the browser.

---

## Installation & Deployment (Docker Compose)

Add the following service to your `docker-compose.yml` (or deploy as a Stack in **Portainer**):

```yaml
services:
  thermo-hydraulic-hx:
    image: ghcr.io/b85s5dsg/thermo-hydraulic-hx:latest
    container_name: thermo-hydraulic-hx
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./thermo-hydraulic-hx/data:/app/data
```

> [!NOTE]
> The mounted volume (`/app/data`) stores calculation snapshots written to `calculation_history.csv` when clicking **Log Snapshot** in the web interface.

### Building Locally from Source

```bash
git clone https://github.com/B85S5DSG/thermo-hydraulic-hx.git
cd thermo-hydraulic-hx
docker build -t thermo-hydraulic-hx:latest .
docker compose up -d
```

Once running, open `http://<server-ip>:8000` in your browser.
