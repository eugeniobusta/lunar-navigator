import { describe, expect, it } from "vitest";
import { incidence, simulatePower, SOLAR_CONSTANT } from ".";
import type { Series } from "../analysis";

function series(sunFrac: number[], sunEl = 0): Series {
  const n = sunFrac.length, z = () => new Float64Array(n);
  return { startIdx: 0, endIdx: n, sunEl: new Float64Array(n).fill(sunEl), sunAz: z(), sunMargin: z(),
    sunFrac: Float64Array.from(sunFrac), earthEl: z(), earthAz: z(), earthMargin: z(),
    sunlit: Uint8Array.from(sunFrac.map((f) => (f > 0.5 ? 1 : 0))), earthVis: new Uint8Array(n) };
}

describe("incidence (SCIENCE.md section 5)", () => {
  it("vertical panel sees the low Sun almost head-on, horizontal panel barely", () => {
    expect(incidence("vertical_tracking", 0, 0, 0)).toBe(1);
    expect(incidence("horizontal", 30, 0, 0)).toBeCloseTo(0.5, 12);
    expect(incidence("vertical_fixed", 0, 180, 0)).toBe(0);
  });
});

describe("simulatePower", () => {
  const cfg = { mode: "vertical_tracking" as const, panelAzDeg: 0, areaM2: 1, efficiency: 0.25,
    batteryWh: 1000, loadW: 100, initialSocPct: 100 };
  it("generation = S x area x efficiency when fully lit at el 0", () => {
    const r = simulatePower(series([1, 1]), cfg, 3600);
    expect(r.genW[0]).toBeCloseTo(SOLAR_CONSTANT * 0.25, 9);
    expect(r.energyGenWh).toBeCloseTo(2 * SOLAR_CONSTANT * 0.25, 9);
  });
  it("12 dark hours at 100 W drain a 1000 Wh battery: dies after 10 h", () => {
    const r = simulatePower(series(new Array(12).fill(0)), cfg, 3600);
    expect(r.survived).toBe(false);
    expect(r.hoursBelowZero).toBe(2);
    expect(r.batteryNeededWh).toBeCloseTo(1200, 9);
    expect(r.minSocPct).toBe(0);
  });
  it("survives when the battery covers the night", () => {
    const r = simulatePower(series(new Array(8).fill(0)), cfg, 3600);
    expect(r.survived).toBe(true);
    expect(r.minSocPct).toBeCloseTo(20, 9);
  });
});
