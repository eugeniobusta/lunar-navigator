"""engine/topo.py: known answers, Skyfield's own topocentric alt/az, and the exported fixture."""
import json
from pathlib import Path

import numpy as np
import pytest

from engine import ephem, topo

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "topo_reference.json"
EPHEMERIS = ROOT / "web" / "public" / "data" / "ephemeris.json"
SITES = {"mma01": (-85.9425, -0.94365), "hw02": (-86.8076, -21.7194), "apollo11": (0.6741, 23.4730)}


def test_known_directions():
    el, az = topo.altaz_of(0, 0, [[1, 0, 0], [0, 0, 1], [0, 1, 0]])
    assert el == pytest.approx([90, 0, 0], abs=1e-9)
    assert az[1:] == pytest.approx([0, 90], abs=1e-9)
    el, az = topo.altaz_of(-85, 0, [1, 0, 0])  # at 85 S the +X direction is 5 deg up, due north
    assert el == pytest.approx(5, abs=1e-9) and az == pytest.approx(0, abs=1e-9)


def test_earth_parallax():
    # Earth 384400 km away on +X: at zenith from (0, 0); from (0, 90 E) it sits below the horizon by
    # the parallax asin(1737.4 / 384400) = 0.2590 deg, while the Sun direction stays exactly on the horizon.
    sun_el, _, earth_el, earth_az = topo.altaz(0, 90, 1737.4, [1, 0, 0], [384400.0, 0, 0])
    assert sun_el == pytest.approx(0, abs=1e-9)
    assert earth_el == pytest.approx(-np.degrees(np.arctan(1737.4 / 384400)), abs=1e-9)
    assert earth_az == pytest.approx(270, abs=1e-9)
    assert topo.altaz(0, 0, 1737.4, [1, 0, 0], [384400.0, 0, 0])[2] == pytest.approx(90, abs=1e-6)


def _angle_diff(a, b):
    return np.abs((np.asarray(a) - np.asarray(b) + 180.0) % 360.0 - 180.0)


@pytest.mark.skipif(not ephem.kernels_present(), reason="kernels not downloaded (make download)")
def test_matches_skyfield_topocentric():
    ts, eph, pc, frame = ephem.load_kernels()
    t = ts.utc(2026, 11, 1, np.linspace(0, 27767, 10).round())
    sun_dir, _, earth_km = ephem.moon_me_vectors(eph, frame, t)
    worst = 0.0
    for sid, (lat, lon) in SITES.items():
        site = eph["moon"] + pc.build_latlon_degrees(frame, lat, lon)
        se, sa, ee, ea = topo.altaz(lat, lon, topo.MOON_R_KM, sun_dir, earth_km)
        for body, el, az in (("sun", se, sa), ("earth", ee, ea)):
            ref_alt, ref_az, _ = site.at(t).observe(eph[body]).apparent().altaz()
            d_el = np.abs(el - ref_alt.degrees).max()
            # Azimuth error as an angle on the sky (scaled by cos(el)); raw azimuth is ill-defined at the zenith.
            d_az = (_angle_diff(az, ref_az.degrees) * np.cos(np.radians(el))).max()
            print(f"{sid} {body}: max |d el| = {d_el:.5f} deg, max |d az| cos(el) = {d_az:.5f} deg, "
                  f"raw max |d az| = {_angle_diff(az, ref_az.degrees).max():.5f} deg")
            worst = max(worst, d_el, _angle_diff(az, ref_az.degrees).max())
    print(f"max error vs Skyfield topocentric: {worst:.5f} deg")
    assert worst < 0.01


@pytest.mark.skipif(not (FIXTURE.exists() and EPHEMERIS.exists()), reason="run scripts/build_ephemeris.py")
def test_fixture_matches_committed_ephemeris():
    """The rounded ephemeris.json reproduces the reference fixture (this one runs in CI, no kernels needed)."""
    eph = json.loads(EPHEMERIS.read_text())
    assert eph["n"] == 27768 and len(eph["sun_dir"]) == 3 * eph["n"] == len(eph["earth_km"])
    assert len(eph["sun_semidiam_deg"]) == eph["n"]
    sun = np.array(eph["sun_dir"]).reshape(-1, 3)
    earth = np.array(eph["earth_km"]).reshape(-1, 3)
    assert np.abs(np.linalg.norm(sun, axis=1) - 1).max() < 2e-6
    fx = json.loads(FIXTURE.read_text())
    for r in fx["rows"]:
        i = r["index"]
        se, sa, ee, ea = topo.altaz(r["lat"], r["lon"], fx["height_km"], sun[i], earth[i])
        assert abs(se - r["sunEl"]) < 1e-3 and abs(ee - r["earthEl"]) < 1e-3
        assert _angle_diff(sa, r["sunAz"]) < 1e-2 and _angle_diff(ea, r["earthAz"]) < 1e-2
