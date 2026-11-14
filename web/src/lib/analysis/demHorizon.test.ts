// demHorizon (browser, exported grids) against horizons/<id>.json (Python, full-resolution DEM) at every site centre.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demHorizon, heightAt, marchDistances, parseHeightGrid, stereoLatLon, stereoXY, type HeightGrid } from "./demHorizon";

const DATA = new URL("../../../public/data/", import.meta.url);
const json = (p: string) => JSON.parse(readFileSync(new URL(p, DATA), "utf8"));
const bin = (p: string): ArrayBuffer => {
  const b = readFileSync(new URL(p, DATA));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const grid = (metaPath: string, binPath: string): HeightGrid => parseHeightGrid(json(metaPath), bin(binPath));

const far = grid("terrain/south_pole.json", "terrain/south_pole_height.u16");
const sites: { id: string; lat: number; lon: number; terrain: string }[] = json("sites.json").sites;
const demSites = sites.filter((s) => s.terrain === "dem");

describe("projection and sampling helpers", () => {
  it("stereoXY matches pyproj for Malapert (south_pole.json) and inverts", () => {
    const m = json("terrain/south_pole.json").sites.find((s: { id: string }) => s.id === "mma01");
    const [x, y] = stereoXY(-85.9425, -0.94365);
    expect(x).toBeCloseTo(m.x_m, 0);
    expect(y).toBeCloseTo(m.y_m, 0);
    const [lat, lon] = stereoLatLon(x, y);
    expect(lat).toBeCloseTo(-85.9425, 6);
    expect(lon).toBeCloseTo(-0.94365, 6);
  });
  it("heightAt interpolates between pixel centres and is NaN outside", () => {
    const g: HeightGrid = { size: 2, pixelM: 100, xMinM: 0, yMaxM: 200, heightMinM: 0, heightMaxM: 65535,
      data: Uint16Array.from([0, 100, 200, 300]) };
    expect(heightAt(g, 50, 150)).toBeCloseTo(0);     // centre of pixel (0, 0)
    expect(heightAt(g, 150, 50)).toBeCloseTo(300);   // centre of pixel (1, 1)
    expect(heightAt(g, 100, 100)).toBeCloseTo(150);  // middle of the four
    expect(heightAt(g, 10, 100)).toBeNaN();
  });
  it("marchDistances: 120 m steps to 5 km, then 1.5 % growth to exactly 150 km", () => {
    const d = marchDistances();
    expect(d[0]).toBe(120);
    expect(d[40]).toBe(4920);
    expect(d[41] / d[40]).toBeCloseTo(1.015, 9);
    expect(d[d.length - 1]).toBe(150000);
  });
  it("a flat sphere gives the curvature dip of a 2 m observer", () => {
    const flat: HeightGrid = { size: 2, pixelM: 1e6, xMinM: -1e6, yMaxM: 1e6, heightMinM: 0, heightMaxM: 1,
      data: new Uint16Array(4) };
    const [x, y] = stereoXY(-89, 0);
    const tile: HeightGrid = { ...flat, pixelM: 120, xMinM: x - 120, yMaxM: y + 120 };
    const hz = demHorizon(tile, [flat], -89, 0);
    // Dip of the horizon from 2 m up: -acos(R / (R + 2)) = -0.0869 deg, in every direction.
    expect(hz.elevDeg[0]).toBeCloseTo(-0.0869, 3);
    expect(hz.elevDeg[450]).toBeCloseTo(-0.0869, 3);
    expect(hz.surfaceElevM).toBe(0);
  });
});

describe("demHorizon at each site centre vs horizons/<id>.json", () => {
  let sum = 0, n = 0, worst = 0;
  const rows: string[] = [];
  for (const s of demSites) {
    const tile = grid(`terrain/sites/${s.id}/tile.json`, `terrain/sites/${s.id}/height.u16`);
    const siteFar = parseHeightGrid(json(`terrain/sites/${s.id}/tile.json`).far, bin(`terrain/sites/${s.id}/far.u16`));
    const ref = json(`horizons/${s.id}.json`);
    const t0 = performance.now();
    const hz = demHorizon(tile, [far, siteFar], s.lat, s.lon, { siteId: s.id });
    const ms = performance.now() - t0;
    let siteSum = 0, siteMax = 0;
    for (let i = 0; i < 720; i++) {
      const d = Math.abs(hz.elevDeg[i] - ref.elev_deg[i]);
      siteSum += d; if (d > siteMax) siteMax = d;
    }
    sum += siteSum; n += 720; worst = Math.max(worst, siteMax);
    rows.push(`${s.id.padEnd(7)} mean ${(siteSum / 720).toFixed(3)} max ${siteMax.toFixed(3)} deg, ` +
      `surface ${(hz.surfaceElevM - ref.surface_elev_m).toFixed(2)} m off, ${ms.toFixed(0)} ms`);
    it(`${s.id}: mean < 0.3 deg, max < 1.5 deg, surface within 0.5 m`, () => {
      expect(siteSum / 720).toBeLessThan(0.3);
      expect(siteMax).toBeLessThan(1.5);
      expect(Math.abs(hz.surfaceElevM - ref.surface_elev_m)).toBeLessThan(0.5);
    });
  }
  it("all sites together", () => {
    console.log(rows.join("\n") + `\nALL     mean ${(sum / n).toFixed(3)} max ${worst.toFixed(3)} deg over ${demSites.length} sites`);
    expect(demSites.length).toBe(10);
    expect(sum / n).toBeLessThan(0.3);
    expect(worst).toBeLessThan(1.5);
  });
});
