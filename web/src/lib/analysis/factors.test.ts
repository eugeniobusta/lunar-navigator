import { describe, expect, it } from "vitest";
import {
  combineScores, combinedGrid, decodeLayer, factorScore, latLonToXY, pixelToXY, xyToLatLon,
  type FactorMeta, type SiteMapMeta,
} from "./factors";

const meta = (over: Partial<FactorMeta> = {}): FactorMeta => ({
  key: "landing_slope_deg", name: "Landing slope", unit: "deg", file: "x.u8", encMin: 0, encMax: 45,
  reject: 10, ideal: 0, weight: 1, available: true, source: "", explain: "", ...over,
});

describe("factorScore (reject -> 0, ideal -> 1, linear)", () => {
  it("landing slope: 10 deg or more is 0, 5 deg is 0.5, flat is 1", () => {
    expect(factorScore(12, 10, 0)).toBe(0);
    expect(factorScore(10, 10, 0)).toBe(0);
    expect(factorScore(5, 10, 0)).toBeCloseTo(0.5, 12);
    expect(factorScore(0, 10, 0)).toBe(1);
  });
  it("more-is-better factors: sunlight 30 % -> 0, 65 % -> 0.5, 100 % -> 1", () => {
    expect(factorScore(20, 30, 100)).toBe(0);
    expect(factorScore(65, 30, 100)).toBeCloseTo(0.5, 12);
    expect(factorScore(100, 30, 100)).toBe(1);
  });
  it("no data stays no data", () => expect(factorScore(NaN, 10, 0)).toBeNaN());
});

describe("combineScores (equal weights, any 0 vetoes)", () => {
  it("averages when every factor passes", () => expect(combineScores([1, 0.5, 0.6], [1, 1, 1])).toBeCloseTo(0.7, 12));
  it("is 0 if any factor is 0", () => expect(combineScores([1, 0, 0.9], [1, 1, 1])).toBe(0));
  it("leaves out factors with no data, and unchosen (weight 0) factors cannot veto", () => {
    expect(combineScores([0.4, NaN, 0.8], [1, 1, 1])).toBeCloseTo(0.6, 12);
    expect(combineScores([0.4, 0, 0.8], [1, 0, 1])).toBeCloseTo(0.6, 12);
  });
  it("is NaN when nothing has data", () => expect(combineScores([NaN], [1])).toBeNaN());
});

describe("decodeLayer and combinedGrid", () => {
  it("decodes the u8 encoding and 255 as no data", () => {
    const l = decodeLayer(meta(), Uint8Array.of(0, 127, 254, 255));
    expect(l.values[0]).toBe(0);
    expect(l.values[1]).toBeCloseTo(22.5, 4);
    expect(l.values[2]).toBeCloseTo(45, 4);
    expect(l.values[3]).toBeNaN();
  });
  it("combines per pixel with the veto", () => {
    const slope = { meta: meta(), values: Float32Array.of(0, 5, 12) };
    const sun = { meta: meta({ key: "sun_pct", reject: 30, ideal: 100 }), values: Float32Array.of(100, 65, 100) };
    const th = [{ reject: 10, ideal: 0, weight: 1 }, { reject: 30, ideal: 100, weight: 1 }];
    const g = combinedGrid([slope, sun], th);
    expect(g[0]).toBeCloseTo(1, 6);
    expect(g[1]).toBeCloseTo(0.5, 6);
    expect(g[2]).toBe(0); // too steep: vetoed despite full sunlight
  });
});

describe("polar stereographic helpers", () => {
  const m: SiteMapMeta = { size: 1024, pixelM: 429.6875, xMinM: -220000, yMaxM: 220000, factors: [] };
  it("the grid centre is the pole", () => {
    const [x, y] = pixelToXY(m, 511.5, 511.5);
    expect(x).toBeCloseTo(0, 6); expect(y).toBeCloseTo(0, 6);
  });
  it("round-trips Malapert Massif (85.9425 S, 0.94365 W)", () => {
    const [x, y] = latLonToXY(-85.9425, -0.94365);
    const [lat, lon] = xyToLatLon(x, y);
    expect(lat).toBeCloseTo(-85.9425, 9); expect(lon).toBeCloseTo(-0.94365, 9);
    expect(y).toBeGreaterThan(0); // lon 0 points to +y
  });
  it("90 E lies on +x", () => {
    const [x, y] = latLonToXY(-85, 90);
    expect(x).toBeGreaterThan(0); expect(Math.abs(y)).toBeLessThan(1e-6);
  });
});
