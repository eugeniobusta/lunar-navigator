"""Fetches JPL Horizons observer tables (apparent az/el of the Sun and Earth from lunar sites) into
tests/fixtures/horizons/, and reports how engine/topo.py + web/public/data/ephemeris.json compare.

Run: uv run python scripts/fetch_horizons_fixtures.py          (fetch what is missing, then report)
     uv run python scripts/fetch_horizons_fixtures.py --report (no network)
Cached files are never re-fetched; requests are spaced 1 s apart.
"""
import json
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import topo

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = ROOT / "tests" / "fixtures" / "horizons"
EPHEMERIS = ROOT / "web" / "public" / "data" / "ephemeris.json"
SITES = {"mma01": (-85.9425, -0.94365), "hw02": (-86.8076, -21.7194), "apollo11": (0.6741, 23.4730)}
BODIES = {"sun": "10", "earth": "399"}
ALT_KM = 0.0
# 20 whole-hour times across 2027-2028 (every 36 d 13 h, so the hour of day and lunar phase both vary).
TIMES = [datetime(2027, 1, 1, tzinfo=UTC) + k * timedelta(days=36, hours=13) for k in range(20)]


def fixture_path(site, body):
    return OUT / f"{site}_{body}.txt"


def fetch(site, body, tries=6):
    lat, lon = SITES[site]
    params = {
        "format": "text", "COMMAND": f"'{BODIES[body]}'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER", "CENTER": "'coord@301'", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{lon},{lat},{ALT_KM}'", "QUANTITIES": "'4'", "CSV_FORMAT": "YES",
        "TLIST": ",".join(f"'{t:%Y-%m-%d %H:%M}'" for t in TIMES),
    }
    for attempt in range(tries):
        try:
            r = requests.get(API, params=params, timeout=60)
            if r.status_code == 200 and "$$SOE" in r.text:
                return r.text
            err = f"HTTP {r.status_code}"
        except requests.RequestException as e:
            err = str(e)
        print(f"  retry {attempt + 1}/{tries} {site} {body}: {err}")
        time.sleep(1 + 2 * attempt)  # slow down if Horizons refuses or rate-limits
    return None


def parse_response(text):
    """[(utc datetime, az_deg, el_deg)] from a Horizons CSV observer table with QUANTITIES='4'."""
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in body.strip().splitlines():
        f = [x.strip() for x in line.split(",")]
        t = datetime.strptime(f[0], "%Y-%b-%d %H:%M:%S.%f").replace(tzinfo=UTC)
        rows.append((t, float(f[3]), float(f[4])))
    return rows


def angle_diff(a, b):
    return np.abs((np.asarray(a) - np.asarray(b) + 180.0) % 360.0 - 180.0)


def compare():
    """{site: {body: (max |d el|, max |d az|, max |d az| * cos(el))}} for every cached fixture, degrees."""
    eph = json.loads(EPHEMERIS.read_text())
    start = datetime.fromisoformat(eph["start_utc"])
    sun = np.array(eph["sun_dir"]).reshape(-1, 3)
    earth = np.array(eph["earth_km"]).reshape(-1, 3)
    out = {}
    for site, (lat, lon) in SITES.items():
        for body in BODIES:
            path = fixture_path(site, body)
            if not path.exists():
                continue
            rows = parse_response(path.read_text())
            idx = [round((t - start).total_seconds() / eph["step_s"]) for t, _, _ in rows]
            se, sa, ee, ea = topo.altaz(lat, lon, topo.MOON_R_KM + ALT_KM, sun[idx], earth[idx])
            el, az = (se, sa) if body == "sun" else (ee, ea)
            d_el = np.abs(el - np.array([r[2] for r in rows]))
            d_az = angle_diff(az, [r[1] for r in rows])
            out.setdefault(site, {})[body] = (len(rows), float(d_el.max()), float(d_az.max()),
                                              float((d_az * np.cos(np.radians(el))).max()))
    return out


def main():
    if "--report" not in sys.argv:
        OUT.mkdir(parents=True, exist_ok=True)
        for site in SITES:
            for body in BODIES:
                path = fixture_path(site, body)
                if path.exists():
                    print(f"cached  {path.name}")
                    continue
                text = fetch(site, body)
                if text is None:
                    print(f"FAILED  {path.name} (Horizons unreachable; re-run later)")
                else:
                    path.write_text(text)
                    print(f"fetched {path.name} ({len(text)} bytes)")
                time.sleep(1)
    print("\n| Site | Times | Max abs error Sun alt / az (deg) | Max abs error Earth alt / az (deg) |")
    print("|------|-------|----------------------------------|------------------------------------|")
    for site, res in compare().items():
        cells = [f"{res[b][1]:.4f} / {res[b][2]:.4f}" if b in res else "not fetched" for b in BODIES]
        n = max(r[0] for r in res.values())
        print(f"| {site} | {n} | {cells[0]} | {cells[1]} |")
    print("\nAzimuth error as an angle on the sky (x cos el), max over sites:",
          {b: round(max(r[b][3] for r in compare().values() if b in r), 4) for b in BODIES})


if __name__ == "__main__":
    main()
