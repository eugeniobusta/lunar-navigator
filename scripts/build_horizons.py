"""Writes web/public/data/horizons/<id>.json (+ <id>_grid.json) per docs/INTERFACES.md sections 3-4.

Needs data/ldem_75s_120m_float.img + .lbl (make download). Run: uv run python scripts/build_horizons.py
"""
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine.dem import Dem
from engine.horizon import horizon

SITES = ROOT / "web" / "public" / "data" / "sites.json"
OUT = ROOT / "web" / "public" / "data" / "horizons"
OBSERVER_H_M = 2.0
AZ_STEP_DEG = 0.5
MAX_RANGE_KM = 150
GRID_N, GRID_SPACING_M = 9, 500


def rounded(a, nd=3):
    return [round(float(x), nd) for x in a]


def write(path, doc):
    path.write_text(json.dumps(doc, separators=(",", ":")))


def site_doc(dem, s):
    elev, surface = horizon(dem, s["lat"], s["lon"], OBSERVER_H_M, AZ_STEP_DEG, MAX_RANGE_KM)
    # Lower bound is the curvature dip from the observer's own height: acos(R / (R + h)), e.g. 4.9 deg at 6.4 km.
    dip = np.degrees(np.arccos(1737400.0 / (1737400.0 + max(surface, 0.0) + OBSERVER_H_M)))
    assert np.all(np.isfinite(elev)) and elev.min() > -dip - 1.5 and elev.max() < 15, f"{s['id']}: horizon out of range"
    return {"version": 1, "site_id": s["id"], "lat": s["lat"], "lon": s["lon"],
            "surface_elev_m": round(surface, 1), "observer_h_m": OBSERVER_H_M, "az_step_deg": AZ_STEP_DEG,
            "elev_deg": rounded(elev), "dem": dem.name, "max_range_km": MAX_RANGE_KM}


def flat_doc(s):
    return {"version": 1, "site_id": s["id"], "lat": s["lat"], "lon": s["lon"], "surface_elev_m": 0.0,
            "observer_h_m": OBSERVER_H_M, "az_step_deg": AZ_STEP_DEG, "elev_deg": [0.0] * round(360 / AZ_STEP_DEG),
            "dem": "flat", "max_range_km": MAX_RANGE_KM}


def grid_doc(dem, s):
    """9 x 9 observers, 500 m apart in polar-stereographic x/y, centred on the site (i along x, j along y)."""
    x0, y0 = dem.xy(s["lat"], s["lon"])
    half = (GRID_N - 1) // 2
    points = []
    for j in range(GRID_N):
        for i in range(GRID_N):
            dx, dy = (i - half) * GRID_SPACING_M, (j - half) * GRID_SPACING_M
            lat, lon = dem.latlon(x0 + dx, y0 + dy)
            elev, surface = horizon(dem, lat, lon, OBSERVER_H_M, AZ_STEP_DEG, MAX_RANGE_KM)
            points.append({"i": i, "j": j, "dx_m": dx, "dy_m": dy, "lat": round(float(lat), 6),
                           "lon": round(float(lon), 6), "surface_elev_m": round(surface, 1),
                           "elev_deg": rounded(elev)})
    return {"version": 1, "site_id": s["id"], "spacing_m": GRID_SPACING_M, "n": GRID_N,
            "observer_h_m": OBSERVER_H_M, "az_step_deg": AZ_STEP_DEG, "points": points}


def main():
    sites = json.loads(SITES.read_text())["sites"]
    OUT.mkdir(parents=True, exist_ok=True)
    print("LOLA label:")
    dem = Dem.from_label(verbose=True)
    print(f"DEM {dem.name}: shape {dem.h.shape}, heights {dem.h.min():.0f} .. {dem.h.max():.0f} m")
    for s in sites:
        t0 = time.perf_counter()
        if s["terrain"] != "dem":
            write(OUT / f"{s['id']}.json", flat_doc(s))
            print(f"{s['id']:9s} flat (terrain not modelled)")
            continue
        doc = site_doc(dem, s)
        write(OUT / f"{s['id']}.json", doc)
        e = np.array(doc["elev_deg"])
        line = (f"{s['id']:9s} surface {doc['surface_elev_m']:8.1f} m  horizon min/max/mean "
                f"{e.min():6.3f} / {e.max():6.3f} / {e.mean():6.3f} deg  {time.perf_counter() - t0:.2f} s")
        if s["has_grid"]:
            t0 = time.perf_counter()
            write(OUT / f"{s['id']}_grid.json", grid_doc(dem, s))
            line += f"  + grid {time.perf_counter() - t0:.2f} s"
        print(line)


if __name__ == "__main__":
    main()
