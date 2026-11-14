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

// The clock on the homepage must come from our own ephemeris and the real skyline, not from a constant.
import { computeSeries } from ".";
import { parseEphemeris, parseHorizon } from "../data";
import ephFile from "../../../public/data/ephemeris.json";
import mma01 from "../../../public/data/horizons/mma01.json";

describe("the homepage countdown on the published data", () => {
  const eph = parseEphemeris(ephFile);
  const hz = parseHorizon(mma01 as Parameters<typeof parseHorizon>[0]);
  const hourOf = (iso: string) => Math.round((Date.parse(iso) - eph.startMs) / (eph.stepS * 1000));
  it("sunrise at Malapert Massif after 14 Nov 2026 00:00 UTC is on 17 Nov at 10:12 UTC, as the Python model finds", () => {
    const from = hourOf("2026-11-14T00:00:00Z");
    const s = computeSeries(eph, hz, from, from + 60 * 24);
    const change = nextSunChange(s, eph.startMs + from * eph.stepS * 1000, eph.stepS);
    expect(change.lit).toBe(false); // it is night there on the 14th
    // engine/visibility.py on the same files: 2026-11-17T10:12:01.78Z (the crossing between samples 394 and 395).
    expect(Math.abs(change.atMs! - Date.parse("2026-11-17T10:12:01.78Z"))).toBeLessThan(2000);
    // And it is a real crossing of the skyline: dark the hour before, lit the hour after.
    const i = Math.floor((change.atMs! - eph.startMs) / (eph.stepS * 1000)) - from;
    expect(s.sunlit[i]).toBe(0);
    expect(s.sunlit[i + 1]).toBe(1);
    expect(formatCountdown(change.atMs! - Date.parse("2026-11-14T00:00:00Z"))).toBe("3d 10:12:01");
  });
  it("the next change always falls between two hours whose Sun state differs, at 50 starting hours", () => {
    for (let k = 0; k < 50; k++) {
      const from = 500 + k * 431;
      const s = computeSeries(eph, hz, from, from + 60 * 24);
      const c = nextSunChange(s, eph.startMs + from * eph.stepS * 1000, eph.stepS);
      expect(c.lit).toBe(s.sunlit[0] === 1);
      if (c.atMs === null) { expect(new Set(s.sunlit).size).toBe(1); continue; }
      const i = Math.floor((c.atMs - (eph.startMs + from * eph.stepS * 1000)) / (eph.stepS * 1000));
      expect(s.sunlit[i] === 1).toBe(c.lit);
      expect(s.sunlit[i + 1] === 1).toBe(!c.lit);
      for (let j = 0; j <= i; j++) expect(s.sunlit[j] === 1).toBe(c.lit); // nothing earlier was missed
    }
  });
});
