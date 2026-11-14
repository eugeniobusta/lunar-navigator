"""web/public/data/terrain/sites/<id>/ against docs/INTERFACES.md section 9."""
import json
from pathlib import Path

import numpy as np
import pytest
from pyproj import Proj

ROOT = Path(__file__).resolve().parents[1]
TILES = ROOT / "web" / "public" / "data" / "terrain" / "sites"
DATA = ROOT / "data"
SITES = {s["id"]: s for s in json.loads((ROOT / "web" / "public" / "data" / "sites.json").read_text())["sites"]}
DEM_SITES = [k for k, s in SITES.items() if s["terrain"] == "dem"]
needs_raw = pytest.mark.skipif(not (DATA / "ldem_75s_120m_float.img").exists(), reason="raw data not downloaded")


def doc(sid):
    return json.loads((TILES / sid / "tile.json").read_text())


def grid(sid, key, dtype):
    d = doc(sid)
    return np.fromfile(TILES / sid / d["files"][key], dtype=dtype).reshape(d["size"], d["size"])


def heights(sid):
    d = doc(sid)
    return d["height_min_m"] + grid(sid, "height", "<u2") / 65535 * (d["height_max_m"] - d["height_min_m"])


def test_one_folder_per_dem_site_with_the_right_sizes():
    assert sorted(p.name for p in TILES.iterdir() if p.is_dir()) == sorted(DEM_SITES)
    for sid in DEM_SITES:
        d = doc(sid)
        assert d["size"] == 512 and d["pixel_m"] == 120 and d["site_id"] == sid
        sizes = {k: (TILES / sid / f).stat().st_size for k, f in d["files"].items()}
        assert sizes == {"height": 524_288, "far": 524_288, "sun": 262_144, "earth": 262_144, "slope": 262_144}
        assert d["far"]["size"] == 512 and d["far"]["pixel_m"] == 600
        # The far grid shares the tile's centre.
        assert d["far"]["x_min_m"] + 256 * 600 == d["x_min_m"] + 256 * 120
        assert d["far"]["y_max_m"] - 256 * 600 == d["y_max_m"] - 256 * 120


def test_site_is_at_the_tile_centre_and_matches_pyproj():
    for sid in DEM_SITES:
        d = doc(sid)
        x, y = Proj(d["proj"])(SITES[sid]["lon"], SITES[sid]["lat"])
        assert d["site"]["x_m"] == pytest.approx(x, abs=0.1) and d["site"]["y_m"] == pytest.approx(y, abs=0.1)
        assert 255 <= d["site"]["row"] <= 256 and 255 <= d["site"]["col"] <= 256
        assert d["x_min_m"] + (d["site"]["col"] + 0.5) * 120 == pytest.approx(x, abs=0.1)
        assert d["y_max_m"] - (d["site"]["row"] + 0.5) * 120 == pytest.approx(y, abs=0.1)


def test_known_pixels_at_malapert():
    d = doc("mma01")
    assert (d["x_min_m"], d["y_max_m"]) == (-32760.0, 153840.0)
    h = heights("mma01")
    r, c = d["site"]["row"], d["site"]["col"]
    r0, c0 = int(r), int(c)
    tr, tc = r - r0, c - c0
    bilinear = ((1 - tr) * ((1 - tc) * h[r0, c0] + tc * h[r0, c0 + 1])
                + tr * ((1 - tc) * h[r0 + 1, c0] + tc * h[r0 + 1, c0 + 1]))
    horizon = json.loads((ROOT / "web" / "public" / "data" / "horizons" / "mma01.json").read_text())
    assert bilinear == pytest.approx(horizon["surface_elev_m"], abs=0.2)  # 4728.7 m, the massif's summit ridge
    assert d["site"]["height_m"] == horizon["surface_elev_m"]
    assert grid("mma01", "earth", np.uint8)[r0, c0] > 90  # Malapert faces Earth
    assert grid("mma01", "slope", np.uint8)[r0, c0] < 15  # the site is on the summit plateau, not the flank


def test_value_ranges():
    for sid in DEM_SITES:
        for key in ("sun", "earth"):
            a = grid(sid, key, np.uint8)
            assert a[a != 255].max() <= 100
        slope = grid(sid, "slope", np.uint8)
        assert slope.max() < 60 and 3 < np.median(slope) < 20
        d = doc(sid)
        assert -9000 < d["height_min_m"] < d["height_max_m"] < 11000
        assert -9000 < d["far"]["height_min_m"] <= d["height_min_m"] + 200  # the wider area reaches at least as low


def test_slope_of_a_known_ramp():
    from engine.dem import Dem
    from scripts.export_site_tiles import slope_deg
    ramp = np.tile(np.arange(64) * 120.0 * np.tan(np.radians(10.0)), (64, 1)).astype(np.float32)  # 10 deg along x
    s = slope_deg(Dem(ramp, 120.0, 31.5, 31.5))
    assert s[32, 32] == pytest.approx(10.0, abs=0.01)


@needs_raw
def test_tile_pixels_are_the_dem_and_pgda_pixels():
    import rasterio

    from engine.dem import Dem
    dem = Dem.from_label()
    d = doc("mma01")
    col0 = int(round(d["x_min_m"] / 120 + dem.sample_offset + 0.5))
    row0 = int(round(dem.line_offset + 0.5 - d["y_max_m"] / 120))
    assert np.abs(heights("mma01") - dem.h[row0:row0 + 512, col0:col0 + 512]).max() < 0.1
    far = d["far"]["height_min_m"] + grid("mma01", "far", "<u2") / 65535 * (d["far"]["height_max_m"] - d["far"]["height_min_m"])
    block = dem.h[row0 - 1024 + 1280:row0 - 1024 + 1285, col0 - 1024 + 1280:col0 - 1024 + 1285]  # far pixel (256, 256)
    assert far[256, 256] == pytest.approx(float(block.mean()), abs=0.2)
    with rasterio.open(DATA / "AVGVISIB_75S_120M_201608.TIF") as ds:
        dn = ds.read(1, window=((row0 + 255, row0 + 256), (col0 + 255, col0 + 256)))[0, 0]
        pgda = 100.0 * (dn * ds.scales[0] + ds.offsets[0])
    assert abs(float(grid("mma01", "sun", np.uint8)[255, 255]) - pgda) <= 0.5
