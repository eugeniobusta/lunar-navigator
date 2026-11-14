"""Site Map layers (demo, owner: Chinh): one raster per landing factor on the 1024 x 1024 south-pole grid.

Reuses Eugenio's per-pixel parameters (scripts/build_suitability.py: compute_grids, NASA LOLA + PGDA + Diviner) and adds
two of our own: how far a spot sits below its surroundings (the "bowl" factor) and Diviner's ice stability depth.
Every factor is computed at the DEM's 120 m cells; each ~430 m map pixel then shows the 120 m cell with the best
combined score, and every layer is taken from that SAME cell, so a click describes one real place.

Writes web/public/data/sitemap/layers.json and one <factor>.u8 per factor
(value = enc_min + v / 254 * (enc_max - enc_min), 255 = no data; row 0 = northern edge, column 0 = smallest x).
Run: uv run python scripts/build_site_map.py   (needs make download: LOLA, PGDA, Diviner PRP)
"""
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import build_suitability as BS  # noqa: E402

from engine import criteria as C  # noqa: E402
from engine.dem import Dem  # noqa: E402

OUT = ROOT / "web" / "public" / "data" / "sitemap"
GRID = json.loads((ROOT / "web" / "public" / "data" / "terrain" / "south_pole.json").read_text())
BOWL_RADIUS_M = 2000.0  # compare a spot with the mean ground height within the 2 km walking radius

HLS = "NASA, Artemis Human Landing System Update (2024), NTRS 20240009596"
# key, name, unit, encoding range, reject (score 0), ideal (score 1), source of the thresholds, plain explanation
FACTORS = [
    ("landing_slope_deg", "Landing slope", "deg", (0, 45), 10.0, 0.0,
     f'"Surface slope for landing (100m): <10 deg" ({HLS}). Measured across 120 m, steepest side.',
     "How steep the ground is right under the lander. Over 10 deg it may tip over."),
    ("eva_slope_deg", "Walk-out slope", "deg", (0, 45), 20.0, 0.0,
     f'"Surface slope limit for EVA (2km): <20 deg" ({HLS}). Grade over a ~2 km baseline.',
     "How steep the way out is over the 2 km astronauts can walk. Over 20 deg they cannot walk out."),
    ("bowl_depth_m", "Bowl / crater floor", "m below surroundings", (-200, 200), 70.0, 0.0,
     "Team assumption: 70 m below the mean ground within 2 km is ground rising about 2 deg on every side.",
     "How far the spot sits below the average ground within 2 km. Crater floors are darker, colder and hard to leave."),
    ("sun_pct", "Sunlight", "% of time", (0, 100), 30.0, 100.0,
     "NASA GSFC PGDA long-run average (product 69). Reject at 30 % is a team assumption.",
     "Share of time the Sun is up over the terrain, averaged over 18.6 years. Power and warmth."),
    ("earth_pct", "Earth in view", "% of time", (0, 100), 30.0, 100.0,
     "NASA GSFC PGDA long-run average (product 69). Reject at 30 % is a team assumption.",
     "Share of time Earth is above the skyline, so the radio can reach home without a relay."),
    ("psr_distance_km", "Distance to ice", "km", (0, 20), 10.0, 0.0,
     "Permanent shadow = PGDA sunlight 0 over at least 1 km2 (team choice, as docs/criteria.md). 10 km reject: team assumption.",
     "How far to the nearest permanently shadowed ground, where water ice can survive."),
    ("temp_avg_k", "Ground temperature", "K, yearly mean", (20, 320), 110.0, 150.0,
     'LRO Diviner Polar Resource Product. 110 K: "surfaces below 110 K capable of cold trapping water" (Williams et al. 2019).',
     "Yearly mean temperature just below the surface. Colder ground needs more heater power."),
    ("ice_depth_m", "Buried ice depth", "m", (0, 2), 1.0, 0.0,
     "LRO Diviner Polar Resource Product (ice stability depth, thermal model). 1 m reject: team assumption.",
     "How deep you would have to dig before water ice could stay frozen. Shallower is easier to reach."),
]


def diviner_ice_depth(dem, sl):
    """Diviner PRP ice stability depth (m) on the DEM window, binned like BS.diviner_mean_temperature. NaN = none."""
    if not BS.DIVINER.exists():
        return None
    raw = np.memmap(BS.DIVINER, dtype="S1", mode="r")
    rec = np.frombuffer(raw, count=raw.size // 210, dtype=np.dtype([
        ("xyz", "S126"), ("lon", "S15"), ("s1", "S2"), ("lat", "S15"), ("s2", "S2"), ("alt", "S15"), ("s3", "S2"),
        ("tavg", "S8"), ("s4", "S2"), ("tmax", "S8"), ("s5", "S2"), ("ice", "S11"), ("eol", "S2")]))[1:]
    lon, lat, ice = (rec[k].astype(np.float64) for k in ("lon", "lat", "ice"))
    x, y = dem.xy(lat, lon)
    rows, cols = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    col = np.floor(x / dem.scale_m + dem.sample_offset + 0.5).astype(np.int64) - sl[1].start
    row = np.floor(dem.line_offset - y / dem.scale_m + 0.5).astype(np.int64) - sl[0].start
    b = BS.DIVINER_BIN_PX
    ok = (col >= 0) & (col < cols) & (row >= 0) & (row < rows) & np.isfinite(ice) & (ice >= 0)
    print(f"Diviner ice: {ok.sum()} usable points, depth range {np.nanmin(ice[ok]):.3f} .. {np.nanmax(ice[ok]):.3f} m, "
          f"negative/no-ice {(ice < 0).sum()}")
    flat = (row[ok] // b) * (cols // b + 1) + col[ok] // b
    size = (rows // b + 1) * (cols // b + 1)
    total = np.bincount(flat, weights=ice[ok], minlength=size)
    count = np.bincount(flat, minlength=size)
    coarse = np.where(count > 0, total / np.maximum(count, 1), np.nan).reshape(rows // b + 1, cols // b + 1)
    return np.repeat(np.repeat(coarse, b, axis=0), b, axis=1)[:rows, :cols]


def combined_score(g):
    """Equal weights; any factor at 0 makes the combined score 0; factors without data are left out."""
    total = np.zeros(g["sun_pct"].shape)
    n = np.zeros(g["sun_pct"].shape)
    veto = np.zeros(g["sun_pct"].shape, dtype=bool)
    for f in FACTORS:
        key, reject, ideal = f[0], f[4], f[5]
        v = g.get(key)
        if v is None:
            continue
        ok = np.isfinite(v)
        s = C.subscore(np.where(ok, v, reject), reject, ideal)
        total += np.where(ok, s, 0.0)
        n += ok
        veto |= ok & (s <= 0.0)
    return np.where(veto, 0.0, total / np.maximum(n, 1)), n > 0


def main():
    t0 = time.perf_counter()
    OUT.mkdir(parents=True, exist_ok=True)
    dem = Dem.from_label()
    sl, g = BS.compute_grids(dem)
    print(f"Eugenio's grids: {time.perf_counter() - t0:.1f} s, temperature {'yes' if g['temp_avg_k'] is not None else 'MISSING'}")
    h = g["elevation_m"]
    g["bowl_depth_m"] = C.disc_mean(h, BOWL_RADIUS_M / dem.scale_m) - h
    g["ice_depth_m"] = diviner_ice_depth(dem, sl)
    combined, valid = combined_score(g)

    # Each ~430 m pixel shows its best 120 m cell (highest combined score); every layer reads that same cell.
    size, px, half = GRID["size"], GRID["pixel_m"], -GRID["x_min_m"]
    col = np.floor((g["x"] + half) / px).astype(np.int64)
    row = np.floor((half - g["y"]) / px).astype(np.int64)
    ok = ((col >= 0) & (col < size))[None, :] & ((row >= 0) & (row < size))[:, None] & valid
    cell = (row[:, None] * size + col[None, :])[ok]
    order = np.lexsort((combined[ok], cell))
    cs = cell[order]
    last = np.r_[cs[1:] != cs[:-1], True]
    best = order[last]
    target = cs[last]

    layers = []
    for key, name, unit, (lo, hi), reject, ideal, source, text in FACTORS:
        v = g.get(key)
        out = np.full(size * size, 255, dtype=np.uint8)
        if v is not None:
            vals = v[ok][best]
            fin = np.isfinite(vals)
            enc = np.clip(np.rint((np.where(fin, vals, lo) - lo) / (hi - lo) * 254), 0, 254).astype(np.uint8)
            out[target[fin]] = enc[fin]
            print(f"  {key:18s} {np.nanmin(vals):9.2f} .. {np.nanmax(vals):9.2f} {unit}, no data {(~fin).sum()}")
        else:
            print(f"  {key:18s} MISSING (source file not downloaded)")
        (OUT / f"{key}.u8").write_bytes(out.tobytes())
        layers.append({"key": key, "name": name, "unit": unit, "file": f"{key}.u8", "enc_min": lo, "enc_max": hi,
                       "reject": reject, "ideal": ideal, "weight": 1, "available": v is not None,
                       "source": source, "explain": text})

    meta = {"version": 1, "note": "Demo (Chinh). Raw factor values on the docs/INTERFACES.md section 8 grid.",
            "proj": GRID["proj"], "size": size, "pixel_m": px, "x_min_m": GRID["x_min_m"], "y_max_m": GRID["y_max_m"],
            "cell": "each pixel = its 120 m cell with the best combined score; all layers from the same cell",
            "combine": "equal weights; any factor scoring 0 makes the combined score 0; missing data left out",
            "factors": layers}
    (OUT / "layers.json").write_text(json.dumps(meta, indent=1))
    print(f"done in {time.perf_counter() - t0:.1f} s -> {OUT}")


if __name__ == "__main__":
    main()
