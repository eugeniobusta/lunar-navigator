"""Writes small MOCK data files to web/src/mocks/ with the exact shapes in docs/INTERFACES.md.

The numbers are made up but plausible. They exist so the web app can be built before the real
pipeline (make data) produces web/public/data/. Every file has "mock": true.
Run: uv run python scripts/make_mocks.py
"""
import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "web" / "src" / "mocks"
N = 24 * 60  # hourly samples (60 days, enough to exercise every screen)
SYNODIC_H = 29.530589 * 24


def ephemeris():
    sun, semi, earth = [], [], []
    for i in range(N):
        # Sub-solar longitude drifts west ~12.2 deg/day; latitude wobbles within +-1.5 deg.
        lon = math.radians(40.0 - 360.0 * i / SYNODIC_H)
        lat = math.radians(1.5 * math.sin(2 * math.pi * i / SYNODIC_H))
        sun += [round(math.cos(lat) * math.cos(lon), 6), round(math.cos(lat) * math.sin(lon), 6),
                round(math.sin(lat), 6)]
        semi.append(0.2666)
        # Earth sits near +X in MOON_ME, ~384400 km away, with a few degrees of libration.
        el = math.radians(-5.0 + 0.1 * i / N)
        az = math.radians(3.0 * math.sin(2 * math.pi * i / (27.3 * 24)))
        d = 384400.0
        earth += [round(d * math.cos(el) * math.cos(az), 1), round(d * math.cos(el) * math.sin(az), 1),
                  round(d * math.sin(el), 1)]
    return {"version": 1, "mock": True, "frame": "MOON_ME_DE421", "source": "MOCK (scripts/make_mocks.py)",
            "start_utc": "2026-11-01T00:00:00Z", "step_s": 3600, "n": N,
            "sun_dir": sun, "sun_semidiam_deg": semi, "earth_km": earth}


def horizon():
    elev = [round(1.0 + 1.5 * math.sin(math.radians(i * 0.5) * 3) + 0.8 * math.cos(math.radians(i * 0.5) * 7), 3)
            for i in range(720)]
    return {"version": 1, "mock": True, "site_id": "mma01", "lat": -85.9425, "lon": -0.94365,
            "surface_elev_m": 4800.0, "observer_h_m": 2.0, "az_step_deg": 0.5, "elev_deg": elev,
            "dem": "LDEM_75S_120M", "max_range_km": 150}


def sites():
    def s(i, n, g, la, lo, t):
        return {"id": i, "name": n, "group": g, "lat": la, "lon": lo, "terrain": t, "has_grid": False,
                "note": "MOCK", "source": "MOCK", "coords_quality": "published"}
    return {"version": 1, "mock": True, "sites": [
        s("mma01", "Malapert Massif", "artemis", -85.9425, -0.94365, "dem"),
        s("hw02", "Haworth", "artemis", -86.8076, -21.7194, "dem"),
        s("apollo11", "Apollo 11", "historic", 0.6741, 23.4730, "flat")]}


if __name__ == "__main__":
    (OUT / "horizons").mkdir(parents=True, exist_ok=True)
    (OUT / "ephemeris.json").write_text(json.dumps(ephemeris()))
    (OUT / "horizons" / "mma01.json").write_text(json.dumps(horizon()))
    (OUT / "sites.json").write_text(json.dumps(sites(), indent=2))
    print("wrote mocks to", OUT)
