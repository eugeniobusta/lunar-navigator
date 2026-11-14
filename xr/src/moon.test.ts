// The whole-Moon view: frames, the globe mesh, the cap's edge, the compass and the zoom, against geo.ts, the
// published south-pole grid and the exported CGI Moon Kit heights.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heightAt, parseHeightGrid, stereoXY } from '../../web/src/lib/analysis/demHorizon';
import { R_M, gridFrame, latLonToScene, type V3 } from './geo';
import {
  ARROW_TO_LAT,
  COMPASS_RINGS,
  MOON_POS,
  MOON_SCALE,
  MOON_TILT,
  POLE_POS,
  POLE_SCALE,
  capEdge,
  colatDeg,
  earthArrow,
  globeHeight,
  globeMesh,
  orbitCamera,
  orbitPose,
  parallel,
  poleDir,
  polePoint,
  stepZoom,
  toRoom,
  type GlobeHeights,
} from './moon';

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const MOON = new URL('../public/moon/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('moon.json', MOON), 'utf8'));
const raw = readFileSync(new URL(meta.height.file, MOON));
const heights: GlobeHeights = {
  data: new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)),
  cols: meta.height.cols,
  rows: meta.height.rows,
  unitM: meta.height.unit_m,
  baseRadiusM: meta.height.base_radius_m,
};

describe('pole frame', () => {
  it('polePoint is geo.ts latLonToScene in the frame of the south pole, everywhere on the Moon', () => {
    const f = gridFrame(0, 0);
    for (const [lat, lon, h] of [[-90, 0, 0], [-85, 30, 1200], [-60, -120, -3000], [0, 0, 0], [20, 90, 500], [90, 0, 0]]) {
      expect(dist(polePoint(lat, lon, h), latLonToScene(f, lat, lon, h))).toBeLessThan(0.5); // metres
    }
  });

  it('the pole is the origin, Earth is towards -z, 90 deg E towards +x, the centre is R below', () => {
    expect(dist(polePoint(-90, 0), [0, 0, 0])).toBeLessThan(1e-6);
    expect(dist(poleDir(0, 0), [0, 0, -1])).toBeLessThan(1e-12);
    expect(dist(poleDir(0, 90), [1, 0, 0])).toBeLessThan(1e-12);
    expect(dist(polePoint(90, 0), [0, -2 * R_M, 0])).toBeLessThan(1e-6);
  });
});

describe('globe', () => {
  it('the exported heights are the CGI Moon Kit file: 720 x 360 counts of half a metre', () => {
    expect(heights.data.length).toBe(720 * 360);
    expect(heights.unitM).toBe(0.5);
    expect(heights.baseRadiusM).toBe(1727400);
  });

  it('globeHeight agrees with our own south-pole grid (different resolution, same Moon)', () => {
    const pm = JSON.parse(readFileSync(new URL('../../web/public/data/terrain/south_pole.json', import.meta.url), 'utf8'));
    const b = readFileSync(new URL(`../../web/public/data/terrain/${pm.files.height}`, import.meta.url));
    const grid = parseHeightGrid(pm, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    let sum = 0;
    let sq = 0;
    let n = 0;
    for (const lat of [-84, -85, -86, -87]) {
      for (let lon = -180; lon < 180; lon += 5) {
        const [x, y] = stereoXY(lat, lon);
        const d = globeHeight(heights, lat, lon) - heightAt(grid, x, y);
        sum += d;
        sq += d * d;
        n++;
      }
    }
    const mean = sum / n;
    const rms = Math.sqrt(sq / n);
    console.log(`kit minus our grid at ${n} points, 84 to 87 S: mean ${mean.toFixed(0)} m, rms ${rms.toFixed(0)} m`);
    // The kit file is 0.5 deg (15 km) per pixel here against 430 m: the relief is +/- several km, so a few hundred
    // metres of rms is the resolution; a wrong longitude origin or unit would give kilometres.
    expect(Math.abs(mean)).toBeLessThan(150);
    expect(rms).toBeLessThan(900);
    // The same check turned by 180 degrees must be much worse: it proves the longitude origin.
    let sqFlip = 0;
    for (let lon = -180; lon < 180; lon += 5) {
      const [x, y] = stereoXY(-85, lon);
      sqFlip += (globeHeight(heights, -85, lon + 180) - heightAt(grid, x, y)) ** 2;
    }
    expect(Math.sqrt(sqFlip / 72)).toBeGreaterThan(2 * rms);
  });

  it('globeMesh: every vertex is on the raised sphere, uv follows the maps, triangles face outwards', () => {
    const h = (lat: number, lon: number) => 1000 * Math.sin(lat / 30) + 500 * Math.cos(lon / 20);
    const m = globeMesh(24, 12, h);
    expect(m.position.length).toBe(25 * 13 * 3);
    expect(m.index.length).toBe(24 * 12 * 6);
    for (let k = 0; k < 25 * 13; k += 7) {
      const lat = -90 + 180 * m.uv[2 * k + 1];
      const lon = -180 + 360 * m.uv[2 * k];
      const r = Math.hypot(m.position[3 * k], m.position[3 * k + 1] + R_M, m.position[3 * k + 2]);
      expect(r).toBeCloseTo(R_M + h(lat, lon), 0);
    }
    // First triangle away from the pole row: its normal points away from the Moon's centre.
    const t = 6 * (24 * 5 + 3);
    const v = (i: number): V3 => [m.position[3 * i], m.position[3 * i + 1] + R_M, m.position[3 * i + 2]];
    const [a, b, c] = [v(m.index[t]), v(m.index[t + 1]), v(m.index[t + 2])];
    const n: V3 = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    expect(n[0] * a[0] + n[1] * a[1] + n[2] * a[2]).toBeGreaterThan(0);
  });
});

describe('cap and compass', () => {
  it('the cap ends inside the 440 km grid and the globe starts before the cap fades', () => {
    expect(colatDeg(220000)).toBeCloseTo(7.245, 2);
    const e = capEdge(220000);
    expect(e.holeDeg).toBeLessThan(e.inDeg);
    expect(e.inDeg).toBeLessThan(e.outDeg);
    expect(e.outDeg).toBeLessThan(colatDeg(220000));
    expect(e.inDeg).toBeGreaterThan(6); // the 6 degree region NASA's limits cover stays fully ours
  });

  it('rings at 84, 86, 88 S; the arrow runs along 0 deg E away from the pole', () => {
    expect(COMPASS_RINGS).toEqual([84, 86, 88]);
    const ring = parallel(-86, 3);
    expect(ring.length).toBe(120);
    expect(ring.every(([lat]) => lat === -86)).toBe(true);
    const [shaft, head] = earthArrow();
    expect(shaft.every(([, lon]) => lon === 0)).toBe(true);
    expect(shaft[shaft.length - 1][0]).toBe(ARROW_TO_LAT);
    expect(shaft[0][0]).toBeLessThan(ARROW_TO_LAT);
    // The tip is the Earth-side end: further along -z than the start.
    expect(polePoint(ARROW_TO_LAT, 0)[2]).toBeLessThan(polePoint(shaft[0][0], 0)[2]);
    expect(head[1]).toEqual([ARROW_TO_LAT, 0]);
    expect(head[0][1]).toBeCloseTo(-head[2][1], 12);
  });
});

describe('zoom', () => {
  it('zoom 0: the Moon is 1.3 m across, centred at MOON_POS, its south pole tipped towards the viewer', () => {
    const p = orbitPose(0);
    expect(p.scale).toBeCloseTo(MOON_SCALE, 15);
    expect(dist(toRoom(p, [0, -R_M, 0]), MOON_POS)).toBeLessThan(1e-9);
    const pole = toRoom(p, [0, 0, 0]);
    expect(dist(pole, MOON_POS)).toBeCloseTo(0.65, 6);
    expect(pole[2]).toBeGreaterThan(MOON_POS[2]); // nearer the viewer, who looks along -z
    expect(pole[2] - MOON_POS[2]).toBeCloseTo(0.65 * Math.sin(MOON_TILT), 6);
    // The Earth side (0 deg E) is up.
    expect(toRoom(p, polePoint(-60, 0))[1]).toBeGreaterThan(toRoom(p, polePoint(-60, 180))[1]);
  });

  it('zoom 1: the pole is at POLE_POS, level, and the 440 km relief is 1.6 m across', () => {
    const p = orbitPose(1);
    expect(p.tilt).toBe(0);
    expect(p.scale).toBeCloseTo(POLE_SCALE, 15);
    expect(dist(toRoom(p, [0, 0, 0]), POLE_POS)).toBeLessThan(1e-9);
    expect(dist(toRoom(p, [220000, 0, 0]), toRoom(p, [-220000, 0, 0]))).toBeCloseTo(1.6, 9);
  });

  it('in between, the scale and the tilt change monotonically and nothing jumps', () => {
    let last = orbitPose(0);
    for (let z = 0.02; z <= 1.0001; z += 0.02) {
      const p = orbitPose(z);
      expect(p.scale).toBeGreaterThan(last.scale);
      expect(p.tilt).toBeLessThanOrEqual(last.tilt);
      expect(dist(toRoom(p, [0, 0, 0]), toRoom(last, [0, 0, 0]))).toBeLessThan(0.08); // the pole moves under 8 cm per step
      last = p;
    }
    expect(orbitPose(-1)).toEqual(orbitPose(0));
    expect(orbitPose(2)).toEqual(orbitPose(1));
  });

  it('orbitCamera and stepZoom', () => {
    expect(orbitCamera(0)).toEqual({ az: 0, pol: 1.45 });
    expect(orbitCamera(1)).toEqual({ az: 0.5, pol: 0.72 });
    expect(stepZoom(0, 1, 0.5, 2)).toBeCloseTo(0.25, 12);
    expect(stepZoom(0.9, 1, 0.5, 2)).toBe(1);
    expect(stepZoom(0.5, 0, 0.1, 2)).toBeCloseTo(0.45, 12);
  });
});
