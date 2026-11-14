// Keeps the address bar and the store in step (web/src/state/url.ts), so a view survives a reload and can be shared.
import { useStore, type Tab } from "./store";
import { buildQuery, parseQuery } from "./url";

export const TAB_IDS: Tab[] = ["overview", "land", "windows", "compare", "grid", "power", "moon3d", "data", "method"];

/** Reads the query string once the data is loaded, then rewrites it whenever the view changes. */
export function startUrlSync(): void {
  const st = useStore.getState();
  const eph = st.eph;
  if (!eph) return;
  const found = parseQuery(window.location.search, {
    siteIds: st.sites.map((s) => s.id), tabs: TAB_IDS, startMs: eph.startMs, stepS: eph.stepS, n: eph.n,
  });
  useStore.setState({
    ...(found.siteId ? { siteId: found.siteId } : {}),
    ...(found.compareId ? { compareId: found.compareId } : {}),
    ...(found.startIdx !== undefined ? { startIdx: found.startIdx } : {}),
    ...(found.windowDays ? { windowDays: found.windowDays } : {}),
    ...(found.tab ? { tab: found.tab as Tab } : {}),
    ...(found.weights ? { landWeights: found.weights, landPreset: "custom" } : found.preset ? { landPreset: found.preset } : {}),
  });
  const now = useStore.getState();
  void now.ensureHorizon(now.siteId);
  void now.ensureHorizon(now.compareId);

  const write = () => {
    const s = useStore.getState();
    const query = buildQuery({ siteId: s.siteId, compareId: s.compareId, startIdx: s.startIdx, windowDays: s.windowDays,
      tab: s.tab, preset: s.landPreset, weights: s.landWeights }, eph.startMs, eph.stepS);
    if (query !== window.location.search) window.history.replaceState(null, "", query + window.location.hash);
  };
  write();
  useStore.subscribe(write);
}
