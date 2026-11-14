// App shell: the top menu bar, then one page at a time. The homepage is full-width; every other page has a title,
// the mission controls when it needs a site and dates, and its content.
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { SkyPanorama } from "./charts/SkyPanorama";
import { SiteSelect } from "./components/ui";
import { BackToTop } from "./components/ui/BackToTop";
import { Compare } from "./routes/Compare";
import { Home } from "./routes/Home";
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

/** The pages in the menu bar: id, label, one line under the page title. */
const TABS: [Tab, string, string][] = [
  ["overview", "Overview", "One site, one mission: when the Sun gives power and Earth is in view."],
  ["land", "Site Finder", "Every 120 m square near the pole checked against NASA's limits, then ranked for your mission."],
  ["windows", "Window Finder", "The days on which a landing works at your site."],
  ["compare", "Compare sites", "Two sites side by side, hour by hour."],
  ...(Grid ? [["grid", "Move the lander", "What a few hundred metres changes."] as [Tab, string, string]] : []),
  ["power", "Battery", "Will the battery last through the dark?"],
  ["moon3d", "3D Moon", "Stand at the site at true scale, with the real Sun and Earth."],
  ["data", "Data & Method", "For researchers: every file we publish, how the answers are made, and how we checked them."],
];
/** Pages that work on one site and one time window, so they show the site, date and length controls. */
const MISSION_TABS: Tab[] = ["overview", "windows", "compare", "grid", "power", "moon3d"];

/** The page asked for in the address, read before the data has loaded (the store only learns it afterwards). */
const firstTab = new URLSearchParams(window.location.search).get("tab");

export default function App() {
  const st = useStore();
  useEffect(() => { void st.init().then(startUrlSync); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useSiteView(st.siteId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // A new page starts at its top.
  useEffect(() => { window.scrollTo(0, 0); setMenuOpen(false); }, [st.tab]);

  const hz = st.horizons[st.siteId];
  const eph = st.eph;
  // Until the data is in, show the homepage straight away if that is what was asked for.
  const tab: Tab = st.ready ? st.tab : (firstTab === null || firstTab === "home" ? "home" : st.tab);
  const site = st.sites.find((s) => s.id === st.siteId);
  const n = view?.series.sunlit.length ?? 1;
  const k = Math.min(st.cursor, n - 1);
  const sunMargin = view?.series.sunMargin[k];
  // Data and Method are one page with two sections; tab=method opens the second.
  const research = tab === "data" || tab === "method";
  const page = TABS.find(([t]) => t === (tab === "method" ? "data" : tab));

  const nav = (
    <header className={tab === "home" && !scrolled && !menuOpen ? "nav" : "nav solid"}>
      <button type="button" className="brand-mark" onClick={() => st.setTab("home")} aria-label="Claude's P.L.A.N: home">
        Claude's <span>P.L.A.N</span>
      </button>
      <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="pages" onClick={() => setMenuOpen((o) => !o)}>
        <span className="sr-only">Menu</span>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d={menuOpen ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <nav id="pages" className={menuOpen ? "nav-tabs open" : "nav-tabs"} role="tablist" aria-label="Pages">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t || (t === "data" && research)} className={tab === t || (t === "data" && research) ? "tab on" : "tab"}
            onClick={() => st.setTab(t)}>{label}</button>
        ))}
      </nav>
      {tab === "home" && st.ready && site && sunMargin !== undefined && (
        <button type="button" className="live" onClick={() => st.setTab("overview")}
          title={`The Sun at ${site.name}, ${fmtDate(idxToMs(st.startIdx + k))}: ${Math.abs(sunMargin).toFixed(2)}° ${sunMargin >= 0 ? "above" : "below"} the skyline`}>
          <span>Sun at {site.name}</span>
          <b className={sunMargin >= 0 ? "up" : "down"}>{sunMargin >= 0 ? "▲" : "▼"} {Math.abs(sunMargin).toFixed(1)}°</b>
        </button>
      )}
    </header>
  );

  if (tab === "home") {
    return (
      <div className="shell">
        {nav}
        <main className="home-main"><Home /></main>
        <Footer />
        <BackToTop />
      </div>
    );
  }

  if (!st.ready || !eph) return <div className="shell">{nav}<main className="page loading">Loading ephemeris…</main></div>;
  const mock = st.ephMock || st.sitesMock || hz?.mock;
  const dateValue = fmtDate(idxToMs(st.startIdx), false);
  const minDate = fmtDate(eph.startMs, false), maxDate = fmtDate(idxToMs(eph.n - 1), false);
  // Near the south pole Earth always hangs low in the north; elsewhere that sentence would be wrong.
  const polar = (site?.lat ?? 0) < -75;

  return (
    <div className="shell">
      {nav}
      <div className={tab === "land" || tab === "windows" ? "page wide" : "page"}>
        <div className="page-head">
          <h1 className="display">{page?.[1]}</h1>
          <p>{page?.[2]}</p>
        </div>

        {MISSION_TABS.includes(tab) && (
          <div className="mission-bar controls" aria-label="Mission">
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
        )}

        {research && (
          <div className="seg" role="group" aria-label="Section">
            <button type="button" aria-pressed={tab === "data"} onClick={() => st.setTab("data")}>Open data</button>
            <button type="button" aria-pressed={tab === "method"} onClick={() => st.setTab("method")}>How it works</button>
          </div>
        )}

        {mock && (
          <p className="banner" role="status">
            Showing mock data: the real ephemeris or this site's terrain has not been generated yet. Shapes are right, numbers are not.
          </p>
        )}

        {tab === "overview" && (
          <section className="hero" aria-label={`Sky from ${site?.name}`}>
            <div className="hero-head">
              <p>
                You are standing at <strong>{site?.name}</strong>. This is the whole horizon around you, unrolled flat:
                the left and right edges are both south.{polar ? " North points towards Earth." : ""}
              </p>
              <a className="vr-link primary" href={xrUrl(st.siteId, idxToMs(st.startIdx + k))}>
                Stand on the Moon (3D / VR)
              </a>
            </div>
            {view && hz ? (
              <>
                <SkyPanorama series={view.series} horizon={hz.value} cursor={st.cursor} sunR={eph.sunSemiDiam[st.startIdx] ?? 0.27} />
                <label className="scrub">
                  <span>{fmtDate(idxToMs((view.series.startIdx) + k))}</span>
                  <input type="range" min={0} max={n - 1} value={k}
                    onChange={(e) => st.setCursor(+e.target.value)} aria-label="Time within the mission window" />
                </label>
                <p className="note credit-line">
                  Skyline: NASA LOLA terrain, to scale. Earth photo: NASA, Apollo 17 (AS17-148-22727), lit in its phase
                  as seen from the Moon at that hour. Sun photo: NASA/GSFC/Solar Dynamics Observatory (PIA26681). The
                  rock texture and boulders are illustration.
                </p>
              </>
            ) : <p className="note">Loading terrain…</p>}
          </section>
        )}

        <main>
          {tab === "overview" && <Overview />}
          {tab === "windows" && <Windows />}
          {tab === "compare" && <Compare />}
          {tab === "power" && <Power />}
          {tab === "method" && <Method />}
          <Suspense fallback={<p className="note">Loading…</p>}>
            {tab === "grid" && Grid && <Grid />}
            {tab === "land" && <WhereToLand />}
            {tab === "moon3d" && <Moon3D />}
            {tab === "data" && <Data />}
          </Suspense>
        </main>
      </div>
      <Footer />
      <BackToTop />
    </div>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <p className="brand-mark small">Claude's <span>P.L.A.N</span></p>
      <p>
        Built by team Claude's Plan at HackAthlone 2026 with AI coding assistants (Claude). Data: NASA LOLA,
        NASA Goddard PGDA, JPL Horizons and DE421. Results are our own computations, not NASA's; this is not an
        official NASA product and implies no NASA endorsement.
      </p>
    </footer>
  );
}
