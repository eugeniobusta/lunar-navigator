// App shell: the top menu bar, then one page at a time. The homepage is full-width; every other page has a title,
// the mission controls when it needs a site and dates, and its content.
import { lazy, Suspense, useEffect, useState } from "react";
import { BackToTop } from "./components/ui/BackToTop";
import { MissionControls } from "./components/ui/MissionControls";
import { SunClock } from "./components/ui/SunClock";
import { Explore } from "./routes/Explore";
import { Home } from "./routes/Home";
import { Method } from "./routes/Method";
import { useStore, type Tab } from "./state/store";
import { startUrlSync } from "./state/urlSync";

// Loaded on demand so their code stays out of the main bundle.
const Moon3D = lazy(() => import("./routes/Moon3D").then((m) => ({ default: m.Moon3D })));
const Plan = lazy(() => import("./routes/Plan").then((m) => ({ default: m.Plan })));
const Data = lazy(() => import("./routes/Data").then((m) => ({ default: m.Data })));
/** The pages in the menu bar: id, label, one line under the page title. The two main pages hold the older ones:
 *  Explore = Overview + Compare sites; Plan = Site Finder + Window Finder + Battery (state/store.ts canonicalTab). */
const TABS: [Tab, string, string][] = [
  ["explore", "Explore a site", "What is it like to stand at a landing site near the Moon's south pole?"],
  ["plan", "Plan a landing", "Where is it safe to land, when can you land, and will the batteries last the night?"],
  ["moon3d", "3D Moon", "Stand at the site at true scale, with the real Sun and Earth."],
  ["data", "Data & Method", "For researchers: every file we publish, how the answers are made, and how we checked them."],
];
/** The page asked for in the address, read before the data has loaded (the store only learns it afterwards). */
const firstTab = new URLSearchParams(window.location.search).get("tab");

export default function App() {
  const st = useStore();
  useEffect(() => { void st.init().then(startUrlSync); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
      {tab === "home" && st.ready && eph && site && hz && (
        <SunClock eph={eph} horizon={hz.value} siteName={site.name} onOpen={() => st.setTab("explore")} />
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

  return (
    <div className="shell">
      {nav}
      <div className={tab === "plan" ? "page wide" : "page"}>
        <div className="page-head">
          <h1 className="display">{page?.[1]}</h1>
          <p>{page?.[2]}</p>
        </div>

        {tab === "moon3d" && <MissionControls />}

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

        <main>
          {tab === "explore" && <Explore />}
          {tab === "method" && <Method />}
          <Suspense fallback={<p className="note">Loading…</p>}>
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
