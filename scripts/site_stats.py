"""Prints % sunlit, % Earth visible and longest darkness per site from web/public/data (the files the app loads).

Run: uv run python scripts/site_stats.py [--year 2027] [--group artemis]
"""
import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import visibility

DATA = ROOT / "web" / "public" / "data"


def grid_metrics(grid, sun, earth, step_h=1.0):
    """visibility.metrics for each of the grid's points (each has its own lat/lon, height and horizon)."""
    common = {"observer_h_m": grid["observer_h_m"], "az_step_deg": grid["az_step_deg"]}
    return [visibility.metrics(visibility.series({**common, **p}, sun, earth), step_h) for p in grid["points"]]


def grid_table(sun, earth, step_h):
    print("| Site | Points | % sunlit min | centre | max | % Earth min | max | Longest darkness min-max (h) |")
    print("|------|-------:|-------------:|-------:|----:|------------:|----:|------------------------------|")
    for s in json.loads((DATA / "sites.json").read_text())["sites"]:
        if not s["has_grid"]:
            continue
        grid = json.loads((DATA / "horizons" / f"{s['id']}_grid.json").read_text())
        ms = grid_metrics(grid, sun, earth, step_h)
        centre = next(m for m, p in zip(ms, grid["points"], strict=True) if p["dx_m"] == 0 and p["dy_m"] == 0)
        sun_pct = [m["sunPct"] for m in ms]
        earth_pct = [m["earthPct"] for m in ms]
        dark = [m["longestDarkH"] for m in ms]
        print(f"| {s['id']} | {len(ms)} | {min(sun_pct):.1f} | {centre['sunPct']:.1f} | {max(sun_pct):.1f} | "
              f"{min(earth_pct):.1f} | {max(earth_pct):.1f} | {min(dark):.0f}-{max(dark):.0f} |")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2027)
    ap.add_argument("--group", default="artemis", help="artemis | mission | historic | all")
    ap.add_argument("--grids", action="store_true", help="min/max across each site's 9x9 'move the lander' grid")
    args = ap.parse_args()

    eph = json.loads((DATA / "ephemeris.json").read_text())
    start = datetime.fromisoformat(eph["start_utc"])
    step_h = eph["step_s"] / 3600
    i0 = round((datetime(args.year, 1, 1, tzinfo=UTC) - start).total_seconds() / eph["step_s"])
    i1 = round((datetime(args.year + 1, 1, 1, tzinfo=UTC) - start).total_seconds() / eph["step_s"])
    assert 0 <= i0 < i1 <= eph["n"], "year outside the ephemeris"
    sun = np.array(eph["sun_dir"]).reshape(-1, 3)[i0:i1]
    earth = np.array(eph["earth_km"]).reshape(-1, 3)[i0:i1]

    print(f"{args.year}, hourly, {i1 - i0} samples; disc CENTRE above the terrain horizon")
    if args.grids:
        grid_table(sun, earth, step_h)
        return
    print("| Site | Name | % sunlit | % Earth visible | Longest darkness (h) | Max Sun el (deg) |")
    print("|------|------|---------:|----------------:|---------------------:|-----------------:|")
    for s in json.loads((DATA / "sites.json").read_text())["sites"]:
        if args.group != "all" and s["group"] != args.group:
            continue
        hz = json.loads((DATA / "horizons" / f"{s['id']}.json").read_text())
        m = visibility.metrics(visibility.series(hz, sun, earth), step_h)
        print(f"| {s['id']} | {s['name']} | {m['sunPct']:.1f} | {m['earthPct']:.1f} | "
              f"{m['longestDarkH']:.0f} | {m['maxSunEl']:.2f} |")


if __name__ == "__main__":
    main()
