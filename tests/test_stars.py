"""web/public/data/stars.json against docs/INTERFACES.md section 11."""
import json
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
DOC = json.loads((ROOT / "web" / "public" / "data" / "stars.json").read_text())
EPH = json.loads((ROOT / "web" / "public" / "data" / "ephemeris.json").read_text())


def rotate(q, v):
    x, y, z, w = q
    u = np.array([x, y, z])
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def test_shape_and_units():
    s = np.array(DOC["stars"]).reshape(-1, 4)
    assert len(s) == DOC["n_stars"] == 287
    assert np.allclose(np.linalg.norm(s[:, :3], axis=1), 1, atol=2e-5)
    assert s[:, 3].max() <= DOC["mag_limit"] and np.all(np.diff(s[:, 3]) >= 0)
    q = np.array(DOC["quat_xyzw"]).reshape(-1, 4)
    assert len(q) == DOC["n"] == 4629 and np.allclose(np.linalg.norm(q, axis=1), 1, atol=1e-5)
    assert np.all(np.sum(q[1:] * q[:-1], axis=1) > 0.9)  # neighbours are close: 6 hours is about 3.3 deg of rotation
    assert DOC["start_utc"] == EPH["start_utc"] and DOC["step_s"] == 6 * EPH["step_s"]


def test_sirius_is_first_at_its_catalogue_position():
    x, y, z, v = DOC["stars"][:4]
    assert DOC["names"]["0"] == "Sirius" and v == -1.46
    ra, dec = np.degrees(np.arctan2(y, x)) % 360, np.degrees(np.arcsin(z))
    assert ra == pytest.approx(101.287, abs=0.01) and dec == pytest.approx(-16.716, abs=0.01)  # 06h45m08.9s, -16d42m58s


def test_sexagesimal_and_quaternion():
    from scripts.export_stars import quaternion, sexagesimal
    assert sexagesimal("06h 45m 08.9s") == pytest.approx(6.752472, abs=1e-6)
    assert sexagesimal("-16° 42′ 58″") == pytest.approx(-16.716111, abs=1e-6)
    a = np.radians(30)
    m = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])  # 30 deg about +z
    q = quaternion(m)
    assert q == pytest.approx([0, 0, np.sin(a / 2), np.cos(a / 2)])
    assert rotate(q, np.array([1.0, 0, 0])) == pytest.approx(m @ np.array([1.0, 0, 0]))


def test_moon_axis_points_near_the_ecliptic_pole():
    # The Moon's spin axis is tilted about 1.54 deg to the ecliptic pole: the lunar north pole (MOON_ME +z) in ICRF.
    q = np.array(DOC["quat_xyzw"][:4])
    inv = np.array([-q[0], -q[1], -q[2], q[3]])
    north = rotate(inv, np.array([0.0, 0, 1]))
    eps = np.radians(23.4393)
    ecliptic_pole = np.array([0, -np.sin(eps), np.cos(eps)])
    tilt = np.degrees(np.arccos(north @ ecliptic_pole))
    print(f"lunar pole to ecliptic pole: {tilt:.2f} deg")
    assert 1.3 < tilt < 1.8


def test_kernels_cross_check():
    kernels = ROOT / "data" / "kernels" / "de421.bsp"
    if not kernels.exists():
        pytest.skip("kernels not downloaded")
    from engine import ephem
    ts, eph, _, _ = ephem.load_kernels()
    i = 1000
    t = ephem.hourly_times(ts, (2026, 11, 1), DOC["n"], DOC["step_s"])[i]
    v = eph["moon"].at(t).observe(eph["sun"]).apparent().position.km
    got = rotate(np.array(DOC["quat_xyzw"][4 * i:4 * i + 4]), v / np.linalg.norm(v))
    want = np.array(EPH["sun_dir"][18 * i:18 * i + 3])
    assert np.degrees(np.arccos(np.clip(got @ want, -1, 1))) < 0.001
