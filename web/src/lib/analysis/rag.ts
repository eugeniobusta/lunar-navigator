// Traffic lights: every parameter, and the combined score, as one of three classes per map pixel.
//   green = in the good range (safest), amber = acceptable, red = rejected; grey = no data, never green.
// Pure TypeScript, no React and no DOM, so the web app and the VR view can both import it.
// Bounds are those of docs/criteria.csv (through explain.ts RULES, which a test keeps in step with it).
// Method and the reasoning for the thresholds: docs/criteria.md section 8.
//
// Rules, in order:
//  1. No data -> grey.
//  2. A pixel that fails a NASA hard limit is red and labelled "unsafe: fails <limit>". Nothing overrides this:
//     not the score, not a flipped direction, not the display settings.
//  3. One parameter shown by itself: green at or beyond its ideal bound, red at or beyond its reject bound, amber
//     in between. A flipped parameter swaps green and red.
//  4. Several parameters: the weighted score of suitability.ts, then green >= 70, amber 40 to 69, red < 40.
import { RULES, TERM_OF, verdictOf, type PointValues } from "./explain";
import {
  LAYER_KEYS, TERM_KEYS, countedTerms, flipBytes, flippedTerms, mapScore, selectionWeights,
  type LayerKey, type Selection, type TermKey,
} from "./suitability";

export type Rag = "green" | "amber" | "red" | "grey";

/** Score classes for a combined map (docs/criteria.md section 8): green from 70, amber from 40, red below. */
export const SCORE_GREEN = 70;
export const SCORE_AMBER = 40;

/** Class of a combined score 0..100. */
export function classifyScore(score: number): Rag {
  if (!Number.isFinite(score)) return "grey";
  return score >= SCORE_GREEN ? "green" : score >= SCORE_AMBER ? "amber" : "red";
}

/** Bounds of every parameter in its own unit: `ideal` is where green starts, `reject` where red starts. */
export interface Bounds { ideal: number; reject: number; unit: string }
const UNITS: Record<TermKey, string> = {
  sunlight: "% of the time", earth: "% of the time", landing_slope: "°", shadow: "km", walkable: "%",
  temperature: "K", ice: "m", hollow: "m", darkness: "h", no_earth: "h",
};
const valueKey = (term: TermKey) => (Object.keys(TERM_OF) as (keyof PointValues)[]).find((k) => TERM_OF[k] === term)!;
const ruleOf = (term: TermKey) => RULES.find((r) => r.key === valueKey(term))!;
export const BOUNDS: Record<TermKey, Bounds> = Object.fromEntries(TERM_KEYS.map((k) => {
  const r = ruleOf(k);
  return [k, { ideal: r.ideal, reject: r.reject, unit: UNITS[k] }];
})) as Record<TermKey, Bounds>;

/** Which way each parameter is preferred by default: "more" if a larger value is better. */
export type Direction = "more" | "less";
export const prefers = (term: TermKey, flipped = false): Direction =>
  ((BOUNDS[term].ideal > BOUNDS[term].reject) !== flipped ? "more" : "less");
/** Plain words for the two directions of the parameters that can flip, as [less, more]. */
export const DIRECTION_WORDS: Partial<Record<TermKey, [string, string]>> = {
  landing_slope: ["flatter", "steeper"], shadow: ["nearer", "farther"], ice: ["shallower", "deeper"],
  temperature: ["colder", "warmer"], hollow: ["level", "sunken"],
};

/** The four groups of the layer panel. A group tick ticks all its parameters. */
export interface Group { key: string; label: string; terms: TermKey[] }
export const GROUPS: Group[] = [
  { key: "ground", label: "Safe ground", terms: ["landing_slope", "walkable", "hollow"] },
  { key: "power", label: "Power and heat", terms: ["sunlight", "darkness", "temperature"] },
  { key: "radio", label: "Radio link", terms: ["earth", "no_earth"] },
  { key: "ice", label: "Ice and science", terms: ["shadow", "ice"] },
];

/** How much of a group is ticked. */
export function groupState(sel: Selection, group: Group): "all" | "some" | "none" {
  const on = countedTerms(sel), n = group.terms.filter((k) => on.includes(k)).length;
  return n === 0 ? "none" : n === group.terms.length ? "all" : "some";
}

/** Ticks every parameter of a group, or unticks them all if they were all ticked. Exact weights are dropped. */
export function toggleGroup(sel: Selection, group: Group): Selection {
  const on = countedTerms(sel), all = group.terms.every((k) => on.includes(k));
  const ticked = TERM_KEYS.filter((k) => (group.terms.includes(k) ? !all : on.includes(k)));
  return { ticked, importance: sel.weights ? undefined : sel.importance, flipped: sel.flipped?.filter((k) => ticked.includes(k)) };
}

/** NASA's hard limits as bits of south_pole_limits.u8 (255 = no data). `term` is the parameter the limit bounds. */
export interface HardLimit { bit: number; name: string; term: TermKey | null }
export const HARD_LIMITS: HardLimit[] = [
  { bit: 1, name: "landing slope under 10°", term: "landing_slope" },
  { bit: 2, name: "walkable ground within 2 km", term: "walkable" },
  { bit: 4, name: "sunlight for the whole stay", term: "sunlight" },
  { bit: 8, name: "Earth in view", term: "earth" },
  { bit: 16, name: "within 6° of the pole", term: null },
];
export const NO_DATA = 255;

/** Names of the hard limits a limits byte says fail. */
export function failedLimitNames(bits: number): string[] {
  return bits === NO_DATA ? [] : HARD_LIMITS.filter((l) => bits & l.bit).map((l) => l.name);
}
/** "unsafe: fails landing slope under 10°", or null if every limit passes (or there is no data). */
export function unsafeLabel(bits: number): string | null {
  const names = failedLimitNames(bits);
  return names.length ? `unsafe: fails ${names.join(", ")}` : null;
}

/**
 * Class of one parameter from its layer byte (0 at the reject bound, 255 at the ideal bound).
 * For the four parameters whose reject bound is a NASA hard limit, red is decided by the limit itself (`limitBits`),
 * not by the byte: the byte is rounded to 1/255 of the range, the limit is exact.
 */
export function classifyByte(term: LayerKey, q: number, limitBits = 0, flipped = false): Rag {
  if (limitBits === NO_DATA || q === undefined || Number.isNaN(q)) return "grey";
  const hard = HARD_LIMITS.find((l) => l.term === term);
  if (hard && limitBits & hard.bit) return "red";
  let rag: Rag = q >= 255 ? "green" : q <= 0 ? "red" : "amber";
  if (flipped) rag = rag === "green" ? "red" : rag === "red" ? "green" : "amber";
  else if (hard && rag === "red") rag = "amber"; // exactly on the limit: the limit passes, so it is acceptable
  return rag;
}

/** Class of one parameter from its value in real units. Missing (undefined, NaN) is grey. Infinity is a value:
 *  "no stable ice" is deeper than any drill. */
export function classifyValue(term: TermKey, value: number | undefined | null, flipped = false): Rag {
  if (value === undefined || value === null || Number.isNaN(value)) return "grey";
  const v = verdictOf(ruleOf(term), value);
  const rag: Rag = v === "good" ? "green" : v === "acceptable" ? "amber" : "red";
  if (!flipped) return rag;
  const hard = HARD_LIMITS.some((l) => l.term === term);
  if (hard && rag === "red") return "red"; // a NASA limit never flips
  return rag === "green" ? "red" : rag === "red" ? "green" : "amber";
}

/** The value a layer byte stands for, in the parameter's unit (exact to 1/255 of its range; 0 and 255 mean
 *  "at the bound or beyond"). */
export function byteValue(term: LayerKey, q: number): number {
  const b = BOUNDS[term];
  return b.reject + (q / 255) * (b.ideal - b.reject);
}

/** What the map shows for a selection. */
export type MapMode =
  | { kind: "single"; term: LayerKey }   // one per-pixel parameter by itself: its own ranges
  | { kind: "combined" }                  // two or more: the weighted score, then the score classes
  | { kind: "limits" };                   // nothing per-pixel ticked: only where the NASA limits pass
export function mapMode(sel: Selection): MapMode {
  const layers = countedTerms(sel).filter((k): k is LayerKey => (LAYER_KEYS as readonly string[]).includes(k));
  if (layers.length === 0) return { kind: "limits" };
  return layers.length === 1 ? { kind: "single", term: layers[0] } : { kind: "combined" };
}

/** Everything about one map cell under a selection. */
export interface CellClass {
  rag: Rag;
  /** Score 0..100 of the ticked per-pixel parameters; null with no data or nothing per-pixel ticked. */
  score: number | null;
  /** "unsafe: fails <limit>" when a NASA hard limit fails here; the class is then red whatever the score. */
  unsafe: string | null;
  failed: string[];
  /** The class the ticked parameters alone would give (what shows through if the limits overlay is faded). */
  under: Rag | null;
}

/** Classifies one cell. `q`: its layer bytes in LAYER_KEYS order; `limitBits`: its byte of the limits grid. */
export function classifyCell(q: ArrayLike<number>, limitBits: number, sel: Selection): CellClass {
  if (limitBits === NO_DATA) return { rag: "grey", score: null, unsafe: null, failed: [], under: null };
  const mode = mapMode(sel), failed = failedLimitNames(limitBits), unsafe = unsafeLabel(limitBits);
  let score: number | null = null, under: Rag | null = null;
  if (mode.kind !== "limits") {
    score = mapScore(flipBytes(q, sel), selectionWeights(sel));
    under = mode.kind === "single"
      ? classifyByte(mode.term, q[LAYER_KEYS.indexOf(mode.term)], limitBits, flippedTerms(sel).includes(mode.term))
      : classifyScore(score);
  }
  return { rag: unsafe ? "red" : under ?? "grey", score, unsafe, failed, under };
}

/** Codes of a class grid: the low bits are the class of the ticked parameters, UNSAFE is added where a NASA hard
 *  limit fails (the pixel is then red, hatched). UNSCORED: passes every limit, nothing per-pixel ticked. */
export const CODE = { red: 0, amber: 1, green: 2, grey: 3, unscored: 4 } as const;
export const UNSAFE = 8;
/** The class a code stands for on the map. */
export function codeRag(code: number): Rag | "unscored" {
  if (code === CODE.grey) return "grey";
  if (code & UNSAFE) return "red";
  return (["red", "amber", "green", "grey", "unscored"] as const)[code & 7];
}

/**
 * The class of every cell of a grid. `layers`: the layer grids in LAYER_KEYS order; `limits`: the limits grid.
 * Returns one code per cell (see CODE and UNSAFE) and, in `scoreOut` if given, the score 0..100 (255 = none).
 */
export function classGrid(layers: ArrayLike<number>[], limits: ArrayLike<number>, sel: Selection,
  out?: Uint8Array, scoreOut?: Uint8Array): Uint8Array {
  const n = limits.length, res = out ?? new Uint8Array(n);
  const mode = mapMode(sel), w = selectionWeights(sel), flips = flippedTerms(sel);
  const wl = LAYER_KEYS.map((k) => w[k]), flip = LAYER_KEYS.map((k) => flips.includes(k));
  const den = 255 * wl.reduce((a, b) => a + b, 0);
  const single = mode.kind === "single" ? LAYER_KEYS.indexOf(mode.term) : -1;
  const hardBit = mode.kind === "single" ? HARD_LIMITS.find((l) => l.term === mode.term)?.bit ?? 0 : 0;
  for (let i = 0; i < n; i++) {
    const bits = limits[i];
    if (bits === NO_DATA) { res[i] = CODE.grey; if (scoreOut) scoreOut[i] = 255; continue; }
    let code: number = CODE.unscored, score = 255;
    if (den > 0) {
      let num = 0;
      for (let k = 0; k < wl.length; k++) if (wl[k]) num += wl[k] * (flip[k] ? 255 - layers[k][i] : layers[k][i]);
      score = Math.floor((200 * num + den) / (2 * den));
      if (single >= 0) {
        const q = layers[single][i];
        let c: number = q >= 255 ? CODE.green : q <= 0 ? CODE.red : CODE.amber;
        if (hardBit && bits & hardBit) c = CODE.red;
        else if (flip[single]) c = c === CODE.green ? CODE.red : c === CODE.red ? CODE.green : CODE.amber;
        else if (hardBit && c === CODE.red) c = CODE.amber;
        code = c;
      } else code = score >= SCORE_GREEN ? CODE.green : score >= SCORE_AMBER ? CODE.amber : CODE.red;
    }
    res[i] = bits ? code | UNSAFE : code;
    if (scoreOut) scoreOut[i] = score;
  }
  return res;
}

/** The class of every counted parameter at one place, from real values (zones, sites, a clicked spot). */
export function termClasses(values: Partial<Record<TermKey, number>>, sel: Selection): { term: TermKey; rag: Rag }[] {
  const flips = flippedTerms(sel);
  return countedTerms(sel).map((term) => ({ term, rag: classifyValue(term, values[term], flips.includes(term)) }));
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const SPECIAL: Partial<Record<TermKey, Partial<Record<"green" | "amber" | "red", string>>>> = {
  ice: { green: "ice stable at the surface (0 m)", red: "deeper than 1 m, or no stable ice" },
  hollow: { green: "level with or above its surroundings", amber: "in a dip of less than 70 m", red: "in a hollow 70 m deep or more" },
  no_earth: { green: "Earth never sets (0 h)", amber: "Earth sets for less than 336 h", red: "336 h or more without Earth" },
  shadow: { red: "more than 20 km" },
};

/** The real-unit range of each class of one parameter, for the legend: { green: "70 % of the time or more", ... }. */
export function classRanges(term: TermKey, flipped = false): Record<"green" | "amber" | "red", string> {
  const { ideal, reject, unit } = BOUNDS[term];
  const u = unit === "°" || unit === "%" ? unit : ` ${unit}`;
  const more = ideal > reject, lo = Math.min(ideal, reject), hi = Math.max(ideal, reject);
  const low = more ? `under ${fmt(lo)}${u}` : `${fmt(lo)}${u} or less`;
  const high = `${fmt(hi)}${u} or more`;
  const usual = {
    green: SPECIAL[term]?.green ?? (more ? high : low),
    amber: SPECIAL[term]?.amber ?? `${fmt(lo)} to ${fmt(hi)}${u}`,
    red: SPECIAL[term]?.red ?? (more ? low : high),
  };
  if (!flipped) return usual;
  // Flipped: green and red change places. Where the reject bound is a NASA limit, beyond it stays unsafe.
  return { green: usual.red, amber: usual.amber, red: usual.green };
}

/** The legend of whatever a selection shows on the map. */
export function legend(sel: Selection): { title: string; green: string; amber: string; red: string } {
  const mode = mapMode(sel);
  if (mode.kind === "single") {
    const flipped = flippedTerms(sel).includes(mode.term);
    const hard = HARD_LIMITS.some((l) => l.term === mode.term);
    const r = classRanges(mode.term, flipped);
    // A flipped parameter with a NASA limit: what would be green is beyond the limit, so it is unsafe instead.
    return { title: mode.term, ...r, ...(flipped && hard ? { green: "none: beyond NASA's limit this is unsafe" } : {}) };
  }
  if (mode.kind === "combined")
    return { title: "combined", green: `score ${SCORE_GREEN} to 100`, amber: `score ${SCORE_AMBER} to ${SCORE_GREEN - 1}`, red: `score under ${SCORE_AMBER}` };
  return { title: "limits", green: "", amber: "", red: "" };
}

/** A layer byte in words, in real units: "57 % of the time", and at the clipped ends the range it stands for. */
export function byteText(term: LayerKey, q: number, limitBits = 0): string {
  const { unit } = BOUNDS[term], u = unit === "°" || unit === "%" ? unit : ` ${unit}`;
  const hard = HARD_LIMITS.find((l) => l.term === term);
  const r = classRanges(term);
  if (q >= 255) return r.green;
  if (q <= 0) return hard && !(limitBits & hard.bit) ? `about ${fmt(BOUNDS[term].reject)}${u}` : r.red;
  if (hard && limitBits & hard.bit) return r.red; // the byte was rounded up by a step; the exact limit says it fails
  const v = byteValue(term, q);
  return `${Math.abs(v) >= 100 ? v.toFixed(0) : unit === "m" && Math.abs(v) < 10 ? v.toFixed(2) : fmt(Math.round(v * 10) / 10)}${u}`;
}

/**
 * The values of one map cell as explain.ts reads them, from its layer bytes. Where a NASA limit fails the value is
 * put beyond the bound, so the sentence says "rejected" as the exact limit does. Zone-only parameters (longest
 * night, longest time without Earth) are not known at a cell and are left out.
 */
export function cellValues(q: ArrayLike<number>, limitBits: number, latDeg: number): PointValues {
  const out: PointValues = { latDeg };
  LAYER_KEYS.forEach((term, i) => {
    const b = BOUNDS[term], hard = HARD_LIMITS.find((l) => l.term === term);
    let v = byteValue(term, q[i]);
    if (hard && limitBits & hard.bit) v = b.reject + (b.ideal > b.reject ? -1 : 1);
    else if (hard && q[i] <= 0) v = b.reject + (b.ideal > b.reject ? 0 : -0.01);
    else if (q[i] <= 0) v = b.reject + (b.ideal > b.reject ? -0.01 : 0); // at or beyond the reject bound
    if (term === "ice" && q[i] <= 0) v = Infinity;
    out[valueKey(term)] = v;
  });
  return out;
}

/** One word for each class. */
export const RAG_WORD: Record<Rag, string> = { green: "Good", amber: "Acceptable", red: "Poor", grey: "No data" };

/** One place judged from its published values (a site, a zone): each ticked parameter, and the score they give. */
export interface Assessment {
  /** Weighted mean of the ticked parameters' sub-scores, 0..100; null if nothing is ticked. */
  score: number | null;
  rag: Rag;
  terms: { term: TermKey; value: number | undefined; subscore: number; rag: Rag }[];
}

/**
 * Scores a place from real values instead of layer bytes: the same sub-scores (0 at reject, 1 at ideal, turned
 * round if flipped) and the same weights. A ticked parameter with no value counts as 0 and is grey: missing data
 * never raises a score. Hard limits are not judged here; the caller knows which fail.
 */
export function assessValues(values: PointValues, sel: Selection): Assessment {
  const w = selectionWeights(sel), flips = flippedTerms(sel);
  let num = 0, den = 0;
  const terms = countedTerms(sel).map((term) => {
    const value = values[valueKey(term)], flipped = flips.includes(term), b = BOUNDS[term];
    const known = value !== undefined && value !== null && !Number.isNaN(value);
    let s = known ? Math.min(1, Math.max(0, ((Number.isFinite(value) ? value : b.reject) - b.reject) / (b.ideal - b.reject))) : 0;
    if (known && flipped) s = 1 - s;
    num += w[term] * s; den += w[term];
    return { term, value: known ? value : undefined, subscore: s, rag: classifyValue(term, value, flipped) };
  });
  const score = den > 0 ? Math.round((100 * num) / den) : null;
  return { score, rag: score === null ? "grey" : classifyScore(score), terms };
}

/** Names of the hard limits in a `failed_limits` column ("latitude sunlight") of the published tables. */
export function failedLimitTokens(text: string): string[] {
  const order = ["landing_slope", "eva_slope", "sunlight", "earth", "latitude"];
  return text.split(" ").filter(Boolean).map((t) => HARD_LIMITS[order.indexOf(t)]?.name ?? t);
}
