// Scene frames and the terrain shadow geometry against the analysis library (the numbers the app displays).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeSeries, type Ephemeris } from '../../web/src/lib/analysis';
import { demHorizon, parseHeightGrid, stereoXY, type HeightGrid } from '../../web/src/lib/analysis/demHorizon';
import {
  R_M,
  azElToScene,
  buildField,
  dirToScene,
  gridFrame,
  groundAt,
  landingSlopeDeg,
  latLonToScene,
  raycastField,
  shadowMarginDeg,
  sunDirAt,
  unitOf,
} from './geo';

const DATA = new URL('../../web/public/data/', import.meta.url);
const json = (p: string) => JSON.parse(readFileSync(new URL(p, DATA), 'utf8'));
const bin = (p: string): ArrayBuffer => {
  const b = readFileSync(new URL(p, DATA));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const flat = (size: number, pixelM: number, cx: number, cy: number): HeightGrid => ({
  size, pixelM, xMinM: cx - (size * pixelM) / 2, yMaxM: cy + (size * pixelM) / 2, heightMinM: 0, heightMaxM: 1,
  data: new Uint16Array(size * size),
});

describe('frames', () => {
  it('at the pole the grid axes are lon 90 E (+x), lon 0 (+y) and up is south', () => {
    const f = gridFrame(0, 0);
    expect(f.gx).toEqual([0, 1, 0].map((v) => expect.closeTo(v, 12)));
    expect(f.gy).toEqual([1, 0, 0].map((v) => expect.closeTo(v, 12)));
    expect(f.up).toEqual([0, 0, -1].map((v) => expect.closeTo(v, 12)));
    // 1 degree from the pole along lon 0: 30.3 km towards scene -z, 265 m below the tangent plane.
    const p = latLonToScene(f, -89, 0, 0);
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[2]).toBeCloseTo(-R_M * Math.sin(Math.PI / 180), 3);
    expect(p[1]).toBeCloseTo(-R_M * (1 - Math.cos(Math.PI / 180)), 3); // curvature: -264.6 m
    expect(p[1]).toBeCloseTo(-264.6, 0);
  });
  it('a site sits at (0, height, 0) of its own frame, and its north is the direction away from the pole', () => {
    const [x, y] = stereoXY(-85.9425, -0.94365);
    const f = gridFrame(x, y);
    const p = latLonToScene(f, -85.9425, -0.94365, 4728.7);
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(4728.7, 5);
    expect(p[2]).toBeCloseTo(0, 5);
    const lam = (-0.94365 * Math.PI) / 180;
    const north = azElToScene(f, -85.9425, -0.94365, 0, 0);
    expect(north[0]).toBeCloseTo(Math.sin(lam), 9);
    expect(north[1]).toBeCloseTo(0, 9);
    expect(north[2]).toBeCloseTo(-Math.cos(lam), 9);
    expect(azElToScene(f, -85.9425, -0.94365, 123, 90)[1]).toBeCloseTo(1, 9);
    expect(dirToScene(f, unitOf(-85.9425, -0.94365))[1]).toBeCloseTo(1, 12);
  });
  it('buildField puts every pixel where latLonToScene puts it, and a ray straight down finds it', () => {
    const [x, y] = stereoXY(-86, 20);
    const g = flat(64, 120, x, y);
    g.heightMaxM = 1000;
    g.data.fill(32768); // 500 m everywhere
    const f = buildField(g, gridFrame(x, y));
    const hit = groundAt(f, 10, 50);
    const i = 10 * 64 + 50;
    expect(f.x[i]).toBeCloseTo(hit.pos[0], 2);
    expect(f.up[i]).toBeCloseTo(hit.pos[1], 2);
    expect(f.z[i]).toBeCloseTo(hit.pos[2], 2);
    expect(hit.heightM).toBeCloseTo(500.0, 1);
    const ray = raycastField(f, [hit.pos[0], 3000, hit.pos[2]], [0, -1, 0], 5000)!;
    expect(ray.row).toBeCloseTo(10, 1);
    expect(ray.col).toBeCloseTo(50, 1);
    expect(raycastField(f, [0, 3000, 0], [0, 1, 0], 5000)).toBeNull();
  });
});

describe('the scene agrees with the analysis library at Malapert (mma01)', () => {
  const e = json('ephemeris.json');
  const eph: Ephemeris = {
    startMs: Date.parse(e.start_utc), stepS: e.step_s, n: e.n, sunDir: Float64Array.from(e.sun_dir),
    sunSemiDiam: Float64Array.from(e.sun_semidiam_deg), earthKm: Float64Array.from(e.earth_km),
  };
  const meta = json('terrain/sites/mma01/tile.json');
  const tile = parseHeightGrid(meta, bin('terrain/sites/mma01/height.u16'));
  const far = parseHeightGrid(meta.far, bin('terrain/sites/mma01/far.u16'));
  const pole = parseHeightGrid(json('terrain/south_pole.json'), bin('terrain/south_pole_height.u16'));
  const half = (tile.size * tile.pixelM) / 2;
  const frame = gridFrame(tile.xMinM + half, tile.yMaxM - half);
  const lat = -85.9425, lon = -0.94365;
  const hz = demHorizon(tile, [pole, far], lat, lon);
  const series = computeSeries(eph, hz, 0, 2000);

  it('the Sun drawn from computeSeries az/el is the ephemeris Sun direction in the scene (< 0.001 deg)', () => {
    let worst = 0;
    for (let k = 0; k < 2000; k += 37) {
      const a = azElToScene(frame, lat, lon, series.sunAz[k], series.sunEl[k]);
      const b = dirToScene(frame, sunDirAt(eph, k));
      worst = Math.max(worst, (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI);
    }
    expect(worst).toBeLessThan(0.001);
  });

  it('the terrain shadow march gives the same Sun margin as demHorizon + computeSeries', () => {
    const field = buildField(tile, frame);
    const farField = buildField(far, frame);
    const row = meta.site.row, col = meta.site.col;
    let sum = 0, worst = 0, n = 0, flips = 0;
    for (let k = 0; k < 2000; k += 7) {
      const m = shadowMarginDeg(field, farField, row, col, dirToScene(frame, sunDirAt(eph, k)), 2);
      const d = Math.abs(m - series.sunMargin[k]);
      sum += d; n++; worst = Math.max(worst, d);
      if (m > 0 !== series.sunMargin[k] > 0) flips++;
    }
    console.log(`shadow march vs computeSeries at mma01: mean ${(sum / n).toFixed(3)} deg, max ${worst.toFixed(3)} deg, ` +
      `${flips} of ${n} samples disagree on lit / dark`);
    // The mask is sampled every 0.5 deg of azimuth and interpolated; the march follows the exact azimuth, so a
    // sharp nearby ridge can differ by several tenths of a degree at single times.
    expect(sum / n).toBeLessThan(0.05);
    expect(worst).toBeLessThan(1.0);
    expect(flips / n).toBeLessThan(0.03);
  });
});

describe('landingSlopeDeg', () => {
  it('reproduces landing_slope_deg of zones.csv at the best cell of every zone on the Malapert tile', () => {
    const meta = json('terrain/sites/mma01/tile.json');
    const tile = parseHeightGrid(meta, bin('terrain/sites/mma01/height.u16'));
    const lines = readFileSync(new URL('suitability/zones.csv', DATA), 'utf8').trim().split('\n');
    const head = lines[0].split(',');
    const ix = head.indexOf('x_m'), iy = head.indexOf('y_m'), is = head.indexOf('landing_slope_deg');
    let n = 0;
    let worst = 0;
    for (const line of lines.slice(1)) {
      const c = line.split(',');
      const col = Math.round((Number(c[ix]) - tile.xMinM) / tile.pixelM - 0.5);
      const row = Math.round((tile.yMaxM - Number(c[iy])) / tile.pixelM - 0.5);
      const v = landingSlopeDeg(tile, row, col);
      if (!Number.isNaN(v)) {
        n++;
        worst = Math.max(worst, Math.abs(v - Number(c[is])));
      }
    }
    console.log(`landingSlopeDeg vs zones.csv on the mma01 tile: ${n} zones, worst difference ${worst.toFixed(3)} deg`);
    expect(n).toBeGreaterThan(20);
    expect(worst).toBeLessThan(0.2); // heights are stored in 16 bits and the csv is rounded to 0.1 deg
  });
});
