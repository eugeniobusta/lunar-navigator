"""Writes web/public/data/terrain/ for the 3D view (docs/INTERFACES.md section 8).

A 1024 x 1024 grid centred on the south pole, half-width 220 km, polar stereographic (docs/SCIENCE.md section 3):
LOLA heights as uint16 and the NASA PGDA Sun / Earth visibility maps as uint8 percent.
Needs make download. Run: uv run python scripts/export_terrain.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine.dem import STERE_SOUTH, Dem

DATA = ROOT / "data"
SITES = ROOT / "web" / "public" / "data" / "sites.json"
OUT = ROOT / "web" / "public" / "data" / "terrain"
SIZE = 1024
HALF_WIDTH_M = 220000.0
PIXEL_M = 2 * HALF_WIDTH_M / SIZE
X_MIN_M, Y_MAX_M = -HALF_WIDTH_M, HALF_WIDTH_M
SUB = 4  # each output pixel is the mean of SUB x SUB bilinear samples (the source is 120 m, the output ~430 m)
NO_DATA = 255
FILES = {"height": "south_pole_height.u16", "sun": "south_pole_sun.u8", "earth": "south_pole_earth.u8"}
SOURCES = [
    {"name": "LOLA LDEM_75S_120M (LRO Lunar Orbiter Laser Altimeter, PDS Geosciences Node)",
     "url": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/"},
    {"name": "NASA GSFC PGDA Lunar Polar Illumination, AVGVISIB_75S_120M_201608 (Sun and Earth)",
     "url": "https://pgda.gsfc.nasa.gov/products/69"},
]


def pixel_centres():
    """x of each column and y of each row (m). Row 0 is the northern edge (largest y); column 0 the smallest x."""
    k = np.arange(SIZE) + 0.5
    return X_MIN_M + k * PIXEL_M, Y_MAX_M - k * PIXEL_M


def resample(grid):
    """Mean of SUB x SUB bilinear samples inside every output pixel. grid: a Dem-like object. NaN where no data."""
    x, y = pixel_centres()
    off = ((np.arange(SUB) + 0.5) / SUB - 0.5) * PIXEL_M
    total = np.zeros((SIZE, SIZE))
    for dy in off:
        for dx in off:
            total += grid.height_at_xy((x + dx)[None, :], (y + dy)[:, None])
    return total / SUB**2


def pgda_as_grid(path):
    """A PGDA GeoTIFF as percent 0..100 on the same 120 m grid as the DEM (scale, offset and nodata from the file)."""
    with rasterio.open(path) as ds:
        t = ds.transform
        assert (t.a, t.e, t.c, t.f) == (120.0, -120.0, -457440.0, 457440.0), "unexpected PGDA grid"
        dn = ds.read(1)
        pct = 100.0 * (dn.astype(np.float32) * ds.scales[0] + ds.offsets[0])
        if ds.nodata is not None:
            pct[dn == ds.nodata] = np.nan
    return Dem(pct, 120.0, 3811.5, 3811.5, name=path.stem)


def to_u8(pct):
    out = np.full(pct.shape, NO_DATA, dtype=np.uint8)
    ok = np.isfinite(pct)
    out[ok] = np.clip(np.rint(pct[ok]), 0, 100).astype(np.uint8)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    dem = Dem.from_label()
    h = resample(dem)
    assert np.all(np.isfinite(h)), "the 220 km square must lie inside the DEM"
    h_min, h_max = float(np.floor(h.min())), float(np.ceil(h.max()))
    v = np.rint((h - h_min) / (h_max - h_min) * 65535).astype("<u2")
    (OUT / FILES["height"]).write_bytes(v.tobytes())
    for key, tif in (("sun", "AVGVISIB_75S_120M_201608.TIF"), ("earth", "AVGVISIB_75S_120M_201608_EARTH.TIF")):
        (OUT / FILES[key]).write_bytes(to_u8(resample(pgda_as_grid(DATA / tif))).tobytes())

    sites = []
    for s in json.loads(SITES.read_text())["sites"]:
        if s["terrain"] != "dem":
            continue
        x, y = dem.xy(s["lat"], s["lon"])
        assert abs(x) < HALF_WIDTH_M and abs(y) < HALF_WIDTH_M, f"{s['id']} is outside the exported square"
        sites.append({"id": s["id"], "name": s["name"], "x_m": round(float(x), 1), "y_m": round(float(y), 1),
                      "height_m": round(float(dem.height_at(s["lat"], s["lon"])), 1)})
    doc = {"version": 1, "proj": STERE_SOUTH, "size": SIZE, "pixel_m": PIXEL_M, "x_min_m": X_MIN_M, "y_max_m": Y_MAX_M,
           "height_min_m": h_min, "height_max_m": h_max, "files": FILES, "sites": sites, "sources": SOURCES}
    (OUT / "south_pole.json").write_text(json.dumps(doc, indent=1))

    total = 0
    for p in sorted(OUT.iterdir()):
        total += p.stat().st_size
        print(f"{p.name:26s} {p.stat().st_size:>9,d} bytes")
    print(f"total {total / 1e6:.2f} MB; pixel {PIXEL_M} m; heights {h_min:.0f} .. {h_max:.0f} m; {len(sites)} sites")
    assert total < 5e6


if __name__ == "__main__":
    main()
