import { describe, expect, it } from "vitest";
import {
  altAz, computeMetrics, computeSeries, discFraction, findWindows, horizonAt, siteFrame,
  type Ephemeris, type Horizon, type Series,
} from ".";

const flat = (lat: number, lon: number): Horizon => ({
  siteId: "t", lat, lon, surfaceElevM: 0, observerHM: 0, azStepDeg: 0.5, elevDeg: new Float64Array(720), flat: true,
});

describe("topocentric alt/az (SCIENCE.md section 2)", () => {
  const eq = siteFrame(0, 0, 1737.4);
  it("Sun straight overhead at (0,0) when sun_dir = +X", () => {
    expect(altAz(eq, 1, 0, 0)[0]).toBeCloseTo(90, 9);
  });
  it("+Z is due north on the horizon, +Y due east", () => {
    const [elN, azN] = altAz(eq, 0, 0, 1);
    expect(elN).toBeCloseTo(0, 9); expect(azN).toBeCloseTo(0, 9);
    const [elE, azE] = altAz(eq, 0, 1, 0);
    expect(elE).toBeCloseTo(0, 9); expect(azE).toBeCloseTo(90, 9);
  });
  it("at 85 S, 0 E the +X direction is 5 deg up, due north", () => {
    const [el, az] = altAz(siteFrame(-85, 0, 1737.4), 1, 0, 0);
    expect(el).toBeCloseTo(5, 9); expect(az).toBeCloseTo(0, 9);
  });
  it("Earth parallax: Earth at 384400 km on +X is at zenith for (0,0) and 89.74 deg at 0.25 deg longitude", () => {
    const eph: Ephemeris = { startMs: 0, stepS: 3600, n: 1, sunDir: Float64Array.of(1, 0, 0),
      sunSemiDiam: Float64Array.of(0.2666), earthKm: Float64Array.of(384400, 0, 0) };
    expect(computeSeries(eph, flat(0, 0), 0, 1).earthEl[0]).toBeCloseTo(90, 6);
    // Geocentric angle 0.25 deg; topocentric zenith distance is larger by the parallax (~0.0011 deg here).
    const el = computeSeries(eph, flat(0, 0.25), 0, 1).earthEl[0];
    expect(el).toBeLessThan(89.75); expect(el).toBeGreaterThan(89.74);
  });
});

describe("horizon interpolation and disc fraction", () => {
  const hz: Horizon = { ...flat(-85, 0), flat: false, elevDeg: new Float64Array(720) };
  hz.elevDeg[0] = 2; hz.elevDeg[1] = 4; hz.elevDeg[719] = 6;
  it("interpolates between bins and wraps at 360", () => {
    expect(horizonAt(hz, 0.25)).toBeCloseTo(3, 9);
    expect(horizonAt(hz, 359.75)).toBeCloseTo(4, 9);
    expect(horizonAt(hz, 360)).toBeCloseTo(2, 9);
  });
  it("disc fraction: half at the centre line, full and empty at +-r", () => {
    expect(discFraction(0, 0.27)).toBeCloseTo(0.5, 12);
    expect(discFraction(0.27, 0.27)).toBe(1);
    expect(discFraction(-0.27, 0.27)).toBe(0);
    expect(discFraction(0.1, 0.27) + discFraction(-0.1, 0.27)).toBeCloseTo(1, 12);
  });
});

function fakeSeries(sunlit: number[], earthVis: number[], sunEl?: number[]): Series {
  const n = sunlit.length;
  const z = () => new Float64Array(n);
  return { startIdx: 0, endIdx: n, sunEl: Float64Array.from(sunEl ?? sunlit.map((x) => (x ? 3 : -1))),
    sunAz: z(), sunMargin: z(), sunFrac: Float64Array.from(sunlit), earthEl: z(), earthAz: z(), earthMargin: z(),
    sunlit: Uint8Array.from(sunlit), earthVis: Uint8Array.from(earthVis) };
}

describe("computeMetrics", () => {
  const m = computeMetrics(fakeSeries([1, 1, 0, 0, 0, 1, 1, 1], [0, 1, 1, 1, 0, 0, 1, 1]));
  it("percentages", () => {
    expect(m.sunPct).toBe(62.5); expect(m.earthPct).toBe(62.5); expect(m.bothPct).toBe(37.5);
  });
  it("longest runs and countdowns", () => {
    expect(m.longestDarkH).toBe(3); expect(m.longestNoEarthH).toBe(2);
    expect(m.hoursToSunset).toBe(2); expect(m.hoursToSunrise).toBeNull();
    expect(m.hoursToEarthrise).toBe(1); expect(m.hoursToEarthset).toBeNull();
  });
  it("respects the sample spacing", () => {
    expect(computeMetrics(fakeSeries([1, 0, 0], [1, 1, 1]), 6).longestDarkH).toBe(12);
  });
});

describe("findWindows", () => {
  // Sun direction swings between +X and -X once per 48 h: at (0,0) that is 24 h lit, 24 h dark.
  const n = 24 * 6;
  const sun = new Float64Array(3 * n), earth = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / 48;
    sun[3 * i] = Math.cos(a); sun[3 * i + 1] = Math.sin(a);
    earth[3 * i] = 384400;
  }
  const eph: Ephemeris = { startMs: Date.parse("2026-11-01T00:00:00Z"), stepS: 3600, n, sunDir: sun,
    sunSemiDiam: new Float64Array(n).fill(0.2666), earthKm: earth };
  it("returns one result per UTC day and finds the fully lit 6-hour windows", () => {
    const spec = { durationH: 6, minSunPct: 100, minEarthPct: 100, maxDarkH: 0, requireLitAndEarthAtLanding: true };
    const days = findWindows(eph, flat(0, 0), spec, 0, n);
    expect(days.length).toBe(6);
    expect(days[0].feasible).toBe(true);
    expect(days[0].score).toBe(1);
    expect(days[0].metrics?.longestDarkH).toBe(0);
  });
  it("is infeasible when the spec asks for more sunlight than exists", () => {
    const spec = { durationH: 36, minSunPct: 90, minEarthPct: 0, maxDarkH: 1, requireLitAndEarthAtLanding: false };
    const days = findWindows(eph, flat(0, 0), spec, 0, n);
    expect(days.every((d) => !d.feasible && d.score === 0)).toBe(true);
  });
});
