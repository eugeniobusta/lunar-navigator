"""Sun and Earth vectors from the Moon's centre in MOON_ME_DE421 (docs/INTERFACES.md section 2). Owner: Kien."""
from pathlib import Path

import numpy as np
from skyfield.api import Loader, PlanetaryConstants

KERNELS = Path(__file__).resolve().parents[1] / "data" / "kernels"
SOURCE = "Skyfield, de421.bsp, moon_pa_de421_1900-2050.bpc, moon_080317.tf, pck00008.tpc; apparent positions"
SUN_R_KM = 695700.0  # IAU 2015 nominal solar radius


def kernels_present(kernels=KERNELS):
    names = ["de421.bsp", "moon_pa_de421_1900-2050.bpc", "moon_080317.tf", "pck00008.tpc"]
    return all((Path(kernels) / k).exists() for k in names)


def load_kernels(kernels=KERNELS):
    """Returns (timescale, ephemeris, planetary constants, MOON_ME_DE421 frame)."""
    load = Loader(str(kernels), verbose=False)
    ts = load.timescale(builtin=True)
    eph = load("de421.bsp")
    pc = PlanetaryConstants()
    pc.read_text(load("moon_080317.tf"))
    pc.read_text(load("pck00008.tpc"))
    pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
    return ts, eph, pc, pc.build_frame_named("MOON_ME_DE421")


def hourly_times(ts, start, n, step_s=3600):
    """n Skyfield times from start = (year, month, day), every step_s seconds, UTC."""
    y, m, d = start
    return ts.utc(y, m, d, 0, 0, np.arange(n) * float(step_s))


def moon_me_vectors(eph, frame, t):
    """Apparent Sun and Earth as seen from the Moon's centre, rotated into MOON_ME.

    Returns sun_dir (n, 3) unit vectors, sun_semidiam_deg (n,), earth_km (n, 3).
    """
    moon = eph["moon"]
    rot = frame.rotation_at(t)  # (3, 3, n): ICRF -> MOON_ME
    at = moon.at(t)
    sun = np.einsum("ijn,jn->ni", rot, at.observe(eph["sun"]).apparent().position.km)
    earth = np.einsum("ijn,jn->ni", rot, at.observe(eph["earth"]).apparent().position.km)
    dist = np.linalg.norm(sun, axis=1)
    return sun / dist[:, None], np.degrees(np.arcsin(SUN_R_KM / dist)), earth
