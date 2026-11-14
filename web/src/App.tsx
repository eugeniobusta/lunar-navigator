// App shell: header controls, the sky panorama, then one tab at a time.
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { SkyPanorama } from "./charts/SkyPanorama";
import { SiteSelect } from "./components/ui";
import { Compare } from "./routes/Compare";
import { Method } from "./routes/Method";
import { xrUrl } from "./routes/xr";
import { Overview } from "./routes/Overview";
import { Power } from "./routes/Power";
import { Windows } from "./routes/Windows";
import { fmtDate, idxToMs, useSiteView } from "./state/derived";
import { useStore, type Tab } from "./state/store";
import { startUrlSync } from "./state/urlSync";

// Loaded on demand so their code stays out of the main bundle.
const Moon3D = lazy(() => import("./routes/Moon3D").then((m) => ({ default: m.Moon3D })));
const WhereToLand = lazy(() => import("./routes/WhereToLand").then((m) => ({ default: m.WhereToLand })));
const Data = lazy(() => import("./routes/Data").then((m) => ({ default: m.Data })));
// "Move the lander" appears as soon as web/src/routes/Grid.tsx exists (it must export `Grid`).
const gridModule = Object.values(import.meta.glob<{ Grid: ComponentType }>("./routes/Grid.tsx"))[0];
const Grid = gridModule ? lazy(() => gridModule().then((m) => ({ default: m.Grid }))) : null;

const TABS: [Tab, string][] = [["overview", "Overview"], ["land", "Where to land"], ["windows", "Window Finder"], ["compare", "Compare sites"],
  ...(Grid ? [["grid", "Move the lander"] as [Tab, string]] : []),
  ["power", "Battery"], ["moon3d", "3D Moon"], ["data", "Data"], ["method", "Method"]];

export default function App() {
  const st = useStore();
  useEffect(() => { void st.init().then(startUrlSync); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useSiteView(st.siteId);
  const hz = st.horizons[st.siteId];
  const eph = st.eph;

  if (!st.ready || !eph) return <main className="loading">Loading ephemeris…</main>;
  const site = st.sites.find((s) => s.id === st.siteId);
  const mock = st.ephMock || st.sitesMock || hz?.mock;
  const dateValue = fmtDate(idxToMs(st.startIdx), false);
  const minDate = fmtDate(eph.startMs, false), maxDate = fmtDate(idxToMs(eph.n - 1), false);
  const n = view?.series.sunlit.length ?? 1;
  // Near the south pole Earth always hangs low in the north; elsewhere that sentence would be wrong.
  const polar = (site?.lat ?? 0) < -75;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Lunar Landing Site Navigator</h1>
          <p>When will a south-pole lander have sunlight for power and Earth in view for a direct link home?</p>
        </div>
        <div className="controls">
          <SiteSelect label="Landing site" sites={st.sites} value={st.siteId} onChange={st.setSite} />
          <label className="field">
            <span>Landing date (UTC)</span>
            <input type="date" value={dateValue} min={minDate} max={maxDate}
              onChange={(e) => { const ms = Date.parse(e.target.value + "T00:00:00Z"); if (!Number.isNaN(ms)) st.setStartIdx((ms - eph.startMs) / (eph.stepS * 1000)); }} />
          </label>
          <label className="field">
            <span>Mission length</span>
            <select value={st.windowDays} onChange={(e) => st.setWindowDays(+e.target.value)}>
              {[...new Set([1, 3, 7, 14, 30, 90, 365, st.windowDays])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>)}
            </select>
          </label>
        </div>
      </header>

      {mock && (
        <p className="banner" role="status">
          Showing mock data: the real ephemeris or this site's terrain has not been generated yet. Shapes are right, numbers are not.
        </p>
      )}

      <section className="hero" aria-label={`Sky from ${site?.name}`}>
        <div className="hero-head">
          <p>
            You are standing at <strong>{site?.name}</strong>. This is the whole horizon around you, unrolled flat:
            the left and right edges are both south.{polar ? " North points towards Earth." : ""}
          </p>
          <a className="vr-link primary" href={xrUrl(st.siteId, idxToMs(st.startIdx + Math.min(st.cursor, n - 1)))}>
            Stand on the Moon (3D / VR)
          </a>
        </div>
        {view && hz ? (
          <>
            <SkyPanorama series={view.series} horizon={hz.value} cursor={st.cursor} sunR={eph.sunSemiDiam[st.startIdx] ?? 0.27} />
            <label className="scrub">
              <span>{fmtDate(idxToMs((view.series.startIdx) + Math.min(st.cursor, n - 1)))}</span>
              <input type="range" min={0} max={n - 1} value={Math.min(st.cursor, n - 1)}
                onChange={(e) => st.setCursor(+e.target.value)} aria-label="Time within the mission window" />
            </label>
          </>
        ) : <p className="note">Loading terrain…</p>}
      </section>

      <nav className="tabs" role="tablist">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={st.tab === t} className={st.tab === t ? "tab on" : "tab"}
            onClick={() => st.setTab(t)}>{label}</button>
        ))}
      </nav>

      <main>
        {st.tab === "overview" && <Overview />}
        {st.tab === "windows" && <Windows />}
        {st.tab === "compare" && <Compare />}
        {st.tab === "power" && <Power />}
        {st.tab === "method" && <Method />}
        <Suspense fallback={<p className="note">Loading…</p>}>
          {st.tab === "grid" && Grid && <Grid />}
          {st.tab === "land" && <WhereToLand />}
          {st.tab === "moon3d" && <Moon3D />}
          {st.tab === "data" && <Data />}
        </Suspense>
      </main>

      <footer className="foot">
        Built by team Claude's Plan at HackAthlone 2026 with AI coding assistants (Claude). Data: NASA LOLA,
        NASA Goddard PGDA, JPL Horizons and DE421. Results are our own computations, not NASA's; this is not an
        official NASA product and implies no NASA endorsement.
      </footer>
    </div>
  );
}
