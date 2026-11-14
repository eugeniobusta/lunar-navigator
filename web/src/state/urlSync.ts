// Keeps the address bar and the store in step (web/src/state/url.ts), so a view survives a reload and can be shared.
import { TERM_KEYS, type Importance, type Selection, type TermKey, type Weights } from "../lib/analysis/suitability";
import { useStore, type Tab } from "./store";
import { buildQuery, parseQuery } from "./url";

// "land" is the old name of the map page: links that carry it still open.
export const TAB_IDS: string[] = ["map", "land", "overview", "windows", "compare", "grid", "power", "moon3d", "data", "method"];

/** Reads the query string once the data is loaded, then rewrites it whenever the view changes. */
export function startUrlSync(): void {
  const st = useStore.getState();
  const eph = st.eph;
  if (!eph) return;
  const found = parseQuery(window.location.search, {
    siteIds: st.sites.map((s) => s.id), tabs: TAB_IDS, startMs: eph.startMs, stepS: eph.stepS, n: eph.n, termKeys: TERM_KEYS,
  });
  // Where to land: a preset key, hand-set ticks, or the exact weights of an old link (kept as they were).
  let land: { landPreset: string | null; landSelection: Selection | null } | null = null;
  if (found.preset) land = { landPreset: found.preset, landSelection: null };
  else if (found.ticked) land = { landPreset: null, landSelection: { ticked: found.ticked as TermKey[], importance: (found.importance ?? {}) as Partial<Record<TermKey, Importance>>,
    ...(found.flipped ? { flipped: found.flipped as TermKey[] } : {}) } };
  else if (found.weights) {
    const weights = Object.fromEntries(TERM_KEYS.map((k, i) => [k, found.weights![i]])) as Weights;
    land = { landPreset: null, landSelection: { ticked: TERM_KEYS.filter((k) => weights[k] > 0), weights } };
  }
  useStore.setState({
    ...(found.siteId ? { siteId: found.siteId } : {}),
    ...(found.compareId ? { compareId: found.compareId } : {}),
    ...(found.startIdx !== undefined ? { startIdx: found.startIdx } : {}),
    ...(found.windowDays ? { windowDays: found.windowDays } : {}),
    ...(found.tab ? { tab: (found.tab === "land" ? "map" : found.tab) as Tab } : {}),
    ...(found.spot ? { mapSpot: found.spot } : {}),
    ...(land ?? {}),
  });
  const now = useStore.getState();
  void now.ensureHorizon(now.siteId);
  void now.ensureHorizon(now.compareId);

  const write = () => {
    const s = useStore.getState();
    const query = buildQuery({ siteId: s.siteId, compareId: s.compareId, startIdx: s.startIdx, windowDays: s.windowDays,
      tab: s.tab, preset: s.landPreset,
      weights: s.landSelection?.weights ? TERM_KEYS.map((k) => s.landSelection!.weights![k]) : null,
      ticked: s.landSelection && !s.landSelection.weights ? s.landSelection.ticked : null,
      importance: s.landSelection?.importance ?? null,
      flipped: s.landSelection?.flipped ?? null, spot: s.mapSpot }, eph.startMs, eph.stepS);
    if (query !== window.location.search) window.history.replaceState(null, "", query + window.location.hash);
  };
  write();
  useStore.subscribe(write);
}
