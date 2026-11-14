"""Publishes the validation tables as CSV and an index of every file in web/public/data/.

- web/public/data/validation/jpl.csv   (docs/VALIDATION.md table 1; needs tests/fixtures/horizons/)
- web/public/data/validation/pgda.csv  (docs/VALIDATION.md table 4; needs make download)
- web/public/data/index.json           (path, bytes, format, description of every published file)
Run: uv run python scripts/export_open_data.py   (last step of make data)
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_horizons_fixtures as jpl
import validate_pgda as pgda

DATA = ROOT / "web" / "public" / "data"
VALIDATION = DATA / "validation"
FORMATS = {".json": "JSON", ".geojson": "GeoJSON", ".csv": "CSV", ".u16": "binary, little-endian uint16", ".u8": "binary, uint8"}


def write_csv(path, header, rows):
    with open(path, "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)


def export_jpl():
    names = {s["id"]: s["name"] for s in json.loads((DATA / "sites.json").read_text())["sites"]}
    rows = []
    for site, by_body in jpl.compare().items():
        lat, lon = jpl.SITES[site]
        for body, (n, d_el, d_az, d_az_sky) in by_body.items():
            rows.append([site, names[site], lat, lon, body, n, f"{d_el:.5f}", f"{d_az:.5f}", f"{d_az_sky:.5f}"])
    write_csv(VALIDATION / "jpl.csv",
              ["site_id", "site_name", "lat_deg", "lon_east_deg", "body", "n_times", "max_abs_elevation_error_deg",
               "max_abs_azimuth_error_deg", "max_abs_azimuth_error_on_sky_deg"], rows)


def export_pgda():
    rows = [[r["id"], r["name"]] + [f"{v:.1f}" for v in (
        r["sun_centre"], r["pgda_sun"], r["sun_centre"] - r["pgda_sun"],
        r["earth_centre"], r["pgda_earth"], r["earth_centre"] - r["pgda_earth"],
        r["sun_disc"], r["earth_any"], r["ground_sun_disc"], r["ground_earth_any"])]
        for r in pgda.compute_rows(verbose=False)]
    write_csv(VALIDATION / "pgda.csv",
              ["site_id", "site_name", "our_sun_pct_centre", "pgda_sun_pct", "sun_diff_points",
               "our_earth_pct_centre", "pgda_earth_pct", "earth_diff_points", "our_sun_pct_disc_fraction",
               "our_earth_pct_any_part", "our_sun_pct_disc_fraction_observer_0m", "our_earth_pct_any_part_observer_0m"],
              rows)


def describe(rel, names):
    stem = Path(rel).stem
    if rel == "sites.json":
        return "Landing sites: coordinates, source and coordinate quality."
    if rel == "ephemeris.json":
        return "Hourly Sun direction and Earth position seen from the Moon's centre, MOON_ME frame, Nov 2026 to Dec 2029."
    if rel == "index.json":
        return "This list: every published file with its size, format and description."
    if rel.startswith("horizons/") and stem.endswith("_grid"):
        return f"Terrain horizons at 81 points (9 x 9, 500 m apart) around {names[stem[:-5]]}."
    if rel.startswith("horizons/"):
        return f"Terrain horizon (skyline elevation every 0.5 deg of azimuth) at {names[stem]}."
    if rel.startswith("terrain/sites/"):
        site = names[rel.split("/")[2]]
        return {
            "tile.json": f"Grid definition and sources for the 120 m terrain tile around {site}.",
            "height.u16": f"Terrain heights around {site}, 512 x 512 at 120 m per pixel.",
            "far.u16": f"Coarse terrain heights around {site}, 512 x 512 at 600 m per pixel (far horizon).",
            "sun.u8": f"NASA PGDA average sunlight around {site}, percent, 120 m per pixel.",
            "earth.u8": f"NASA PGDA average Earth visibility around {site}, percent, 120 m per pixel.",
            "slope.u8": f"Terrain slope around {site}, degrees, 120 m per pixel.",
        }[Path(rel).name]
    if rel.startswith("suitability/sites/"):
        site, kind = names[stem.rsplit("_", 1)[0]], stem.rsplit("_", 1)[1]
        return (f"Landing suitability score around {site}, 512 x 512 at 120 m per pixel." if kind == "score"
                else f"Which hard limits fail around {site} (bit flags), 512 x 512 at 120 m per pixel.")
    return {
        "criteria.csv": "Landing criteria: good, acceptable and rejected ranges, the reason and the source for each.",
        "missions.csv": "Every lunar soft-landing attempt: where, when, outcome, lesson, and our criteria at the polar ones.",
        "suitability/zones.csv": "Goldilocks zones: every area that passes all hard limits, ranked, with its numbers.",
        "suitability/zones.geojson": "The 500 best Goldilocks zones as GeoJSON points (lunar longitude and latitude).",
        "suitability/south_pole_score.u8": "Landing suitability score of the south pole, 1024 x 1024, about 430 m per pixel.",
        "suitability/south_pole_limits.u8": "Which hard limits fail (bit flags), on the same 1024 x 1024 grid.",
        "suitability/summary.json": "Headline numbers of the suitability analysis.",
        "terrain/south_pole.json": "Grid definition, site positions and sources for the south-pole terrain files.",
        "terrain/south_pole_height.u16": "South-pole terrain heights, 1024 x 1024, about 430 m per pixel.",
        "terrain/south_pole_sun.u8": "NASA PGDA average sunlight, percent, on the same grid.",
        "terrain/south_pole_earth.u8": "NASA PGDA average Earth visibility, percent, on the same grid.",
        "validation/jpl.csv": "Largest differences between our Sun and Earth positions and JPL Horizons.",
        "validation/pgda.csv": "Our long-run sunlight and Earth visibility against NASA's PGDA maps, per Artemis site.",
    }[rel]


def export_index():
    names = {s["id"]: s["name"] for s in json.loads((DATA / "sites.json").read_text())["sites"]}
    index = DATA / "index.json"
    index.touch()
    paths = sorted(p for p in DATA.rglob("*") if p.is_file() and p.name != ".gitkeep")
    for _ in range(3):  # index.json lists itself, so write until its own size settles
        files = [{"path": p.relative_to(DATA).as_posix(), "bytes": p.stat().st_size, "format": FORMATS[p.suffix],
                  "description": describe(p.relative_to(DATA).as_posix(), names)} for p in paths]
        doc = {"version": 1, "licence": "CC BY 4.0 (see DATA_LICENSE.md); NASA source data keeps its own terms",
               "dictionary": "https://github.com/eugeniobusta/lunar-navigator/blob/main/docs/DATA_DICTIONARY.md",
               "files": files}
        index.write_text(json.dumps(doc, indent=1))
    print(f"index.json: {len(files)} files, {sum(f['bytes'] for f in files) / 1e6:.2f} MB")


def main():
    VALIDATION.mkdir(parents=True, exist_ok=True)
    export_jpl()
    if pgda.SUN_TIF.exists():
        export_pgda()
    else:
        print("PGDA maps missing (make download): pgda.csv left as it is")
    export_index()


if __name__ == "__main__":
    main()
