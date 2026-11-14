"""Writes xr/public/moon/ for the whole-Moon view of the VR (docs/XR.md): colour, relief and heights of the globe.

Source: NASA Scientific Visualization Studio, "CGI Moon Kit" (https://svs.gsfc.nasa.gov/4720), public domain:
  lroc_color_poles_4k.tif  LROC WAC colour mosaic, 4096 x 2048, simple cylindrical, centred on 0 deg longitude
  ldem_16_uint.tif         LOLA elevation, 16 pixels per degree, uint16 half-metres above a 1,727,400 m sphere

Output (the globe is display only: no number shown in the app is computed from these files):
  color_4k.jpg, color_2k.jpg    the colour map, 4096 x 2048 and 2048 x 1024
  relief_4k.jpg, relief_2k.jpg  ground slope from LOLA: red = 0.5 + rise per metre towards east, green = the same
                                towards north, both clamped to +/- 0.5 (26.6 deg); blue unused
  height_720.u16                720 x 360 heights, uint16 little-endian, same units as the source
  polar_height.u16              1024 x 1024 heights within 35 deg of the south pole, polar stereographic like
                                web/public/data/terrain/south_pole_height.u16 (docs/INTERFACES.md section 8),
                                2.14 km per pixel: the ring between our 430 m grid and the globe, with shadows
  moon.json                     sizes, units, credit, and the check against our own south-pole grid

Run: uv run python scripts/export_moon_globe.py   (downloads the two source files into data/moonkit/ if missing)
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "moonkit"
OUT = ROOT / "xr" / "public" / "moon"
POLE = ROOT / "web" / "public" / "data" / "terrain"
URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
COLOR, LDEM = "lroc_color_poles_4k.tif", "ldem_16_uint.tif"
R_M = 1737400.0
HEIGHT_UNIT_M = 0.5          # one count of the LOLA file
HEIGHT_BASE_M = 1727400.0    # radius of count 0
SLOPE_CLAMP = 0.5            # rise per metre that maps to the ends of a byte
POLAR_SIZE = 1024
POLAR_REACH_DEG = 35.0       # angle from the south pole at the middle of the polar grid's edge
CREDIT = "NASA's Scientific Visualization Studio, CGI Moon Kit: LROC WAC colour (ASU), LOLA elevation (GSFC)"


def fetch(name: str) -> Path:
    path = SRC / name
    if not path.exists():
        SRC.mkdir(parents=True, exist_ok=True)
        print("downloading", URL + name)
        urllib.request.urlretrieve(URL + name, path)
    return path


def write_jpg(path: Path, rgb: np.ndarray) -> None:
    """rgb: (3, rows, cols) uint8."""
    with rasterio.open(path, "w", driver="JPEG", width=rgb.shape[2], height=rgb.shape[1], count=3, dtype="uint8", quality=86) as d:
        d.write(rgb)
    for side in path.parent.glob(path.name + ".aux.xml"):
        side.unlink()


def slopes(height_m: np.ndarray) -> np.ndarray:
    """East and north rise per metre of an equirectangular height grid (row 0 = north, column 0 = 180 W)."""
    rows, cols = height_m.shape
    lat = np.radians(90 - (np.arange(rows) + 0.5) * 180 / rows)
    d_ang = 2 * np.pi / cols  # one pixel, both ways
    east = (np.roll(height_m, -1, axis=1) - np.roll(height_m, 1, axis=1)) / (2 * d_ang * R_M * np.cos(lat)[:, None])
    north = np.empty_like(height_m)
    north[1:-1] = (height_m[:-2] - height_m[2:]) / (2 * d_ang * R_M)
    north[0], north[-1] = north[1], north[-2]
    return np.stack([east, north])


def relief_rgb(height_m: np.ndarray) -> np.ndarray:
    s = np.clip(slopes(height_m), -SLOPE_CLAMP, SLOPE_CLAMP)
    rg = np.round((0.5 + s / (2 * SLOPE_CLAMP)) * 255).astype(np.uint8)
    return np.concatenate([rg, np.full((1, *height_m.shape), 128, np.uint8)])


def polar_grid(full_m: np.ndarray) -> tuple[np.ndarray, dict]:
    """Heights on a south polar stereographic grid (true at the pole, x towards 90 E, y towards 0 E), bilinear."""
    half = 2 * R_M * np.tan(np.radians(POLAR_REACH_DEG) / 2)
    pixel = 2 * half / POLAR_SIZE
    k = np.arange(POLAR_SIZE) + 0.5
    x, y = np.meshgrid(-half + k * pixel, half - k * pixel)
    lat = -90 + np.degrees(2 * np.arctan(np.hypot(x, y) / (2 * R_M)))
    lon = np.degrees(np.arctan2(x, y))
    rows, cols = full_m.shape
    fr = np.clip((90 - lat) / 180 * rows - 0.5, 0, rows - 1.001)
    fc = ((lon + 180) / 360 * cols - 0.5) % cols
    r0, c0 = np.floor(fr).astype(int), np.floor(fc).astype(int)
    c1 = (c0 + 1) % cols
    tr, tc = fr - r0, fc - c0
    h = (full_m[r0, c0] * (1 - tc) + full_m[r0, c1] * tc) * (1 - tr) + (full_m[r0 + 1, c0] * (1 - tc) + full_m[r0 + 1, c1] * tc) * tr
    lo, hi = float(np.floor(h.min())), float(np.ceil(h.max()))
    counts = np.round((h - lo) / (hi - lo) * 65535).astype("<u2")
    meta = {"file": "polar_height.u16", "size": POLAR_SIZE, "pixel_m": pixel, "x_min_m": -half, "y_max_m": half,
            "height_min_m": lo, "height_max_m": hi, "reach_deg": POLAR_REACH_DEG}
    return counts, meta


def check_against_pole(height_m: np.ndarray) -> dict:
    """Mean and worst difference between the kit's heights and our south-pole grid on the 86 S circle."""
    meta = json.loads((POLE / "south_pole.json").read_text())
    n = meta["size"]
    grid = np.fromfile(POLE / meta["files"]["height"], dtype="<u2").reshape(n, n)
    span = meta["height_max_m"] - meta["height_min_m"]
    rows, cols = height_m.shape
    diffs = []
    for lon in np.arange(-180, 180, 2.0):
        rho = 2 * R_M * np.tan(np.radians(4.0) / 2)  # 86 S
        x, y = rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))
        c, r = int((x - meta["x_min_m"]) / meta["pixel_m"]), int((meta["y_max_m"] - y) / meta["pixel_m"])
        ours = meta["height_min_m"] + grid[r, c] / 65535 * span
        kit = height_m[int((90 + 86) / 180 * rows), int((lon + 180) / 360 * cols) % cols]
        diffs.append(kit - ours)
    d = np.array(diffs)
    return {"points": len(d), "mean_m": round(float(d.mean()), 1), "rms_m": round(float(np.sqrt((d**2).mean())), 1), "worst_m": round(float(np.abs(d).max()), 1)}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with rasterio.open(fetch(COLOR)) as d:
        color4 = d.read()
        color2 = d.read(out_shape=(3, d.height // 2, d.width // 2), resampling=Resampling.average)
    write_jpg(OUT / "color_4k.jpg", color4)
    write_jpg(OUT / "color_2k.jpg", color2)

    with rasterio.open(fetch(LDEM)) as d:
        def height(cols: int) -> np.ndarray:
            a = d.read(1, out_shape=(cols // 2, cols), resampling=Resampling.average).astype(np.float64)
            return HEIGHT_BASE_M + HEIGHT_UNIT_M * a - R_M
        full = HEIGHT_BASE_M + HEIGHT_UNIT_M * d.read(1).astype(np.float64) - R_M
        h4, h2, h720 = height(4096), height(2048), height(720)
    write_jpg(OUT / "relief_4k.jpg", relief_rgb(h4))
    write_jpg(OUT / "relief_2k.jpg", relief_rgb(h2))
    counts = np.round((h720 + R_M - HEIGHT_BASE_M) / HEIGHT_UNIT_M).astype("<u2")
    counts.tofile(OUT / "height_720.u16")
    polar, polar_meta = polar_grid(full)
    polar.tofile(OUT / polar_meta["file"])

    check = check_against_pole(full)
    meta = {
        "version": 1,
        "projection": "simple cylindrical; row 0 = 90 N, column 0 = 180 W, centre column = 0 deg E (MOON_ME)",
        "color": {"4k": "color_4k.jpg", "2k": "color_2k.jpg"},
        "relief": {"4k": "relief_4k.jpg", "2k": "relief_2k.jpg", "slope_clamp": SLOPE_CLAMP},
        "height": {"file": "height_720.u16", "cols": 720, "rows": 360, "unit_m": HEIGHT_UNIT_M, "base_radius_m": HEIGHT_BASE_M},
        "polar": polar_meta,
        "credit": CREDIT,
        "source": "https://svs.gsfc.nasa.gov/4720",
        "licence": "public domain (NASA)",
        "check_vs_south_pole_grid_86S": check,
    }
    (OUT / "moon.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("86 S circle, kit minus our grid:", check)
    for p in sorted(OUT.iterdir()):
        print(f"{p.name:16s} {p.stat().st_size / 1e6:6.2f} MB")


if __name__ == "__main__":
    sys.exit(main())
