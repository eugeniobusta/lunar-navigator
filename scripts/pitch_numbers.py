"""Writes docs/PITCH_NUMBERS.md: the numbers said on stage, computed only from web/public/data (what the app loads).

Run: uv run python scripts/pitch_numbers.py
"""
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from site_stats import grid_metrics

from engine import visibility

DATA = ROOT / "web" / "public" / "data"
OUT = ROOT / "docs" / "PITCH_NUMBERS.md"
TODAY = datetime(2026, 11, 14, tzinfo=UTC)  # hackathon Saturday; "the next 12 months" starts here
SLIP_SITE, SLIP_STAY_H, SLIPS_D = "nr107", 240, (0, 3, 7, 14)
MISSION = {"site": "mma01", "duration_h": 336, "min_sun": 70.0, "min_earth": 50.0, "max_dark_h": 48}


class Data:
    def __init__(self):
        eph = json.loads((DATA / "ephemeris.json").read_text())
        assert eph["step_s"] == 3600
        self.start = datetime.fromisoformat(eph["start_utc"])
        self.sun = np.array(eph["sun_dir"]).reshape(-1, 3)
        self.earth = np.array(eph["earth_km"]).reshape(-1, 3)
        self.sites = {s["id"]: s for s in json.loads((DATA / "sites.json").read_text())["sites"]}

    def idx(self, t):
        return round((t - self.start).total_seconds() / 3600)

    def time(self, i):
        return self.start + timedelta(hours=int(i))

    def horizon(self, sid):
        return json.loads((DATA / "horizons" / f"{sid}.json").read_text())

    def series(self, sid, i0, i1):
        return visibility.series(self.horizon(sid), self.sun[i0:i1], self.earth[i0:i1])


def max_sun_elevation(d, out):
    i0, i1 = d.idx(datetime(2027, 1, 1, tzinfo=UTC)), d.idx(datetime(2028, 1, 1, tzinfo=UTC))
    out += ["## 1. Highest the Sun gets in 2027", "",
            "| Site | Latitude | Max Sun elevation (deg) | When (UTC) |", "|------|---------:|------------------------:|------------|"]
    for sid in ("mma01", "hw02", "dgr203", "apollo11"):
        el = d.series(sid, i0, i1)["sunEl"]
        k = int(el.argmax())
        out.append(f"| {d.sites[sid]['name']} ({sid}) | {d.sites[sid]['lat']:.2f} | {el[k]:.2f} | {d.time(i0 + k):%Y-%m-%d %H:%M} |")
    out.append("")


def launch_slip(d, out):
    i0, i1 = d.idx(datetime(2027, 1, 1, tzinfo=UTC)), d.idx(datetime(2028, 1, 1, tzinfo=UTC))
    s = d.series(SLIP_SITE, i0, i1 + SLIP_STAY_H + 24 * max(SLIPS_D))
    lit, earth = s["sunMargin"] > 0, s["earthMargin"] > 0
    sun_pct, earth_pct, longest = visibility.window_stats(lit, earth, SLIP_STAY_H)
    # Reference landing: the 2027 landing hour with the most sunlight over the stay; ties -> most Earth, then earliest.
    n = i1 - i0
    ref = int(np.lexsort((np.arange(n), -earth_pct[:n], -sun_pct[:n]))[0])
    out += [f"## 2. A launch slip at {d.sites[SLIP_SITE]['name']} ({SLIP_SITE}), {SLIP_STAY_H // 24}-day stay", "",
            (f"Reference landing {d.time(i0 + ref):%Y-%m-%d %H:%M} UTC: the landing hour in 2027 with the most sunlight over "
            f"the stay (ties: most Earth visibility, then earliest)."), "",
            "| Slip (days) | Landing (UTC) | % sunlit | % Earth visible | Longest darkness (h) |",
            "|------------:|---------------|---------:|----------------:|---------------------:|"]
    for slip in SLIPS_D:
        j = ref + 24 * slip
        out.append(f"| {slip} | {d.time(i0 + j):%Y-%m-%d %H:%M} | {sun_pct[j]:.1f} | {earth_pct[j]:.1f} | {longest[j]} |")
    out.append("")


def move_the_lander(d, out):
    i0, i1 = d.idx(datetime(2027, 1, 1, tzinfo=UTC)), d.idx(datetime(2028, 1, 1, tzinfo=UTC))
    grid = json.loads((DATA / "horizons" / "mma01_grid.json").read_text())
    ms = grid_metrics(grid, d.sun[i0:i1], d.earth[i0:i1])
    out += ["## 3. Moving the lander near Malapert Massif (mma01), 2027", "",
            "| Points | How many | % sunlit min | at the site | max | Distance of best point (m) |",
            "|--------|---------:|-------------:|------------:|----:|---------------------------:|"]
    centre = next(m for m, p in zip(ms, grid["points"], strict=True) if p["dx_m"] == 0 and p["dy_m"] == 0)
    for label, keep in (("within 2 km of the site", lambda r: r <= 2000.0), ("whole 9x9 grid (4 x 4 km)", lambda r: True)):
        sel = [(m["sunPct"], float(np.hypot(p["dx_m"], p["dy_m"]))) for m, p in zip(ms, grid["points"], strict=True)
               if keep(np.hypot(p["dx_m"], p["dy_m"]))]
        best = max(sel)
        out.append(f"| {label} | {len(sel)} | {min(sel)[0]:.1f} | {centre['sunPct']:.1f} | {best[0]:.1f} | {best[1]:.0f} |")
    out.append("")


def landing_days(d, out):
    m = MISSION
    i0, i1 = d.idx(TODAY), d.idx(TODAY.replace(year=TODAY.year + 1))
    s = d.series(m["site"], i0, i1 + m["duration_h"])
    lit, earth = s["sunMargin"] > 0, s["earthMargin"] > 0
    ok = visibility.feasible_starts(lit, earth, m["duration_h"], m["min_sun"], m["min_earth"], m["max_dark_h"], True)[:i1 - i0]
    days = ok.reshape(-1, 24).any(axis=1)  # a day works if any landing hour that UTC day works
    runs, k = [], 0
    while k < days.size:
        if days[k]:
            j = k
            while j + 1 < days.size and days[j + 1]:
                j += 1
            runs.append((k, j))
            k = j + 1
        else:
            k += 1
    day = lambda n: (TODAY + timedelta(days=int(n))).strftime("%Y-%m-%d")
    out += [f"## 4. When can a {m['duration_h'] // 24}-day mission land at {d.sites[m['site']]['name']} ({m['site']})?", "",
            (f"Mission: {m['duration_h']} h on the surface, at least {m['min_sun']:.0f} % sunlit, at least {m['min_earth']:.0f} % "
            f"Earth visible, no darkness longer than {m['max_dark_h']} h, Sun and Earth both up at touchdown. "
            f"Same rule as the app's Window Finder; a day counts if any landing hour that UTC day works."), "",
            f"- Period searched: {day(0)} to {day(days.size - 1)} ({days.size} days).",
            f"- **Days that work: {int(days.sum())} of {days.size}** ({ok.sum()} landing hours), in {len(runs)} clusters.",
            (f"- Longest cluster: {max(b - a + 1 for a, b in runs)} days. Longest gap between clusters: "
            f"{max(runs[i + 1][0] - runs[i][1] - 1 for i in range(len(runs) - 1))} days."), "",
            "| Cluster | First day | Last day | Days |", "|--------:|-----------|----------|-----:|"]
    for n, (a, b) in enumerate(runs[:3], 1):
        out.append(f"| {n} | {day(a)} | {day(b)} | {b - a + 1} |")
    out.append("")


def goldilocks(d, out):
    import csv
    summary = json.loads((DATA / "suitability" / "summary.json").read_text())
    zones = list(csv.DictReader((DATA / "suitability" / "zones.csv").open()))
    f = summary["fail_pct_of_region"]
    out += ["## 5. Where to land: NASA's Artemis III limits on every 120 m square within 6 deg of the pole", "",
            (f"- Ground tested: {summary['region_km2']:,} km2. **Passing every hard limit: {summary['pass_km2']:,} km2, "
            f"{summary['pass_pct_of_region']} %.**"),
            (f"- Share of the ground failing each limit (they overlap): sunlight {f['sunlight']} %, Earth in view {f['earth']} %, "
            f"landing slope {f['landing_slope']} %, walkable ground {f['eva_slope']} %."),
            (f"- **{summary['zones']:,} Goldilocks zones**; {summary['zones_1km2_or_more']} are 1 km2 or larger; our model confirms "
            f"a 6.5-day window with Sun and Earth for {summary['zones_stay_window_ok']:,}."),
            (f"- Artemis check: {summary['artemis_points_passing']} of the 9 candidate points pass every limit; "
            f"{summary['artemis_regions_with_a_zone']} of the 9 have a passing zone within {summary['artemis_near_km']} km; "
            f"{summary['top20_near_artemis']} of our top 20 zones is near one. Ground near the points is "
            f"{summary['region_pct_near_artemis']} % of the area and {summary['pass_pct_near_artemis']} % of the passing ground."),
            (f"- Radio delay Moon to Earth: {summary['signal_delay_s']['min']:.2f} to {summary['signal_delay_s']['max']:.2f} s one way, "
            "the same from every site."), "",
            ("| Rank | Lat | Lon (E) | Score | Area (km2) | Sunlight % | Earth % | Slope (deg) | Longest darkness (days) | "
            "Nearest Artemis region (km) |"),
            ("|-----:|----:|--------:|------:|-----------:|-----------:|--------:|------------:|------------------------:|"
            "-----------------------------|")]
    for z in zones[:5]:
        out.append(f"| {z['rank']} | {float(z['lat']):.2f} | {float(z['lon']):.2f} | {z['score']} | {float(z['area_km2']):.1f} | "
                   f"{float(z['sun_pct']):.0f} | {float(z['earth_pct']):.0f} | {z['landing_slope_deg']} | "
                   f"{float(z['longest_dark_h']) / 24:.1f} | {z['nearest_artemis_region']} ({z['nearest_artemis_km']}) |")
    out += ["", "Thresholds and sources: docs/criteria.csv. Method: docs/criteria.md.", ""]


def main():
    d = Data()
    out = ["# Pitch numbers (generated by scripts/pitch_numbers.py; do not edit by hand)", "",
           ("Every number comes from web/public/data, the same files the app loads: hourly samples, the centre of the "
           "Sun or Earth above the terrain horizon, observer 2 m above the ground. Checks against JPL and NASA: docs/VALIDATION.md."), ""]
    max_sun_elevation(d, out)
    launch_slip(d, out)
    move_the_lander(d, out)
    landing_days(d, out)
    goldilocks(d, out)
    OUT.write_text("\n".join(out))
    print("\n".join(out))


if __name__ == "__main__":
    main()
