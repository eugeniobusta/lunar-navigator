// "Your priorities": the landing suitability score and zone ranking under any weights.
// Pure TypeScript, no React and no DOM, so the web app and the VR view can both import it.
// Data: web/public/data/suitability/ (docs/INTERFACES.md sections 10 and 11). Method: docs/criteria.md.
//
// Each soft criterion is published as a layer of bytes: 0 at its "reject" bound, 255 at its "ideal" bound.
// This is the one scoring engine: "Where to land", its Layers view and the VR all score through this file.
// The score is the weighted mean of the layers, scaled to 0..100, in integer arithmetic so that this file and the
// Python pipeline (engine/criteria.py) agree exactly. With the "balanced" weights it reproduces the published scores.

/** The per-pixel layers, in file order. The last two carry no weight in the balanced score. */
export const LAYER_KEYS = ["sunlight", "earth", "landing_slope", "shadow", "walkable", "temperature", "ice", "hollow"] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];
/** The two terms only our time model can give, known at zone best cells: longest darkness, longest time without Earth. */
export const ZONE_KEYS = ["darkness", "no_earth"] as const;
export type TermKey = LayerKey | (typeof ZONE_KEYS)[number];
/** Relative importance of each term. Only the ratios matter; use whole numbers for exact agreement with Python. */
export type Weights = Record<TermKey, number>;

/** A preset of suitability/weights.json: the parameters it ticks, and the weights that follow from them. */
export interface Preset { key: string; label: string; weights: Weights; ticked?: TermKey[] }
export interface ZoneTerm { reject: number; ideal: number }
/** Bounds in hours for the two zone terms (suitability/weights.json carries the same numbers). */
export const DARKNESS: ZoneTerm = { reject: 354, ideal: 85 };
export const NO_EARTH: ZoneTerm = { reject: 336, ideal: 0 };

/** Every parameter, in the order of the checkbox list and of the old w= links: the layers, then the zone terms. */
export const TERM_KEYS: TermKey[] = [...LAYER_KEYS, ...ZONE_KEYS];

/** How much a ticked parameter counts: low 0.5, normal 1, high 2, kept as whole numbers so scores stay exact. */
export type Importance = "low" | "normal" | "high";
export const IMPORTANCE: Record<Importance, number> = { low: 1, normal: 2, high: 4 };

/**
 * What the user asked for: the ticked parameters, and optionally an importance for some of them (default normal).
 * The score is the weighted mean of the ticked parameters' scores; NASA's hard limits always apply.
 * `weights`, when present, are exact weights that replace the importances (the "NASA-style balance" preset, which
 * reproduces the published scores, and old w= links).
 */
export interface Selection {
  ticked: TermKey[];
  importance?: Partial<Record<TermKey, Importance>>;
  weights?: Weights;
}

/** The weights a selection stands for: each ticked parameter's importance, 0 for the others. */
export function selectionWeights(sel: Selection): Weights {
  if (sel.weights) return sel.weights;
  const w = {} as Weights;
  for (const k of TERM_KEYS) w[k] = sel.ticked.includes(k) ? IMPORTANCE[sel.importance?.[k] ?? "normal"] : 0;
  return w;
}

/** The default: every parameter ticked, all equally important. */
export const EVERYTHING: Selection = { ticked: [...TERM_KEYS] };

/** The selection a preset stands for. Presets with their own weights (NASA-style balance) keep them. */
export function presetSelection(p: Preset): Selection {
  const ticked = TERM_KEYS.filter((k) => (p.ticked ? p.ticked.includes(k) : p.weights[k] > 0));
  const plain = selectionWeights({ ticked });
  return TERM_KEYS.every((k) => plain[k] === p.weights[k]) ? { ticked } : { ticked, weights: p.weights };
}

/** True if two selections give the same weights (so the same scores and ranking). */
export function sameSelection(a: Selection, b: Selection): boolean {
  const wa = selectionWeights(a), wb = selectionWeights(b);
  return TERM_KEYS.every((k) => wa[k] === wb[k]);
}

/** The parameters of a selection that actually count (ticked, or with weight in an exact-weights selection). */
export function countedTerms(sel: Selection): TermKey[] {
  const w = selectionWeights(sel);
  return TERM_KEYS.filter((k) => w[k] > 0);
}

/** Ticks or unticks one parameter. Any exact weights are dropped: the result is a plain selection again. */
export function toggleTerm(sel: Selection, key: TermKey): Selection {
  const on = countedTerms(sel);
  const ticked = on.includes(key) ? on.filter((k) => k !== key) : TERM_KEYS.filter((k) => on.includes(k) || k === key);
  return { ticked, importance: sel.weights ? undefined : sel.importance };
}

/** Sets one ticked parameter's importance. */
export function setImportance(sel: Selection, key: TermKey, level: Importance): Selection {
  return { ticked: countedTerms(sel), importance: { ...(sel.weights ? {} : sel.importance), [key]: level } };
}

/** Zones scored and ranked for a selection (rankZones with the selection's weights). */
export function rankZonesFor(zones: ZoneInput[], sel: Selection): RankedZone[] {
  return rankZones(zones, selectionWeights(sel));
}

/** The weights of docs/criteria.md ("NASA-style balance"): they reproduce the published scores exactly. */
export const BALANCED: Weights = {
  sunlight: 42, earth: 28, landing_slope: 28, shadow: 21, walkable: 14, temperature: 7, ice: 0, hollow: 0,
  darkness: 30, no_earth: 30,
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

/** Map score 0..100 from the layer bytes of one cell (LAYER_KEYS order): round-half-up of 100 * sum(W q) / (255 * sum(W)). */
export function mapScore(q: ArrayLike<number>, weights: Weights): number {
  const { w, den } = layerWeights(weights);
  if (den === 0) return 0;
  let num = 0;
  for (let i = 0; i < w.length; i++) num += w[i] * q[i];
  return Math.floor((200 * num + den) / (2 * den));
}

/** Map score for every cell of a grid. `layers` are the layer grids in LAYER_KEYS order, all the same length. */
export function mapScoreGrid(layers: ArrayLike<number>[], weights: Weights, out?: Uint8Array): Uint8Array {
  const n = layers[0].length;
  const res = out ?? new Uint8Array(n);
  const { w, den } = layerWeights(weights);
  if (den === 0) return res.fill(0);
  // Sum the weighted layers one at a time (layers with no weight are skipped), then scale.
  const num = new Float64Array(n);
  for (let k = 0; k < w.length; k++) {
    const wk = w[k], layer = layers[k];
    if (wk === 0) continue;
    for (let i = 0; i < n; i++) num[i] += wk * layer[i];
  }
  for (let i = 0; i < n; i++) res[i] = Math.floor((200 * num[i] + den) / (2 * den));
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

/** What the checkbox list says about each parameter: its name, one plain line, and its colour token. */
export interface ParameterInfo { key: TermKey; label: string; explain: string; token: string }
export const PARAMETERS: ParameterInfo[] = [
  { key: "sunlight", label: "Sunlight", token: "--sunlight", explain: "How much of the time the Sun is up: solar power and warmth." },
  { key: "darkness", label: "Short nights", token: "--p-nights", explain: "How long the longest night lasts: a lander must sit it out on batteries." },
  { key: "earth", label: "Earth in view", token: "--earth", explain: "How much of the time Earth is above the skyline: a direct radio link." },
  { key: "no_earth", label: "Never out of contact", token: "--cloud", explain: "How long the longest stretch without Earth lasts." },
  { key: "landing_slope", label: "Landing slope", token: "--lichen", explain: "How flat the ground is, with margin under NASA's 10 degree limit." },
  { key: "walkable", label: "Walkable ground", token: "--p-walkable", explain: "How much of the ground within 2 km a suited astronaut can walk." },
  { key: "shadow", label: "Ice nearby", token: "--p-ice-near", explain: "How close the nearest permanent shadow is, where water ice may survive." },
  { key: "ice", label: "Ice depth", token: "--p-ice-depth", explain: "How deep you would dig before ice stays frozen: within a 1 m drill or not." },
  { key: "temperature", label: "Temperature", token: "--p-temperature", explain: "How mild the ground is on average: very cold ground needs more heating." },
  { key: "hollow", label: "Hollow depth", token: "--p-hollow", explain: "Whether the spot sits in a dip, with raised ground all round." },
];
export const parameter = (key: TermKey): ParameterInfo => PARAMETERS.find((p) => p.key === key)!;
