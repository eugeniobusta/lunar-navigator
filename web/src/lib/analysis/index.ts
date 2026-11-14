// Analysis API (owner: Chinh). Contract: docs/INTERFACES.md section 5. Do not change these types
// without the lead. Implementations replace the stubs below.

export interface Ephemeris {
  startMs: number; stepS: number; n: number;
  sunDir: Float64Array; sunSemiDiam: Float64Array; earthKm: Float64Array;
}

export interface Horizon {
  siteId: string; lat: number; lon: number; surfaceElevM: number;
  observerHM: number; azStepDeg: number; elevDeg: Float64Array; flat: boolean;
}

/** All arrays have length endIdx - startIdx. margin = elevation minus horizon(az). */
export interface Series {
  startIdx: number; endIdx: number;
  sunEl: Float64Array; sunAz: Float64Array; sunMargin: Float64Array;
  /** Visible fraction of the solar disc, 0..1. */
  sunFrac: Float64Array;
  earthEl: Float64Array; earthAz: Float64Array; earthMargin: Float64Array;
  /** 1 if the disc CENTRE is above the horizon. */
  sunlit: Uint8Array; earthVis: Uint8Array;
}

export interface Metrics {
  sunPct: number; earthPct: number; bothPct: number;
  longestDarkH: number; longestNoEarthH: number;
  /** Hours from window start; null if it never happens in the window. */
  hoursToSunset: number | null; hoursToEarthset: number | null;
  /** Only set if currently below the horizon. */
  hoursToSunrise: number | null; hoursToEarthrise: number | null;
  maxSunEl: number; meanSunElWhenLit: number;
}

export interface MissionSpec {
  durationH: number; minSunPct: number; minEarthPct: number;
  maxDarkH: number; requireLitAndEarthAtLanding: boolean;
}

/** One entry per UTC day. score is 0..1, and 0 if infeasible. */
export interface DayResult {
  dayIdx: number; bestStartIdx: number | null; feasible: boolean;
  score: number; metrics: Metrics | null;
}

export function computeSeries(_eph: Ephemeris, _hz: Horizon, _startIdx: number, _endIdx: number): Series {
  throw new Error("not implemented");
}

export function computeMetrics(_s: Series): Metrics {
  throw new Error("not implemented");
}

export function findWindows(_eph: Ephemeris, _hz: Horizon, _spec: MissionSpec,
  _fromIdx: number, _toIdx: number): DayResult[] {
  throw new Error("not implemented");
}
