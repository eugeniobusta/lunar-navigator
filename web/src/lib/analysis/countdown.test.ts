// Homepage clock: known answers.
import { describe, expect, it } from "vitest";
import type { Series } from ".";
import { formatCountdown, nextSunChange } from "./countdown";

const withMargins = (m: number[]) => ({ sunMargin: Float64Array.from(m) }) as unknown as Series;

describe("next sunset or sunrise", () => {
  it("a sunset half-way between two hours", () => {
    const r = nextSunChange(withMargins([2, 1, -1, -2]), 0, 3600);
    expect(r.lit).toBe(true);
    expect(r.atMs).toBe(1.5 * 3600 * 1000);
  });
  it("a sunrise a quarter of the way into the hour", () => {
    const r = nextSunChange(withMargins([-3, -0.5, 1.5]), 1000, 3600);
    expect(r.lit).toBe(false);
    expect(r.atMs).toBe(1000 + 1.25 * 3600 * 1000);
  });
  it("no change in the series", () => {
    expect(nextSunChange(withMargins([1, 2, 3]), 0, 3600)).toEqual({ lit: true, atMs: null });
    expect(nextSunChange(withMargins([]), 0, 3600)).toEqual({ lit: false, atMs: null });
  });
  it("the countdown text", () => {
    expect(formatCountdown(((2 * 24 + 4) * 3600 + 12 * 60 + 9) * 1000 + 999)).toBe("2d 04:12:09");
    expect(formatCountdown(59_000)).toBe("00:00:59");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });
});
