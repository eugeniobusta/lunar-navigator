"""Writes web/public/data/ephemeris.json (docs/INTERFACES.md section 2) and tests/fixtures/topo_reference.json.

Needs the kernels in data/kernels/ (make download). Run: uv run python scripts/build_ephemeris.py
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import ephem, topo  # noqa: E402

OUT = ROOT / "web" / "public" / "data" / "ephemeris.json"
FIXTURE = ROOT / "tests" / "fixtures" / "topo_reference.json"
SITES = ROOT / "web" / "public" / "data" / "sites.json"
START = (2026, 11, 1)
STEP_S = 3600
N = 27768  # hourly to 2029-12-31T23:00Z
FIXTURE_SITES = ["mma01", "hw02", "apollo11"]
FIXTURE_TIMES = 20


def fixture_indices(n=N, k=FIXTURE_TIMES):
    return [int(i) for i in np.linspace(0, n - 1, k).round()]


def main():
    ts, eph, _, frame = ephem.load_kernels()
    t = ephem.hourly_times(ts, START, N, STEP_S)
    assert t[0].utc_iso() == "2026-11-01T00:00:00Z" and t[-1].utc_iso() == "2029-12-31T23:00:00Z"
    sun_dir, semi, earth_km = ephem.moon_me_vectors(eph, frame, t)

    doc = {
        "version": 1, "frame": "MOON_ME_DE421", "source": ephem.SOURCE,
        "start_utc": "2026-11-01T00:00:00Z", "step_s": STEP_S, "n": N,
        "sun_dir": [round(float(x), 6) for x in sun_dir.ravel()],
        "sun_semidiam_deg": [round(float(x), 4) for x in semi],
        "earth_km": [round(float(x), 1) for x in earth_km.ravel()],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, separators=(",", ":")))
    size = OUT.stat().st_size
    print(f"wrote {OUT.relative_to(ROOT)}: n={N}, {size / 1e6:.2f} MB")
    assert size < 3e6, "ephemeris.json must stay under 3 MB"

    # Reference alt/az from the unrounded vectors, observer on the 1737.4 km sphere (no terrain height).
    sites = {s["id"]: s for s in json.loads(SITES.read_text())["sites"]}
    idx = fixture_indices()
    rows = []
    for sid in FIXTURE_SITES:
        lat, lon = sites[sid]["lat"], sites[sid]["lon"]
        se, sa, ee, ea = topo.altaz(lat, lon, topo.MOON_R_KM, sun_dir[idx], earth_km[idx])
        for k, i in enumerate(idx):
            rows.append({"site": sid, "lat": lat, "lon": lon, "index": i,
                         "sunEl": round(float(se[k]), 6), "sunAz": round(float(sa[k]), 6),
                         "earthEl": round(float(ee[k]), 6), "earthAz": round(float(ea[k]), 6)})
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps({
        "note": "engine/topo.py alt/az (deg) at ephemeris sample `index`, observer height 0 m on the "
                "1737.4 km sphere, flat horizon. Written by scripts/build_ephemeris.py.",
        "height_km": topo.MOON_R_KM, "rows": rows}, indent=1))
    print(f"wrote {FIXTURE.relative_to(ROOT)}: {len(rows)} rows")


if __name__ == "__main__":
    main()
