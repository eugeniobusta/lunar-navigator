"""Writes xr/public/sky/: the pictures of the Earth and the Sun used by the VR view (docs/XR.md).

Sources, both NASA and in the public domain (display only: no number shown in the app is computed from them):
  Earth  NASA Goddard Scientific Visualization Studio, "Blue Marble - A Seamless Image Mosaic of the Earth (WMS)",
         item 2915: bluemarble-2048.png, 2048 x 1024, simple cylindrical, centred on 0 deg longitude.
         https://svs.gsfc.nasa.gov/2915
  Sun    NASA Solar Dynamics Observatory, "Spotless Sun" (PIA21582), full disc on 2017-03-13.
         https://images.nasa.gov/details/PIA21582

Output:
  earth_2k.jpg, earth_1k.jpg  the Earth, 2048 x 1024 and 1024 x 512
  sun_512.jpg                 the Sun's disc cut out to fill a 512 x 512 square, brightened (its brightest 1 % = white level)
  sky.json                    file names, sources, credit

Run: uv run python scripts/export_sky_textures.py   (downloads the two source files into data/sky/ if missing)
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "sky"
OUT = ROOT / "xr" / "public" / "sky"
EARTH = ("bluemarble-2048.png", "https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png")
SUN = ("sdo_PIA21582.jpg", "https://images-assets.nasa.gov/image/PIA21582/PIA21582~orig.jpg")
SUN_SIZE = 512


def fetch(name: str, url: str) -> Path:
    path = SRC / name
    if not path.exists():
        SRC.mkdir(parents=True, exist_ok=True)
        print("downloading", url)
        urllib.request.urlretrieve(url, path)
    return path


def write_jpg(path: Path, rgb: np.ndarray, quality: int = 88) -> None:
    """rgb: (3, rows, cols) uint8."""
    with rasterio.open(path, "w", driver="JPEG", width=rgb.shape[2], height=rgb.shape[1], count=3, dtype="uint8", quality=quality) as d:
        d.write(rgb)
    for side in path.parent.glob(path.name + ".aux.xml"):
        side.unlink()


def sun_disc(path: Path) -> tuple[np.ndarray, dict]:
    """The Sun's disc found by brightness (the sky round it is black), cut out square and resampled."""
    with rasterio.open(path) as d:
        full = d.read().astype(np.float64)
        lum = full.mean(axis=0)
        on = lum > 0.5 * np.percentile(lum, 50)  # half the typical brightness of the disc: its edge, not the glow round it
        # Extent along the middle rows and the middle columns only: the date printed in a corner does not count.
        h, w = on.shape
        rows = np.flatnonzero(on[:, int(0.4 * w) : int(0.6 * w)].any(axis=1))
        cols = np.flatnonzero(on[int(0.4 * h) : int(0.6 * h), :].any(axis=0))
        cy, cx = (rows[0] + rows[-1] + 1) / 2, (cols[0] + cols[-1] + 1) / 2
        r = min(rows[-1] - rows[0] + 1, cols[-1] - cols[0] + 1) / 2
        win = Window(cx - r, cy - r, 2 * r, 2 * r)
        cut = d.read(window=win, out_shape=(3, SUN_SIZE, SUN_SIZE), resampling=Resampling.average, boundless=True).astype(np.float64)
    white = np.percentile(cut.max(axis=0), 99)
    out = np.clip(cut / white * 255, 0, 255).round().astype(np.uint8)
    return out, {"centre_px": [round(float(cx), 1), round(float(cy), 1)], "radius_px": round(float(r), 1), "white_level": round(float(white), 1)}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with rasterio.open(fetch(*EARTH)) as d:
        e2 = d.read([1, 2, 3])
        e1 = d.read([1, 2, 3], out_shape=(3, d.height // 2, d.width // 2), resampling=Resampling.average)
    write_jpg(OUT / "earth_2k.jpg", e2)
    write_jpg(OUT / "earth_1k.jpg", e1)
    sun, found = sun_disc(fetch(*SUN))
    write_jpg(OUT / "sun_512.jpg", sun, 90)
    meta = {
        "version": 1,
        "earth": {"2k": "earth_2k.jpg", "1k": "earth_1k.jpg", "projection": "simple cylindrical; row 0 = 90 N, column 0 = 180 W",
                  "source": "https://svs.gsfc.nasa.gov/2915", "file": EARTH[1],
                  "credit": "NASA/Goddard Space Flight Center Scientific Visualization Studio. The Blue Marble Next Generation data is courtesy of Reto Stockli (NASA/GSFC) and NASA's Earth Observatory."},
        "sun": "sun_512.jpg",
        "sun_source": {"source": "https://images.nasa.gov/details/PIA21582", "file": SUN[1], "title": "Spotless Sun (PIA21582), 2017-03-13",
                       "credit": "NASA/GSFC/Solar Dynamics Observatory", "disc_found": found},
        "licence": "public domain (NASA)",
    }
    (OUT / "sky.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("Sun's disc in the source image:", found)
    for p in sorted(OUT.iterdir()):
        print(f"{p.name:14s} {p.stat().st_size / 1e3:7.1f} kB")


if __name__ == "__main__":
    sys.exit(main())
