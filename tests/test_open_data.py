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
    for name in ("index.json", "stars.json", "sites.json", "ephemeris.json", "_grid.json", "south_pole.json", "south_pole_height.u16",
                 "south_pole_sun.u8", "south_pole_earth.u8", "tile.json", "height.u16", "far.u16", "sun.u8", "earth.u8", "slope.u8", "validation/jpl.csv", "validation/pgda.csv"):
        assert name in text, name
    for csv_name in ("validation/jpl.csv", "validation/pgda.csv", "suitability/zones.csv", "criteria.csv", "missions.csv",
                     "suitability/zones_layers.csv", "suitability/artemis_points.csv", "suitability/site_values.csv"):
        assert csv_name in text, csv_name
        for col in next(csv.reader((DATA / csv_name).open())):
            assert f"`{col}`" in text, (csv_name, col)
    for name in ("south_pole_score.u8", "south_pole_limits.u8", "_score.u8", "_limits.u8", "zones.geojson", "summary.json"):
        assert name in text, name
    for key in json.loads((DATA / "suitability" / "summary.json").read_text()):
        assert f"`{key}`" in text, key
    weights = json.loads((DATA / "suitability" / "weights.json").read_text())
    for key in weights:
        assert f"`{key}`" in text or f"`{key}[]." in text, key
    for group in ("layers", "zone_terms", "presets"):
        for key in weights[group][0]:
            assert f"`{group}[].{key}`" in text, (group, key)
    for doc in ("sites.json", "ephemeris.json", "horizons/mma01.json", "horizons/mma01_grid.json", "terrain/south_pole.json",
                "terrain/sites/mma01/tile.json", "stars.json"):
        d = json.loads((DATA / doc).read_text())
        d = d["sites"][0] if doc == "sites.json" else d
        for key in d:
            assert any(form in text for form in (f"`{key}`", f".{key}`", f"`{key}[", f"`{key}.")), (doc, key)


def test_every_third_party_picture_is_credited():
    """Each photo in web/public/media/ is listed with a NASA ID and a credit in docs/CREDITS.md, in index.json and
    on the Data page; the VR globe's credit is the one in its own moon.json."""
    photos = {p.name for p in (ROOT / "web" / "public" / "media").glob("*.jpg")}
    listed = INDEX["third_party"]["website_photos"]
    assert {a["file"].split("/")[1] for a in listed} == photos
    credits = (ROOT / "docs" / "CREDITS.md").read_text()
    page = (ROOT / "web" / "src" / "routes" / "Data.tsx").read_text()
    for a in listed:
        assert a["nasa_id"] and a["credit"].startswith("NASA")
        assert a["nasa_id"] in credits and a["file"].split("/")[1] in credits
    assert "third_party" in page and "Pictures and textures" in page
    moon = json.loads((ROOT / "xr" / "public" / "moon" / "moon.json").read_text())
    assert INDEX["third_party"]["vr_textures"][0]["credit"] == moon["credit"]
    assert "svs.gsfc.nasa.gov/4720" in credits
