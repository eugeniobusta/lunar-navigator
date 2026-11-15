// The illustrative surface detail: its tile, its bounds, the patch's fade, the rocks and the length of a shadow.
import { describe, expect, it } from 'vitest';
import {
  BIG,
  DETAIL_RANGE_M,
  PATCH_FADE_M,
  PATCH_HOLE_M,
  PATCH_N,
  PATCH_STEP_M,
  TILE_M,
  TILE_N,
  craterProfile,
  detailHeight,
  hash,
  patchWeight,
  rocksNear,
  shadowLength,
  tileData,
  tileHeight,
} from './ground';

describe('detail tile', () => {
  it('hash is repeatable and spread over 0..1', () => {
    expect(hash(3, 7, 11)).toBe(hash(3, 7, 11));
    let sum = 0;
    for (let i = 0; i < 4000; i++) {
      const v = hash(i, 3 * i + 1, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 4000).toBeCloseTo(0.5, 1);
  });

  it('a crater is a bowl 0.09 diameters deep with a rim 0.02 high, and ends at 1.6 radii', () => {
    expect(craterProfile(0, 5, 1)).toBeCloseTo(-0.9, 2); // 10 m across: 0.9 m deep
    expect(craterProfile(1, 5, 1)).toBeCloseTo(0.2, 6); // the rim
    expect(craterProfile(1.6, 5, 1)).toBe(0);
    expect(craterProfile(0, 5, 0.5)).toBeCloseTo(-0.45, 2); // an older crater is shallower
    expect(Math.abs(craterProfile(1.599, 5, 1))).toBeLessThan(0.005); // no step at its edge
  });

  it('the tile repeats every 96 m and is continuous', () => {
    for (const [x, z] of [[3.3, 7.1], [50.2, 91.7], [95.9, 0.05]]) {
      expect(tileHeight(x + TILE_M, z)).toBeCloseTo(tileHeight(x, z), 9);
      expect(tileHeight(x, z - 2 * TILE_M)).toBeCloseTo(tileHeight(x, z), 9);
    }
    let worst = 0;
    for (let k = 0; k < 3000; k++) {
      const x = 0.0317 * k;
      worst = Math.max(worst, Math.abs(tileHeight(x + 0.01, 17.3) - tileHeight(x, 17.3)));
    }
    expect(worst).toBeLessThan(0.02); // under 2 cm per centimetre step: slopes stay under about 60 deg
  });

  it('the added relief never reaches the eyes: within -1.5 m and +0.45 m everywhere', () => {
    let lo = Infinity;
    let hi = -Infinity;
    let raw = -Infinity;
    for (let k = 0; k < 40000; k++) {
      const x = -30000 + ((k * 7919) % 60000) + 0.37 * k;
      const z = -30000 + ((k * 104729) % 60000) + 0.11 * k;
      const h = detailHeight(x, z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      raw = Math.max(raw, tileHeight(x, z));
    }
    console.log(`added relief at 40,000 points of a 60 km tile: ${lo.toFixed(2)} m to ${hi.toFixed(2)} m; highest rim of the tile ${raw.toFixed(2)} m`);
    expect(lo).toBeGreaterThanOrEqual(DETAIL_RANGE_M[0]);
    expect(hi).toBeLessThanOrEqual(DETAIL_RANGE_M[1]);
    expect(DETAIL_RANGE_M[1]).toBeLessThan(2 + DETAIL_RANGE_M[0]); // eyes at 2 m above the lowest ground still clear the highest
    expect(BIG).toBeGreaterThan(1);
  });

  it('tileData: slopes are the differences of its heights, albedo is 0..1', () => {
    const d = tileData();
    expect(d.length).toBe(4 * TILE_N * TILE_N);
    const px = TILE_M / TILE_N;
    const at = (i: number, j: number, k: number) => d[4 * (j * TILE_N + i) + k];
    expect(at(100, 200, 2)).toBeCloseTo(tileHeight(100.5 * px, 200.5 * px), 5);
    expect(at(100, 200, 0)).toBeCloseTo((at(101, 200, 2) - at(99, 200, 2)) / (2 * px), 5);
    expect(at(0, 7, 0)).toBeCloseTo((at(1, 7, 2) - at(TILE_N - 1, 7, 2)) / (2 * px), 5); // wraps
    expect(at(100, 200, 1)).toBeCloseTo((at(100, 201, 2) - at(100, 199, 2)) / (2 * px), 5);
    let lo = 1;
    let hi = 0;
    for (let k = 3; k < d.length; k += 4) {
      lo = Math.min(lo, d[k]);
      hi = Math.max(hi, d[k]);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
  });
});

describe('patch, rocks, shadows', () => {
  it('the patch keeps all the relief near the visitor and none where the plain mesh takes over', () => {
    expect(patchWeight(0)).toBe(1);
    expect(patchWeight(PATCH_FADE_M[0])).toBe(1);
    expect(patchWeight((PATCH_FADE_M[0] + PATCH_FADE_M[1]) / 2)).toBeCloseTo(0.5, 9);
    expect(patchWeight(PATCH_FADE_M[1])).toBe(0);
    // The plain mesh starts where the patch is already flat, and inside the patch's reach.
    expect(PATCH_HOLE_M).toBeGreaterThan(PATCH_FADE_M[1]);
    expect(PATCH_HOLE_M).toBeLessThan(((PATCH_N - 1) / 2) * PATCH_STEP_M);
  });

  it('rocks are the same wherever the visitor stands, nearest first, mostly small', () => {
    const a = rocksNear(100, -40, 25);
    const b = rocksNear(104, -37, 25);
    expect(a.length).toBeGreaterThan(80);
    expect(a.length).toBeLessThan(260);
    const key = (r: { x: number; z: number }) => `${r.x.toFixed(3)},${r.z.toFixed(3)}`;
    const inB = new Set(b.map(key));
    const shared = a.filter((r) => Math.hypot(r.x - 104, r.z + 37) < 25);
    expect(shared.length).toBeGreaterThan(50);
    expect(shared.every((r) => inB.has(key(r)))).toBe(true);
    const d = a.map((r) => Math.hypot(r.x - 100, r.z + 40));
    expect([...d].sort((p, q) => p - q)).toEqual(d);
    expect(Math.max(...d)).toBeLessThanOrEqual(25);
    const sizes = a.map((r) => r.w).sort((p, q) => p - q);
    expect(sizes[Math.floor(sizes.length / 2)]).toBeLessThan(0.2); // the median rock is under 20 cm
    expect(sizes[sizes.length - 1]).toBeLessThanOrEqual(1.2);
    expect(a.every((r) => r.h < r.w)).toBe(true);
  });

  it('a shadow is height over the tangent of the Sun elevation, capped; none with the Sun down', () => {
    expect(shadowLength(1, Math.PI / 4)).toBeCloseTo(1, 9);
    expect(shadowLength(0.5, (2 * Math.PI) / 180)).toBeCloseTo(14.32, 2); // half a metre of rock, Sun 2 deg up: 14 m
    expect(shadowLength(2, (1 * Math.PI) / 180)).toBe(18); // capped: the strip is drawn flat on ground that is not
    expect(shadowLength(1, -0.01)).toBe(0);
  });
});
