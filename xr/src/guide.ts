// What the VR view takes from the website's analysis code: the time a site opens at, the "Everything" selection
// and the names of the parameters, and the colours and legend words of the safe-landing map. Nothing is computed
// here that the website does not compute the same way.
import { computeSeries, type Ephemeris, type Horizon } from '../../web/src/lib/analysis';
import type { PaintStyle, RGB } from '../../web/src/lib/analysis/paint';
import { legend, mapMode, type Rag } from '../../web/src/lib/analysis/rag';
import {
  BALANCED,
  countedTerms,
  EVERYTHING,
  LAYER_KEYS,
  parameter,
  presetSelection,
  TERM_KEYS,
  type LayerKey,
  type Preset,
  type Selection,
  type TermKey,
} from '../../web/src/lib/analysis/suitability';

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
