"""engine/dem.py, engine/horizon.py and engine/visibility.py: synthetic known answers plus a real-site check."""
import numpy as np
import pytest

from engine.dem import LDEM_LABEL, Dem
from engine.horizon import R_M, horizon, march_distances, obstruction_angle
from engine.visibility import horizon_at, longest_run


def synthetic(n=3001, scale=120.0):
    """Flat 360 km square around the south pole, pixel centres at whole pixels from the pole."""
    return Dem(np.zeros((n, n), dtype=np.float32), scale, (n - 1) / 2, (n - 1) / 2)


def test_bilinear_and_orientation():
    dem = synthetic()
    c = (dem.h.shape[0] - 1) // 2
    dem.h[c - 10, c] = 100.0   # 10 px up from the pole: on the lon = 0 meridian
    dem.h[c, c + 10] = 200.0   # 10 px right of the pole: on the lon = 90 E meridian
    lat = -90 + np.degrees(2 * np.arctan(1200.0 / (2 * R_M)))  # 1200 m from the pole in stereographic x/y
    assert dem.height_at(lat, 0.0) == pytest.approx(100.0, abs=1e-3)
    assert dem.height_at(lat, 90.0) == pytest.approx(200.0, abs=1e-3)
    assert dem.height_at(lat, 180.0) == pytest.approx(0.0, abs=1e-6)
    x, y = dem.xy(lat, 0.0)
    assert dem.height_at_xy(x, y - 60.0) == pytest.approx(50.0, abs=1e-3)  # halfway to the next pixel
    assert np.isnan(dem.height_at(-80.0, 0.0))  # outside this small grid


def test_march_distances():
    d = march_distances()
    assert d[0] == 120 and d[1] == 240 and d[-1] == 150000
    near = d[d <= 4920]
    assert near.size == 41 and np.allclose(np.diff(near), 120)
    far = d[d >= 4920]
    assert np.allclose(far[1:-1] / far[:-2], 1.015)


def test_flat_dem_gives_curvature_dip():
    # From 2 m above a smooth sphere the horizon dips by acos(R / (R + h)) = 0.0869 deg, all around.
    elev, surface = horizon(synthetic(), -89.0, 30.0)
    assert surface == 0.0 and elev.shape == (720,)
    assert elev == pytest.approx(-np.degrees(np.arccos(R_M / (R_M + 2.0))), abs=1e-4)


def test_cone_of_known_height_and_distance():
    dem = synthetic()
    lat, lon, dist, peak, base = -89.0, 0.0, 30000.0, 3000.0, 20000.0
    # Cone centred 30 km from the observer along azimuth 180 (towards the pole and beyond).
    ox, oy = dem.xy(lat, lon)
    rows, cols = np.indices(dem.h.shape)
    x = (cols - dem.sample_offset) * dem.scale_m
    y = (dem.line_offset - rows) * dem.scale_m
    # Stereographic scale is ~1 near the pole; place the peak 30 km "down" the lon = 0 meridian.
    dem.h[:] = np.maximum(0.0, peak * (1 - np.hypot(x - ox, y - (oy - dist)) / base))
    elev, _ = horizon(dem, lat, lon)
    expected = float(obstruction_angle(peak, 2.0, dist))
    assert expected == pytest.approx(5.21, abs=0.01)
    # The march steps ~450 m at this range, so it can miss the exact summit by a few tens of metres.
    assert elev[360] == pytest.approx(expected, abs=0.1)   # az 180
    assert elev[360] <= expected + 1e-9
    assert elev[0] == pytest.approx(-0.0869, abs=1e-3)     # az 0: nothing but the smooth sphere


def test_horizon_interpolation_and_runs():
    elev = np.zeros(720)
    elev[0], elev[1], elev[719] = 2, 4, 6
    assert horizon_at(elev, [0.25, 359.75, 360.0]) == pytest.approx([3, 4, 2])
    assert longest_run(np.array([1, 1, 0, 1, 1, 1, 0], dtype=bool)) == 3
    assert longest_run(np.zeros(4, dtype=bool)) == 0


@pytest.mark.skipif(not LDEM_LABEL.with_suffix(".img").exists(), reason="LOLA DEM not downloaded (make download)")
def test_real_dem_and_site_horizon():
    dem = Dem.from_label()
    assert dem.h.shape == (7624, 7624)
    assert -8000 < dem.h.min() and dem.h.max() < 8000
    assert dem.height_at(-89.67, 129.2) < -2000   # Shackleton crater floor: fixes the axis orientation
    assert dem.height_at(-88.1, 44.9) < -3000     # Shoemaker crater floor
    elev, surface = horizon(dem, -85.9425, -0.94365)  # mma01, Malapert Massif
    assert 4000 < surface < 5500
    assert elev.min() > -5 and elev.max() < 15


def test_series_and_metrics_known_answer():
    from engine.visibility import metrics, series
    # At 85 S, 0 E the +X direction is 5 deg up, due north; a 6 deg wall to the north hides it, 4 deg does not.
    hz = {"lat": -85.0, "lon": 0.0, "surface_elev_m": 0.0, "observer_h_m": 0.0, "az_step_deg": 0.5,
          "elev_deg": [4.0] * 720}
    sun = np.array([[1.0, 0, 0], [1.0, 0, 0], [-1.0, 0, 0], [-1.0, 0, 0]])
    earth = np.array([[384400.0, 0, 0]] * 4)
    s = series(hz, sun, earth)
    assert s["sunEl"][:2] == pytest.approx(5.0) and s["sunMargin"][:2] == pytest.approx(1.0)
    assert s["earthEl"][0] == pytest.approx(5.0 - 0.258, abs=0.002)  # Earth sits lower by the parallax
    m = metrics(s, step_h=6.0)
    assert m["sunPct"] == 50.0 and m["earthPct"] == 100.0 and m["bothPct"] == 50.0
    assert m["longestDarkH"] == 12.0 and m["longestNoEarthH"] == 0.0
    hz["elev_deg"] = [6.0] * 720
    assert metrics(series(hz, sun, earth))["sunPct"] == 0.0
