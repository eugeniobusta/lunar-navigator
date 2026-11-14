// Site Map factors (demo): decode the per-factor rasters in public/data/sitemap/ and score them.
//
// Each factor has a "reject" value (score 0) and an "ideal" value (score 1) with a straight line in between, so
// slope 10 deg -> 0, 5 deg -> 0.5, 0 deg -> 1. The combined score of the chosen factors uses equal weights, and
// any chosen factor scoring 0 makes the combined score 0 (a lander that tips over does not care about sunlight).
// The factor's own layer still shows its own score. Factors with no data at a pixel are left out of the mean.

export interface FactorMeta {
  key: string; name: string; unit: string; file: string;
  encMin: number; encMax: number;
  reject: number; ideal: number; weight: number;
  available: boolean; source: string; explain: string;
}

export interface SiteMapMeta {
  size: number; pixelM: number; xMinM: number; yMaxM: number;
  factors: FactorMeta[];
}

/** Raw value of one factor at every pixel; NaN = no data. */
export interface FactorLayer { meta: FactorMeta; values: Float32Array }

export const NO_DATA = 255;

/** u8 raster -> physical values (enc_min + v / 254 * range; 255 = no data). */
export function decodeLayer(meta: FactorMeta, bytes: Uint8Array): FactorLayer {
  const values = new Float32Array(bytes.length);
  const k = (meta.encMax - meta.encMin) / 254;
  for (let i = 0; i < bytes.length; i++) values[i] = bytes[i] === NO_DATA ? NaN : meta.encMin + bytes[i] * k;
  return { meta, values };
}

/** 0 at the reject bound, 1 at the ideal bound, linear in between; works whether more or less is better. */
export function factorScore(v: number, reject: number, ideal: number): number {
  if (!Number.isFinite(v)) return NaN;
  if (ideal === reject) return v === ideal ? 1 : 0;
  const s = (v - reject) / (ideal - reject);
  return s <= 0 ? 0 : s >= 1 ? 1 : s;
}

export interface Thresholds { reject: number; ideal: number; weight: number }

/**
 * Combined score 0..1 of several factor scores (NaN entries = no data, left out).
 * Any factor at 0 (with weight > 0) gives 0. Returns NaN if no factor has data.
 */
export function combineScores(scores: ArrayLike<number>, weights: ArrayLike<number>): number {
  let total = 0, wsum = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i], w = weights[i];
    if (!Number.isFinite(s) || w <= 0) continue;
    if (s <= 0) return 0;
    total += s * w; wsum += w;
  }
  return wsum > 0 ? total / wsum : NaN;
}

/** Combined score at every pixel for the chosen layers. Allocates once per call; ~1 M pixels x layers. */
export function combinedGrid(layers: FactorLayer[], th: Thresholds[]): Float32Array {
  const n = layers[0]?.values.length ?? 0;
  const out = new Float32Array(n);
  const s = new Float64Array(layers.length), w = new Float64Array(layers.length);
  for (let j = 0; j < layers.length; j++) w[j] = th[j].weight;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < layers.length; j++) s[j] = factorScore(layers[j].values[i], th[j].reject, th[j].ideal);
    out[i] = combineScores(s, w);
  }
  return out;
}

const R_M = 1737400;

/** Pixel centre (row, col) -> polar stereographic metres (docs/INTERFACES.md section 8). */
export function pixelToXY(m: SiteMapMeta, row: number, col: number): [number, number] {
  return [m.xMinM + (col + 0.5) * m.pixelM, m.yMaxM - (row + 0.5) * m.pixelM];
}

/** Polar stereographic metres -> latitude, east longitude (deg). lon 0 towards +y, lon 90 E towards +x. */
export function xyToLatLon(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y);
  const lat = -90 + (2 * Math.atan(rho / (2 * R_M)) * 180) / Math.PI;
  const lon = (Math.atan2(x, y) * 180) / Math.PI;
  return [lat, lon];
}

/** Latitude, east longitude -> polar stereographic metres. */
export function latLonToXY(lat: number, lon: number): [number, number] {
  const rho = 2 * R_M * Math.tan(((90 + lat) * Math.PI) / 360);
  const l = (lon * Math.PI) / 180;
  return [rho * Math.sin(l), rho * Math.cos(l)];
}

// ---------------------------------------------------------------------------------------------------
// Colours. Normal: one hue per factor, combined red -> yellow -> green. Colour-blind: Okabe-Ito hues and a
// blue -> yellow (cividis-like) combined ramp, which stays readable for red/green colour blindness.

export type ColourMode = "normal" | "colourblind";
type RGB = [number, number, number];

const NORMAL: Record<string, RGB> = {
  landing_slope_deg: [168, 85, 247], eva_slope_deg: [236, 72, 153], bowl_depth_m: [180, 120, 60],
  sun_pct: [246, 185, 59], earth_pct: [47, 111, 214], psr_distance_km: [34, 211, 238],
  temp_avg_k: [239, 68, 68], ice_depth_m: [20, 184, 166],
};
const OKABE: Record<string, RGB> = {
  landing_slope_deg: [204, 121, 167], eva_slope_deg: [213, 94, 0], bowl_depth_m: [140, 140, 140],
  sun_pct: [230, 159, 0], earth_pct: [0, 114, 178], psr_distance_km: [86, 180, 233],
  temp_avg_k: [240, 228, 66], ice_depth_m: [0, 158, 115],
};

export function factorColour(key: string, mode: ColourMode): RGB {
  return (mode === "colourblind" ? OKABE : NORMAL)[key] ?? [200, 200, 200];
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Combined score 0..1 -> colour. Normal: red, yellow, green. Colour-blind: dark blue, grey, yellow. */
export function combinedColour(s: number, mode: ColourMode): RGB {
  const stops: RGB[] = mode === "colourblind"
    ? [[0, 32, 77], [124, 123, 120], [253, 231, 55]]
    : [[215, 48, 39], [254, 224, 90], [26, 152, 80]];
  return s < 0.5 ? lerp(stops[0], stops[1], s / 0.5) : lerp(stops[1], stops[2], (s - 0.5) / 0.5);
}
