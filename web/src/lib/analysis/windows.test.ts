// Window Finder tests: hand-made cases, a brute-force twin that must agree EXACTLY, real data, and a benchmark.
import { describe, expect, it } from "vitest";
import {
  MISSION_PRESETS, buildRunIndex, buildWindowIndex, computeMetrics, computeSeries, findWindows, longestRunIn,
  scanDays, sliceSeries, windowScore, type DayResult, type Ephemeris, type Horizon, type MissionSpec, type Series,
} from ".";
import { parseEphemeris, parseHorizon } from "../data";
import ephFile from "../../../public/data/ephemeris.json";

// ---------------------------------------------------------------------------------------------------
// Helpers

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random 0/1 series made of runs, like real lighting (long blocks, not coin flips). */
function runsArray(n: number, rand: () => number, pOne: number, meanRun: number): Uint8Array {
  const a = new Uint8Array(n);
  let i = 0;
  while (i < n) {
    const v = rand() < pOne ? 1 : 0;
    const len = 1 + Math.floor(rand() * 2 * meanRun);
    for (let k = 0; k < len && i < n; k++) a[i++] = v;
  }
  return a;
}

function fakeSeries(sunlit: Uint8Array, earthVis: Uint8Array, startIdx = 0): Series {
  const n = sunlit.length, z = () => new Float64Array(n);
  return { startIdx, endIdx: startIdx + n, sunEl: z(), sunAz: z(), sunMargin: z(), sunFrac: z(),
    earthEl: z(), earthAz: z(), earthMargin: z(), sunlit, earthVis };
}

/** Obvious O(n) longest run of zeros in [L, R). */
function bruteLongest(a: Uint8Array, L: number, R: number): number {
  let best = 0, cur = 0;
  for (let i = L; i < R; i++) { if (a[i] === 0) { cur++; if (cur > best) best = cur; } else cur = 0; }
  return best;
}

/** Brute-force Window Finder: same rules as scanDays, written the slow, obvious way with its own score formula. */
function bruteDays(eph: Ephemeris, s: Series, spec: MissionSpec, lo: number, hi: number): DayResult[] {
  const stepH = eph.stepS / 3600;
  const w = Math.max(1, Math.round(spec.durationH / stepH));
  const dayOf = (i: number) => Math.floor((eph.startMs + i * eph.stepS * 1000) / 86400000);
  const out: DayResult[] = [];
  let i = lo;
  while (i < hi) {
    const day = dayOf(i), dayIdx = Math.floor((i * eph.stepS) / 86400);
    let best: DayResult = { dayIdx, bestStartIdx: null, feasible: false, score: 0, metrics: null };
    let bestScore = -1;
    for (; i < hi && dayOf(i) === day; i++) {
      const j = i - s.startIdx;
      if (j + w > s.sunlit.length) continue;
      let lit = 0, earth = 0;
      for (let k = j; k < j + w; k++) { lit += s.sunlit[k]; earth += s.earthVis[k]; }
      const sunPct = (100 * lit) / w, earthPct = (100 * earth) / w;
      const darkH = bruteLongest(s.sunlit, j, j + w) * stepH;
      const ok = sunPct >= spec.minSunPct && earthPct >= spec.minEarthPct && darkH <= spec.maxDarkH &&
        (!spec.requireLitAndEarthAtLanding || (s.sunlit[j] === 1 && s.earthVis[j] === 1));
      if (!ok) continue;
      const m = (v: number, min: number) => (min >= 100 ? 1 : Math.min(1, Math.max(0, (v - min) / (100 - min))));
      const d = spec.maxDarkH <= 0 ? 1 : Math.min(1, Math.max(0, (spec.maxDarkH - darkH) / spec.maxDarkH));
      const score = (m(sunPct, spec.minSunPct) + m(earthPct, spec.minEarthPct) + d) / 3;
      if (score > bestScore) {
        bestScore = score;
        best = { dayIdx, bestStartIdx: i, feasible: true, score,
          metrics: computeMetrics(sliceSeries(s, j, j + w), stepH) };
      }
    }
    out.push(best);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------

describe("longestRunIn (sparse table + edge clipping)", () => {
  //                       0 1 2 3 4 5 6 7 8 9 10 11 12 13
  const a = Uint8Array.from([1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1]);
  const ri = buildRunIndex(a);
  it("finds the maximal dark runs", () => {
    expect([...ri.start]).toEqual([2, 6, 9]);
    expect([...ri.end]).toEqual([5, 8, 13]);
  });
  it("clips runs at both window edges (worked example from the brief)", () => {
    expect(longestRunIn(ri, 4, 11)).toBe(2);   // [4,5)=1, [6,8)=2, [9,11)=2
    expect(longestRunIn(ri, 0, 14)).toBe(4);
    expect(longestRunIn(ri, 3, 4)).toBe(1);    // inside one run
    expect(longestRunIn(ri, 0, 2)).toBe(0);    // all lit
    expect(longestRunIn(ri, 5, 5)).toBe(0);    // empty window
  });
  it("handles all-dark and all-lit arrays", () => {
    expect(longestRunIn(buildRunIndex(new Uint8Array(50)), 7, 40)).toBe(33);
    expect(longestRunIn(buildRunIndex(new Uint8Array(50).fill(1)), 0, 50)).toBe(0);
  });
  it("matches brute force on every window of 300 random arrays", () => {
    const rand = rng(1);
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rand() * 60);
      const arr = runsArray(n, rand, 0.5, 1 + rand() * 6);
      const idx = buildRunIndex(arr);
      for (let L = 0; L <= n; L++) for (let R = L; R <= n; R++) {
        if (longestRunIn(idx, L, R) !== bruteLongest(arr, L, R)) throw new Error(`mismatch n=${n} L=${L} R=${R}`);
      }
    }
  });
});

describe("windowScore (safety margin)", () => {
  const spec: MissionSpec = { durationH: 156, minSunPct: 90, minEarthPct: 50, maxDarkH: 12, requireLitAndEarthAtLanding: true };
  it("is 1 for a perfect window and 0 when every constraint is only just met", () => {
    expect(windowScore(spec, 100, 100, 0)).toBe(1);
    expect(windowScore(spec, 90, 50, 12)).toBe(0);
  });
  it("averages the three normalised margins", () => {
    // sun (95-90)/10 = 0.5, earth (75-50)/50 = 0.5, dark (12-6)/12 = 0.5
    expect(windowScore(spec, 95, 75, 6)).toBeCloseTo(0.5, 12);
    // sun 0.1, earth 1, dark 1 -> 0.7: the brief's example of a window that is close to failing on sunlight
    expect(windowScore(spec, 91, 100, 0)).toBeCloseTo(0.7, 12);
  });
  it("treats thresholds that cannot be beaten as margin 1", () => {
    expect(windowScore({ ...spec, minSunPct: 100, minEarthPct: 100, maxDarkH: 0 }, 100, 100, 0)).toBe(1);
  });
});

describe("findWindows equals the brute-force twin", () => {
  it("on 200 random series, specs, day offsets and step sizes", () => {
    const rand = rng(42);
    for (let t = 0; t < 200; t++) {
      const stepS = [3600, 1800, 7200][t % 3];
      const n = 24 * 3 + Math.floor(rand() * 24 * 12);
      const startMs = Date.parse("2026-11-01T00:00:00Z") + Math.floor(rand() * 24) * 3600000;
      const eph = { startMs, stepS, n } as Ephemeris;
      const s = fakeSeries(runsArray(n, rand, 0.6, 1 + rand() * 30), runsArray(n, rand, 0.6, 1 + rand() * 30));
      const spec: MissionSpec = {
        durationH: 1 + Math.floor(rand() * 72), minSunPct: Math.floor(rand() * 101), minEarthPct: Math.floor(rand() * 101),
        maxDarkH: Math.floor(rand() * 40), requireLitAndEarthAtLanding: rand() < 0.5,
      };
      const lo = Math.floor(rand() * n * 0.3), hi = lo + Math.floor(rand() * (n - lo)) + 1;
      const w = Math.max(1, Math.round(spec.durationH / (stepS / 3600)));
      const fast = scanDays(eph, buildWindowIndex(s), spec, lo, Math.min(hi, n), w, stepS / 3600);
      expect(fast).toEqual(bruteDays(eph, s, spec, lo, Math.min(hi, n)));
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Real data (Kien's ephemeris + LOLA horizons committed in public/data).

const hzFiles = import.meta.glob("../../../public/data/horizons/*.json", { eager: true, import: "default" });
const horizons: Record<string, Horizon> = {};
for (const f of Object.values(hzFiles)) {
  const h = parseHorizon(f as Parameters<typeof parseHorizon>[0]);
  horizons[h.siteId] = h;
}
const eph = parseEphemeris(ephFile);

describe("findWindows on the real data", () => {
  it.each(["mma01", "nr107", "hw02"])("matches brute force for every preset over all 3 years at %s", (id) => {
    const s = computeSeries(eph, horizons[id], 0, eph.n);
    for (const p of MISSION_PRESETS) {
      expect(findWindows(eph, horizons[id], p.spec, 0, eph.n)).toEqual(bruteDays(eph, s, p.spec, 0, eph.n));
    }
  });

  it("marks the last days infeasible when the mission would run past the ephemeris", () => {
    const days = findWindows(eph, horizons.mma01, MISSION_PRESETS[2].spec, eph.n - 24 * 5, eph.n);
    expect(days.length).toBe(5);
    expect(days.every((d) => !d.feasible && d.bestStartIdx === null)).toBe(true);
  });

  it("benchmark: 15 sites x 2 years under 300 ms (printed; asserted loosely for slow CI machines)", () => {
    const ids = Object.keys(horizons).sort();
    const sites = Array.from({ length: 15 }, (_, i) => horizons[ids[i % ids.length]]);
    const twoYears = 2 * 365 * 24;
    findWindows(eph, sites[0], MISSION_PRESETS[0].spec, 0, twoYears); // warm up the JIT
    const t0 = performance.now();
    let feasible = 0;
    for (const hz of sites) feasible += findWindows(eph, hz, MISSION_PRESETS[0].spec, 0, twoYears).filter((d) => d.feasible).length;
    const fastMs = performance.now() - t0;

    const t1 = performance.now();
    const s = computeSeries(eph, sites[0], 0, twoYears + 156);
    bruteDays(eph, s, MISSION_PRESETS[0].spec, 0, twoYears);
    const bruteOneSiteMs = performance.now() - t1;
    console.log(`[bench] Window Finder 15 sites x 2 years: ${fastMs.toFixed(0)} ms (${feasible} feasible site-days); ` +
      `brute force, 1 site: ${bruteOneSiteMs.toFixed(0)} ms -> ~${(bruteOneSiteMs * 15).toFixed(0)} ms for 15`);
    expect(fastMs).toBeLessThan(1500);
  });
});
