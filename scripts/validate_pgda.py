"""Long-run illumination and Earth visibility at the Artemis sites versus the NASA PGDA maps
AVGVISIB_75S_120M_201608(.TIF / _EARTH.TIF). Prints table 4 of docs/VALIDATION.md.

Builds its own ephemeris in memory (2009-01-01 to 2028-12-31, every 6 h, same method as build_ephemeris);
nothing is written to web/public/data. Needs make download. Run: uv run python scripts/validate_pgda.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import ephem, topo, visibility
from engine.dem import Dem
from engine.horizon import horizon

DATA = ROOT / "data"
SITES = ROOT / "web" / "public" / "data" / "sites.json"
HORIZONS = ROOT / "web" / "public" / "data" / "horizons"
SUN_TIF = DATA / "AVGVISIB_75S_120M_201608.TIF"
EARTH_TIF = DATA / "AVGVISIB_75S_120M_201608_EARTH.TIF"
START, STEP_S, N = (2009, 1, 1), 6 * 3600, 7305 * 4  # 20 years to 2028-12-31T18:00Z
EARTH_R_KM = 6378.137


class PgdaMap:
    def __init__(self, path, verbose=True):
        with rasterio.open(path) as ds:
            self.scale, self.offset, self.nodata = ds.scales[0], ds.offsets[0], ds.nodata
            self.transform = ds.transform
            self.dn = ds.read(1)
            if verbose:
                print(f"{path.name}: {ds.width}x{ds.height} {ds.dtypes[0]}, scale {self.scale}, offset {self.offset}, "
                      f"nodata {self.nodata}, pixel {ds.transform.a} m, origin ({ds.transform.c}, {ds.transform.f}), "
                      f"DN {self.dn.min()}..{self.dn.max()}, nodata pixels {(self.dn == self.nodata).sum()}")

    def percent(self, x, y, half=0):
        """Map value in % at stereographic x/y (m): the pixel containing the point, or (min, max) of a window."""
        col, row = ~self.transform * (x, y)
        r, c = int(np.floor(row)), int(np.floor(col))
        win = self.dn[r - half:r + half + 1, c - half:c + half + 1].astype(float)
        win[win == self.nodata] = np.nan
        pct = 100.0 * (win * self.scale + self.offset)
        return float(pct[0, 0]) if half == 0 else (float(np.nanmin(pct)), float(np.nanmax(pct)))


def long_run(hz, sun_dir, semi, earth_km):
    """Our long-run percentages for one horizon dict."""
    s = visibility.series(hz, sun_dir, earth_km)
    height_km = topo.MOON_R_KM + (hz["surface_elev_m"] + hz["observer_h_m"]) / 1000.0
    up, _, _ = topo.site_basis(hz["lat"], hz["lon"])
    earth_semi = np.degrees(np.arcsin(EARTH_R_KM / np.linalg.norm(earth_km - height_km * up, axis=1)))
    return {"sun_centre": 100.0 * (s["sunMargin"] > 0).mean(),
            "sun_disc": 100.0 * visibility.disc_fraction(s["sunMargin"], semi).mean(),
            "earth_centre": 100.0 * (s["earthMargin"] > 0).mean(),
            "earth_any": 100.0 * (s["earthMargin"] > -earth_semi).mean()}


def main():
    ts, eph, _, frame = ephem.load_kernels()
    t = ephem.hourly_times(ts, START, N, STEP_S)
    print(f"long-run ephemeris: {t[0].utc_iso()} .. {t[-1].utc_iso()}, {N} samples every {STEP_S // 3600} h")
    sun_dir, semi, earth_km = ephem.moon_me_vectors(eph, frame, t)
    sun_map, earth_map = PgdaMap(SUN_TIF), PgdaMap(EARTH_TIF)
    dem = Dem.from_label()

    rows = []
    for s in json.loads(SITES.read_text())["sites"]:
        if s["group"] != "artemis":
            continue
        hz = json.loads((HORIZONS / f"{s['id']}.json").read_text())
        ours = long_run(hz, sun_dir, semi, earth_km)
        x, y = dem.xy(s["lat"], s["lon"])
        # Same site with the observer on the surface (PGDA's maps are for the surface, ours for a 2 m mast).
        elev0, surf0 = horizon(dem, s["lat"], s["lon"], observer_h_m=0.0)
        ground = long_run({**hz, "observer_h_m": 0.0, "surface_elev_m": surf0, "elev_deg": elev0},
                          sun_dir, semi, earth_km)
        rows.append({"id": s["id"], **ours, "pgda_sun": sun_map.percent(x, y), "pgda_earth": earth_map.percent(x, y),
                     "pgda_sun_3x3": sun_map.percent(x, y, 1), "pgda_earth_3x3": earth_map.percent(x, y, 1),
                     "pgda_sun_1km": sun_map.percent(x, y, 4), "ground_sun_disc": ground["sun_disc"],
                     "ground_earth_any": ground["earth_any"]})

    print("\nTable 4 (centre-of-disc, as the app counts it; Diff = ours - PGDA, percentage points)")
    print("| Site | Our Sun % | PGDA Sun % | Diff | Our Earth % | PGDA Earth % | Diff |")
    print("|------|-----------|------------|------|-------------|--------------|------|")
    for r in rows:
        print(f"| {r['id']} | {r['sun_centre']:.1f} | {r['pgda_sun']:.1f} | {r['sun_centre'] - r['pgda_sun']:+.1f} | "
              f"{r['earth_centre']:.1f} | {r['pgda_earth']:.1f} | {r['earth_centre'] - r['pgda_earth']:+.1f} |")
    print("\nLike-for-like (PGDA's definitions: mean visible fraction of the solar disc; any part of Earth visible)")
    print("| Site | Our Sun disc % | PGDA Sun % | Diff | Our Earth any-part % | PGDA Earth % | Diff | "
          "PGDA Sun 3x3 px min-max | PGDA Sun within 480 m min-max | PGDA Earth 3x3 px min-max | "
          "Ours at 0 m: Sun disc / Earth any |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['id']} | {r['sun_disc']:.1f} | {r['pgda_sun']:.1f} | {r['sun_disc'] - r['pgda_sun']:+.1f} | "
              f"{r['earth_any']:.1f} | {r['pgda_earth']:.1f} | {r['earth_any'] - r['pgda_earth']:+.1f} | "
              f"{r['pgda_sun_3x3'][0]:.1f}-{r['pgda_sun_3x3'][1]:.1f} | "
              f"{r['pgda_sun_1km'][0]:.1f}-{r['pgda_sun_1km'][1]:.1f} | "
              f"{r['pgda_earth_3x3'][0]:.1f}-{r['pgda_earth_3x3'][1]:.1f} | "
              f"{r['ground_sun_disc']:.1f} / {r['ground_earth_any']:.1f} |")
    flagged = [r["id"] for r in rows
               if abs(r["sun_disc"] - r["pgda_sun"]) > 10 or abs(r["earth_any"] - r["pgda_earth"]) > 10]
    print("\nSites differing by more than 10 points (like-for-like):", flagged or "none")


if __name__ == "__main__":
    main()
