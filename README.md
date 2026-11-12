# Thermo-Hydraulic Heat Exchanger Calculator

This is my first attempt at making a container. As a mechanical engineer, I figured I'd try something that I know how to calculate. This is a relatively simple heat exchanger calculator—very basic, and not what you'd find in an industrial application due to its academic design.

> [!WARNING]
> **Educational Use Only:** This project was built as a quick exercise to learn coding and container deployment (using Gemini Argon to generate the Python and JS code). While I sanity-checked the physics and results, there are likely errors, and **this should not be used for production.**

## Components
* **Pipe:** Annular fins with uniform wall thickness and spacing.
* **Duct:** Configured for cross-flow air.
* **Calculations:** Basic thermodynamic and fluid power modeling.

## Configurable Input Parameters
* **Units:** Selectable between Metric and Imperial.
* **Liquid Side:** Volumetric flow rate and inlet temperature.
* **Air Side:** Air velocity.
* **Pump Selection:** Automatically selects an impeller or positive displacement pump based on liquid viscosity, with an adjustable typical efficiency.
* **Geometry:** Pipe ID, wall thickness, length, fin OD, fin wall thickness, and duct sizing (specified as a percentage larger than the fin OD).

## Installation (Docker Compose)

Add the following service to your `docker-compose.yml` file:

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

> **Note:** The mounted volume is used for writing out calculation results to a `.csv` file.
