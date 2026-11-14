// Layers view of "Where to land": a thin adapter over the one scoring engine (suitability.ts).
// It holds only what the map needs on top of it: reading a layer byte back as a value, where a pixel is on the
// Moon, and which colour token each layer uses. All scoring goes through suitability.ts, so this view can never
// disagree with the zone ranking. First written by Chinh as the Site Map demo; folded in here.
import { LAYER_KEYS, decodeScore, mapScore, type LayerKey, type Weights } from "./suitability";

/** One layer as described in suitability/weights.json. */
export interface LayerInfo { key: LayerKey; label: string; unit: string; reject: number; ideal: number }

/** A layer byte back to the value it stands for: `reject` at 0, `ideal` at 255. Values beyond either bound are not
 *  kept in the layer, so 0 and 255 mean "at the bound or beyond it". */
export function layerValue(q: number, info: Pick<LayerInfo, "reject" | "ideal">): number {
  return info.reject + (q / 255) * (info.ideal - info.reject);
}

/** The value in words, e.g. "57 % of time", "70 % of time or more", "10 deg or more". */
export function layerValueText(q: number, info: LayerInfo): string {
  const v = layerValue(q, info);
  const text = `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")} ${info.unit}`;
  if (q > 0 && q < 255) return text;
  const moreIsBetter = info.ideal > info.reject;
  return `${text} or ${(q === 255) === moreIsBetter ? "more" : "less"}`;
}

/** Everything the Layers view says about one grid cell. */
export interface PointReadout {
  /** Passes every hard limit (from the published score grid); null where there is no data. */
  passes: boolean | null;
  /** Map score 0..100 under the given weights: suitability.mapScore of this cell's layer bytes. */
  score: number;
  /** The layer bytes of this cell, in LAYER_KEYS order. */
  q: number[];
}

/** Reads cell `i` of the south-pole grids. `layers` in LAYER_KEYS order; `scoreGrid` is south_pole_score.u8. */
export function readPoint(layers: ArrayLike<number>[], scoreGrid: ArrayLike<number>, i: number, weights: Weights): PointReadout {
  const q = LAYER_KEYS.map((_, k) => layers[k][i]);
  const published = decodeScore(scoreGrid[i]);
  return { passes: published ? published.passes : null, score: mapScore(q, weights), q };
}

/** Names of the hard limits whose bit is set in a byte of south_pole_limits.u8. */
export function failedLimits(bits: number): string[] {
  if (bits === 255) return [];
  const names: [number, string][] = [[1, "landing slope of 10° or more"], [2, "too little walkable ground"],
    [4, "too little sunlight"], [8, "Earth in view too rarely"], [16, "more than 6° from the pole"]];
  return names.filter(([bit]) => bits & bit).map(([, name]) => name);
}

const R_M = 1737400;
/** The section-8 grid: 1024 pixels across 440 km, centred on the pole. */
export const GRID = { size: 1024, halfM: 220000 } as const;

/** Polar stereographic metres -> latitude, east longitude (deg). lon 0 towards +y, lon 90 E towards +x. */
export function xyToLatLon(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y);
  return [-90 + (2 * Math.atan(rho / (2 * R_M)) * 180) / Math.PI, (Math.atan2(x, y) * 180) / Math.PI];
}

/** Latitude, east longitude -> polar stereographic metres. */
export function latLonToXY(lat: number, lon: number): [number, number] {
  const rho = 2 * R_M * Math.tan(((90 + lat) * Math.PI) / 360);
  const l = (lon * Math.PI) / 180;
  return [rho * Math.sin(l), rho * Math.cos(l)];
}

/** Index of the grid cell that holds a point given in polar stereographic metres; -1 outside the grid. */
export function cellAt(x: number, y: number): number {
  const px = (2 * GRID.halfM) / GRID.size;
  const col = Math.floor((x + GRID.halfM) / px), row = Math.floor((GRID.halfM - y) / px);
  return col < 0 || row < 0 || col >= GRID.size || row >= GRID.size ? -1 : row * GRID.size + col;
}

/** Centre of grid cell `i` in polar stereographic metres. */
export function cellCentre(i: number): [number, number] {
  const px = (2 * GRID.halfM) / GRID.size;
  const row = Math.floor(i / GRID.size), col = i % GRID.size;
  return [-GRID.halfM + (col + 0.5) * px, GRID.halfM - (row + 0.5) * px];
}

/** The colour token each layer is drawn in. A colour keeps its meaning: sunlight, Earth, dark, and OK ground. */
export const LAYER_TOKEN: Record<LayerKey, string> = {
  sunlight: "--sunlight", earth: "--earth", landing_slope: "--lichen", shadow: "--eclipse", walkable: "--lichen",
  temperature: "--bone", ice: "--cloud", hollow: "--lichen",
};

type RGB = [number, number, number];
const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A three-stop ramp, t in 0..1. Used for the colour-blind palette (dark blue, grey, yellow). */
export function ramp3(stops: [RGB, RGB, RGB], t: number): RGB {
  const s = Math.min(1, Math.max(0, t));
  return s < 0.5 ? lerp(stops[0], stops[1], s / 0.5) : lerp(stops[1], stops[2], (s - 0.5) / 0.5);
}
