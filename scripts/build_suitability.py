"""Landing criteria over the south pole: hard limits, a 0-100 suitability score and the "Goldilocks zones".

Reads the raw data in data/ (make download) and writes, per docs/INTERFACES.md section 10:
  web/public/data/suitability/zones.csv, zones.geojson, south_pole_score.u8, south_pole_limits.u8,
  sites/<id>_score.u8, sites/<id>_limits.u8, summary.json
  docs/criteria.csv (copied to web/public/data/criteria.csv) and, for the polar rows, docs/missions.csv.
The method is written up in docs/criteria.md. Run: uv run python scripts/build_suitability.py
"""
import csv
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np
from rasterio import features

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from export_site_tiles import pgda_percent

from engine import criteria as C
from engine import visibility
from engine.dem import Dem
from engine.horizon import horizon

DATA = ROOT / "data"
PUBLIC = ROOT / "web" / "public" / "data"
OUT = PUBLIC / "suitability"
DOCS = ROOT / "docs"
DIVINER = DATA / "dlre_prp_south.tab"
HALF_KM = 232.0          # computed square: covers the 1024 grid (+/- 220 km) and every site tile
PSR_CAP_PX = 170         # distances to permanent shadow are exact up to 20.4 km, then reported as the cap
GEOJSON_ZONES = 500      # zones.geojson holds the best 500; zones.csv holds them all
DIVINER_BIN_PX = 5       # Diviner's ~490 m triangles averaged in 600 m bins
LIMIT_BITS = {"landing_slope": 1, "eva_slope": 2, "sunlight": 4, "earth": 8, "latitude": 16}


def window(dem):
    half = int(np.ceil(HALF_KM * 1000 / dem.scale_m))
    r0, c0 = round(dem.line_offset + 0.5), round(dem.sample_offset + 0.5)
    return slice(r0 - half, r0 + half), slice(c0 - half, c0 + half)


def diviner_mean_temperature(dem, sl):
    """Annual mean surface temperature (K) from the Diviner polar resource product, on the DEM window. NaN = no data."""
    if not DIVINER.exists():
        return None
    raw = np.memmap(DIVINER, dtype="S1", mode="r")
    rec = np.frombuffer(raw, count=raw.size // 210, dtype=np.dtype([
        ("xyz", "S126"), ("lon", "S15"), ("s1", "S2"), ("lat", "S15"), ("s2", "S2"), ("alt", "S15"), ("s3", "S2"),
        ("tavg", "S8"), ("s4", "S2"), ("tmax", "S8"), ("s5", "S2"), ("ice", "S11"), ("eol", "S2")]))[1:]
    lon, lat, tavg = (rec[k].astype(np.float64) for k in ("lon", "lat", "tavg"))
    x, y = dem.xy(lat, lon)
    rows, cols = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    col = np.floor(x / dem.scale_m + dem.sample_offset + 0.5).astype(np.int64) - sl[1].start
    row = np.floor(dem.line_offset - y / dem.scale_m + 0.5).astype(np.int64) - sl[0].start
    b = DIVINER_BIN_PX
    ok = (col >= 0) & (col < cols) & (row >= 0) & (row < rows) & (tavg > 0)
    flat = (row[ok] // b) * (cols // b + 1) + col[ok] // b
    size = (rows // b + 1) * (cols // b + 1)
    total = np.bincount(flat, weights=tavg[ok], minlength=size)
    count = np.bincount(flat, minlength=size)
    coarse = np.where(count > 0, total / np.maximum(count, 1), np.nan).reshape(rows // b + 1, cols // b + 1)
    return np.repeat(np.repeat(coarse, b, axis=0), b, axis=1)[:rows, :cols]


_PGDA = {}


def pgda(dem, name):
    if name not in _PGDA:
        _PGDA[name] = pgda_percent(DATA / name, dem)
    return _PGDA[name]


def compute_grids(dem, sl=None):
    """Every per-pixel parameter, hard-limit flags and the score on a DEM window (default: the main square)."""
    sl = sl or window(dem)
    s = dem.scale_m
    h = dem.h[sl].astype(np.float64)
    k = C.scale_factor(dem.h.shape, s, dem.line_offset, dem.sample_offset)[sl]
    x = (np.arange(sl[1].start, sl[1].stop) - dem.sample_offset) * s
    y = (dem.line_offset - np.arange(sl[0].start, sl[0].stop)) * s
    lat = -90.0 + np.degrees(2 * np.arctan(np.hypot(x[None, :], y[:, None]) / (2 * C.R_M)))
    sun = pgda(dem, "AVGVISIB_75S_120M_201608.TIF")[sl]
    earth = pgda(dem, "AVGVISIB_75S_120M_201608_EARTH.TIF")[sl]
    g = {"x": x, "y": y, "lat": lat, "elevation_m": h, "sun_pct": sun, "earth_pct": earth}
    g["landing_slope_deg"] = C.landing_slope_deg(h, s, k)
    g["eva_slope_deg"] = C.baseline_slope_deg(h, s, C.EVA_HALF_PX, k)
    slope_240 = np.degrees(np.arctan(np.hypot(*np.gradient(h, s)) * k))
    g["eva_walkable_pct"] = np.clip(100.0 * C.disc_mean(slope_240 < C.EVA_SLOPE_MAX, C.EVA_RADIUS_M / s), 0, 100)
    # Permanent shadow: PGDA sunlight exactly 0, keeping only patches of at least PSR_MIN_PX pixels.
    psr = features.sieve((sun == 0).astype(np.uint8), C.PSR_MIN_PX, connectivity=8).astype(bool) & (sun == 0)
    g["psr"] = psr
    g["psr_distance_km"] = C.distance_px(psr, PSR_CAP_PX) * s / 1000.0
    g["temp_avg_k"] = diviner_mean_temperature(dem, sl)

    fails = np.zeros(h.shape, dtype=np.uint8)
    fails[~(g["landing_slope_deg"] < C.LANDING_SLOPE_MAX)] |= LIMIT_BITS["landing_slope"]
    fails[~(g["eva_walkable_pct"] >= C.EVA_WALKABLE_MIN)] |= LIMIT_BITS["eva_slope"]
    fails[~(sun >= C.SUN_MIN_PCT)] |= LIMIT_BITS["sunlight"]
    fails[~(earth >= C.EARTH_MIN_PCT)] |= LIMIT_BITS["earth"]
    fails[~(lat <= C.LAT_MAX)] |= LIMIT_BITS["latitude"]
    g["fails"] = fails
    g["passes"] = fails == 0
    g["score"] = C.map_score(g)
    g["valid"] = np.isfinite(g["score"])
    return sl, g


def to_south_pole_grid(g, size=1024, half_m=220000.0):
    """The 120 m grids on the section-8 grid: each ~430 m pixel shows its best 120 m cell (a passing one if any)."""
    px = 2 * half_m / size
    col = np.floor((g["x"] + half_m) / px).astype(np.int64)
    row = np.floor((half_m - g["y"]) / px).astype(np.int64)
    ok = ((col >= 0) & (col < size))[None, :] & ((row >= 0) & (row < size))[:, None] & g["valid"]
    cell = (row[:, None] * size + col[None, :])[ok]
    # Sort key: passing cells first, then by score; the last entry per cell after sorting is the best one.
    key = g["passes"][ok].astype(np.int64) * 1000 + np.rint(g["score"][ok]).astype(np.int64)
    order = np.lexsort((key, cell))
    cell_sorted = cell[order]
    last = np.r_[cell_sorted[1:] != cell_sorted[:-1], True]
    best = order[last]
    score = np.full(size * size, 255, dtype=np.uint8)
    limits = np.full(size * size, 255, dtype=np.uint8)
    score[cell_sorted[last]] = C.encode_score(g["score"][ok][best], g["passes"][ok][best], np.ones(best.size, bool))
    limits[cell_sorted[last]] = g["fails"][ok][best]
    # Which 120 m cell each grid pixel shows, so the per-variable layers can show the same cell.
    source = np.full(size * size, -1, dtype=np.int64)
    source[cell_sorted[last]] = np.flatnonzero(ok)[best]
    return score.reshape(size, size), limits.reshape(size, size), source


def model_metrics(dem, lat, lon, sun_dir, earth_km):
    """Our own model at one point: longest darkness, longest time without Earth, longest stretch with both (hours)."""
    elev, surface = horizon(dem, lat, lon)
    hz = {"lat": lat, "lon": lon, "surface_elev_m": surface, "observer_h_m": 2.0, "az_step_deg": 0.5, "elev_deg": elev}
    s = visibility.series(hz, sun_dir, earth_km)
    lit, earth = s["sunMargin"] > 0, s["earthMargin"] > 0
    return {"longest_dark_h": visibility.longest_run(~lit), "longest_no_earth_h": visibility.longest_run(~earth),
            "longest_sun_and_earth_h": visibility.longest_run(lit & earth),
            "model_sun_pct": round(100.0 * lit.mean(), 1), "model_earth_pct": round(100.0 * earth.mean(), 1)}


def values_at(g, r, c):
    """The per-pixel parameters at window pixel (r, c), rounded for publication."""
    t = g["temp_avg_k"]
    return {"elevation_m": round(float(g["elevation_m"][r, c])), "landing_slope_deg": round(float(g["landing_slope_deg"][r, c]), 1),
            "eva_slope_deg": round(float(g["eva_slope_deg"][r, c]), 1), "eva_walkable_pct": round(float(g["eva_walkable_pct"][r, c])),
            "sun_pct": round(float(g["sun_pct"][r, c]), 1), "earth_pct": round(float(g["earth_pct"][r, c]), 1),
            "psr_distance_km": round(float(g["psr_distance_km"][r, c]), 2),
            "temp_avg_k": "" if t is None or not np.isfinite(t[r, c]) else round(float(t[r, c]))}


def great_circle_km(lat1, lon1, lat2, lon2):
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return float(2 * C.R_M / 1000 * np.arcsin(np.sqrt(a)))


def build_zones(dem, g, sites, sun_dir, earth_km):
    """Connected areas where every hard limit passes, described at their best cell and ranked."""
    passes = g["passes"] & g["valid"]
    shapes = [geom for geom, _ in features.shapes(passes.astype(np.uint8), mask=passes, connectivity=8)]
    labels = features.rasterize(((geom, i + 1) for i, geom in enumerate(shapes)), out_shape=passes.shape, dtype="int32")
    labels[~passes] = 0
    idx = np.flatnonzero(labels)
    lab = labels.ravel()[idx]
    score = g["score"].ravel()[idx]
    order = np.lexsort((score, lab))
    last = np.r_[lab[order][1:] != lab[order][:-1], True]
    best_flat = idx[order][last]          # best-scoring cell of each zone
    area = np.bincount(lab)[1:] * (dem.scale_m / 1000.0) ** 2
    artemis = [s for s in sites if s["group"] == "artemis"]
    zones = []
    for zone_label, flat in zip(lab[order][last], best_flat, strict=True):
        r, c = divmod(int(flat), passes.shape[1])
        lat, lon = dem.latlon(g["x"][c], g["y"][r])
        z = {"lat": round(float(lat), 5), "lon": round(float(lon), 5), "x_m": round(float(g["x"][c])),
             "y_m": round(float(g["y"][r])), "area_km2": round(float(area[zone_label - 1]), 3),
             "map_score": round(float(g["score"][r, c])), "_flat": int(flat), **values_at(g, r, c),
             **model_metrics(dem, float(lat), float(lon), sun_dir, earth_km)}
        z["stay_window_ok"] = z["longest_sun_and_earth_h"] >= C.STAY_H
        z["score"] = C.zone_score(z)
        d = [(great_circle_km(lat, lon, s["lat"], s["lon"]), s["name"]) for s in artemis]
        z["nearest_artemis_km"], z["nearest_artemis_region"] = round(min(d)[0], 1), min(d)[1]
        z["near_artemis"] = z["nearest_artemis_km"] <= C.ARTEMIS_NEAR_KM
        zones.append(z)
    # Zones whose stay window our own model confirms come first, then by score, then by size.
    zones.sort(key=lambda z: (not z["stay_window_ok"], -z["score"], -z["area_km2"]))
    for rank, z in enumerate(zones, 1):
        z["rank"] = rank
    return zones


ZONE_COLUMNS = ["rank", "lat", "lon", "x_m", "y_m", "area_km2", "score", "map_score", "elevation_m", "landing_slope_deg",
                "eva_slope_deg", "eva_walkable_pct", "sun_pct", "earth_pct", "psr_distance_km", "temp_avg_k",
                "longest_dark_h", "longest_no_earth_h", "longest_sun_and_earth_h", "stay_window_ok", "model_sun_pct",
                "model_earth_pct", "nearest_artemis_region", "nearest_artemis_km", "near_artemis"]


def write_zones(zones):
    with open(OUT / "zones.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ZONE_COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows({k: z[k] for k in ZONE_COLUMNS} for z in zones)
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [z["lon"], z["lat"]]},
              "properties": {k: z[k] for k in ZONE_COLUMNS if k not in ("lat", "lon")}} for z in zones[:GEOJSON_ZONES]]
    (OUT / "zones.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "name": "goldilocks_zones",
         "description": f"The {GEOJSON_ZONES} best zones (all of them are in zones.csv). Each point is the best cell of one zone; coordinates are lunar longitude (east) and latitude, "
                        "MOON_ME, 1737.4 km sphere. Columns: docs/DATA_DICTIONARY.md.", "features": feats},
        separators=(",", ":")))


def write_site_tiles(dem, sl, g, sites):
    (OUT / "sites").mkdir(parents=True, exist_ok=True)
    enc = C.encode_score(g["score"], g["passes"], g["valid"])
    for s in sites:
        if s["terrain"] != "dem":
            continue
        tile = json.loads((PUBLIC / "terrain" / "sites" / s["id"] / "tile.json").read_text())
        c0 = round(tile["x_min_m"] / dem.scale_m + dem.sample_offset + 0.5) - sl[1].start
        r0 = round(dem.line_offset - tile["y_max_m"] / dem.scale_m + 0.5) - sl[0].start
        n = tile["size"]
        assert 0 <= r0 and r0 + n <= enc.shape[0] and 0 <= c0 and c0 + n <= enc.shape[1], s["id"]
        (OUT / "sites" / f"{s['id']}_score.u8").write_bytes(enc[r0:r0 + n, c0:c0 + n].tobytes())
        limits = np.where(g["valid"], g["fails"], 255).astype(np.uint8)
        (OUT / "sites" / f"{s['id']}_limits.u8").write_bytes(limits[r0:r0 + n, c0:c0 + n].tobytes())


def write_layers(dem, sl, g, q, source, sites, zones, sun_dir, earth_km):
    """'Your priorities' (docs/INTERFACES.md section 11): each soft term as a 0-255 layer, plus what the browser
    needs to re-rank the zones and the Artemis points under any weights. Only adds files; changes none."""
    out = OUT / "layers"
    (out / "sites").mkdir(parents=True, exist_ok=True)
    flat = q.reshape(len(C.LAYER_KEYS), -1)
    for i, key in enumerate(C.LAYER_KEYS):
        grid = np.zeros(source.size, dtype=np.uint8)
        grid[source >= 0] = flat[i][source[source >= 0]]
        (out / f"south_pole_{key}.u8").write_bytes(grid.tobytes())
    for s in sites:
        if s["terrain"] != "dem":
            continue
        tile = json.loads((PUBLIC / "terrain" / "sites" / s["id"] / "tile.json").read_text())
        c0 = round(tile["x_min_m"] / dem.scale_m + dem.sample_offset + 0.5) - sl[1].start
        r0 = round(dem.line_offset - tile["y_max_m"] / dem.scale_m + 0.5) - sl[0].start
        n = tile["size"]
        for i, key in enumerate(C.LAYER_KEYS):
            (out / "sites" / f"{s['id']}_{key}.u8").write_bytes(np.ascontiguousarray(q[i, r0:r0 + n, c0:c0 + n]).tobytes())

    with open(OUT / "zones_layers.csv", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["rank", *C.LAYER_KEYS])
        w.writerows([z["rank"], *(int(v) for v in flat[:, z["_flat"]])] for z in zones)

    # The nine Artemis points: their own layer values and model numbers, and where they would rank among the
    # zones whose stay window is confirmed, under each preset.
    confirmed = [z for z in zones if z["stay_window_ok"]]
    zq = np.stack([flat[:, z["_flat"]] for z in confirmed], axis=1)
    cols = ["id", "name", "lat", "lon", "passes_hard_limits", "failed_limits", *C.LAYER_KEYS, "longest_dark_h",
            "longest_no_earth_h", "longest_sun_and_earth_h"]
    cols += [f"{kind}_{p}" for p in C.PRESETS for kind in ("score", "rank")]
    rows = []
    for s in sites:
        if s["group"] != "artemis":
            continue
        sx, sy = dem.xy(s["lat"], s["lon"])
        c = round(float(sx) / dem.scale_m + dem.sample_offset) - sl[1].start
        r = round(dem.line_offset - float(sy) / dem.scale_m) - sl[0].start
        pq = q[:, r, c]
        mm = model_metrics(dem, s["lat"], s["lon"], sun_dir, earth_km)
        row = {"id": s["id"], "name": s["name"], "lat": s["lat"], "lon": s["lon"],
               "passes_hard_limits": "yes" if g["passes"][r, c] else "no",
               "failed_limits": " ".join(name for name, bit in LIMIT_BITS.items() if g["fails"][r, c] & bit),
               **{k: int(v) for k, v in zip(C.LAYER_KEYS, pq, strict=True)},
               **{k: mm[k] for k in ("longest_dark_h", "longest_no_earth_h", "longest_sun_and_earth_h")}}
        for name, (_, weights) in C.PRESETS.items():
            score = C.zone_score_weighted(int(C.int_map_score(pq[:, None], weights)[0]), mm["longest_dark_h"],
                                          mm["longest_no_earth_h"], weights)
            zone_scores = [C.zone_score_weighted(int(m), z["longest_dark_h"], z["longest_no_earth_h"], weights)
                           for m, z in zip(C.int_map_score(zq, weights), confirmed, strict=True)]
            row[f"score_{name}"] = score
            row[f"rank_{name}"] = 1 + sum(v > score for v in zone_scores)
        rows.append(row)
    with open(OUT / "artemis_points.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

    soft = {k: (key, reject, ideal) for k, (key, reject, ideal, _) in zip(C.LAYER_KEYS, C.SOFT, strict=True)}
    units = {"sunlight": "% of time", "earth": "% of time", "landing_slope": "deg", "shadow": "km", "walkable": "%",
             "temperature": "K"}
    (OUT / "weights.json").write_text(json.dumps({
        "version": 1,
        "layers": [{"key": k, "label": C.LAYER_LABELS[k], "parameter": soft[k][0], "unit": units[k],
                    "reject": soft[k][1], "ideal": soft[k][2], "file": f"layers/south_pole_{k}.u8",
                    "site_file": f"layers/sites/<id>_{k}.u8"} for k in C.LAYER_KEYS],
        "zone_terms": [{"key": "darkness", "label": C.LAYER_LABELS["darkness"], "column": "longest_dark_h", "unit": "h",
                        "reject": C.DARK_REJECT_H, "ideal": C.DARK_IDEAL_H},
                       {"key": "no_earth", "label": C.LAYER_LABELS["no_earth"], "column": "longest_no_earth_h",
                        "unit": "h", "reject": C.NO_EARTH_REJECT_H, "ideal": 0.0}],
        "default": "balanced",
        "presets": [{"key": k, "label": label, "weights": w} for k, (label, w) in C.PRESETS.items()],
        "confirmed_zones": len(confirmed),
    }, indent=1))
    print(f"layers: {len(C.LAYER_KEYS)} x (1 south-pole grid + {sum(s['terrain'] == 'dem' for s in sites)} site tiles); "
          f"Artemis points among the {len(confirmed)} confirmed zones (score, rank):")
    print("  " + "site".ljust(8) + "passes  " + "  ".join(label.ljust(18) for label, _ in C.PRESETS.values()))
    for row in rows:
        print("  " + row["id"].ljust(8) + row["passes_hard_limits"].ljust(8)
              + "  ".join(f"{row[f'score_{p}']:3d}, rank {row[f'rank_{p}']:<8d}" for p in C.PRESETS))


SITE_VALUE_COLUMNS = ["id", "name", "lat", "lon", "passes_hard_limits", "failed_limits", "map_score", "elevation_m",
                      "landing_slope_deg", "eva_slope_deg", "eva_walkable_pct", "sun_pct", "earth_pct", "psr_distance_km",
                      "temp_avg_k", "longest_dark_h", "longest_no_earth_h", "longest_sun_and_earth_h"]


def write_site_values(dem, sl, g, sites, sun_dir, earth_km):
    """suitability/site_values.csv: the criteria values at every terrain="dem" site, for the "Why here?" box."""
    rows = []
    for s in sites:
        if s["terrain"] != "dem":
            continue
        sx, sy = dem.xy(s["lat"], s["lon"])
        c = round(float(sx) / dem.scale_m + dem.sample_offset) - sl[1].start
        r = round(dem.line_offset - float(sy) / dem.scale_m) - sl[0].start
        mm = model_metrics(dem, s["lat"], s["lon"], sun_dir, earth_km)
        rows.append({"id": s["id"], "name": s["name"], "lat": s["lat"], "lon": s["lon"],
                     "passes_hard_limits": "yes" if g["passes"][r, c] else "no",
                     "failed_limits": " ".join(name for name, bit in LIMIT_BITS.items() if g["fails"][r, c] & bit),
                     "map_score": round(float(g["score"][r, c])), **values_at(g, r, c),
                     **{k: mm[k] for k in ("longest_dark_h", "longest_no_earth_h", "longest_sun_and_earth_h")}})
    with open(OUT / "site_values.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SITE_VALUE_COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def polar_missions(dem, sl, main, sun_dir, earth_km):
    """Fill the criteria columns of docs/missions.csv for landing attempts inside the computed area."""
    path = DOCS / "missions.csv"
    if not path.exists():
        return
    rows = list(csv.DictReader(path.open()))
    extra = ["in_criteria_area", "c_landing_slope_deg", "c_eva_slope_deg", "c_sun_pct", "c_earth_pct",
             "c_psr_distance_km", "c_temp_avg_k", "c_score", "c_passes_hard_limits", "c_failed_limits",
             "c_longest_dark_h", "c_longest_no_earth_h"]
    base = [k for k in rows[0] if k not in extra]
    for m in rows:
        for k in extra:
            m[k] = ""
        m["in_criteria_area"] = "no"
        if not m["lat"] or not m["lon"]:
            continue
        lat, lon = float(m["lat"]), float(m["lon"])
        if lat > -77.0:  # the DEM ends at 75 S; the measures need about 25 km of ground around the point
            continue
        x, y = dem.xy(lat, lon)
        col, row = round(float(x) / dem.scale_m + dem.sample_offset), round(dem.line_offset - float(y) / dem.scale_m)
        c, r = col - sl[1].start, row - sl[0].start
        if not (0 <= r < main["valid"].shape[0] and 0 <= c < main["valid"].shape[1]):
            # Outside the main square (IM-1 at 80 S): the same measures on a 50 km square around the point.
            half = PSR_CAP_PX + 40
            _, g = compute_grids(dem, (slice(row - half, row + half), slice(col - half, col + half)))
            r = c = half
        else:
            g = main
        if not g["valid"][r, c]:
            continue
        v = values_at(g, r, c)
        mm = model_metrics(dem, lat, lon, sun_dir, earth_km)
        failed = [name for name, bit in LIMIT_BITS.items() if g["fails"][r, c] & bit]
        m.update({"in_criteria_area": "yes", "c_landing_slope_deg": v["landing_slope_deg"], "c_eva_slope_deg": v["eva_slope_deg"],
                  "c_sun_pct": v["sun_pct"], "c_earth_pct": v["earth_pct"], "c_psr_distance_km": v["psr_distance_km"],
                  "c_temp_avg_k": v["temp_avg_k"], "c_score": round(float(g["score"][r, c])),
                  "c_passes_hard_limits": "yes" if not failed else "no", "c_failed_limits": " ".join(failed),
                  "c_longest_dark_h": mm["longest_dark_h"], "c_longest_no_earth_h": mm["longest_no_earth_h"]})
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=base + extra, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(path, PUBLIC / "missions.csv")
    polar = [m for m in rows if m["in_criteria_area"] == "yes"]
    print(f"missions.csv: {len(rows)} attempts, {len(polar)} inside the criteria area: " + ", ".join(m["id"] for m in polar))


def main():
    t0 = time.perf_counter()
    OUT.mkdir(parents=True, exist_ok=True)
    dem = Dem.from_label()
    sites = json.loads((PUBLIC / "sites.json").read_text())["sites"]
    eph = json.loads((PUBLIC / "ephemeris.json").read_text())
    sun_dir = np.array(eph["sun_dir"]).reshape(-1, 3)
    earth_km = np.array(eph["earth_km"]).reshape(-1, 3)

    C.write_criteria_csv(DOCS / "criteria.csv")
    shutil.copyfile(DOCS / "criteria.csv", PUBLIC / "criteria.csv")

    sl, g = compute_grids(dem)
    region = g["lat"] <= C.LAT_MAX
    print(f"grids: {g['score'].shape}, Diviner temperature {'loaded' if g['temp_avg_k'] is not None else 'MISSING'}, "
          f"{time.perf_counter() - t0:.1f} s")
    score, limits, source = to_south_pole_grid(g)
    (OUT / "south_pole_score.u8").write_bytes(score.tobytes())
    (OUT / "south_pole_limits.u8").write_bytes(limits.tobytes())
    write_site_tiles(dem, sl, g, sites)

    zones = build_zones(dem, g, sites, sun_dir, earth_km)
    write_zones(zones)
    q, _ = C.quantise_layers(g)
    write_layers(dem, sl, g, q, source, sites, zones, sun_dir, earth_km)
    write_site_values(dem, sl, g, sites, sun_dir, earth_km)
    polar_missions(dem, sl, g, sun_dir, earth_km)

    px_km2 = (dem.scale_m / 1000.0) ** 2
    top20 = zones[:20]
    dist = np.linalg.norm(earth_km, axis=1)
    summary = {
        "version": 1,
        "region_km2": round(float(region.sum() * px_km2)),
        "pass_km2": round(float(g["passes"].sum() * px_km2)),
        "pass_pct_of_region": round(100.0 * float(g["passes"].sum()) / float(region.sum()), 1),
        "fail_pct_of_region": {name: round(100.0 * float(((g["fails"] & bit) > 0)[region].mean()), 1)
                               for name, bit in LIMIT_BITS.items() if name != "latitude"},
        "zones": len(zones),
        "zones_stay_window_ok": sum(z["stay_window_ok"] for z in zones),
        "zones_1km2_or_more": sum(z["area_km2"] >= 1 for z in zones),
        "largest_zone_km2": max(z["area_km2"] for z in zones),
        "top20_near_artemis": sum(z["near_artemis"] for z in top20),
        "top20_nearest_regions": sorted({z["nearest_artemis_region"] for z in top20 if z["near_artemis"]}),
        "artemis_near_km": C.ARTEMIS_NEAR_KM,
        "zones_near_artemis": sum(z["near_artemis"] for z in zones),
        "pass_km2_near_artemis": None,
        "signal_delay_s": {"min": round(float(dist.min()) / 299792.458, 3), "max": round(float(dist.max()) / 299792.458, 3),
                           "mean": round(float(dist.mean()) / 299792.458, 3)},
        "psr_km2_in_region": round(float((g["psr"] & region).sum() * px_km2)),
        "temperature_available": g["temp_avg_k"] is not None,
    }
    # How much of the passing area lies near the Artemis points, against how much of the whole region does.
    near = np.zeros(g["passes"].shape, dtype=bool)
    for s in sites:
        if s["group"] == "artemis":
            sx, sy = dem.xy(s["lat"], s["lon"])
            near |= np.hypot(g["x"][None, :] - sx, g["y"][:, None] - sy) <= C.ARTEMIS_NEAR_KM * 1000
    summary["pass_km2_near_artemis"] = round(float((g["passes"] & near).sum() * px_km2))
    summary["region_pct_near_artemis"] = round(100.0 * float((near & region).sum()) / float(region.sum()), 1)
    summary["pass_pct_near_artemis"] = round(100.0 * float((g["passes"] & near).sum()) / float(g["passes"].sum()), 1)
    # The nine Artemis points themselves: do they pass, and what is the best zone close to each?
    summary["artemis"] = []
    for s in sites:
        if s["group"] != "artemis":
            continue
        sx, sy = dem.xy(s["lat"], s["lon"])
        c = round(float(sx) / dem.scale_m + dem.sample_offset) - sl[1].start
        r = round(dem.line_offset - float(sy) / dem.scale_m) - sl[0].start
        close = [z for z in zones if great_circle_km(z["lat"], z["lon"], s["lat"], s["lon"]) <= C.ARTEMIS_NEAR_KM]
        summary["artemis"].append({
            "id": s["id"], "name": s["name"], "passes_at_point": bool(g["passes"][r, c]),
            "failed_limits": [name for name, bit in LIMIT_BITS.items() if g["fails"][r, c] & bit],
            "score_at_point": round(float(g["score"][r, c])), "zones_nearby": len(close),
            "best_zone_rank_nearby": min((z["rank"] for z in close), default=None),
            "best_zone_score_nearby": max((z["score"] for z in close), default=None)})
    summary["artemis_points_passing"] = sum(a["passes_at_point"] for a in summary["artemis"])
    summary["artemis_regions_with_a_zone"] = sum(a["zones_nearby"] > 0 for a in summary["artemis"])
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps({k: v for k, v in summary.items() if k != "artemis"}, indent=1))
    for a in summary["artemis"]:
        print(f"  {a['id']:7s} passes at point: {a['passes_at_point']!s:5s} {' '.join(a['failed_limits']):30s} score {a['score_at_point']:3d}  "
              f"zones within {C.ARTEMIS_NEAR_KM} km: {a['zones_nearby']:3d}, best rank {a['best_zone_rank_nearby']}, best score {a['best_zone_score_nearby']}")
    print("top 10 zones:")
    for z in zones[:10]:
        print(f"  #{z['rank']:<3d} {z['lat']:.3f} {z['lon']:8.3f}  score {z['score']:3d}  {z['area_km2']:8.2f} km2  sun {z['sun_pct']:.0f}% "
              f"earth {z['earth_pct']:.0f}%  slope {z['landing_slope_deg']}  dark {z['longest_dark_h']} h  "
              f"{z['nearest_artemis_region']} {z['nearest_artemis_km']} km")
    print(f"done in {time.perf_counter() - t0:.1f} s")


if __name__ == "__main__":
    main()
