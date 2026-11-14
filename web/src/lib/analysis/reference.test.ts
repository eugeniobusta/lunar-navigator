// The browser maths must match the Python reference (engine/topo.py, docs/SCIENCE.md section 2).
// tests/fixtures/topo_reference.json is exported by scripts/build_ephemeris.py together with ephemeris.json.
import { describe, expect, it } from "vitest";
import { computeSeries, type Horizon } from ".";
import { parseEphemeris } from "../data";
import ephFile from "../../../public/data/ephemeris.json";
import ref from "../../../../tests/fixtures/topo_reference.json";

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe("computeSeries matches the Python reference (topo_reference.json)", () => {
  const eph = parseEphemeris(ephFile);
  const worst = { sunEl: 0, sunAz: 0, earthEl: 0, earthAz: 0 };
  for (const r of ref.rows) {
    // Same observer as the fixture: on the 1737.4 km sphere, no terrain.
    const hz: Horizon = { siteId: r.site, lat: r.lat, lon: r.lon, surfaceElevM: (ref.height_km - 1737.4) * 1000,
      observerHM: 0, azStepDeg: 0.5, elevDeg: new Float64Array(720), flat: true };
    const s = computeSeries(eph, hz, r.index, r.index + 1);
    worst.sunEl = Math.max(worst.sunEl, Math.abs(s.sunEl[0] - r.sunEl));
    worst.sunAz = Math.max(worst.sunAz, angleDiff(s.sunAz[0], r.sunAz));
    worst.earthEl = Math.max(worst.earthEl, Math.abs(s.earthEl[0] - r.earthEl));
    worst.earthAz = Math.max(worst.earthAz, angleDiff(s.earthAz[0], r.earthAz));
  }
  it("covers 3 sites x 20 times", () => {
    expect(ref.rows.length).toBe(60);
    expect(eph.n).toBe(27768);
  });
  it("max difference < 0.01 deg for Sun and Earth elevation and azimuth", () => {
    console.log("max |TS - Python| (deg):", JSON.stringify(worst));
    expect(worst.sunEl).toBeLessThan(0.01);
    expect(worst.sunAz).toBeLessThan(0.01);
    expect(worst.earthEl).toBeLessThan(0.01);
    expect(worst.earthAz).toBeLessThan(0.01);
  });
});
