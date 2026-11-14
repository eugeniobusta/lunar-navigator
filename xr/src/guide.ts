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
  TERM_OF,
  explainFor,
  summarise,
  valuesFromRow,
  type CriterionRow,
  type Explanation,
  type PointValues,
  type Verdict,
} from '../../web/src/lib/analysis/explain';
import type { PaintStyle, RGB } from '../../web/src/lib/analysis/paint';
import { RAG_WORD, classifyScore, classifyValue, legend, mapMode, type Rag } from '../../web/src/lib/analysis/rag';
import {
  BALANCED,
  countedTerms,
  EVERYTHING,
  flippedTerms,
  LAYER_KEYS,
  parameter,
  PARAMETERS,
  presetSelection,
  rankZonesFor,
  TERM_KEYS,
  type LayerKey,
  type Preset,
  type Selection,
  type TermKey,
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

// ------------------------------------------------------------------------------------------------ what matters (layers)

/** suitability/weights.json, as far as the VR needs it. */
export interface Priorities {
  presets: Preset[];
  /** The selection the view opens with (weights.json's "default" preset; everything ticked if it names none). */
  initial: Selection;
  /** The website's name of each parameter. */
  labels: Partial<Record<TermKey, string>>;
}

interface WeightsFile {
  presets?: Preset[];
  default?: string;
  layers?: { key: TermKey; label: string }[];
  zone_terms?: { key: TermKey; label: string }[];
}

export function priorities(f: WeightsFile | null): Priorities {
  const presets = f?.presets?.length ? f.presets : FALLBACK_PRESETS;
  const first = presets.find((p) => p.key === f?.default);
  const labels: Priorities['labels'] = {};
  for (const t of [...(f?.layers ?? []), ...(f?.zone_terms ?? [])]) {
    labels[t.key] = t.label;
  }
  return { presets, initial: first ? presetSelection(first) : f ? EVERYTHING : presetSelection(presets[0]), labels };
}

export const paramLabel = (k: TermKey, p: Priorities | null) => p?.labels[k] ?? parameter(k).label;

const isLayer = (k: TermKey): k is LayerKey => (LAYER_KEYS as readonly string[]).includes(k);

/** The traffic-light colours of the website (web/src/styles/tokens.css: --go, --caution, --stop, --nodata), and its
 *  colour-blind palette (--cb-high, --cb-mid, --cb-low, and --void for no data, since its "acceptable" is grey).
 *  guide.test.ts checks them against that file. */
export const RAG_COLOR: Record<Rag, string> = { green: '#6FBF73', amber: '#F0B429', red: '#E5484D', grey: '#7A746B' };
export const CB_COLOR: Record<Rag, string> = { green: '#FDE737', amber: '#7C7B78', red: '#00204D', grey: '#000000' };
/** What each class's colour is called in the legend, for the two palettes. */
const COLOUR_NAME: Record<'plain' | 'cb', Record<Rag, string>> = {
  plain: { green: 'Green', amber: 'Amber', red: 'Red', grey: 'Grey' },
  cb: { green: 'Yellow', amber: 'Grey', red: 'Dark blue', grey: 'Black' },
};
export const ragColors = (colourBlind: boolean) => (colourBlind ? CB_COLOR : RAG_COLOR);

const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;

/** How the classes are drawn (paint.ts): the palette, the opacity of the classes and of the unsafe ground. */
export function paintStyle(colourBlind: boolean, opacity: number, unsafeOpacity: number): PaintStyle {
  const c = ragColors(colourBlind);
  return { red: rgb(c.red), amber: rgb(c.amber), green: rgb(c.green), grey: rgb(c.grey), opacity, unsafeOpacity };
}

/**
 * What the map shows: the ticks, or one ticked per-pixel parameter by itself ("show alone"). The zones are always
 * ranked for the ticks, whatever the map shows.
 */
export function shownSelection(sel: Selection, solo: LayerKey | null): Selection {
  return solo && countedTerms(sel).includes(solo) ? { ticked: [solo], flipped: sel.flipped } : sel;
}

/** The key the opacity of the map is kept under: the parameter shown by itself, or "combined", or "limits". */
export function showingKey(shown: Selection): string {
  const m = mapMode(shown);
  return m.kind === 'single' ? m.term : m.kind;
}

/** One line of the map's legend. `mark` is what is drawn before it: a class colour, the hatch, or nothing. */
export interface LegendLine {
  mark: Rag | 'unsafe' | null;
  text: string;
}

/** The legend of whatever the map shows, in the website's words (web/src/routes/LandingMap.tsx). */
export function mapLegend(shown: Selection, p: Priorities | null, colourBlind = false): { what: string; lines: LegendLine[] } {
  const name = COLOUR_NAME[colourBlind ? 'cb' : 'plain'];
  const mode = mapMode(shown);
  const lg = legend(shown);
  const layers = countedTerms(shown).filter(isLayer);
  const what =
    mode.kind === 'single'
      ? `${paramLabel(mode.term, p)} alone`
      : mode.kind === 'combined'
        ? countedTerms(shown).length === TERM_KEYS.length
          ? 'Combined score of all ten parameters'
          : `Combined score of ${layers.map((k) => paramLabel(k, p)).join(' + ')}`
        : 'NASA safety limits only';
  const classes: LegendLine[] =
    mode.kind === 'limits'
      ? [{ mark: null, text: 'Clear ground passes every NASA limit. Tick a parameter to score it.' }]
      : [
          { mark: 'green', text: `${name.green}, good: ${lg.green}` },
          { mark: 'amber', text: `${name.amber}, acceptable: ${lg.amber}` },
          { mark: 'red', text: `${name.red}, poor: ${lg.red}` },
        ];
  return { what, lines: [...classes, { mark: 'unsafe', text: 'Hatched: unsafe, fails a NASA limit' }, { mark: 'grey', text: `${name.grey}: no data` }] };
}

/** Re-ranks the zones for a selection (suitability.ts rankZonesFor: weights and turned-round directions); best first. */
export function rankAll(zones: ZoneRow[], sel: Selection): ZoneRow[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  return rankZonesFor(zones, sel).map((r) => {
    const z = byId.get(r.id)!;
    z.rank = r.rank;
    z.score = r.score;
    return z;
  });
}

const VALUE_KEY = Object.fromEntries((Object.keys(TERM_OF) as (keyof PointValues)[]).filter((k) => TERM_OF[k]).map((k) => [TERM_OF[k], k])) as Record<TermKey, keyof PointValues>;

/** A zone's class, as on the website: with one parameter ticked, that parameter's own range at the zone's best
 *  cell; otherwise the class of its score; grey with nothing ticked. */
export function zoneRag(z: ZoneRow, sel: Selection): Rag {
  const on = countedTerms(sel);
  if (on.length !== 1) {
    return on.length ? classifyScore(z.score) : 'grey';
  }
  return classifyValue(on[0], valuesFromRow(z.row)[VALUE_KEY[on[0]]], flippedTerms(sel).includes(on[0]));
}

/** The one line under the layers: what the ranking is for, and how good the best zone is. Short enough to read in
 *  the headset at a glance: more than three names become a count. */
export function answer(sel: Selection, p: Priorities | null, zones: number, best: ZoneRow | undefined): string {
  const on = PARAMETERS.map((q) => q.key).filter((k) => countedTerms(sel).includes(k));
  const n = zones.toLocaleString('en-US');
  if (on.length === 0 || !best) {
    return `Nothing is ticked, so nothing is ranked. Clear ground passes every NASA limit: ${n} zones.`;
  }
  const what =
    on.length === TERM_KEYS.length
      ? 'everything on the list'
      : on.length > 3
        ? `${on.length} of ${TERM_KEYS.length} parameters`
        : on.map((k) => paramLabel(k, p)).join(' + ');
  return `Best landing spots for ${what}: ${n} zones. The best scores ${best.score} of 100 (${RAG_WORD[zoneRag(best, sel)].toLowerCase()})${best.near ? `, near ${best.near}` : ''}.`;
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
export function why(title: string, values: PointValues, criteria: CriterionRow[], counted: readonly TermKey[] = TERM_KEYS, flipped: readonly TermKey[] = []): Why {
  const list: Explanation[] = explainFor(values, criteria, counted, flipped);
  return {
    title,
    summary: summarise(list),
    lines: list.map((e) => ({ head: `${e.label} ${e.value}: ${e.verdict}`, verdict: e.verdict, detail: e.detail })),
  };
}

export const whyFromRow = (title: string, row: Row, criteria: CriterionRow[], counted: readonly TermKey[] = TERM_KEYS, flipped: readonly TermKey[] = []) =>
  why(title, valuesFromRow(row), criteria, counted, flipped);

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
  const tail = 'Hatched red fails a limit; green, amber and red score the rest.';
  if (!s || s.pass_km2 == null || s.region_km2 == null || s.pass_pct_of_region == null) {
    return `${head} ${tail}`;
  }
  const km = (v: number) => Math.round(v).toLocaleString('en-US');
  return `${head} ${km(s.pass_km2)} of ${km(s.region_km2)} km2 pass them all (${s.pass_pct_of_region} %)${s.zones ? `, in ${km(s.zones)} zones` : ''}. ${tail}`;
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
