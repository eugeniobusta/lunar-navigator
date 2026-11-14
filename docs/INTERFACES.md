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
