"""Writes web/public/data/stars.json for the VR view (docs/INTERFACES.md section 11).

The bright stars of the Yale Bright Star Catalogue as ICRF unit vectors, and the Moon's orientation
(ICRF -> MOON_ME_DE421, from the same kernels as the ephemeris) every 6 hours as quaternions, so the browser can
put each star where it really is in the lunar sky at any time.
Needs make download. Run: uv run python scripts/export_stars.py
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import ephem

CATALOGUE = ROOT / "data" / "bsc5-short.json"
OUT = ROOT / "web" / "public" / "data" / "stars.json"
MAG_LIMIT = 3.5
START = (2026, 11, 1)
STEP_S = 21600
N = 27768 // 6 + 1  # covers the hourly ephemeris to 2029-12-31T23:00Z
SOURCE = ("Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), J2000 positions, via "
          "https://github.com/brettonw/YaleBrightStarCatalog; Moon orientation: Skyfield, moon_pa_de421_1900-2050.bpc")


def sexagesimal(text):
    """'06h 45m 08.9s' or '-16° 42′ 58″' as a signed decimal number in the leading unit."""
    a, b, c = (float(x) for x in re.findall(r"\d+(?:\.\d+)?", text)[:3])
    return (-1 if text.strip().startswith("-") else 1) * (a + b / 60 + c / 3600)


def star_vectors(catalogue=CATALOGUE, mag_limit=MAG_LIMIT):
    """[(x, y, z, V magnitude, name)] for stars brighter than mag_limit, ICRF unit vectors, brightest first."""
    out = []
    for s in json.loads(Path(catalogue).read_text()):
        if "RA" not in s or "V" not in s or float(s["V"]) > mag_limit:
            continue
        ra, dec = np.radians(sexagesimal(s["RA"]) * 15), np.radians(sexagesimal(s["Dec"]))
        out.append((np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec), float(s["V"]), s.get("N", "")))
    return sorted(out, key=lambda r: r[3])


def quaternion(m):
    """Unit quaternion (x, y, z, w) of a proper rotation matrix, w >= 0."""
    w = np.sqrt(max(0.0, 1 + m[0, 0] + m[1, 1] + m[2, 2])) / 2
    x = np.sqrt(max(0.0, 1 + m[0, 0] - m[1, 1] - m[2, 2])) / 2
    y = np.sqrt(max(0.0, 1 - m[0, 0] + m[1, 1] - m[2, 2])) / 2
    z = np.sqrt(max(0.0, 1 - m[0, 0] - m[1, 1] + m[2, 2])) / 2
    x, y, z = np.copysign(x, m[2, 1] - m[1, 2]), np.copysign(y, m[0, 2] - m[2, 0]), np.copysign(z, m[1, 0] - m[0, 1])
    return np.array([x, y, z, w])


def main():
    stars = star_vectors()
    ts, _, _, frame = ephem.load_kernels()
    t = ephem.hourly_times(ts, START, N, STEP_S)
    rot = frame.rotation_at(t)  # (3, 3, n): ICRF -> MOON_ME
    q = np.array([quaternion(rot[:, :, i]) for i in range(N)])
    for i in range(1, N):  # keep neighbours in the same hemisphere so interpolation takes the short way
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]
    doc = {"version": 1, "source": SOURCE, "mag_limit": MAG_LIMIT, "n_stars": len(stars),
           "stars": [round(float(v), 5) if k < 3 else round(float(v), 2) for s in stars for k, v in enumerate(s[:4])],
           "names": {str(i): s[4] for i, s in enumerate(stars) if s[4]},
           "frame": "ICRF to MOON_ME_DE421", "start_utc": "2026-11-01T00:00:00Z", "step_s": STEP_S, "n": N,
           "quat_xyzw": [round(float(v), 6) for v in q.ravel()]}
    OUT.write_text(json.dumps(doc, separators=(",", ":")))
    print(f"stars.json: {len(stars)} stars to V = {MAG_LIMIT}, brightest {stars[0][4]} ({stars[0][3]}), "
          f"{N} orientations, {OUT.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
