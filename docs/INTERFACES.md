# Data contracts (owner: Eugenio, changes need his approval)

All generated files live in `web/public/data/` and are produced by `make data`.
Until real files exist, `web/src/mocks/` holds small mock files with the SAME shape.

Conventions: degrees, east-positive longitude in [-180, 180], azimuth clockwise from north in [0, 360),
UTC ISO-8601, lunar sphere radius R = 1737.4 km, frame MOON_ME (DE421).

---------------------------------------------------------------------------------------------------
## 1. sites.json  (curated by Eugenio + Kien; see docs/SITES.md for sources)

```json
{
  "version": 1,
  "sites": [
    {
      "id": "mma01",
      "name": "Malapert Massif",
      "group": "artemis",            // artemis | mission | historic
      "lat": -85.9425,
      "lon": -0.94365,
      "terrain": "dem",              // dem = horizon from LOLA DEM; flat = no terrain (outside DEM coverage)
      "has_grid": true,              // true if horizons/<id>_grid.json exists
      "note": "Artemis candidate region (representative point MMA01).",
      "source": "Wueller et al. 2026, JGR Planets, doi:10.1029/2025JE009434",
      "coords_quality": "published"  // published | approximate | verify
    }
  ]
}
```

---------------------------------------------------------------------------------------------------
## 2. ephemeris.json  (owner: Kien) — ONE file for all sites

Sun and Earth positions relative to the Moon's centre, expressed in the MOON_ME frame, hourly.
The browser turns these into topocentric altitude/azimuth for any lat/lon (docs/SCIENCE.md §2).

```json
{
  "version": 1,
  "frame": "MOON_ME_DE421",
  "source": "Skyfield, de421.bsp, moon_pa_de421_1900-2050.bpc, moon_080317.tf, pck00008.tpc; apparent positions",
  "start_utc": "2026-11-01T00:00:00Z",
  "step_s": 3600,
  "n": 27768,
  "sun_dir": [x0, y0, z0, x1, y1, z1, ...],      // unit vectors, 6 decimals, length 3n
  "sun_semidiam_deg": [r0, r1, ...],             // 4 decimals, length n
  "earth_km": [x0, y0, z0, ...]                  // Earth centre minus Moon centre, km, 1 decimal, length 3n
}
```
Time of sample i = start_utc + i * step_s. End = 2029-12-31T23:00Z.

---------------------------------------------------------------------------------------------------
## 3. horizons/<site_id>.json  (owner: Kien)

```json
{
  "version": 1,
  "site_id": "mma01",
  "lat": -85.9425,
  "lon": -0.94365,
  "surface_elev_m": 4321.0,        // DEM height above 1737.4 km sphere; 0 if flat
  "observer_h_m": 2.0,
  "az_step_deg": 0.5,
  "elev_deg": [720 numbers],       // horizon elevation angle at az = i * az_step_deg, 3 decimals
  "dem": "LDEM_75S_120M",          // or "flat"
  "max_range_km": 150
}
```

## 4. horizons/<site_id>_grid.json  (owner: Kien) — "move the lander" neighbourhood

9 x 9 grid of observers, 500 m spacing, centred on the site, in polar-stereographic x/y.
```json
{
  "version": 1, "site_id": "mma01", "spacing_m": 500, "n": 9, "observer_h_m": 2.0, "az_step_deg": 0.5,
  "points": [ { "i": 0, "j": 0, "dx_m": -2000, "dy_m": -2000, "lat": -85.95, "lon": -1.2,
                "surface_elev_m": 4300.0, "elev_deg": [720 numbers] } ]
}
```
Uses the SITE ephemeris geometry (500 m changes Sun/Earth direction by < 0.02 deg; horizon dominates).

---------------------------------------------------------------------------------------------------
## 5. TypeScript analysis API  (owner: Chinh) — web/src/lib/analysis/

```ts
export interface Ephemeris { startMs: number; stepS: number; n: number;
  sunDir: Float64Array; sunSemiDiam: Float64Array; earthKm: Float64Array; }
export interface Horizon { siteId: string; lat: number; lon: number; surfaceElevM: number;
  observerHM: number; azStepDeg: number; elevDeg: Float64Array; flat: boolean; }

export interface Series {          // all arrays length = number of samples in [startIdx, endIdx)
  startIdx: number; endIdx: number;
  sunEl: Float64Array; sunAz: Float64Array; sunMargin: Float64Array;   // margin = el - horizon(az)
  sunFrac: Float64Array;                                               // visible fraction of solar disc 0..1
  earthEl: Float64Array; earthAz: Float64Array; earthMargin: Float64Array;
  sunlit: Uint8Array;  earthVis: Uint8Array;                           // 1 if disc CENTRE above horizon
}
export function computeSeries(eph: Ephemeris, hz: Horizon, startIdx: number, endIdx: number): Series;

export interface Metrics {
  sunPct: number; earthPct: number; bothPct: number;
  longestDarkH: number; longestNoEarthH: number;
  hoursToSunset: number | null; hoursToEarthset: number | null;   // from window start; null if never in window
  hoursToSunrise: number | null; hoursToEarthrise: number | null; // only if currently set
  maxSunEl: number; meanSunElWhenLit: number;
}
export function computeMetrics(s: Series): Metrics;

export interface MissionSpec { durationH: number; minSunPct: number; minEarthPct: number;
  maxDarkH: number; requireLitAndEarthAtLanding: boolean; }
export interface DayResult { dayIdx: number; bestStartIdx: number | null; feasible: boolean;
  score: number; metrics: Metrics | null; }       // score 0..1, 0 if infeasible
export function findWindows(eph: Ephemeris, hz: Horizon, spec: MissionSpec,
  fromIdx: number, toIdx: number): DayResult[];   // one entry per UTC day
```

## 6. Power API  (owner: Ahmed) — web/src/lib/power/

```ts
export type PanelMode = "vertical_tracking" | "vertical_fixed" | "horizontal";
export interface PowerConfig { mode: PanelMode; panelAzDeg: number; areaM2: number;
  efficiency: number; batteryWh: number; loadW: number; initialSocPct: number; }
export interface PowerResult { genW: Float64Array; socWh: Float64Array; minSocPct: number;
  survived: boolean; hoursBelowZero: number; batteryNeededWh: number; energyGenWh: number; }
export function simulatePower(s: Series, cfg: PowerConfig, stepS: number): PowerResult;
```

## 7. MoonBox serial protocol  (owner: Ahmed) — Web Serial, 115200 baud, newline-terminated ASCII

```
SUN,<az_deg>,<el_deg>,<frac 0..1>
EARTH,<az_deg>,<el_deg>,<vis 0|1>
HELLO            (board replies "MOONBOX,<version>")
```
The app sends one SUN and one EARTH line per animation frame (max 20 Hz).

---------------------------------------------------------------------------------------------------
## 8. 3D terrain export  (owner: Eugenio; consumer: Ahmed's 3D view) — web/public/data/terrain/

Written by `scripts/export_terrain.py` (part of `make data`). A square 1024 x 1024 grid centred on the south pole,
half-width 220 km, in the same polar stereographic projection as docs/SCIENCE.md section 3 (lon 0 towards +y,
lon 90 E towards +x). Resampled from data/ldem_75s_120m_float.img.

- `south_pole_height.u16`: little-endian uint16, row-major, row 0 = northern edge (largest y), column 0 = smallest x.
  `height_m = height_min_m + v / 65535 * (height_max_m - height_min_m)`. 2,097,152 bytes.
- `south_pole_sun.u8` and `south_pole_earth.u8`: NASA PGDA AVGVISIB_75S_120M_201608 Sun and Earth maps resampled to
  the same grid, value = percent 0..100, 255 = no data. 1,048,576 bytes each.
- `south_pole.json`:

```json
{
  "version": 1,
  "proj": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs",
  "size": 1024,
  "pixel_m": 429.6875,
  "x_min_m": -220000.0,
  "y_max_m": 220000.0,
  "height_min_m": -5709.0,
  "height_max_m": 7018.0,
  "files": { "height": "south_pole_height.u16", "sun": "south_pole_sun.u8", "earth": "south_pole_earth.u8" },
  "sites": [ { "id": "mma01", "name": "Malapert Massif", "x_m": -2027.2, "y_m": 123071.7, "height_m": 4728.7 } ],
  "sources": [ { "name": "LOLA LDEM_75S_120M ...", "url": "https://..." } ]
}
```
`sites` has every terrain="dem" site. `x_min_m` and `y_max_m` are the outer edges of the grid; the centre of
pixel (row, col) is at `x = x_min_m + (col + 0.5) * pixel_m`, `y = y_max_m - (row + 0.5) * pixel_m`.
Site `height_m` is the full-resolution DEM height (same as `surface_elev_m` in horizons/<id>.json).
Each pixel is the mean of the source over its ~430 m footprint, so sharp ridges are smoothed: use the maps for
display, and horizons/<id>.json or docs/VALIDATION.md for per-site numbers.

---------------------------------------------------------------------------------------------------
## 9. Site terrain tiles  (owner: Eugenio; consumer: the VR view in xr/) — web/public/data/terrain/sites/<id>/

Written by `scripts/export_site_tiles.py` (part of `make data`) for every terrain="dem" site. A 512 x 512 tile at the
DEM's native 120 m per pixel (61.44 km across, about 30 km around the site), same projection as section 8. The tile is
cut on the DEM's own pixel grid, with no resampling, so the site lies within half a pixel of the tile centre
(`site.row`, `site.col`). All grids: row-major, row 0 = northern edge (largest y), column 0 = smallest x.

- `height.u16`: little-endian uint16, `height_m = height_min_m + v / 65535 * (height_max_m - height_min_m)`
  (per-tile min/max, steps of about 0.1 m). 524,288 bytes.
- `sun.u8`, `earth.u8`: NASA PGDA AVGVISIB_75S_120M_201608 Sun and Earth maps at their native 120 m pixels,
  percent 0..100, 255 = no data. 262,144 bytes each.
- `slope.u8`: slope in whole degrees from central differences of the DEM (240 m baseline), 255 = no data. 262,144 bytes.
- `far.u16`: the surroundings for the far horizon, 512 x 512 at 600 m per pixel (each the mean of 5 x 5 DEM pixels,
  +/- 153.6 km around the tile centre), encoded like `height.u16` with the `far` block's own min/max. 524,288 bytes.
- `tile.json`:

```json
{
  "version": 1,
  "site_id": "mma01",
  "proj": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs",
  "size": 512,
  "pixel_m": 120.0,
  "x_min_m": -32760.0,
  "y_max_m": 153840.0,
  "height_min_m": -2502.0,
  "height_max_m": 5173.0,
  "site": { "x_m": -2027.2, "y_m": 123071.7, "row": 255.902, "col": 255.607, "height_m": 4728.7 },
  "far": { "size": 512, "pixel_m": 600.0, "x_min_m": -155640.0, "y_max_m": 276720.0,
           "height_min_m": -5008.0, "height_max_m": 7008.0 },
  "files": { "height": "height.u16", "sun": "sun.u8", "earth": "earth.u8", "slope": "slope.u8", "far": "far.u16" },
  "sources": [ { "name": "LOLA LDEM_75S_120M ...", "url": "https://..." } ]
}
```
`x_min_m` and `y_max_m` are outer edges; the centre of pixel (row, col) is at `x = x_min_m + (col + 0.5) * pixel_m`,
`y = y_max_m - (row + 0.5) * pixel_m`. `site.row` / `site.col` are fractional pixel indices on that same convention
(an integer is a pixel centre). `site.height_m` equals `surface_elev_m` in horizons/<id>.json.

`web/src/lib/analysis/demHorizon.ts` turns these grids into a section-3 horizon at any point of the tile:
`demHorizon(tile, [southPole, siteFar], lat, lon)` returns a `Horizon` for `computeSeries`. Heights come from the
tile where it covers the sample, then from the section-8 grid, then from `far.u16`. At the 10 site centres it differs
from horizons/<id>.json by 0.003 deg on average and 0.027 deg at most (web/src/lib/analysis/demHorizon.test.ts).

---------------------------------------------------------------------------------------------------
## 10. Landing suitability  (owner: Eugenio; consumers: the "Where to land" tab and the VR view) — web/public/data/suitability/

Written by `scripts/build_suitability.py` (part of `make data`). Method and formula: docs/criteria.md; thresholds:
docs/criteria.csv (copied to `web/public/data/criteria.csv`). File names are fixed: the VR view reads them.

**Score grids** (uint8, row-major, row 0 = northern edge, column 0 = smallest x):
- `south_pole_score.u8`: 1024 x 1024 on the section-8 grid. Each ~430 m pixel shows its best 120 m cell.
- `sites/<id>_score.u8`: 512 x 512 at 120 m on the section-9 tile of each terrain="dem" site, pixel for pixel.

Value `v`: `0..100` = every hard limit passes and the suitability score is `v`; `101..201` = at least one hard
limit fails and the score is `v - 101`; `255` = no data. So `passes = v <= 100` and `score = v <= 100 ? v : v - 101`.

**Limit grids** `south_pole_limits.u8` and `sites/<id>_limits.u8`, same grids: bit flags of the hard limits that
FAIL at that cell: `1` landing slope, `2` EVA slope, `4` sunlight, `8` Earth in view, `16` more than 6 deg from the
pole; `0` = all pass; `255` = no data.

**Zones.** A zone is a connected area (8-neighbour) of 120 m cells where every hard limit passes. One 120 m cell
already holds the 100 m x 100 m landing box, and the EVA slope limit is part of the hard limits.
- `zones.csv`: one row per zone, ordered by `rank` (1 = best). Columns, all measured at the zone's best cell:

```
rank, lat, lon, x_m, y_m, area_km2, score, map_score, elevation_m, landing_slope_deg, eva_slope_deg,
eva_walkable_pct, sun_pct, earth_pct, psr_distance_km, temp_avg_k, longest_dark_h, longest_no_earth_h,
longest_sun_and_earth_h, stay_window_ok, model_sun_pct, model_earth_pct, nearest_artemis_region,
nearest_artemis_km, near_artemis
```
- `zones.geojson`: the 500 best zones as a FeatureCollection of Points, `coordinates = [lon, lat]` (lunar east
  longitude and latitude, MOON_ME), `properties` = the other zones.csv columns.
- `summary.json`: headline numbers (region and passing area, share failing each limit, zone counts, the Artemis
  comparison, Earth-Moon signal delay).

Related tables at `web/public/data/`: `criteria.csv` (parameter, kind, unit, ideal, acceptable, reject, weight_pct,
reason, source) and `missions.csv` (every lunar landing attempt; the `c_*` columns hold our criteria at the polar ones).
Every column is described in docs/DATA_DICTIONARY.md.

---------------------------------------------------------------------------------------------------
## 11. stars.json  (owner: Eugenio; consumer: the VR view in xr/) — web/public/data/stars.json

Written by `scripts/export_stars.py` (part of `make data`). Real stars for the VR sky: the 287 stars of the Yale
Bright Star Catalogue brighter than V = 3.5, and the Moon's orientation from the same kernels as the ephemeris.

```json
{
  "version": 1,
  "source": "Yale Bright Star Catalogue ...; Moon orientation: Skyfield, moon_pa_de421_1900-2050.bpc",
  "mag_limit": 3.5,
  "n_stars": 287,
  "stars": [x0, y0, z0, V0, x1, y1, z1, V1, ...],   // ICRF unit vector (J2000 catalogue position) and V magnitude
  "names": { "0": "Sirius" },                        // proper names by star index, where the catalogue has one
  "frame": "ICRF to MOON_ME_DE421",
  "start_utc": "2026-11-01T00:00:00Z",
  "step_s": 21600,
  "n": 4629,
  "quat_xyzw": [x0, y0, z0, w0, ...]                 // rotation ICRF -> MOON_ME at start_utc + i * step_s
}
```
A star's MOON_ME direction at time t is its ICRF vector rotated by the quaternion interpolated (slerp) between the
two nearest samples; alt/az then follows docs/SCIENCE.md section 2. Proper motion since J2000 and aberration
(under 0.01 deg together) are ignored: the stars are scenery, not a measurement.

---------------------------------------------------------------------------------------------------
## 11. Suitability layers and weights: "Your priorities"  (owner: Eugenio; consumers: the web app and the VR view)

Added next to the section-10 files, which are unchanged. Written by `scripts/build_suitability.py`.
The scoring code is `web/src/lib/analysis/suitability.ts` (pure TypeScript, no React, importable from `xr/`).

**Layers**, one per soft criterion, uint8, row-major, same grids and orientation as section 10:
- `suitability/layers/south_pole_<key>.u8`: 1024 x 1024 on the section-8 grid (the same 120 m cell per pixel as
  `south_pole_score.u8`).
- `suitability/layers/sites/<id>_<key>.u8`: 512 x 512 at 120 m on the section-9 tile of each terrain="dem" site.

`<key>` is one of `sunlight`, `earth`, `landing_slope`, `shadow`, `walkable`, `temperature`, `ice`, `hollow`
(the last two were added with the Layers view; they carry weight 0 in `balanced`). A value `q` is the
criterion's sub-score: `0` at its "reject" bound, `255` at its "ideal" bound, linear in between (bounds in
`weights.json`). Where `south_pole_score.u8` is 255 (no data) the layers hold 0.

**Score from weights** `W` (any non-negative numbers; only their ratios matter):

    map_score = floor( (200 * sum(W_k * q_k) + D) / (2 * D) ),   D = 255 * sum(W_k)      (integers, round half up)
    zone_score = round_half_even( (W6 / T) * map_score + (100 * W_darkness / T) * s_dark + (100 * W_no_earth / T) * s_no_earth )

with `W6` = sum of the six layer weights, `T` = `W6 + W_darkness + W_no_earth`, and `s_dark`, `s_no_earth` the
sub-scores of `longest_dark_h` and `longest_no_earth_h` (zones.csv) between the bounds in `weights.json`.
Pass / fail does not depend on the weights: take it from the section-10 score and limit grids.
With the `balanced` preset these formulas reproduce `south_pole_score.u8`, every `sites/<id>_score.u8` and the
`score`, `map_score` and order of zones.csv exactly (web/src/lib/analysis/suitability.test.ts). To make that
possible each layer value is the sub-score rounded to the nearest of 256 steps, except that in 2.65 % of cells one
to three layers are moved by a single step (0.4 % of their range).

**Tables**
- `suitability/weights.json`:

```json
{
  "version": 1,
  "layers": [ { "key": "sunlight", "label": "Sunlight", "parameter": "sun_pct", "unit": "% of time", "reject": 25.0,
                "ideal": 70.0, "file": "layers/south_pole_sunlight.u8", "site_file": "layers/sites/<id>_sunlight.u8" } ],
  "zone_terms": [ { "key": "darkness", "label": "Short nights", "column": "longest_dark_h", "unit": "h",
                    "reject": 354.0, "ideal": 85.0 } ],
  "default": "balanced",
  "presets": [ { "key": "balanced", "label": "Balanced",
                 "weights": { "sunlight": 42, "earth": 28, "landing_slope": 28, "shadow": 21, "walkable": 14,
                              "temperature": 7, "ice": 0, "hollow": 0, "darkness": 30, "no_earth": 30 } } ],
  "confirmed_zones": 4224
}
```
  Presets: `balanced` (docs/criteria.md), `power`, `radio`, `ice`.
- `suitability/zones_layers.csv`: `rank, sunlight, earth, landing_slope, shadow, walkable, temperature, ice, hollow,
  ice_depth_m, hollow_depth_m`: the layer values at each zone's best cell, in the row order of zones.csv, then the
  two newer criteria as plain values (`ice_depth_m` empty = no stable ice).
- `suitability/artemis_points.csv`: the nine Artemis points with their layer values, model numbers, and for each
  preset `score_<preset>` and `rank_<preset>` (1 + the number of confirmed zones that score higher).
- `suitability/site_values.csv`: the criteria values at every terrain="dem" site, with the zones.csv column names
  (`landing_slope_deg`, `eva_walkable_pct`, `sun_pct`, `earth_pct`, `psr_distance_km`, `temp_avg_k`,
  `longest_dark_h`, `longest_no_earth_h`, ...) plus `passes_hard_limits` and `failed_limits`.

**One scoring engine.** Everything that shows a score goes through `suitability.ts`: the zone ranking, "Your
priorities", and the Layers view of "Where to land" (`web/src/lib/analysis/factors.ts` is only an adapter: reading a
layer byte back as a value, pixel geometry, colour tokens). There is one set of rasters, `suitability/layers/`.

**"Why here?"** `web/src/lib/analysis/explain.ts` (pure TypeScript, importable from `xr/`):
`explain(valuesFromRow(row), criteriaRows)` turns a row of zones.csv or site_values.csv into one sentence per
criterion: value, verdict (`good` / `acceptable` / `rejected`), the range, and the reason from criteria.csv.
