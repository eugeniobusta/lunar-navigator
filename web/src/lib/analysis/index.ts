// Analysis API. Contract: docs/INTERFACES.md section 5. Formulas: docs/SCIENCE.md sections 2 and 4.

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

export const MOON_R_KM = 1737.4;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Local east/north/up basis and observer position (SCIENCE.md section 2). */
export function siteFrame(latDeg: number, lonDeg: number, heightKm: number) {
  const p = latDeg * D2R, l = lonDeg * D2R;
  const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l), sl = Math.sin(l);
  const up = [cp * cl, cp * sl, sp];
  const east = [-sl, cl, 0];
  const north = [-sp * cl, -sp * sl, cp];
  const pos = [heightKm * up[0], heightKm * up[1], heightKm * up[2]];
  return { up, east, north, pos };
}

/** Elevation and azimuth (deg) of vector (x, y, z) in the given frame. Azimuth clockwise from north, [0, 360). */
export function altAz(f: ReturnType<typeof siteFrame>, x: number, y: number, z: number): [number, number] {
  const len = Math.hypot(x, y, z);
  const u = (x * f.up[0] + y * f.up[1] + z * f.up[2]) / len;
  const e = x * f.east[0] + y * f.east[1] + z * f.east[2];
  const nn = x * f.north[0] + y * f.north[1] + z * f.north[2];
  const el = Math.asin(Math.max(-1, Math.min(1, u))) * R2D;
  let az = Math.atan2(e, nn) * R2D;
  if (az < 0) az += 360;
  if (az >= 360) az -= 360;
  return [el, az];
}

/** Horizon elevation at azimuth az (deg), linear interpolation with wrap at 360. */
export function horizonAt(hz: Horizon, az: number): number {
  if (hz.flat) return 0;
  const n = hz.elevDeg.length;
  const x = (((az % 360) + 360) % 360) / hz.azStepDeg;
  const i0 = Math.floor(x) % n;
  const i1 = (i0 + 1) % n;
  const t = x - Math.floor(x);
  return hz.elevDeg[i0] * (1 - t) + hz.elevDeg[i1] * t;
}

/** Visible fraction of a disc of angular radius r whose centre is m above a flat horizon (SCIENCE.md section 4). */
export function discFraction(m: number, r: number): number {
  const d = m / r;
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

export function computeSeries(eph: Ephemeris, hz: Horizon, startIdx: number, endIdx: number): Series {
  const lo = Math.max(0, startIdx), hi = Math.min(eph.n, endIdx);
  const len = Math.max(0, hi - lo);
  const s: Series = {
    startIdx: lo, endIdx: lo + len,
    sunEl: new Float64Array(len), sunAz: new Float64Array(len), sunMargin: new Float64Array(len),
    sunFrac: new Float64Array(len),
    earthEl: new Float64Array(len), earthAz: new Float64Array(len), earthMargin: new Float64Array(len),
    sunlit: new Uint8Array(len), earthVis: new Uint8Array(len),
  };
  const hKm = MOON_R_KM + (hz.surfaceElevM + hz.observerHM) / 1000;
  const f = siteFrame(hz.lat, hz.lon, hKm);
  for (let k = 0; k < len; k++) {
    const i = lo + k;
    // Sun: direction only (surface parallax < 0.001 deg).
    const [se, sa] = altAz(f, eph.sunDir[3 * i], eph.sunDir[3 * i + 1], eph.sunDir[3 * i + 2]);
    const sm = se - horizonAt(hz, sa);
    s.sunEl[k] = se; s.sunAz[k] = sa; s.sunMargin[k] = sm;
    s.sunFrac[k] = discFraction(sm, eph.sunSemiDiam[i]);
    s.sunlit[k] = sm > 0 ? 1 : 0;
    // Earth: topocentric vector, parallax included.
    const ex = eph.earthKm[3 * i] - f.pos[0], ey = eph.earthKm[3 * i + 1] - f.pos[1], ez = eph.earthKm[3 * i + 2] - f.pos[2];
    const [ee, ea] = altAz(f, ex, ey, ez);
    const em = ee - horizonAt(hz, ea);
    s.earthEl[k] = ee; s.earthAz[k] = ea; s.earthMargin[k] = em;
    s.earthVis[k] = em > 0 ? 1 : 0;
  }
  return s;
}

function longestRun(a: Uint8Array, value: number, from = 0, to = a.length): number {
  let best = 0, cur = 0;
  for (let i = from; i < to; i++) {
    if (a[i] === value) { cur++; if (cur > best) best = cur; } else cur = 0;
  }
  return best;
}

function firstIndex(a: Uint8Array, value: number, from = 0, to = a.length): number {
  for (let i = from; i < to; i++) if (a[i] === value) return i;
  return -1;
}

/**
 * Metrics over a whole Series. stepH is the sample spacing in hours (the contract's ephemeris is hourly);
 * it is a trailing optional argument so the INTERFACES.md signature computeMetrics(s) still works.
 */
export function computeMetrics(s: Series, stepH = 1): Metrics {
  const n = s.sunlit.length;
  let lit = 0, earth = 0, both = 0, maxEl = -90, elSum = 0;
  for (let i = 0; i < n; i++) {
    lit += s.sunlit[i]; earth += s.earthVis[i]; both += s.sunlit[i] & s.earthVis[i];
    if (s.sunEl[i] > maxEl) maxEl = s.sunEl[i];
    if (s.sunlit[i]) elSum += s.sunEl[i];
  }
  const pct = (x: number) => (n ? (100 * x) / n : 0);
  const hoursTo = (a: Uint8Array, target: number) => {
    const j = firstIndex(a, target, 1);
    return j < 0 ? null : j * stepH;
  };
  const litNow = n > 0 && s.sunlit[0] === 1;
  const earthNow = n > 0 && s.earthVis[0] === 1;
  return {
    sunPct: pct(lit), earthPct: pct(earth), bothPct: pct(both),
    longestDarkH: longestRun(s.sunlit, 0) * stepH,
    longestNoEarthH: longestRun(s.earthVis, 0) * stepH,
    hoursToSunset: litNow ? hoursTo(s.sunlit, 0) : null,
    hoursToEarthset: earthNow ? hoursTo(s.earthVis, 0) : null,
    hoursToSunrise: n > 0 && !litNow ? hoursTo(s.sunlit, 1) : null,
    hoursToEarthrise: n > 0 && !earthNow ? hoursTo(s.earthVis, 1) : null,
    maxSunEl: n ? maxEl : 0,
    meanSunElWhenLit: lit ? elSum / lit : 0,
  };
}

/** The part of a Series from local index a (inclusive) to b (exclusive). Views, no copies. */
export function sliceSeries(s: Series, a: number, b: number): Series {
  return {
    startIdx: s.startIdx + a, endIdx: s.startIdx + b,
    sunEl: s.sunEl.subarray(a, b), sunAz: s.sunAz.subarray(a, b), sunMargin: s.sunMargin.subarray(a, b),
    sunFrac: s.sunFrac.subarray(a, b),
    earthEl: s.earthEl.subarray(a, b), earthAz: s.earthAz.subarray(a, b), earthMargin: s.earthMargin.subarray(a, b),
    sunlit: s.sunlit.subarray(a, b), earthVis: s.earthVis.subarray(a, b),
  };
}


// Window Finder: prefix sums + sparse table, safety-margin score. See windows.ts.
export { MISSION_PRESETS, buildRunIndex, buildWindowIndex, findWindows, longestRunIn, scanDays, windowScore } from "./windows";
export type { RunIndex, WindowIndex } from "./windows";
