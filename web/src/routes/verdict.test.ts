import { describe, expect, it } from "vitest";
import type { Metrics } from "../lib/analysis";
import { verdict } from "./verdict";

const m = (sunPct: number, earthPct: number, longestDarkH = 0): Metrics => ({
  sunPct, earthPct, bothPct: 0, longestDarkH, longestNoEarthH: 0, hoursToSunset: null, hoursToEarthset: null,
  hoursToSunrise: null, hoursToEarthrise: null, maxSunEl: 5, meanSunElWhenLit: 2,
});

describe("verdict sentence", () => {
  it("names power as the problem when Earth is always up", () => {
    expect(verdict(m(47, 100, 309))).toBe(
      "Sunlight 47% of the time, Earth always in view: power is the problem here, not the radio link. The longest night lasts 12.9 days.");
  });
  it("names the radio link when sunlight is plentiful", () => {
    expect(verdict(m(90, 40))).toBe("Sunlight 90% of the time, Earth in view 40% of the time: the radio link is the problem here, not power.");
  });
  it("far side: no direct link", () => {
    expect(verdict(m(51, 0))).toContain("Earth never in view: there is no direct radio link from here");
  });
  it("both fine, both limited", () => {
    expect(verdict(m(100, 100))).toBe("Sunlight the whole time, Earth always in view: power and the radio link both hold for this mission.");
    expect(verdict(m(50, 56))).toContain("both part-time here");
  });
});
