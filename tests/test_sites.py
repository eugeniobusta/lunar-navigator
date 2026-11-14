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


def test_grids_exist_for_has_grid_sites():
    """docs/INTERFACES.md section 4: 9 x 9 points, 500 m apart, 720 horizon values each, centre = the site."""
    for s in json.loads(SITES.read_text())["sites"]:
        path = SITES.parent / "horizons" / f"{s['id']}_grid.json"
        assert path.exists() == s["has_grid"], s["id"]
        if not s["has_grid"]:
            continue
        g = json.loads(path.read_text())
        assert (g["site_id"], g["n"], g["spacing_m"], len(g["points"])) == (s["id"], 9, 500, 81)
        assert all(len(p["elev_deg"]) == 720 for p in g["points"])
        centre = next(p for p in g["points"] if p["i"] == 4 and p["j"] == 4)
        assert centre["dx_m"] == 0 and centre["dy_m"] == 0
        assert abs(centre["lat"] - s["lat"]) < 1e-5 and abs(centre["lon"] - s["lon"]) < 1e-5
