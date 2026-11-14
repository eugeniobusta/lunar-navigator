// "Your priorities": the landing suitability score and zone ranking under any weights.
// Pure TypeScript, no React and no DOM, so the web app and the VR view can both import it.
// Data: web/public/data/suitability/ (docs/INTERFACES.md sections 10 and 11). Method: docs/criteria.md.
//
// Each soft criterion is published as a layer of bytes: 0 at its "reject" bound, 255 at its "ideal" bound.
// The score is the weighted mean of the layers, scaled to 0..100, in integer arithmetic so that this file and the
// Python pipeline (engine/criteria.py) agree exactly. With the "balanced" weights it reproduces the published scores.

/** The six per-pixel layers, in file order. */
export const LAYER_KEYS = ["sunlight", "earth", "landing_slope", "shadow", "walkable", "temperature"] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];
/** The two terms only our time model can give, known at zone best cells: longest darkness, longest time without Earth. */
export const ZONE_KEYS = ["darkness", "no_earth"] as const;
export type TermKey = LayerKey | (typeof ZONE_KEYS)[number];
/** Relative importance of each term. Only the ratios matter; use whole numbers for exact agreement with Python. */
export type Weights = Record<TermKey, number>;

export interface Preset { key: string; label: string; weights: Weights }
export interface ZoneTerm { reject: number; ideal: number }
/** Bounds in hours for the two zone terms (suitability/weights.json carries the same numbers). */
export const DARKNESS: ZoneTerm = { reject: 354, ideal: 85 };
export const NO_EARTH: ZoneTerm = { reject: 336, ideal: 0 };

/** The default weights of docs/criteria.md. suitability/weights.json holds this and the other presets. */
export const BALANCED: Weights = {
  sunlight: 42, earth: 28, landing_slope: 28, shadow: 21, walkable: 14, temperature: 7, darkness: 30, no_earth: 30,
};

/** 0 at the reject bound, 1 at the ideal bound, linear in between (either direction). */
export function subscore(value: number, reject: number, ideal: number): number {
  return Math.min(1, Math.max(0, (value - reject) / (ideal - reject)));
}

/** A byte of a score grid: 0..100 passes every hard limit, 101..201 fails one (score = value - 101), 255 no data. */
export function decodeScore(v: number): { passes: boolean; score: number } | null {
  if (v === 255) return null;
  return v <= 100 ? { passes: true, score: v } : { passes: false, score: v - 101 };
}

function layerWeights(w: Weights): { w: number[]; den: number } {
  const list = LAYER_KEYS.map((k) => w[k]);
  return { w: list, den: 255 * list.reduce((a, b) => a + b, 0) };
}

/** Map score 0..100 from the six layer bytes of one cell: round-half-up of 100 * sum(W q) / (255 * sum(W)). */
export function mapScore(q: ArrayLike<number>, weights: Weights): number {
  const { w, den } = layerWeights(weights);
  if (den === 0) return 0;
  let num = 0;
  for (let i = 0; i < 6; i++) num += w[i] * q[i];
  return Math.floor((200 * num + den) / (2 * den));
}

/** Map score for every cell of a grid. `layers` are the six layer grids in LAYER_KEYS order, all the same length. */
export function mapScoreGrid(layers: ArrayLike<number>[], weights: Weights, out?: Uint8Array): Uint8Array {
  const n = layers[0].length;
  const res = out ?? new Uint8Array(n);
  const { w, den } = layerWeights(weights);
  if (den === 0) return res.fill(0);
  const [a, b, c, d, e, f] = layers;
  for (let i = 0; i < n; i++) {
    const num = w[0] * a[i] + w[1] * b[i] + w[2] * c[i] + w[3] * d[i] + w[4] * e[i] + w[5] * f[i];
    res[i] = Math.floor((200 * num + den) / (2 * den));
  }
  return res;
}

/** Rounds to the nearest whole number; exact halves go to the even one (as Python's round, which wrote zones.csv). */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  if (x - floor !== 0.5) return Math.round(x);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Zone score 0..100: the map score at the zone's best cell, plus longest darkness and longest time without Earth,
 * each in proportion to its weight. With BALANCED this is 70 % map score + 15 % + 15 %.
 */
export function zoneScore(mapScoreInt: number, darkH: number, noEarthH: number, weights: Weights,
  dark: ZoneTerm = DARKNESS, noEarth: ZoneTerm = NO_EARTH): number {
  let w6 = 0;
  for (const k of LAYER_KEYS) w6 += weights[k];
  const total = w6 + weights.darkness + weights.no_earth;
  if (total === 0) return 0;
  const sd = subscore(darkH, dark.reject, dark.ideal), sn = subscore(noEarthH, noEarth.reject, noEarth.ideal);
  // Same order of operations as engine/criteria.py, so both give the same floating-point sum:
  // with BALANCED it is 0.7 * map + 15 * dark + 15 * noEarth.
  return roundHalfEven((w6 / total) * mapScoreInt + ((100 * weights.darkness) / total) * sd + ((100 * weights.no_earth) / total) * sn);
}

/** What ranking needs to know about a zone (from zones.csv and zones_layers.csv). `id` is its published rank. */
export interface ZoneInput {
  id: number; q: ArrayLike<number>; darkH: number; noEarthH: number; stayOk: boolean; areaKm2: number;
}
export interface RankedZone { id: number; rank: number; score: number; mapScore: number }

/**
 * Scores every zone under the weights and ranks them: zones whose 6.5-day stay window our model confirms first,
 * then by score, then by area, then by published rank. With BALANCED the result is the published order.
 */
export function rankZones(zones: ZoneInput[], weights: Weights): RankedZone[] {
  const scored = zones.map((z) => {
    const m = mapScore(z.q, weights);
    return { z, mapScore: m, score: zoneScore(m, z.darkH, z.noEarthH, weights) };
  });
  scored.sort((a, b) => Number(b.z.stayOk) - Number(a.z.stayOk) || b.score - a.score
    || b.z.areaKm2 - a.z.areaKm2 || a.z.id - b.z.id);
  return scored.map((s, i) => ({ id: s.z.id, rank: i + 1, score: s.score, mapScore: s.mapScore }));
}

/** Where a point with this score would stand among the zones: 1 + the number of zones that score higher. */
export function rankAmong(score: number, zoneScores: ArrayLike<number>): number {
  let better = 0;
  for (let i = 0; i < zoneScores.length; i++) if (zoneScores[i] > score) better++;
  return better + 1;
}
