// The whole Moon in ORBIT: how the globe, the south-pole cap and the compass are placed, and how the view moves
// from the whole Moon down to the pole. Pure maths, no three.js, so it can be tested (moon.test.ts).
// Everything here is in the pole frame of geo.ts: origin at the south pole on the 1737.4 km sphere, +y up there,
// -z towards 0 deg E (the Earth side), +x towards 90 deg E; the Moon's centre is at (0, -R, 0).
import { R_M, type V3 } from './geo.js';

const D2R = Math.PI / 180;

/** Unit direction of a latitude / east longitude in the pole frame. */
export function poleDir(latDeg: number, lonDeg: number): V3 {
  const cp = Math.cos(latDeg * D2R);
  return [cp * Math.sin(lonDeg * D2R), -Math.sin(latDeg * D2R), -cp * Math.cos(lonDeg * D2R)];
}

/** Position in the pole frame of a point `heightM` above the 1737.4 km sphere, metres. */
export function polePoint(latDeg: number, lonDeg: number, heightM = 0): V3 {
  const d = poleDir(latDeg, lonDeg);
  const r = R_M + heightM;
  return [d[0] * r, d[1] * r - R_M, d[2] * r];
}

// ------------------------------------------------------------------------------------------------ the globe's heights

/** The LOLA heights of the CGI Moon Kit, as exported by scripts/export_moon_globe.py (xr/public/moon/moon.json). */
export interface GlobeHeights {
  data: Uint16Array;
  cols: number;
  rows: number;
  /** Metres per count, and the radius of count 0. */
  unitM: number;
  baseRadiusM: number;
}

/** Height above the 1737.4 km sphere at a latitude / longitude, bilinear, metres. Row 0 = 90 N, column 0 = 180 W. */
export function globeHeight(g: GlobeHeights, latDeg: number, lonDeg: number): number {
  const fr = Math.max(0, Math.min(g.rows - 1, ((90 - latDeg) / 180) * g.rows - 0.5));
  const fc = ((((lonDeg + 180) / 360) * g.cols - 0.5) % g.cols + g.cols) % g.cols;
  const r0 = Math.min(g.rows - 2, Math.floor(fr));
  const c0 = Math.floor(fc);
  const c1 = (c0 + 1) % g.cols;
  const tr = fr - r0;
  const tc = fc - c0;
  const v = (r: number, c: number) => g.data[r * g.cols + c];
  const count = (v(r0, c0) * (1 - tc) + v(r0, c1) * tc) * (1 - tr) + (v(r0 + 1, c0) * (1 - tc) + v(r0 + 1, c1) * tc) * tr;
  return g.baseRadiusM + g.unitM * count - R_M;
}

export interface GlobeMesh {
  position: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
}

/**
 * A latitude / longitude grid over the whole Moon in the pole frame, `cols` x `rows` quads, raised by `heightM`.
 * uv = (longitude from 180 W, latitude from 90 S), both 0..1: the layout of the CGI Moon Kit maps.
 */
export function globeMesh(cols: number, rows: number, heightM: (latDeg: number, lonDeg: number) => number): GlobeMesh {
  const position = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uv = new Float32Array((cols + 1) * (rows + 1) * 2);
  for (let r = 0; r <= rows; r++) {
    const lat = -90 + (180 * r) / rows;
    for (let c = 0; c <= cols; c++) {
      const lon = -180 + (360 * c) / cols;
      const k = r * (cols + 1) + c;
      const p = polePoint(lat, lon, heightM(lat, lon));
      position.set(p, 3 * k);
      uv[2 * k] = c / cols;
      uv[2 * k + 1] = r / rows;
    }
  }
  const index = new Uint32Array(cols * rows * 6);
  let t = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * (cols + 1) + c;
      // Counter-clockwise seen from outside.
      index[t++] = k;
      index[t++] = k + 1;
      index[t++] = k + cols + 1;
      index[t++] = k + 1;
      index[t++] = k + cols + 2;
      index[t++] = k + cols + 1;
    }
  }
  return { position, uv, index };
}

// ------------------------------------------------------------------------------------------------ the south-pole cap

/** Angle from the south pole of a point `rhoM` from the centre of the polar stereographic grid, degrees. */
export const colatDeg = (rhoM: number) => (2 * Math.atan(rhoM / (2 * R_M))) / D2R;

/**
 * Where the square south-pole grid (half-width `halfM`) is cut to a round cap and faded into the globe: the cap
 * is opaque inside `inDeg` from the pole and gone at `outDeg`, just inside the grid's edge; the globe is not drawn
 * inside `holeDeg`.
 */
export function capEdge(halfM: number): { inDeg: number; outDeg: number; holeDeg: number } {
  const edge = colatDeg(halfM);
  return { inDeg: edge - 0.75, outDeg: edge - 0.1, holeDeg: edge - 0.85 };
}

// ------------------------------------------------------------------------------------------------ the compass

/** Points of the parallel at `latDeg`, every `stepDeg` of longitude, as [lat, lon]. */
export function parallel(latDeg: number, stepDeg = 3): [number, number][] {
  const out: [number, number][] = [];
  for (let lon = -180; lon < 180; lon += stepDeg) {
    out.push([latDeg, lon]);
  }
  return out;
}

/** The latitude rings of the compass, degrees south. */
export const COMPASS_RINGS = [84, 86, 88];
/** The arrow towards Earth runs along 0 deg E between these latitudes. */
export const ARROW_FROM_LAT = -89.6;
export const ARROW_TO_LAT = -87.2;

/** The arrow "towards Earth": its shaft and the two strokes of its head, as [lat, lon] lists. */
export function earthArrow(): [number, number][][] {
  const head = 0.35; // degrees of latitude
  const shaft: [number, number][] = [];
  for (let lat = ARROW_FROM_LAT; lat < ARROW_TO_LAT; lat += 0.2) {
    shaft.push([lat, 0]);
  }
  shaft.push([ARROW_TO_LAT, 0]);
  // The head's ends sit `head` back along the shaft and `head` to either side (a longitude offset at that latitude).
  const backLat = ARROW_TO_LAT - head;
  const side = Math.atan2(head, 90 + backLat) / D2R;
  return [shaft, [[backLat, -side], [ARROW_TO_LAT, 0], [backLat, side]]];
}

// ------------------------------------------------------------------------------------------------ the view

/** Scale of the pole view: the 440 km relief is 1.6 m across. */
export const POLE_SCALE = 1.6 / 440000;
/** Scale of the whole-Moon view: the Moon is 1.3 m across. */
export const MOON_SCALE = 1.3 / (2 * R_M);
/** How far the south pole is tipped towards the viewer in the whole-Moon view, radians. */
export const MOON_TILT = 78 * D2R;
/** Where the south pole sits in the room in the pole view, and the Moon's centre in the whole-Moon view, metres. */
export const POLE_POS: V3 = [0, 0.9, -1.3];
export const MOON_POS: V3 = [0.3, 1.3, -1.7];

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface OrbitPose {
  /** Room metres per Moon metre. */
  scale: number;
  /** Rotation about the room's x axis that tips the pole (+y of the pole frame) towards the viewer (+z), radians. */
  tilt: number;
  /** The point of the room the view is centred on, and the pole-frame point that sits there. */
  room: V3;
  local: V3;
  /** Room position of the pole frame's origin (the south pole). */
  origin: V3;
}

/**
 * The placement of the Moon for a zoom between 0 (whole Moon, south pole towards the viewer) and 1 (the south
 * pole lying in front of the viewer like a table). The scale grows evenly in ratio; the tilt and the centre of
 * the view ease in and out.
 */
export function orbitPose(zoom: number): OrbitPose {
  const z = Math.max(0, Math.min(1, zoom));
  const e = smooth(z);
  const scale = Math.exp(lerp(Math.log(MOON_SCALE), Math.log(POLE_SCALE), z));
  const tilt = MOON_TILT * (1 - e);
  const room: V3 = [lerp(MOON_POS[0], POLE_POS[0], e), lerp(MOON_POS[1], POLE_POS[1], e), lerp(MOON_POS[2], POLE_POS[2], e)];
  const local: V3 = [0, -R_M * (1 - e), 0];
  const r = rotX(local, tilt);
  return { scale, tilt, room, local, origin: [room[0] - scale * r[0], room[1] - scale * r[1], room[2] - scale * r[2]] };
}

/** Rotation about x by `a`: +y turns towards +z. */
export function rotX(v: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

/** Pole-frame point -> room point under a pose. */
export function toRoom(p: OrbitPose, v: V3): V3 {
  const r = rotX(v, p.tilt);
  return [p.origin[0] + p.scale * r[0], p.origin[1] + p.scale * r[1], p.origin[2] + p.scale * r[2]];
}

/** The laptop camera's default angles for a zoom: level with the Moon at 0, looking down on the pole at 1. */
export function orbitCamera(zoom: number): { az: number; pol: number } {
  const e = smooth(Math.max(0, Math.min(1, zoom)));
  return { az: lerp(0, 0.5, e), pol: lerp(1.45, 0.72, e) };
}

/** One step of the zoom towards its target: `seconds` is how long the whole way from 0 to 1 takes. */
export function stepZoom(zoom: number, target: number, delta: number, seconds: number): number {
  const d = target - zoom;
  const max = delta / seconds;
  return Math.abs(d) <= max ? target : zoom + Math.sign(d) * max;
}
