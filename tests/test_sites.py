"""Checks web/public/data/sites.json against docs/INTERFACES.md section 1."""
import json
from pathlib import Path

SITES = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "sites.json"
REQUIRED = {"id", "name", "group", "lat", "lon", "terrain", "has_grid", "note", "source", "coords_quality"}


def test_sites_contract():
    doc = json.loads(SITES.read_text())
    assert doc["version"] == 1
    ids = set()
    for s in doc["sites"]:
        assert REQUIRED <= s.keys(), s["id"]
        assert s["id"] not in ids
        ids.add(s["id"])
        assert s["group"] in {"artemis", "mission", "historic"}
        assert s["terrain"] in {"dem", "flat"}
        assert s["coords_quality"] in {"published", "approximate", "verify"}
        assert -90 <= s["lat"] <= 90 and -180 <= s["lon"] <= 180
        # The polar DEM only covers latitudes south of 75S.
        if s["terrain"] == "dem":
            assert s["lat"] <= -75
