// Window Finder (docs/INTERFACES.md section 5). For every UTC day, find the landing hour whose whole mission
// window [t, t + D) meets a MissionSpec, and score how much safety margin it has.
//
// Speed: each candidate start hour is answered in O(1).
//  - Prefix sums give the number of sunlit / Earth-visible hours in any window with one subtraction.
//  - "Longest darkness inside the window" uses the list of maximal dark runs plus a sparse table
//    (range-maximum query) over their lengths: the two runs at the window edges are clipped by hand,
//    the full runs in between come from the sparse table. Built once per site in O(n + m log m).
// A brute-force twin in windows.test.ts must agree exactly on random series and on the real data.

import { computeMetrics, computeSeries, sliceSeries, type DayResult, type Ephemeris, type Horizon,
  type MissionSpec, type Series } from "./index";

/** Mission presets from the team brief. Thresholds are planning assumptions, not official mission requirements. */
export const MISSION_PRESETS: { id: string; name: string; spec: MissionSpec }[] = [
  { id: "artemis", name: "Artemis-like stay (6.5 days)",
    spec: { durationH: 156, minSunPct: 90, minEarthPct: 50, maxDarkH: 12, requireLitAndEarthAtLanding: true } },
  { id: "clps", name: "CLPS 10-day robotic",
    spec: { durationH: 240, minSunPct: 70, minEarthPct: 50, maxDarkH: 48, requireLitAndEarthAtLanding: true } },
  { id: "night", name: "Survive a night (14 days)",
    spec: { durationH: 336, minSunPct: 40, minEarthPct: 30, maxDarkH: 120, requireLitAndEarthAtLanding: true } },
];

// ---------------------------------------------------------------------------------------------------
// Longest run of zeros inside any window, in O(1) per query.

/** Maximal runs of 0 in a 0/1 array, with lookup tables for O(1) "longest run inside [L, R)". */
export interface RunIndex {
  /** Number of runs. */
  m: number;
  /** Run r covers samples [start[r], end[r]). */
  start: Int32Array; end: Int32Array;
  /** firstEndingAfter[h] = first run with end > h (m if none). Length n + 1. */
  firstEndingAfter: Int32Array;
  /** lastStartingBefore[h] = last run with start < h (-1 if none). Length n + 1. */
  lastStartingBefore: Int32Array;
  /** Sparse table: table[k][r] = max run length over runs r .. r + 2^k - 1. */
  table: Int32Array[];
  /** log2floor[x] for x in 1..m. */
  log2floor: Uint8Array;
}

export function buildRunIndex(a: Uint8Array): RunIndex {
  const n = a.length;
  // Count runs first so the arrays are allocated once.
  let m = 0;
  for (let i = 0; i < n; i++) if (a[i] === 0 && (i === 0 || a[i - 1] !== 0)) m++;
  const start = new Int32Array(m), end = new Int32Array(m);
  let r = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] !== 0) continue;
    if (i === 0 || a[i - 1] !== 0) start[r] = i;
    if (i === n - 1 || a[i + 1] !== 0) end[r++] = i + 1;
  }

  const firstEndingAfter = new Int32Array(n + 1);
  for (let h = n, k = m; h >= 0; h--) {
    while (k > 0 && end[k - 1] > h) k--;
    firstEndingAfter[h] = k; // first run index with end > h
  }
  const lastStartingBefore = new Int32Array(n + 1);
  for (let h = 0, k = -1; h <= n; h++) {
    while (k + 1 < m && start[k + 1] < h) k++;
    lastStartingBefore[h] = k;
  }

  const log2floor = new Uint8Array(m + 1);
  for (let x = 2; x <= m; x++) log2floor[x] = log2floor[x >> 1] + 1;
  const table: Int32Array[] = [];
  const t0 = new Int32Array(m);
  for (let i = 0; i < m; i++) t0[i] = end[i] - start[i];
  table.push(t0);
  for (let k = 1; (1 << k) <= m; k++) {
    const prev = table[k - 1], half = 1 << (k - 1), size = m - (1 << k) + 1;
    const t = new Int32Array(size);
    for (let i = 0; i < size; i++) t[i] = prev[i] > prev[i + half] ? prev[i] : prev[i + half];
    table.push(t);
  }
  return { m, start, end, firstEndingAfter, lastStartingBefore, table, log2floor };
}

/** Longest run of zeros fully or partly inside samples [L, R), clipped to the window. O(1). */
export function longestRunIn(ri: RunIndex, L: number, R: number): number {
  if (R <= L) return 0;
  const a = ri.firstEndingAfter[L];      // first run that reaches into the window
  const b = ri.lastStartingBefore[R];    // last run that starts inside the window
  if (a >= ri.m || b < 0 || a > b) return 0;
  const clipA = Math.min(ri.end[a], R) - Math.max(ri.start[a], L);
  if (a === b) return clipA;
  const clipB = Math.min(ri.end[b], R) - Math.max(ri.start[b], L);
  let best = clipA > clipB ? clipA : clipB;
  if (b - a >= 2) { // runs a+1 .. b-1 lie fully inside: sparse-table range maximum
    const lo = a + 1, hi = b - 1, k = ri.log2floor[hi - lo + 1], t = ri.table[k];
    const mid = t[lo] > t[hi - (1 << k) + 1] ? t[lo] : t[hi - (1 << k) + 1];
    if (mid > best) best = mid;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------
// Scoring.

/**
 * Safety-margin score of a window that meets every constraint, 0..1.
 * Each constraint's margin is how far the window beats it, normalised to 0..1:
 *   sun   = (sunPct − minSunPct) / (100 − minSunPct)
 *   earth = (earthPct − minEarthPct) / (100 − minEarthPct)
 *   dark  = (maxDarkH − longestDarkH) / maxDarkH
 * score = mean of the three. 0 = only just passes, 1 = full sunlight, Earth always up, no darkness.
 * A threshold that cannot be beaten (min 100 %, max dark 0 h) counts as margin 1 once it is met.
 * In one sentence: "the score is how much slack the best landing hour has before any requirement breaks".
 */
export function windowScore(spec: MissionSpec, sunPct: number, earthPct: number, longestDarkH: number): number {
  const sunM = spec.minSunPct >= 100 ? 1 : (sunPct - spec.minSunPct) / (100 - spec.minSunPct);
  const earthM = spec.minEarthPct >= 100 ? 1 : (earthPct - spec.minEarthPct) / (100 - spec.minEarthPct);
  const darkM = spec.maxDarkH <= 0 ? 1 : (spec.maxDarkH - longestDarkH) / spec.maxDarkH;
  const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  return (clamp(sunM) + clamp(earthM) + clamp(darkM)) / 3;
}

// ---------------------------------------------------------------------------------------------------
// The Window Finder.

/** Prefix sums and run index for one site's series. Reusable for any mission length. */
export interface WindowIndex {
  series: Series;
  sunPrefix: Int32Array; earthPrefix: Int32Array;
  dark: RunIndex;
}

export function buildWindowIndex(series: Series): WindowIndex {
  const len = series.sunlit.length;
  const sunPrefix = new Int32Array(len + 1), earthPrefix = new Int32Array(len + 1);
  for (let i = 0; i < len; i++) {
    sunPrefix[i + 1] = sunPrefix[i] + series.sunlit[i];
    earthPrefix[i + 1] = earthPrefix[i] + series.earthVis[i];
  }
  return { series, sunPrefix, earthPrefix, dark: buildRunIndex(series.sunlit) };
}

/**
 * For each UTC day in [fromIdx, toIdx), try every landing hour that day and keep the best mission window
 * of spec.durationH (highest score; earliest hour on a tie). Days whose windows would run past the end of
 * the ephemeris are returned as infeasible with bestStartIdx = null.
 */
export function findWindows(eph: Ephemeris, hz: Horizon, spec: MissionSpec,
  fromIdx: number, toIdx: number): DayResult[] {
  const stepH = eph.stepS / 3600;
  const w = Math.max(1, Math.round(spec.durationH / stepH));
  const lo = Math.max(0, fromIdx), hi = Math.min(eph.n, toIdx);
  if (hi <= lo) return [];
  const ix = buildWindowIndex(computeSeries(eph, hz, lo, Math.min(eph.n, hi + w)));
  return scanDays(eph, ix, spec, lo, hi, w, stepH);
}

/** The per-day scan, split out so callers that already hold a WindowIndex (worker, grid) can reuse it. */
export function scanDays(eph: Ephemeris, ix: WindowIndex, spec: MissionSpec,
  lo: number, hi: number, w: number, stepH: number): DayResult[] {
  const s = ix.series, ps = ix.sunPrefix, pe = ix.earthPrefix;
  const len = s.sunlit.length;
  const base = s.startIdx; // ephemeris index of local sample 0
  const stepMs = eph.stepS * 1000;
  const dayOf = (i: number) => Math.floor((eph.startMs + i * stepMs) / 86400000);
  const out: DayResult[] = [];
  let k = lo - base;
  const kEnd = hi - base;
  while (k < kEnd) {
    const day = dayOf(base + k);
    const dayIdx = Math.floor(((base + k) * eph.stepS) / 86400);
    let bestScore = -1, bestLocal = -1;
    let j = k;
    for (; j < kEnd && dayOf(base + j) === day; j++) {
      if (j + w > len) continue; // window would run past the data
      if (spec.requireLitAndEarthAtLanding && !(s.sunlit[j] && s.earthVis[j])) continue;
      const sunPct = (100 * (ps[j + w] - ps[j])) / w;
      if (sunPct < spec.minSunPct) continue;
      const earthPct = (100 * (pe[j + w] - pe[j])) / w;
      if (earthPct < spec.minEarthPct) continue;
      const darkH = longestRunIn(ix.dark, j, j + w) * stepH;
      if (darkH > spec.maxDarkH) continue;
      const score = windowScore(spec, sunPct, earthPct, darkH);
      if (score > bestScore) { bestScore = score; bestLocal = j; }
    }
    out.push(bestLocal < 0
      ? { dayIdx, bestStartIdx: null, feasible: false, score: 0, metrics: null }
      : { dayIdx, bestStartIdx: base + bestLocal, feasible: true, score: bestScore,
          metrics: computeMetrics(sliceSeries(s, bestLocal, bestLocal + w), stepH) });
    k = j;
  }
  return out;
}
