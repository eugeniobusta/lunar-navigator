// Mocks must keep the exact shapes in docs/INTERFACES.md so code written against them works on real data.
import { describe, expect, it } from "vitest";
import eph from "./ephemeris.json";
import hz from "./horizons/mma01.json";
import sites from "./sites.json";

describe("mock data matches the contracts", () => {
  it("ephemeris arrays have lengths 3n, n, 3n", () => {
    expect(eph.sun_dir.length).toBe(3 * eph.n);
    expect(eph.sun_semidiam_deg.length).toBe(eph.n);
    expect(eph.earth_km.length).toBe(3 * eph.n);
  });
  it("sun directions are unit vectors", () => {
    for (let i = 0; i < eph.n; i++) {
      const [x, y, z] = eph.sun_dir.slice(3 * i, 3 * i + 3);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
    }
  });
  it("horizon has 360 / az_step entries", () => {
    expect(hz.elev_deg.length).toBe(360 / hz.az_step_deg);
  });
  it("sites have the required fields", () => {
    for (const s of sites.sites) {
      expect(["artemis", "mission", "historic"]).toContain(s.group);
      expect(["dem", "flat"]).toContain(s.terrain);
    }
  });
});
