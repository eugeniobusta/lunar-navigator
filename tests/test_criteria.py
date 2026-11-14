"""engine/criteria.py known answers, and the published suitability files against docs/INTERFACES.md section 10."""
import csv
import json
from pathlib import Path

import numpy as np
import pytest

from engine import criteria as C

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
SUIT = DATA / "suitability"


def plane(rows, cols, gx, gy, scale=120.0):
    """Heights of a plane rising gx metres per metre along x and gy along y."""
    return gx * scale * np.arange(cols)[None, :] + gy * scale * np.arange(rows)[:, None]


def test_slopes_of_a_plane():
    h = plane(40, 40, 0.1, 0.0)
    assert C.landing_slope_deg(h, 120.0)[5:-5, 5:-5] == pytest.approx(np.degrees(np.arctan(0.1)))  # 5.71 deg
    assert C.baseline_slope_deg(h, 120.0, 8)[10:-10, 10:-10] == pytest.approx(5.7106, abs=1e-3)
    h = plane(40, 40, 0.3, 0.4)  # gradient 0.5 -> 26.57 deg
    assert C.landing_slope_deg(h, 120.0)[5, 5] == pytest.approx(26.565, abs=1e-3)
    assert np.isnan(C.baseline_slope_deg(h, 120.0, 8)[0, 0])  # no data within half a baseline of the edge


def test_landing_slope_takes_the_steeper_side():
    h = np.zeros((5, 5))
    h[2, 3] = 12.0  # a 12 m step one pixel to the right of the centre
    assert C.landing_slope_deg(h, 120.0)[2, 2] == pytest.approx(np.degrees(np.arctan(0.1)))
    assert C.landing_slope_deg(h, 120.0)[0, 0] == 0.0


def test_distance_matches_brute_force():
    rng = np.random.default_rng(3)
    mask = rng.random((40, 50)) < 0.01
    mask[0, 0] = True
    d = C.distance_px(mask, 30)
    rr, cc = np.nonzero(mask)
    for r, c in [(0, 0), (5, 7), (20, 25), (39, 49), (13, 40)]:
        assert d[r, c] == pytest.approx(min(30.0, np.hypot(rr - r, cc - c).min()))
    assert C.distance_px(np.zeros((6, 6), bool), 4).max() == 4  # nothing within the cap


def test_disc_mean():
    assert C.disc_mean(np.ones((64, 64)), 5.0) == pytest.approx(1.0)
    v = np.zeros((64, 64))
    v[32, 32] = 1.0
    m = C.disc_mean(v, 5.0)
    area = sum(1 for y in range(-5, 6) for x in range(-5, 6) if x * x + y * y <= 25)
    assert m[32, 32] == pytest.approx(1 / area) and m[32, 37] == pytest.approx(1 / area) and m[32, 38] == pytest.approx(0, abs=1e-12)


def test_subscore_and_encoding():
    assert C.subscore([30, 50, 70, 90], 30, 70) == pytest.approx([0, 0.5, 1, 1])
    assert C.subscore([10, 7.5, 5, 2], 10, 5) == pytest.approx([0, 0.5, 1, 1])   # less is better
    enc = C.encode_score(np.array([80.4, 80.4, 0.0, 50.0]), np.array([True, False, False, True]),
                         np.array([True, True, True, False]))
    assert enc.tolist() == [80, 181, 101, 255]


def test_map_score_extremes_and_missing_temperature():
    best = {"sun_pct": 90.0, "earth_pct": 100.0, "landing_slope_deg": 1.0, "psr_distance_km": 1.0,
            "eva_walkable_pct": 100.0, "temp_avg_k": 160.0}
    worst = {"sun_pct": 25.0, "earth_pct": 25.0, "landing_slope_deg": 10.0, "psr_distance_km": 20.4,
             "eva_walkable_pct": 40.0, "temp_avg_k": 100.0}
    as_grid = lambda d: {k: np.array([v]) for k, v in d.items()}
    assert C.map_score(as_grid(best)) == pytest.approx(100.0)
    assert C.map_score(as_grid(worst)) == pytest.approx(0.0)
    assert C.map_score(as_grid({**best, "temp_avg_k": np.nan})) == pytest.approx(100.0)  # weights rescaled
    half = {**best, "sun_pct": 47.5}   # sunlight sub-score 0.5 with weight 0.30 -> 85
    assert C.map_score(as_grid(half)) == pytest.approx(85.0)
    assert sum(w for *_, w in C.SOFT) == pytest.approx(1.0)


def test_zone_score():
    assert C.zone_score({"map_score": 100, "longest_dark_h": 85, "longest_no_earth_h": 0}) == 100
    assert C.zone_score({"map_score": 100, "longest_dark_h": 400, "longest_no_earth_h": 400}) == 70
    assert C.zone_score({"map_score": 50, "longest_dark_h": 219.5, "longest_no_earth_h": 168}) == 50  # 35 + 7.5 + 7.5


# ---- published files ----

def zones():
    return list(csv.DictReader((SUIT / "zones.csv").open()))


def test_files_and_sizes():
    assert (SUIT / "south_pole_score.u8").stat().st_size == 1024 * 1024
    assert (SUIT / "south_pole_limits.u8").stat().st_size == 1024 * 1024
    sites = [s for s in json.loads((DATA / "sites.json").read_text())["sites"] if s["terrain"] == "dem"]
    for s in sites:
        assert (SUIT / "sites" / f"{s['id']}_score.u8").stat().st_size == 512 * 512
        assert (SUIT / "sites" / f"{s['id']}_limits.u8").stat().st_size == 512 * 512
    assert (DATA / "criteria.csv").read_text() == (ROOT / "docs" / "criteria.csv").read_text()
    assert (DATA / "missions.csv").read_text() == (ROOT / "docs" / "missions.csv").read_text()


def test_score_and_limit_grids_agree():
    score = np.fromfile(SUIT / "south_pole_score.u8", dtype=np.uint8)
    limits = np.fromfile(SUIT / "south_pole_limits.u8", dtype=np.uint8)
    assert set(np.unique(score)) <= set(range(202)) | {255}
    assert np.array_equal(score <= 100, limits == 0)       # passes exactly where no limit fails
    assert np.array_equal(score == 255, limits == 255)
    assert limits[limits != 255].max() < 32
    summary = json.loads((SUIT / "summary.json").read_text())
    assert 0 < summary["pass_pct_of_region"] < 50


def test_zones_table():
    z = zones()
    summary = json.loads((SUIT / "summary.json").read_text())
    assert len(z) == summary["zones"] and [int(r["rank"]) for r in z] == list(range(1, len(z) + 1))
    for r in z:
        # Every zone passes the hard limits at its best cell.
        assert float(r["landing_slope_deg"]) <= C.LANDING_SLOPE_MAX and float(r["eva_walkable_pct"]) >= C.EVA_WALKABLE_MIN - 0.5
        assert float(r["sun_pct"]) >= C.SUN_MIN_PCT and float(r["earth_pct"]) >= C.EARTH_MIN_PCT
        assert float(r["lat"]) <= C.LAT_MAX + 1e-6 and float(r["area_km2"]) >= 0.014
        assert r["stay_window_ok"] == str(int(r["longest_sun_and_earth_h"]) >= C.STAY_H)
        assert int(r["score"]) == C.zone_score({k: float(r[k]) for k in ("map_score", "longest_dark_h", "longest_no_earth_h")})
    ok = [r["stay_window_ok"] == "True" for r in z]
    assert ok == sorted(ok, reverse=True)                   # confirmed zones first
    first = [int(r["score"]) for r in z if r["stay_window_ok"] == "True"]
    assert first == sorted(first, reverse=True)
    assert summary["top20_near_artemis"] == sum(r["near_artemis"] == "True" for r in z[:20])


def test_zones_geojson_matches_csv():
    gj = json.loads((SUIT / "zones.geojson").read_text())
    z = zones()
    assert gj["type"] == "FeatureCollection" and len(gj["features"]) == min(500, len(z))
    for f, r in zip(gj["features"][:50], z[:50], strict=True):
        assert f["geometry"]["coordinates"] == [float(r["lon"]), float(r["lat"])]
        assert f["properties"]["rank"] == int(r["rank"]) and f["properties"]["score"] == int(r["score"])


def test_best_zone_is_marked_in_the_grids():
    z = zones()[0]
    px = 440000 / 1024
    col, row = int((float(z["x_m"]) + 220000) // px), int((220000 - float(z["y_m"])) // px)
    score = np.fromfile(SUIT / "south_pole_score.u8", dtype=np.uint8).reshape(1024, 1024)
    assert score[row, col] <= 100 and score[row, col] >= int(z["map_score"])


def test_criteria_and_missions_tables():
    crit = list(csv.DictReader((DATA / "criteria.csv").open()))
    assert {"parameter", "kind", "unit", "ideal", "acceptable", "reject", "weight_pct", "reason", "source"} == set(crit[0])
    assert {c["kind"] for c in crit} == {"hard", "soft", "reported"}
    assert all(c["reason"] and c["source"] for c in crit)
    assert sum(float(c["weight_pct"]) for c in crit if c["kind"] == "soft" and c["weight_pct"]) == pytest.approx(100.0)
    missions = list(csv.DictReader((DATA / "missions.csv").open()))
    assert len(missions) >= 40 and len({m["id"] for m in missions}) == len(missions)
    assert {m["outcome"] for m in missions} <= {"landed", "tipped over", "crashed", "lost before landing"}
    for m in missions:
        assert m["source_url"].startswith("http") and m["lesson"]
        if m["lat"]:
            assert -90 <= float(m["lat"]) <= 90 and -180 <= float(m["lon"]) <= 180
    polar = {m["id"] for m in missions if m["in_criteria_area"] == "yes"}
    assert {"im1", "im2"} <= polar


# ---- "Your priorities": layers and weights (docs/INTERFACES.md section 11) ----

def test_int_map_score_and_weighted_zone_score():
    balanced = C.PRESETS["balanced"][1]
    q = np.array([[255, 0, 255], [0, 0, 255], [0, 0, 255], [0, 255, 255], [0, 0, 255], [0, 0, 255]])
    assert C.int_map_score(q, balanced).tolist() == [30, 15, 100]      # sunlight alone, shadow alone, everything
    assert C.int_map_score(q, {**balanced, **dict.fromkeys(C.LAYER_KEYS, 0)}).tolist() == [0, 0, 0]
    for m, d, n in [(100, 85, 0), (65, 560, 0), (55, 85, 336), (73, 201, 177), (40, 500, 12)]:
        z = {"map_score": m, "longest_dark_h": d, "longest_no_earth_h": n}
        assert C.zone_score_weighted(m, d, n, balanced) == C.zone_score(z)
    assert C.zone_score_weighted(80, 400, 400, {**balanced, "darkness": 0, "no_earth": 0}) == 80


def test_layers_reproduce_the_published_scores():
    weights = json.loads((SUIT / "weights.json").read_text())
    balanced = next(p["weights"] for p in weights["presets"] if p["key"] == "balanced")
    assert balanced == C.PRESETS["balanced"][1] and [la["key"] for la in weights["layers"]] == C.LAYER_KEYS

    def check(score_file, layer_pattern, n):
        published = np.fromfile(score_file, dtype=np.uint8).astype(np.int64)
        q = np.stack([np.fromfile(str(layer_pattern).format(k), dtype=np.uint8) for k in C.LAYER_KEYS])
        assert q.shape == (6, n)
        ok = published != 255
        assert np.array_equal(C.int_map_score(q, balanced)[ok], np.where(published <= 100, published, published - 101)[ok])

    check(SUIT / "south_pole_score.u8", SUIT / "layers" / "south_pole_{}.u8", 1024 * 1024)
    for s in json.loads((DATA / "sites.json").read_text())["sites"]:
        if s["terrain"] == "dem":
            check(SUIT / "sites" / f"{s['id']}_score.u8", SUIT / "layers" / "sites" / (s["id"] + "_{}.u8"), 512 * 512)


def test_zone_layers_and_artemis_points():
    z = zones()
    zl = list(csv.DictReader((SUIT / "zones_layers.csv").open()))
    assert [r["rank"] for r in zl] == [r["rank"] for r in z]
    balanced = C.PRESETS["balanced"][1]
    q = np.array([[int(r[k]) for r in zl] for k in C.LAYER_KEYS])
    assert C.int_map_score(q, balanced).tolist() == [int(r["map_score"]) for r in z]
    points = list(csv.DictReader((SUIT / "artemis_points.csv").open()))
    assert len(points) == 9
    summary = json.loads((SUIT / "summary.json").read_text())
    assert sum(p["passes_hard_limits"] == "yes" for p in points) == summary["artemis_points_passing"]
    confirmed = [i for i, r in enumerate(z) if r["stay_window_ok"] == "True"]
    for name, (_, weights) in C.PRESETS.items():
        scores = [C.zone_score_weighted(int(m), int(z[i]["longest_dark_h"]), int(z[i]["longest_no_earth_h"]), weights)
                  for m, i in zip(C.int_map_score(q[:, confirmed], weights), confirmed, strict=True)]
        for p in points:
            pq = np.array([[int(p[k])] for k in C.LAYER_KEYS])
            score = C.zone_score_weighted(int(C.int_map_score(pq, weights)[0]), int(p["longest_dark_h"]),
                                          int(p["longest_no_earth_h"]), weights)
            assert score == int(p[f"score_{name}"]) and 1 + sum(v > score for v in scores) == int(p[f"rank_{name}"])
