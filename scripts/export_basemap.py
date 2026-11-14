"""Writes web/public/data/basemap/ for the landing map: shaded relief from the LOLA elevation map, and the named
craters and mountains with their positions from the IAU Gazetteer of Planetary Nomenclature.

  relief.jpg        2048 x 2048, the 440 km square of the suitability grids (about 215 m per pixel)
  relief_wide.jpg   2048 x 2048, the whole LOLA map down to 75 deg S (about 447 m per pixel), for the surroundings
  basemap.json      extents of the two images, the shading method, sources
  features.json     named features (docs/research/iau_features.csv, fetched from the gazetteer on 14 Nov 2026)

The relief is shading only, to show the shape of the ground. It is lit from four directions at once, so it is not
the real sunlight (the Sun at the pole circles the horizon). Polar stereographic, as docs/SCIENCE.md section 3:
row 0 is the northern edge, lon 0 (towards Earth) is up. Needs make download.
Run: uv run python scripts/export_basemap.py
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine.dem import Dem

OUT = ROOT / "web" / "public" / "data" / "basemap"
FEATURES = ROOT / "docs" / "research" / "iau_features.csv"
SIZE = 2048
HALF_M = 220000.0            # the suitability grids (docs/INTERFACES.md section 8)
AZIMUTHS = (225.0, 270.0, 315.0, 360.0)   # light from the upper left quadrant, the map-reading convention
WEIGHTS = (0.2, 0.25, 0.35, 0.2)
ALTITUDE = 35.0
Z = 2.0                      # vertical exaggeration of the shading, so gentle ground still reads
SUB = 2


def hillshade(h, scale_m):
    """Shaded relief 0..1 of a height grid: the weighted mean of four light directions (multidirectional)."""
    gy, gx = np.gradient(h.astype(np.float32), scale_m)
    gx, gy = Z * gx, Z * -gy                     # rows go down, y goes up
    norm = np.sqrt(gx * gx + gy * gy + 1.0)
    alt = np.radians(ALTITUDE)
    out = np.zeros(h.shape, dtype=np.float32)
    for az, w in zip(AZIMUTHS, WEIGHTS, strict=True):
        a = np.radians(az)                        # clockwise from up (+y)
        lx, ly, lz = np.sin(a) * np.cos(alt), np.cos(a) * np.cos(alt), np.sin(alt)
        out += w * np.clip((-gx * lx - gy * ly + lz) / norm, 0.0, 1.0)
    return out


def resample(shade, half_m, size=SIZE):
    """`shade` (a Dem holding the shading) on a size x size grid over [-half_m, half_m], mean of SUB x SUB samples."""
    px = 2 * half_m / size
    k = np.arange(size) + 0.5
    x, y = -half_m + k * px, half_m - k * px
    off = ((np.arange(SUB) + 0.5) / SUB - 0.5) * px
    total = np.zeros((size, size))
    for dy in off:
        for dx in off:
            total += shade.height_at_xy((x + dx)[None, :], (y + dy)[:, None])
    return total / SUB**2


def write_jpeg(path, grid):
    """0..1 (NaN = outside the data, written black) as an 8-bit greyscale JPEG."""
    img = np.where(np.isfinite(grid), np.clip(grid, 0, 1) ** 0.9 * 255.0, 0.0).round().astype(np.uint8)
    with rasterio.open(path, "w", driver="JPEG", width=img.shape[1], height=img.shape[0], count=1, dtype="uint8", QUALITY=82) as ds:
        ds.write(img, 1)
    aux = Path(str(path) + ".aux.xml")
    if aux.exists():
        aux.unlink()


def features():
    rows = list(csv.DictReader(FEATURES.open()))
    return [{"id": int(r["feature_id"]), "name": r["name"], "type": r["feature_type"], "lat": float(r["lat"]),
             "lon": float(r["lon"]), "diameter_km": float(r["diameter_km"]), "rank": r["rank"], "url": r["url"]} for r in rows]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    dem = Dem.from_label()
    shade = Dem(hillshade(dem.h, dem.scale_m), dem.scale_m, dem.line_offset, dem.sample_offset)
    rows, cols = dem.h.shape
    wide_half = min(dem.sample_offset, cols - 1 - dem.sample_offset, dem.line_offset, rows - 1 - dem.line_offset) * dem.scale_m
    write_jpeg(OUT / "relief.jpg", resample(shade, HALF_M))
    write_jpeg(OUT / "relief_wide.jpg", resample(shade, wide_half))
    feats = features()
    (OUT / "features.json").write_text(json.dumps({
        "version": 1,
        "source": "IAU Gazetteer of Planetary Nomenclature (USGS Astrogeology Science Center), https://planetarynames.wr.usgs.gov, read on 14 Nov 2026",
        "note": "Centre latitude and east longitude in degrees, diameter in km, as listed by the gazetteer.",
        "features": feats}, indent=1))
    (OUT / "basemap.json").write_text(json.dumps({
        "version": 1, "projection": "south polar stereographic, R = 1737.4 km, lon 0 up, lon 90 E right; row 0 = northern edge",
        "images": [{"file": "relief.jpg", "size": SIZE, "half_width_m": HALF_M},
                   {"file": "relief_wide.jpg", "size": SIZE, "half_width_m": round(wide_half, 1)}],
        "shading": {"method": "multidirectional hillshade of the 120 m heights, then averaged down",
                    "azimuths_deg": list(AZIMUTHS), "weights": list(WEIGHTS), "altitude_deg": ALTITUDE,
                    "vertical_exaggeration": Z, "note": "Shading shows the shape of the ground. It is not the real sunlight."},
        "sources": [{"name": "LOLA LDEM_75S_120M (LRO Lunar Orbiter Laser Altimeter, PDS Geosciences Node)",
                     "url": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/"}],
    }, indent=1))
    for f in sorted(OUT.iterdir()):
        print(f"{f.name}: {f.stat().st_size:,} bytes")
    print(f"wide half-width {wide_half / 1000:.1f} km; {len(feats)} named features")


if __name__ == "__main__":
    main()
