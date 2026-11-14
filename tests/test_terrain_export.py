"""web/public/data/terrain/ against docs/INTERFACES.md section 8."""
import json
from pathlib import Path

import numpy as np
import pytest
from pyproj import Proj

ROOT = Path(__file__).resolve().parents[1]
TERRAIN = ROOT / "web" / "public" / "data" / "terrain"
SUN_TIF = ROOT / "data" / "AVGVISIB_75S_120M_201608.TIF"
DOC = json.loads((TERRAIN / "south_pole.json").read_text())


def pixel_of(site):
    col = int((site["x_m"] - DOC["x_min_m"]) // DOC["pixel_m"])
    row = int((DOC["y_max_m"] - site["y_m"]) // DOC["pixel_m"])
    return row, col


def site(sid):
    return next(s for s in DOC["sites"] if s["id"] == sid)


def test_file_sizes_and_grid():
    assert (TERRAIN / DOC["files"]["height"]).stat().st_size == 2_097_152
    assert (TERRAIN / DOC["files"]["sun"]).stat().st_size == 1_048_576
    assert (TERRAIN / DOC["files"]["earth"]).stat().st_size == 1_048_576
    assert DOC["size"] == 1024 and DOC["pixel_m"] == 440000 / 1024
    assert DOC["x_min_m"] == -220000 and DOC["y_max_m"] == 220000
    assert sum(p.stat().st_size for p in TERRAIN.iterdir() if p.name != ".gitkeep") < 5_000_000


def test_site_xy_matches_pyproj():
    sites = {s["id"]: s for s in json.loads((ROOT / "web" / "public" / "data" / "sites.json").read_text())["sites"]}
    assert {s["id"] for s in DOC["sites"]} == {k for k, s in sites.items() if s["terrain"] == "dem"}
    x, y = Proj(DOC["proj"])(sites["mma01"]["lon"], sites["mma01"]["lat"])
    m = site("mma01")
    assert m["x_m"] == pytest.approx(x, abs=0.1) and m["y_m"] == pytest.approx(y, abs=0.1)
    assert abs(x) < 10000 and 100000 < y < 150000  # Malapert: ~4 deg (~123 km) from the pole, near the lon 0 meridian (+y)


def test_height_range_and_decoding():
    assert -9000 < DOC["height_min_m"] < DOC["height_max_m"] < 11000
    v = np.fromfile(TERRAIN / DOC["files"]["height"], dtype="<u2").reshape(1024, 1024)
    h = DOC["height_min_m"] + v / 65535 * (DOC["height_max_m"] - DOC["height_min_m"])
    for sid in ("mma01", "hw02", "nr208"):  # the ~430 m pixel mean stays close to the site's full-resolution height
        assert h[pixel_of(site(sid))] == pytest.approx(site(sid)["height_m"], abs=60)
    # Row 0 is the northern edge: Malapert (y > 0) must be in the top half; the pole is at the centre.
    assert pixel_of(site("mma01"))[0] < 512
    assert h[511:513, 511:513].mean() == pytest.approx(1293, abs=400)  # the pole sits on Shackleton's rim


def test_visibility_maps_are_percent():
    for key in ("sun", "earth"):
        a = np.fromfile(TERRAIN / DOC["files"][key], dtype=np.uint8)
        assert a[a != 255].max() <= 100
    earth = np.fromfile(TERRAIN / DOC["files"]["earth"], dtype=np.uint8).reshape(1024, 1024)
    assert earth[pixel_of(site("mma01"))] > 90  # Malapert faces Earth


@pytest.mark.skipif(not SUN_TIF.exists(), reason="PGDA maps not downloaded (make download)")
def test_malapert_sun_pixel_matches_pgda():
    import rasterio
    sun = np.fromfile(TERRAIN / DOC["files"]["sun"], dtype=np.uint8).reshape(1024, 1024)
    m = site("mma01")
    with rasterio.open(SUN_TIF) as ds:
        dn = next(ds.sample([(m["x_m"], m["y_m"])]))[0]
        pgda = 100.0 * (dn * ds.scales[0] + ds.offsets[0])
    print(f"mma01 sun: exported pixel {sun[pixel_of(m)]} %, PGDA at the exact location {pgda:.1f} %")
    assert abs(float(sun[pixel_of(m)]) - pgda) < 5
