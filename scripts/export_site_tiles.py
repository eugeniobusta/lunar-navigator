"""Writes web/public/data/terrain/sites/<id>/ for the VR view (docs/INTERFACES.md section 9).

For every terrain="dem" site: a 512 x 512 tile at the DEM's native 120 m per pixel, centred on the site, in the polar
stereographic projection of docs/SCIENCE.md section 3. The tile is cut on the DEM's own pixel grid (no resampling),
so the site falls within half a pixel of the tile centre; tile.json gives its exact fractional pixel.
Plus far.u16, the same 512 x 512 at 600 m (+/- 153.6 km), so a horizon can be marched to 150 km in the browser.
Needs make download. Run: uv run python scripts/export_site_tiles.py
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
OUT = ROOT / "web" / "public" / "data" / "terrain" / "sites"
SIZE = 512
PIXEL_M = 120.0
R_M = 1737400.0
NO_DATA = 255
FAR_FACTOR = 5  # far.u16: SIZE x SIZE at 600 m, each pixel the mean of 5 x 5 DEM pixels, same centre as the tile
FILES = {"height": "height.u16", "sun": "sun.u8", "earth": "earth.u8", "slope": "slope.u8", "far": "far.u16"}
SOURCES = [
    {"name": "LOLA LDEM_75S_120M (LRO Lunar Orbiter Laser Altimeter, PDS Geosciences Node)",
     "url": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/"},
    {"name": "NASA GSFC PGDA Lunar Polar Illumination, AVGVISIB_75S_120M_201608 (Sun and Earth)",
     "url": "https://pgda.gsfc.nasa.gov/products/69"},
]


def pgda_percent(path, dem):
    """A PGDA GeoTIFF as percent 0..100 on the DEM's own 120 m grid (scale, offset and nodata from the file)."""
    with rasterio.open(path) as ds:
        t = ds.transform
        assert (t.a, t.e, t.c, t.f) == (120.0, -120.0, -457440.0, 457440.0), "unexpected PGDA grid"
        dn = ds.read(1)
        assert dn.shape == dem.h.shape
        pct = 100.0 * (dn.astype(np.float32) * ds.scales[0] + ds.offsets[0])
        if ds.nodata is not None:
            pct[dn == ds.nodata] = np.nan
    return pct


def slope_deg(dem):
    """Slope (deg) from central differences over 2 pixels (240 m), corrected for the projection's scale factor."""
    dh_dy, dh_dx = np.gradient(dem.h.astype(np.float64), dem.scale_m)
    rows, cols = dem.h.shape
    x = (np.arange(cols) - dem.sample_offset) * dem.scale_m
    y = (dem.line_offset - np.arange(rows)) * dem.scale_m
    rho2 = x[None, :] ** 2 + y[:, None] ** 2
    k = 1.0 + rho2 / (4.0 * R_M**2)  # map metres per ground metre in polar stereographic with k0 = 1 at the pole
    return np.degrees(np.arctan(np.hypot(dh_dx, dh_dy) * k))


def to_u8(a, top):
    out = np.full(a.shape, NO_DATA, dtype=np.uint8)
    ok = np.isfinite(a)
    out[ok] = np.clip(np.rint(a[ok]), 0, top).astype(np.uint8)
    return out


def window(dem, x, y):
    """(row0, col0, site_row, site_col): the SIZE x SIZE block of DEM pixels whose centre is nearest the site."""
    fc = x / dem.scale_m + dem.sample_offset
    fr = dem.line_offset - y / dem.scale_m
    col0 = int(round(fc - (SIZE - 1) / 2))
    row0 = int(round(fr - (SIZE - 1) / 2))
    return row0, col0, fr - row0, fc - col0


def main():
    dem = Dem.from_label()
    assert dem.scale_m == PIXEL_M
    layers = {"sun": pgda_percent(DATA / "AVGVISIB_75S_120M_201608.TIF", dem),
              "earth": pgda_percent(DATA / "AVGVISIB_75S_120M_201608_EARTH.TIF", dem),
              "slope": slope_deg(dem)}
    tops = {"sun": 100, "earth": 100, "slope": 90}
    total = 0
    for s in json.loads(SITES.read_text())["sites"]:
        if s["terrain"] != "dem":
            continue
        x, y = dem.xy(s["lat"], s["lon"])
        row0, col0, site_row, site_col = window(dem, x, y)
        assert row0 >= 0 and col0 >= 0 and row0 + SIZE <= dem.h.shape[0] and col0 + SIZE <= dem.h.shape[1], s["id"]
        block = (slice(row0, row0 + SIZE), slice(col0, col0 + SIZE))
        h = dem.h[block].astype(np.float64)
        h_min, h_max = float(np.floor(h.min())), float(np.ceil(h.max()))
        out = OUT / s["id"]
        out.mkdir(parents=True, exist_ok=True)
        (out / FILES["height"]).write_bytes(np.rint((h - h_min) / (h_max - h_min) * 65535).astype("<u2").tobytes())
        # Far field: the horizon march runs 150 km from the site, which leaves terrain/south_pole.* (220 km from the
        # pole) for the outer sites, so every site carries its own coarse surroundings (+/- 153.6 km).
        n = SIZE * FAR_FACTOR
        fr0, fc0 = row0 - (n - SIZE) // 2, col0 - (n - SIZE) // 2
        assert fr0 >= 0 and fc0 >= 0 and fr0 + n <= dem.h.shape[0] and fc0 + n <= dem.h.shape[1], s["id"]
        far = dem.h[fr0:fr0 + n, fc0:fc0 + n].astype(np.float64)
        far = far.reshape(SIZE, FAR_FACTOR, SIZE, FAR_FACTOR).mean(axis=(1, 3))
        f_min, f_max = float(np.floor(far.min())), float(np.ceil(far.max()))
        (out / FILES["far"]).write_bytes(np.rint((far - f_min) / (f_max - f_min) * 65535).astype("<u2").tobytes())
        for key, grid in layers.items():
            (out / FILES[key]).write_bytes(to_u8(grid[block], tops[key]).tobytes())
        doc = {"version": 1, "site_id": s["id"], "proj": STERE_SOUTH, "size": SIZE, "pixel_m": PIXEL_M,
               # outer edges of the tile; pixel (row, col) centre: x = x_min_m + (col + 0.5) * pixel_m, y likewise down
               "x_min_m": (col0 - dem.sample_offset - 0.5) * PIXEL_M,
               "y_max_m": (dem.line_offset - row0 + 0.5) * PIXEL_M,
               "height_min_m": h_min, "height_max_m": h_max,
               "site": {"x_m": round(float(x), 1), "y_m": round(float(y), 1),
                        "row": round(float(site_row), 3), "col": round(float(site_col), 3),
                        "height_m": round(float(dem.height_at(s["lat"], s["lon"])), 1)},
               "far": {"size": SIZE, "pixel_m": PIXEL_M * FAR_FACTOR,
                       "x_min_m": (fc0 - dem.sample_offset - 0.5) * PIXEL_M,
                       "y_max_m": (dem.line_offset - fr0 + 0.5) * PIXEL_M,
                       "height_min_m": f_min, "height_max_m": f_max},
               "files": FILES, "sources": SOURCES}
        (out / "tile.json").write_text(json.dumps(doc, indent=1))
        size = sum(p.stat().st_size for p in out.iterdir())
        total += size
        slope = layers["slope"][block]
        print(f"{s['id']:8s} {size:>9,d} bytes; heights {h_min:6.0f} .. {h_max:5.0f} m; "
              f"site pixel ({site_row:.2f}, {site_col:.2f}); slope median {np.median(slope):.1f}, max {slope.max():.1f} deg")
    print(f"total {total / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
