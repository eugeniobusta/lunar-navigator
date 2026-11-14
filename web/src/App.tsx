// App shell (Chinh's design): the top menu bar, then one page at a time. One site, two views, switched in the
// menu bar: Simple (the homepage, "Explore a site", "Plan a landing") and Detailed (the homepage and one page per
// tool). 3D Moon and Data & Method are in both. The homepage is full-width; every other page has a title, the
// mission controls when it works on one site and dates, and its content.
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { SkyPanorama } from "./charts/SkyPanorama";
import { BackToTop } from "./components/ui/BackToTop";
import { MissionControls } from "./components/ui/MissionControls";
import { SunClock } from "./components/ui/SunClock";
import { Compare } from "./routes/Compare";
import { Explore } from "./routes/Explore";
import { Home } from "./routes/Home";
import { Method } from "./routes/Method";
import { xrUrl } from "./routes/xr";
import { Overview } from "./routes/Overview";
import { Power } from "./routes/Power";
import { Windows } from "./routes/Windows";
import { fmtDate, idxToMs, useSiteView } from "./state/derived";
import { useStore, type Tab, type View } from "./state/store";
import { startUrlSync } from "./state/urlSync";

// Loaded on demand so their code stays out of the main bundle.
const Moon3D = lazy(() => import("./routes/Moon3D").then((m) => ({ default: m.Moon3D })));
const SiteFinder = lazy(() => import("./routes/LandingMap").then((m) => ({ default: m.SiteFinder })));
const Plan = lazy(() => import("./routes/Plan").then((m) => ({ default: m.Plan })));
const Data = lazy(() => import("./routes/Data").then((m) => ({ default: m.Data })));
// "Move the lander" appears as soon as web/src/routes/Grid.tsx exists (it must export `Grid`).
const gridModule = Object.values(import.meta.glob<{ Grid: ComponentType }>("./routes/Grid.tsx"))[0];
const Grid = gridModule ? lazy(() => gridModule().then((m) => ({ default: m.Grid }))) : null;

type Page = [Tab, string, string];
const SHARED: Page[] = [
  ["moon3d", "3D Moon", "Stand at the site at true scale, with the real Sun and Earth."],
  ["data", "Data & Method", "For researchers: every file we publish, how the answers are made, and how we checked them."],
];
/** The pages in the menu bar of each view: id, label, one line under the page title. */
const PAGES: Record<View, Page[]> = {
  simple: [
    ["explore", "Explore a site", "What is it like to stand at a landing site near the Moon's south pole?"],
    ["plan", "Plan a landing", "Where is it safe to land, when can you land, and will the batteries last the night?"],
    ...SHARED,
  ],
  detailed: [
    ["overview", "Overview", "One site, one mission: when the Sun gives power and Earth is in view."],
    ["map", "Site Finder", "Every 120 m square near the pole checked against NASA's limits, then ranked for your mission."],
    ["windows", "Window Finder", "The days on which a landing works at your site."],
    ["compare", "Compare sites", "Two sites side by side, hour by hour and as landing sites."],
    ...(Grid ? [["grid", "Move the lander", "What a few hundred metres changes."] as Page] : []),
    ["power", "Battery", "Will the battery last through the dark?"],
    ...SHARED,
  ],
};
/** Detailed pages that work on one site and one time window, so they show the site, date and length controls. */
const MISSION_TABS: Tab[] = ["overview", "windows", "compare", "grid", "power", "moon3d"];
const WIDE: Tab[] = ["map", "windows", "plan"];

/** The page asked for in the address, read before the data has loaded (the store only learns it afterwards). */
const firstTab = new URLSearchParams(window.location.search).get("tab");

/** How the menu bar is laid out for the room it has: the pages in the bar or behind the Menu button, the
 *  countdown shown or not, the view switch in the bar or inside the menu. */
interface Fit { menu: "bar" | "button"; clock: boolean; switchInBar: boolean }
const GAP = 28;

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
  useEffect(() => { window.scrollTo(0, 0); setMenuOpen(false); }, [st.tab, st.view]);

  const hz = st.horizons[st.siteId];
  const eph = st.eph;
  // Until the data is in, show the homepage straight away if that is what was asked for.
  const tab: Tab = st.ready ? st.tab : (firstTab === null || firstTab === "home" ? "home" : st.tab);
  const site = st.sites.find((s) => s.id === st.siteId);
  const n = view?.series.sunlit.length ?? 1;
  const k = Math.min(st.cursor, n - 1);
  // Data and Method are one page with two sections; tab=method opens the second.
  const research = tab === "data" || tab === "method";
  const pages = PAGES[st.view];
  const page = pages.find(([t]) => t === (tab === "method" ? "data" : tab));
  const clockWanted = tab === "home" && st.ready && !!eph && !!site && !!hz;

  // The menu bar must never run into the countdown or off the screen: measure what each part needs and fold the
  // pages behind the Menu button when they do not fit (then the countdown, then the view switch, on small screens).
  const bar = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<Fit>({ menu: "bar", clock: true, switchInBar: true });
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const check = () => {
      const w = (sel: string) => (el.querySelector<HTMLElement>(sel)?.offsetWidth ?? 0);
      const pad = parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).paddingRight);
      const room = el.clientWidth - pad;
      const brand = w(".brand-mark"), tabs = w(".nav-measure"), sw = w(".view-measure"), clock = clockWanted ? w(".live-measure") : 0, btn = 40;
      const need = (...parts: number[]) => parts.filter((p) => p > 0).reduce((a, b) => a + b + GAP, -GAP);
      let next: Fit;
      if (need(brand, tabs, sw, clock) <= room) next = { menu: "bar", clock: true, switchInBar: true };
      else if (need(brand, sw, clock, btn) <= room) next = { menu: "button", clock: true, switchInBar: true };
      else if (need(brand, sw, btn) <= room) next = { menu: "button", clock: false, switchInBar: true };
      else next = { menu: "button", clock: false, switchInBar: false };
      setFit((old) => (old.menu === next.menu && old.clock === next.clock && old.switchInBar === next.switchInBar ? old : next));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.querySelectorAll(".nav-measure, .view-measure, .live-measure").forEach((m) => ro.observe(m));
    void document.fonts?.ready.then(check);
    return () => ro.disconnect();
  }, [st.view, clockWanted, st.siteId]);
  useEffect(() => { if (fit.menu === "bar") setMenuOpen(false); }, [fit.menu]);

  const isOn = (t: Tab) => tab === t || (t === "data" && research);
  const viewSwitch = (extra: string) => (
    <div className={`view-switch ${extra}`} role="group" aria-label="View">
      {(["simple", "detailed"] as View[]).map((v) => (
        <button key={v} type="button" aria-pressed={st.view === v} onClick={() => st.setView(v)}
          title={v === "simple" ? "Two pages, in plain steps" : "Every tool on its own page"}>{v === "simple" ? "Simple" : "Detailed"}</button>
      ))}
    </div>
  );
  const clock = clockWanted ? (hidden: boolean) => (
    <SunClock eph={eph!} horizon={hz!.value} siteName={site!.name} onOpen={() => st.setTab("overview")} measure={hidden} />
  ) : null;

  const nav = (
    <header ref={bar} className={tab === "home" && !scrolled && !menuOpen ? "nav" : "nav solid"} data-menu={fit.menu}>
      <button type="button" className="brand-mark" onClick={() => st.setTab("home")} aria-label="Claude's P.L.A.N: home">
        Claude's <span>P.L.A.N</span>
      </button>
      <nav id="pages" className={menuOpen ? "nav-tabs open" : "nav-tabs"} role="tablist" aria-label="Pages">
        {pages.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={isOn(t)} className={isOn(t) ? "tab on" : "tab"}
            onClick={() => st.setTab(t)}>{label}</button>
        ))}
        {!fit.switchInBar && viewSwitch("in-menu")}
      </nav>
      {fit.switchInBar && viewSwitch("in-bar")}
      {clock && fit.clock && clock(false)}
      <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="pages" onClick={() => setMenuOpen((o) => !o)}>
        <span className="sr-only">Menu</span>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d={menuOpen ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {/* Invisible copies, only to measure how much room the pages, the switch and the countdown need. */}
      <div className="nav-measure" aria-hidden="true">{pages.map(([t, label]) => <span key={t} className="tab">{label}</span>)}</div>
      <div className="view-measure view-switch" aria-hidden="true"><span>Simple</span><span>Detailed</span></div>
      {clock && clock(true)}
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
  // Near the south pole Earth always hangs low in the north; elsewhere that sentence would be wrong.
  const polar = (site?.lat ?? 0) < -75;

  return (
    <div className="shell">
      {nav}
      <div className={WIDE.includes(tab) ? "page wide" : "page"}>
        <div className="page-head">
          <h1 className="display">{page?.[1]}</h1>
          <p>{page?.[2]}</p>
        </div>

        {MISSION_TABS.includes(tab) && <MissionControls />}

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
          {tab === "explore" && <Explore />}
          {tab === "overview" && <Overview />}
          {tab === "windows" && <Windows />}
          {tab === "compare" && <Compare />}
          {tab === "power" && <Power />}
          {tab === "method" && <Method />}
          <Suspense fallback={<p className="note">Loading…</p>}>
            {tab === "grid" && Grid && <Grid />}
            {tab === "map" && <SiteFinder />}
            {tab === "plan" && <Plan />}
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
