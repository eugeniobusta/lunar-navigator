"""The published file index, validation CSVs and data dictionary stay in step with web/public/data/."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
INDEX = json.loads((DATA / "index.json").read_text())


def test_index_lists_every_published_file_with_its_size():
    on_disk = {p.relative_to(DATA).as_posix(): p.stat().st_size
               for p in DATA.rglob("*") if p.is_file() and p.name != ".gitkeep"}
    listed = {f["path"]: f["bytes"] for f in INDEX["files"]}
    assert listed == on_disk
    assert all(f["description"] and f["format"] for f in INDEX["files"])


def test_validation_csvs():
    jpl = list(csv.DictReader((DATA / "validation" / "jpl.csv").open()))
    assert len(jpl) == 6 and {r["body"] for r in jpl} == {"sun", "earth"}
    assert all(float(r["max_abs_elevation_error_deg"]) < 0.05 and float(r["max_abs_azimuth_error_deg"]) < 0.05
               for r in jpl)
    pgda = list(csv.DictReader((DATA / "validation" / "pgda.csv").open()))
    artemis = [s["id"] for s in json.loads((DATA / "sites.json").read_text())["sites"] if s["group"] == "artemis"]
    assert [r["site_id"] for r in pgda] == artemis
    for r in pgda:
        assert abs(float(r["our_sun_pct_centre"]) - float(r["pgda_sun_pct"]) - float(r["sun_diff_points"])) < 0.11
        assert abs(float(r["sun_diff_points"])) < 10 and abs(float(r["earth_diff_points"])) < 10


def test_dictionary_covers_every_file_and_column():
    text = (ROOT / "docs" / "DATA_DICTIONARY.md").read_text()
    for name in ("index.json", "sites.json", "ephemeris.json", "_grid.json", "south_pole.json", "south_pole_height.u16",
                 "south_pole_sun.u8", "south_pole_earth.u8", "tile.json", "height.u16", "far.u16", "sun.u8", "earth.u8", "slope.u8", "validation/jpl.csv", "validation/pgda.csv"):
        assert name in text, name
    for csv_name in ("jpl.csv", "pgda.csv"):
        for col in next(csv.reader((DATA / "validation" / csv_name).open())):
            assert f"`{col}`" in text, col
    for doc in ("sites.json", "ephemeris.json", "horizons/mma01.json", "horizons/mma01_grid.json", "terrain/south_pole.json",
                "terrain/sites/mma01/tile.json"):
        d = json.loads((DATA / doc).read_text())
        d = d["sites"][0] if doc == "sites.json" else d
        for key in d:
            assert any(form in text for form in (f"`{key}`", f".{key}`", f"`{key}[", f"`{key}.")), (doc, key)
