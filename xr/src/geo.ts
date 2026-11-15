// Frames. MOON_ME (docs/SCIENCE.md section 2) -> a local scene frame tangent to the sphere at the centre of a grid,
// with its axes along the grid: scene +X = grid +x (east at the grid centre's meridian... see gridFrame),
// scene +Y = up, scene -Z = grid +y. Positions are true 3D positions, so the Moon's curvature is in the scene.
import { siteFrame, type Ephemeris } from '../../web/src/lib/analysis';
import {
  heightAt,
  stereoLatLon,
  type HeightGrid,
} from '../../web/src/lib/analysis/demHorizon';

export type V3 = [number, number, number];
export const R_M = 1737400;
const D2R = Math.PI / 180;

export interface Frame {
  /** Unit vectors in MOON_ME: grid +x, grid +y and up at the frame origin. */
  gx: V3;
  gy: V3;
  up: V3;
  /** Frame origin in MOON_ME, metres: the point on the 1737.4 km sphere under the grid centre. */
  origin: V3;
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Tangent frame at stereographic x/y (m), axes aligned with the stereographic grid. */
export function gridFrame(x: number, y: number): Frame {
  const [lat, lon] = stereoLatLon(x, y);
  const f = siteFrame(lat, lon, R_M);
  const c = Math.cos(lon * D2R);
  const s = Math.sin(lon * D2R);
  // In the grid, north (away from the pole) is (sin lon, cos lon) and east is (cos lon, -sin lon).
  const gx: V3 = [0, 1, 2].map((i) => c * f.east[i] + s * f.north[i]) as V3;
  const gy: V3 = [0, 1, 2].map((i) => -s * f.east[i] + c * f.north[i]) as V3;
  return { gx, gy, up: f.up as V3, origin: f.pos as V3 };
}

/** MOON_ME direction -> scene direction. */
export function dirToScene(f: Frame, v: V3): V3 {
  return [dot(v, f.gx), dot(v, f.up), -dot(v, f.gy)];
}

/** MOON_ME position (m) -> scene position (m). */
export function pointToScene(f: Frame, p: V3): V3 {
  return dirToScene(f, [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]]);
}

/** Unit vector (MOON_ME) of latitude / east longitude in degrees. */
export function unitOf(latDeg: number, lonDeg: number): V3 {
  const cp = Math.cos(latDeg * D2R);
  return [cp * Math.cos(lonDeg * D2R), cp * Math.sin(lonDeg * D2R), Math.sin(latDeg * D2R)];
}

export function latLonToScene(f: Frame, latDeg: number, lonDeg: number, heightM: number): V3 {
  const u = unitOf(latDeg, lonDeg);
  const r = R_M + heightM;
  return pointToScene(f, [u[0] * r, u[1] * r, u[2] * r]);
}

/** Scene direction of azimuth / elevation (deg) seen from latitude / longitude (SCIENCE.md section 2). */
export function azElToScene(f: Frame, latDeg: number, lonDeg: number, azDeg: number, elDeg: number): V3 {
  const s = siteFrame(latDeg, lonDeg, 1);
  const ce = Math.cos(elDeg * D2R);
  const se = Math.sin(elDeg * D2R);
  const ca = Math.cos(azDeg * D2R);
  const sa = Math.sin(azDeg * D2R);
  const v: V3 = [0, 1, 2].map((i) => ce * (sa * s.east[i] + ca * s.north[i]) + se * s.up[i]) as V3;
  return dirToScene(f, v);
}

/** Sun direction (MOON_ME unit vector) at a fractional sample index, interpolated between hourly samples. */
export function sunDirAt(eph: Ephemeris, idx: number): V3 {
  const i0 = Math.max(0, Math.min(eph.n - 2, Math.floor(idx)));
  const t = Math.max(0, Math.min(1, idx - i0));
  const a = eph.sunDir;
  const v: V3 = [0, 1, 2].map((k) => a[3 * i0 + k] * (1 - t) + a[3 * i0 + 3 + k] * t) as V3;
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Earth centre minus Moon centre (MOON_ME, km) at a fractional sample index. */
export function earthKmAt(eph: Ephemeris, idx: number): V3 {
  const i0 = Math.max(0, Math.min(eph.n - 2, Math.floor(idx)));
  const t = Math.max(0, Math.min(1, idx - i0));
  const a = eph.earthKm;
  return [0, 1, 2].map((k) => a[3 * i0 + k] * (1 - t) + a[3 * i0 + 3 + k] * t) as V3;
}

/** A height grid placed in a scene frame: true 3D positions of every pixel centre. */
export interface Field {
  grid: HeightGrid;
  frame: Frame;
  /** Scene y of every pixel (row-major, row 0 = north). */
  up: Float32Array;
  /** Scene x and z of every pixel. */
  x: Float32Array;
  z: Float32Array;
}

export function buildField(grid: HeightGrid, frame: Frame): Field {
  const n = grid.size;
  const up = new Float32Array(n * n);
  const xs = new Float32Array(n * n);
  const zs = new Float32Array(n * n);
  const span = grid.heightMaxM - grid.heightMinM;
  const { gx, gy, up: u, origin: o } = frame;
  for (let r = 0; r < n; r++) {
    const y = grid.yMaxM - (r + 0.5) * grid.pixelM;
    for (let c = 0; c < n; c++) {
      const x = grid.xMinM + (c + 0.5) * grid.pixelM;
      const i = r * n + c;
      const h = grid.heightMinM + (grid.data[i] / 65535) * span;
      // Inverse south polar stereographic without trig: q = (rho / 2R)^2.
      const q = (x * x + y * y) / (4 * R_M * R_M);
      const k = (R_M + h) / (R_M * (1 + q));
      const px = y * k - o[0];
      const py = x * k - o[1];
      const pz = -(R_M + h) * ((1 - q) / (1 + q)) - o[2];
      xs[i] = px * gx[0] + py * gx[1] + pz * gx[2];
      up[i] = px * u[0] + py * u[1] + pz * u[2];
      zs[i] = -(px * gy[0] + py * gy[1] + pz * gy[2]);
    }
  }
  return { grid, frame, up, x: xs, z: zs };
}

/** Fractional (row, col) of scene x/z in a field (the grid is locally a plain square lattice in the scene). */
export function fieldRowCol(f: Field, x: number, z: number): [number, number] {
  const c = (f.grid.size - 1) / 2;
  return [z / f.grid.pixelM + c, x / f.grid.pixelM + c];
}

/** Bilinear scene height (y) of the field at scene x/z. NaN outside. */
export function fieldUpAt(f: Field, x: number, z: number): number {
  const [fr, fc] = fieldRowCol(f, x, z);
  const n = f.grid.size;
  if (!(fr >= 0 && fc >= 0 && fr <= n - 1 && fc <= n - 1)) {
    return NaN;
  }
  const r0 = Math.min(Math.floor(fr), n - 2);
  const c0 = Math.min(Math.floor(fc), n - 2);
  const tr = fr - r0;
  const tc = fc - c0;
  const i = r0 * n + c0;
  const a = f.up;
  return (1 - tr) * ((1 - tc) * a[i] + tc * a[i + 1]) + tr * ((1 - tc) * a[i + n] + tc * a[i + n + 1]);
}

/** The cell of a field's mesh (one vertex every `step` pixels) that holds scene x/z, and where in it (0..1). */
function meshCell(f: Field, step: number, x: number, z: number): { r0: number; r1: number; c0: number; c1: number; u: number; v: number } | null {
  const n = f.grid.size;
  const [fr, fc] = fieldRowCol(f, x, z);
  if (!(fr >= -1 && fc >= -1 && fr <= n && fc <= n)) {
    return null;
  }
  // The mesh's rows and columns: 0, step, 2 step, ... and the last pixel.
  const lo = (v: number) => Math.max(0, Math.min(Math.floor(v / step) * step, Math.floor((n - 2) / step) * step));
  const hi = (v: number) => Math.min(v + step, n - 1);
  let r0 = lo(fr);
  let c0 = lo(fc);
  let u = 0;
  let v = 0;
  // The pixel lattice is only nearly square in the scene (a pixel's height moves it sideways too, by up to tens of
  // metres at a tile's edge): solve for the place in the cell from its four real corners, and step to the next
  // cell while the point is outside.
  const eps = 1e-4;
  for (let k = 0; k < 6; k++) {
    const r1 = hi(r0);
    const c1 = hi(c0);
    const [i00, i01, i10, i11] = [r0 * n + c0, r0 * n + c1, r1 * n + c0, r1 * n + c1];
    u = v = 0.5;
    for (let j = 0; j < 3; j++) {
      const xa = f.x[i00] + v * (f.x[i10] - f.x[i00]);
      const xb = f.x[i01] + v * (f.x[i11] - f.x[i01]);
      u = (x - xa) / (xb - xa);
      const za = f.z[i00] + u * (f.z[i01] - f.z[i00]);
      const zb = f.z[i10] + u * (f.z[i11] - f.z[i10]);
      v = (z - za) / (zb - za);
    }
    const dc = u < -eps && c0 > 0 ? -step : u > 1 + eps && c1 < n - 1 ? step : 0;
    const dr = v < -eps && r0 > 0 ? -step : v > 1 + eps && r1 < n - 1 ? step : 0;
    if (!dc && !dr) {
      break;
    }
    c0 = lo(c0 + dc);
    r0 = lo(r0 + dr);
  }
  const out = u < -0.01 || v < -0.01 || u > 1.01 || v > 1.01;
  return out ? null : { r0, r1: hi(r0), c0, c1: hi(c0), u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
}

/**
 * Scene height (y) of the terrain mesh at scene x/z: the surface of the triangles that fieldGeometry (terrain.ts)
 * draws with one vertex every `step` pixels, so that anything placed with it sits exactly on the drawn ground.
 * NaN outside the field.
 */
export function meshUpAt(f: Field, step: number, x: number, z: number): number {
  const c = meshCell(f, step, x, z);
  if (!c) {
    return NaN;
  }
  const n = f.grid.size;
  const h00 = f.up[c.r0 * n + c.c0];
  const h01 = f.up[c.r0 * n + c.c1];
  const h10 = f.up[c.r1 * n + c.c0];
  const h11 = f.up[c.r1 * n + c.c1];
  // Each cell is two triangles split along the diagonal from (row, col + 1) to (row + 1, col).
  return c.u + c.v <= 1 ? h00 + c.u * (h01 - h00) + c.v * (h10 - h00) : h11 + (1 - c.u) * (h10 - h11) + (1 - c.v) * (h01 - h11);
}

/** Fractional (row, col) of scene x/z from the pixels' true positions (fieldRowCol is the quick estimate). Null outside. */
export function meshRowCol(f: Field, x: number, z: number): [number, number] | null {
  const c = meshCell(f, 1, x, z);
  return c ? [c.r0 + c.v * (c.r1 - c.r0), c.c0 + c.u * (c.c1 - c.c0)] : null;
}

export interface GroundHit {
  row: number;
  col: number;
  lat: number;
  lon: number;
  /** DEM height above the 1737.4 km sphere, metres. */
  heightM: number;
  /** Scene position of the hit. */
  pos: V3;
}

/** The ground point at fractional pixel (row, col) of a field. */
export function groundAt(f: Field, row: number, col: number): GroundHit {
  const g = f.grid;
  const x = g.xMinM + (col + 0.5) * g.pixelM;
  const y = g.yMaxM - (row + 0.5) * g.pixelM;
  const [lat, lon] = stereoLatLon(x, y);
  const heightM = heightAt(g, x, y);
  return { row, col, lat, lon, heightM, pos: latLonToScene(f.frame, lat, lon, heightM) };
}

/**
 * Landing slope (deg) at pixel (row, col) of a 120 m grid, with the formula of engine/criteria.py landing_slope_deg
 * (the one behind landing_slope_deg in zones.csv and the 10 degree hard limit): over one pixel, the steeper of the
 * two one-sided differences on each axis, corrected for the map scale. NaN on the grid's edge.
 */
export function landingSlopeDeg(g: HeightGrid, row: number, col: number): number {
  const n = g.size;
  if (!(row >= 1 && col >= 1 && row <= n - 2 && col <= n - 2)) {
    return NaN;
  }
  const m = (g.heightMaxM - g.heightMinM) / 65535;
  const i = row * n + col;
  const h = g.data[i];
  const sx = Math.max(Math.abs(g.data[i + 1] - h), Math.abs(h - g.data[i - 1])) * m;
  const sy = Math.max(Math.abs(g.data[i + n] - h), Math.abs(h - g.data[i - n])) * m;
  const x = g.xMinM + (col + 0.5) * g.pixelM;
  const y = g.yMaxM - (row + 0.5) * g.pixelM;
  const k = 1 + (x * x + y * y) / (4 * R_M * R_M);
  return Math.atan((Math.hypot(sx, sy) / g.pixelM) * k) / D2R;
}

/** First intersection of a scene ray with the field's surface, or null. */
export function raycastField(f: Field, o: V3, d: V3, maxDist: number): GroundHit | null {
  const step = f.grid.pixelM * 0.5;
  let prevT = 0;
  let prevAbove = true;
  for (let t = 0; t <= maxDist; t += step) {
    const x = o[0] + d[0] * t;
    const y = o[1] + d[1] * t;
    const z = o[2] + d[2] * t;
    const h = fieldUpAt(f, x, z);
    if (Number.isNaN(h)) {
      prevT = t;
      prevAbove = true;
      continue;
    }
    if (y < h) {
      if (!prevAbove) {
        return null; // started under the surface
      }
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 12; k++) {
        const m = 0.5 * (lo + hi);
        const hm = fieldUpAt(f, o[0] + d[0] * m, o[2] + d[2] * m);
        if (Number.isNaN(hm) || o[1] + d[1] * m > hm) {
          lo = m;
        } else {
          hi = m;
        }
      }
      const [row, col] = fieldRowCol(f, o[0] + d[0] * hi, o[2] + d[2] * hi);
      const n = f.grid.size;
      return groundAt(f, Math.max(0, Math.min(n - 1, row)), Math.max(0, Math.min(n - 1, col)));
    }
    prevT = t;
    prevAbove = true;
  }
  return null;
}

/**
 * The terrain shadow test of terrain.ts (SHADOW_FRAG) on the CPU, for one pixel: Sun elevation minus the highest
 * obstruction along the Sun's azimuth, in degrees, in the scene's Euclidean frame. The GPU does exactly this for
 * every pixel; this copy exists so a test can compare it with demHorizon + computeSeries.
 */
export function shadowMarginDeg(inner: Field, outer: Field | null, row: number, col: number, sun: V3, observerM = 1): number {
  const p = inner.grid.pixelM;
  const c = (inner.grid.size - 1) / 2;
  const x0 = (col - c) * p;
  const z0 = (row - c) * p;
  const h = Math.hypot(sun[0], sun[2]);
  const dx = sun[0] / h;
  const dz = sun[2] / h;
  const u0 = fieldUpAt(inner, x0, z0) + observerM;
  let maxTan = -1e9;
  for (let s = p, i = 0; i < 128 && s <= 150000; i++, s += s < 25 * p ? p : s * 0.04) {
    let u = fieldUpAt(inner, x0 + dx * s, z0 + dz * s);
    if (Number.isNaN(u) && outer) {
      u = fieldUpAt(outer, x0 + dx * s, z0 + dz * s);
    }
    if (Number.isNaN(u)) {
      break;
    }
    maxTan = Math.max(maxTan, (u - u0) / s);
  }
  return (Math.atan2(sun[1], h) - Math.atan(maxTan)) / D2R;
}
