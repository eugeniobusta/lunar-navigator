"""The basemap of the landing map: files in step with the gazetteer table, and the named craters where the terrain
has craters (an independent check of the map's projection, orientation and longitude convention)."""
import csv
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
R_M = 1737400.0


def xy(lat, lon):
    rho = 2 * R_M * np.tan(np.radians(90 + lat) / 2)
    return rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))


def heights():
    meta = json.loads((DATA / "terrain" / "south_pole.json").read_text())
    h = np.fromfile(DATA / "terrain" / "south_pole_height.u16", dtype="<u2").reshape(meta["size"], meta["size"])
    return meta, meta["height_min_m"] + h.astype(np.float64) * (meta["height_max_m"] - meta["height_min_m"]) / 65535.0


def sample(meta, h, x, y):
    col = np.floor((x - meta["x_min_m"]) / meta["pixel_m"]).astype(int)
    row = np.floor((meta["y_max_m"] - y) / meta["pixel_m"]).astype(int)
    ok = (col >= 0) & (col < meta["size"]) & (row >= 0) & (row < meta["size"])
    return h[row[ok], col[ok]]


def test_features_match_the_gazetteer_table():
    doc = json.loads((DATA / "basemap" / "features.json").read_text())
    rows = list(csv.DictReader((ROOT / "docs" / "research" / "iau_features.csv").open()))
    assert [f["name"] for f in doc["features"]] == [r["name"] for r in rows]
    for f, r in zip(doc["features"], rows, strict=True):
        assert (f["lat"], f["lon"], f["diameter_km"]) == (float(r["lat"]), float(r["lon"]), float(r["diameter_km"]))
        assert f["url"] == f"https://planetarynames.wr.usgs.gov/Feature/{f['id']}" and r["approval"] == "Approved"
    major = {f["name"] for f in doc["features"] if f["rank"] == "major"}
    assert major == {"Shackleton", "Haworth", "Shoemaker", "Faustini", "de Gerlache", "Cabeus", "Malapert", "Nobile", "Amundsen"}
    assert all(f["lat"] <= -83 for f in doc["features"])


def test_relief_images_cover_what_basemap_json_says():
    doc = json.loads((DATA / "basemap" / "basemap.json").read_text())
    near, wide = doc["images"]
    assert near == {"file": "relief.jpg", "size": 2048, "half_width_m": 220000.0}
    assert wide["file"] == "relief_wide.jpg" and 450000 < wide["half_width_m"] < 460000
    for im in doc["images"]:
        assert (DATA / "basemap" / im["file"]).stat().st_size > 200_000


def test_named_craters_are_depressions_at_their_gazetteer_positions():
    """IAU positions are independent of our grids. If the projection, the row order or the longitude sign were
    wrong, the nine craters would not all be lower in the middle than on their rims."""
    meta, h = heights()
    doc = json.loads((DATA / "basemap" / "features.json").read_text())
    craters = [f for f in doc["features"] if f["rank"] == "major"]
    assert len(craters) == 9
    ang = np.radians(np.arange(0, 360, 5))
    for f in craters:
        cx, cy = xy(f["lat"], f["lon"])
        r = f["diameter_km"] * 500.0
        inner = sample(meta, h, cx + 0.3 * r * np.cos(ang), cy + 0.3 * r * np.sin(ang)).mean()
        rim = sample(meta, h, cx + r * np.cos(ang), cy + r * np.sin(ang)).mean()
        assert rim - inner > 300, (f["name"], round(rim - inner))
        # Mirrored in longitude, the same test must fail for most of them (so the test can tell the difference).
    wrong = 0
    for f in craters:
        cx, cy = xy(f["lat"], -f["lon"])
        r = f["diameter_km"] * 500.0
        inner = sample(meta, h, cx + 0.3 * r * np.cos(ang), cy + 0.3 * r * np.sin(ang)).mean()
        rim = sample(meta, h, cx + r * np.cos(ang), cy + r * np.sin(ang)).mean()
        wrong += rim - inner > 300
    assert wrong <= 4
