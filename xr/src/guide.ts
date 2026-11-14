// What the VR view says and ranks: the demo start time, "Why here?" lines, the priority presets and the tour's
// captions. Nothing is computed here that the website does not compute the same way: sentences come from
// web/src/lib/analysis/explain.ts, scores and ranks from suitability.ts, Sun and Earth from computeSeries.
import {
  computeMetrics,
  computeSeries,
  type Ephemeris,
  type Horizon,
  type Series,
} from '../../web/src/lib/analysis';
import {
  explainFor,
  summarise,
  valuesFromRow,
  type CriterionRow,
  type Explanation,
  type PointValues,
  type Verdict,
} from '../../web/src/lib/analysis/explain';
import {
  BALANCED,
  countedTerms,
  EVERYTHING,
  LAYER_KEYS,
  mapScoreGrid,
  parameter,
  PARAMETERS,
  presetSelection,
  rankZones,
  sameSelection,
  selectionWeights,
  subscore,
  TERM_KEYS,
  type LayerKey,
  type Preset,
  type Selection,
  type TermKey,
  type Weights,
} from '../../web/src/lib/analysis/suitability';

const R2D = 180 / Math.PI;

/** Used when suitability/weights.json is missing: only the published weights, so nothing is invented. */
export const FALLBACK_PRESETS: Preset[] = [{ key: 'balanced', label: 'NASA-style balance', weights: BALANCED }];

// ------------------------------------------------------------------------------------------------ time

/**
 * The first hourly sample at or after `fromIdx` at which the whole solar disc is above the skyline `hz`
 * (computeSeries's sunFrac = 1). If that does not happen within `searchH` hours: the first sample at which the
 * disc's centre is above it (computeSeries's "sunlit"), or null if the Sun stays down.
 */
export function nextSunUp(eph: Ephemeris, hz: Horizon, fromIdx: number, searchH = 1440): number | null {
  const s = computeSeries(eph, hz, fromIdx, fromIdx + searchH);
  let centre: number | null = null;
  for (let k = 0; k < s.sunlit.length; k++) {
    if (s.sunFrac[k] >= 1) {
      return s.startIdx + k;
    }
    if (centre == null && s.sunlit[k]) {
      centre = s.startIdx + k;
    }
  }
  return centre;
}

/** The highest the Sun's centre gets above the ideal horizon at the south pole over the whole ephemeris, degrees. */
export function poleSunMaxDeg(eph: Ephemeris): number {
  let best = -1;
  for (let i = 0; i < eph.n; i++) {
    best = Math.max(best, -eph.sunDir[3 * i + 2]); // up at the south pole is -z in MOON_ME
  }
  return Math.asin(Math.max(-1, Math.min(1, best))) * R2D;
}

/** Longest darkness and longest time without Earth over the whole ephemeris (as zones.csv: our model, 2026 to 2029). */
export function longRunMetrics(eph: Ephemeris, hz: Horizon): { longestDarkH: number; longestNoEarthH: number } {
  const m = computeMetrics(computeSeries(eph, hz, 0, eph.n), eph.stepS / 3600);
  return { longestDarkH: m.longestDarkH, longestNoEarthH: m.longestNoEarthH };
}

// ------------------------------------------------------------------------------------------------ zones and priorities

type Row = Record<string, string>;

export interface ZoneRow {
  /** The published rank (balanced weights): the zone's name, which never changes. */
  id: number;
  lat: number;
  lon: number;
  areaKm2: number;
  /** Nearest Artemis region, by name. */
  near: string;
  /** The layer bytes at the zone's best cell, in LAYER_KEYS order. */
  q: number[];
  darkH: number;
  noEarthH: number;
  stayOk: boolean;
  /** The zones.csv row, for explain.ts. */
  row: Row;
  /** Rank and score under the weights in use. */
  rank: number;
  score: number;
}

/** Joins zones.csv with zones_layers.csv (docs/INTERFACES.md section 10). Zones without layer bytes are left out. */
export function buildZones(zones: Row[], layers: Row[]): ZoneRow[] {
  const byId = new Map(layers.map((r) => [r.rank, r]));
  const out: ZoneRow[] = [];
  for (const r of zones) {
    const l = byId.get(r.rank);
    const id = Number(r.rank);
    if (!l || !Number.isFinite(id) || r.lat === '' || r.lon === '') {
      continue;
    }
    out.push({
      id,
      lat: Number(r.lat),
      lon: Number(r.lon),
      areaKm2: Number(r.area_km2),
      near: r.nearest_artemis_region ?? '',
      q: LAYER_KEYS.map((k) => Number(l[k])),
      darkH: Number(r.longest_dark_h),
      noEarthH: Number(r.longest_no_earth_h),
      stayOk: r.stay_window_ok === 'True',
      row: r,
      rank: id,
      score: Number(r.score),
    });
  }
  return out;
}

/** Re-ranks the zones under `weights` with suitability.ts's rankZones; returns them best first. */
export function rankAll(zones: ZoneRow[], weights: Weights): ZoneRow[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const ranked = rankZones(zones, weights);
  return ranked.map((r) => {
    const z = byId.get(r.id)!;
    z.rank = r.rank;
    z.score = r.score;
    return z;
  });
}

/**
 * The Goldilocks heat map under `weights`. `raw` is the published score grid (0..100 pass, 101..201 fail, 255 no
 * data); the result has the new score where every hard limit passes and 255 elsewhere. `score` receives the new
 * score of every cell with data, pass or fail.
 */
export function rescore(layers: ArrayLike<number>[], raw: Uint8Array, weights: Weights, shown: Uint8Array, score: Uint8Array): void {
  mapScoreGrid(layers, weights, score);
  for (let i = 0; i < raw.length; i++) {
    shown[i] = raw[i] <= 100 ? score[i] : 255;
  }
}

// ------------------------------------------------------------------------------------------------ what matters (tick boxes)

/** suitability/weights.json, as far as the VR needs it. */
export interface Bounds {
  reject: number;
  ideal: number;
  unit: string;
  label: string;
}
export interface Priorities {
  presets: Preset[];
  /** The selection the view opens with (weights.json's "default" preset; everything ticked if it names none). */
  initial: Selection;
  bounds: Partial<Record<TermKey, Bounds>>;
}

interface WeightsFile {
  presets?: Preset[];
  default?: string;
  layers?: (Bounds & { key: TermKey })[];
  zone_terms?: (Bounds & { key: TermKey })[];
}

export function priorities(f: WeightsFile | null): Priorities {
  const presets = f?.presets?.length ? f.presets : FALLBACK_PRESETS;
  const first = presets.find((p) => p.key === f?.default);
  const bounds: Priorities['bounds'] = {};
  for (const t of [...(f?.layers ?? []), ...(f?.zone_terms ?? [])]) {
    bounds[t.key] = { reject: t.reject, ideal: t.ideal, unit: t.unit, label: t.label };
  }
  return { presets, initial: first ? presetSelection(first) : f ? EVERYTHING : presetSelection(presets[0]), bounds };
}

/** The website's colour for each parameter (web/src/styles/tokens.css; guide.test.ts checks them against it). */
export const PARAM_COLOR: Record<TermKey, string> = {
  sunlight: '#F6B93B',
  darkness: '#E8862A',
  earth: '#2F6FD6',
  no_earth: '#DCE8FF',
  landing_slope: '#8FC28A',
  walkable: '#5E9C76',
  shadow: '#B49CF0',
  ice: '#7D5BD6',
  temperature: '#C9774A',
  hollow: '#A39888',
};
/** The chip of the locked "NASA safety limits" row (the website's --bone). */
export const LIMITS_COLOR = '#EFE8DC';

export const paramLabel = (k: TermKey, p: Priorities | null) => p?.bounds[k]?.label ?? parameter(k).label;

const isLayer = (k: TermKey): k is LayerKey => (LAYER_KEYS as readonly string[]).includes(k);

/**
 * What the heat map shows for a selection, as on the website: one ticked parameter that is known everywhere shows
 * its own layer in its colour; two or more show the combined score; with nothing to colour by (nothing ticked, or
 * only the two terms known at zones) it shows where NASA's limits pass.
 */
export type MapKind = { kind: 'flat' } | { kind: 'single'; layer: LayerKey } | { kind: 'combined' };
export function mapKind(sel: Selection): MapKind {
  const on = countedTerms(sel);
  if (!on.some(isLayer)) {
    return { kind: 'flat' };
  }
  return on.length === 1 ? { kind: 'single', layer: on[0] as LayerKey } : { kind: 'combined' };
}

/** The byte a single-parameter map shows where NASA's limits pass, and the top of its colour ramp. */
export const FLAT_BYTE = 45;
export const SINGLE_MAX = 254;

/**
 * Fills the heat map for a selection. `raw` is the published score grid (0..100 pass, 101..201 fail, 255 no data).
 * `shown` gets what the texture carries, 255 = nothing drawn: the combined score 0..100 or FLAT_BYTE where every
 * limit passes, or, for one parameter, its layer everywhere there is data, as 0..SINGLE_MAX with the website's
 * 0.75 power. `score` gets the selection's score of every cell with data.
 */
export function paint(layers: ArrayLike<number>[], raw: Uint8Array, sel: Selection, shown: Uint8Array, score: Uint8Array): void {
  const k = mapKind(sel);
  rescore(layers, raw, selectionWeights(sel), shown, score);
  if (k.kind === 'flat') {
    for (let i = 0; i < raw.length; i++) {
      shown[i] = raw[i] <= 100 ? FLAT_BYTE : 255;
    }
  } else if (k.kind === 'single') {
    const layer = layers[LAYER_KEYS.indexOf(k.layer)];
    for (let i = 0; i < raw.length; i++) {
      shown[i] = raw[i] === 255 ? 255 : Math.round(SINGLE_MAX * (layer[i] / 255) ** 0.75);
    }
  }
}

/** True if the selection scores as the published files do, so the published grid can be shown as it is. */
export const isPublished = (sel: Selection) => sameSelection(sel, { ticked: [], weights: BALANCED });

/** 0..1 for a zone under one of the two zone-only terms (1 = ideal), or null for any other selection. */
export function zoneShade(sel: Selection, z: ZoneRow, p: Priorities): { key: TermKey; s: number } | null {
  const on = countedTerms(sel);
  const key = on.length === 1 && !isLayer(on[0]) ? on[0] : null;
  const b = key && p.bounds[key];
  if (!key || !b) {
    return null;
  }
  return { key, s: subscore(key === 'darkness' ? z.darkH : z.noEarthH, b.reject, b.ideal) ** 0.75 };
}

/** The sentence under the tick boxes, as on the website's "Where to land". `best` is the first zone of the ranking. */
export function answer(sel: Selection, p: Priorities, zones: number, best: ZoneRow | undefined): { text: string; note: string | null } {
  const on = PARAMETERS.map((q) => q.key).filter((k) => countedTerms(sel).includes(k));
  const n = zones.toLocaleString('en-US');
  if (on.length === 0 || !best) {
    return { text: `Nothing is ticked, so nothing is ranked. The map shows where the NASA safety limits pass: ${n} zones.`, note: null };
  }
  const top = `the best${best.near ? ` is near ${best.near} and` : ''} scores ${best.score} of 100`;
  if (on.length === 1) {
    const b = p.bounds[on[0]];
    const name = paramLabel(on[0], p);
    const range = b ? `: ${b.reject} ${b.unit} (dark) to ${b.ideal} ${b.unit}${b.ideal > b.reject ? ' or more' : ' or less'} (full colour)` : '';
    return {
      text: `Showing ${name} by itself${range}. Of ${n} zones, ${top}.`,
      note: isLayer(on[0])
        ? null
        : `${name} comes from our hour-by-hour model, so it is known at the zones, not at every point: the map shows where the NASA limits pass, and the zone rings carry the colour.`,
    };
  }
  const what = on.length === TERM_KEYS.length ? 'everything on the list' : on.map((k) => paramLabel(k, p)).join(' + ');
  return { text: `Best landing spots for ${what}: ${n} zones; ${top}.`, note: null };
}

// ------------------------------------------------------------------------------------------------ Why here?

export interface WhyLine {
  /** "Landing slope 3.4 degrees: good" */
  head: string;
  verdict: Verdict;
  /** The range the value falls in and why the criterion matters. */
  detail: string;
}

export interface Why {
  title: string;
  /** summarise(): what rules the spot out, or how many criteria are good. */
  summary: string;
  lines: WhyLine[];
}

/** The sentences for the ticked parameters plus every NASA hard limit (explain.ts's explainFor). */
export function why(title: string, values: PointValues, criteria: CriterionRow[], counted: readonly TermKey[] = TERM_KEYS): Why {
  const list: Explanation[] = explainFor(values, criteria, counted);
  return {
    title,
    summary: summarise(list),
    lines: list.map((e) => ({ head: `${e.label} ${e.value}: ${e.verdict}`, verdict: e.verdict, detail: e.detail })),
  };
}

export const whyFromRow = (title: string, row: Row, criteria: CriterionRow[], counted: readonly TermKey[] = TERM_KEYS) =>
  why(title, valuesFromRow(row), criteria, counted);

// ------------------------------------------------------------------------------------------------ tour

export const TOUR_STOPS = 4;
/** Stop 4 plays this many hours, at this many hours per second, and repeats. */
export const TOUR_PLAY_H = 48;
export const TOUR_PLAY_RATE = 4;

export interface Summary {
  region_km2?: number;
  pass_km2?: number;
  pass_pct_of_region?: number;
  zones?: number;
}

/** Stop 1: the south pole from orbit. */
export function captionPole(eph: Ephemeris): string {
  const years = Math.round((eph.n * eph.stepS) / (365.25 * 86400));
  return `The Moon's south pole. Here the Sun never climbs more than ${poleSunMaxDeg(eph).toFixed(1)} degrees above the horizon (JPL DE421, ${years} years from ${new Date(eph.startMs).getUTCFullYear()}), so every hill casts a shadow many kilometres long.`;
}

/** Stop 2: the Goldilocks heat map. Numbers from suitability/summary.json; without it, no numbers. */
export function captionGoldilocks(s: Summary | null): string {
  const head = "Every 120 m square within 6 degrees of the pole, tested against NASA's Artemis III limits.";
  if (!s || s.pass_km2 == null || s.region_km2 == null || s.pass_pct_of_region == null) {
    return `${head} Green passes every limit.`;
  }
  const km = (v: number) => Math.round(v).toLocaleString('en-US');
  return `${head} Green passes every limit: ${km(s.pass_km2)} of ${km(s.region_km2)} km2 (${s.pass_pct_of_region} %)${s.zones ? `, in ${km(s.zones)} zones` : ''}.`;
}

/** Stop 3: the best zone under the weights in use. Its Why-here lines are shown under the caption. */
export function captionZone(z: ZoneRow, presetLabel: string, w: Why): string {
  return `The best zone with "${presetLabel}" ticked: #${z.rank}${z.near ? `, nearest Artemis region ${z.near}` : ''}, score ${z.score} of 100, ${z.areaKm2.toFixed(1)} km2. ${w.summary}`;
}

/** Stop 4: standing there. `s` covers the hours that are played, starting at the first. */
export function captionStand(s: Series, hours: number): string {
  const n = Math.min(hours + 1, s.sunAz.length);
  let turn = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let lit = 0;
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      turn += ((s.sunAz[k] - s.sunAz[k - 1] + 540) % 360) - 180;
    }
    lo = Math.min(lo, s.sunEl[k]);
    hi = Math.max(hi, s.sunEl[k]);
    lit += s.sunlit[k];
  }
  return `Standing there, eyes 2 m above the ground. In these ${Math.round(hours / 24)} days the Sun moves ${Math.abs(turn).toFixed(0)} degrees round the horizon, between ${lo.toFixed(1)} and ${hi.toFixed(1)} degrees high, and is above the skyline ${Math.round((100 * lit) / n)} % of the time. The shadows sweep with it.`;
}
