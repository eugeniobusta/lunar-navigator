// Homepage: what this is in one screen, then one full-width section per thing you can do.
// Every picture is drawn from our own published data (NASA LOLA relief, NASA PGDA maps, our suitability score).
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { PoleArt, type ArtTint } from "../components/ui/PoleArt";
import { useStore, type Tab } from "../state/store";

const BASE = `${import.meta.env.BASE_URL}data/`;

interface Summary { region_km2: number; pass_km2: number; pass_pct_of_region: number; zones: number; artemis: unknown[] }

function useSummary(): Summary | null {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${BASE}suitability/summary.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setS(j); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return s;
}

/** A link that opens a tab in place but still has a real address (middle-click, copy link). */
function TabLink({ tab, className, children }: { tab: Tab; className?: string; children: ReactNode }) {
  const setTab = useStore((s) => s.setTab);
  const go = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    setTab(tab);
  };
  return <a href={`?tab=${tab}`} className={className} onClick={go}>{children}</a>;
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A few hundred fixed stars behind the hero; the same sky every time. */
function Stars() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = w * dpr; c.height = h * dpr;
      const g = c.getContext("2d");
      if (!g) return;
      g.scale(dpr, dpr);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 260; i++) {
        const r = rnd() < 0.92 ? 0.6 : 1.1;
        g.fillStyle = `rgba(239,232,220,${0.25 + 0.6 * rnd()})`;
        g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 2 * Math.PI); g.fill();
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);
  return <canvas ref={ref} className="stars" aria-hidden="true" />;
}

interface Feature { tab: Tab; kicker: string; title: string; text: string; cta: string; tint: ArtTint; sunAz: number; credit: string }

export function Home() {
  const s = useSummary();
  const fmt = (n: number) => n.toLocaleString("en-GB");
  const features: Feature[] = [
    { tab: "land", kicker: "Landing sites", title: "Where is it safe to land?", cta: "Find a landing site", tint: "score", sunAz: 120,
      text: s ? `We tested every 120 m square within 6° of the pole against NASA's Artemis III limits. ${s.pass_pct_of_region} % of the ground passes, in ${fmt(s.zones)} separate zones. Tick what matters for your mission and we rank them for it.`
        : "We tested every 120 m square within 6° of the pole against NASA's Artemis III limits. Tick what matters for your mission and we rank the safe zones for it.",
      credit: "Green: ground that passes every NASA limit (our analysis). Relief: NASA LOLA." },
    { tab: "windows", kicker: "Window Finder", title: "When does the Sun shine?", cta: "Find a landing day", tint: "sun", sunAz: 210,
      text: "At the pole the Sun skims the horizon, so a single ridge can mean days of darkness. Pick a site and we search the calendar, hour by hour, for landings with sunlight and Earth in view for the whole stay.",
      credit: "Gold: how often the Sun is up, long-run average (NASA Goddard PGDA). Relief: NASA LOLA." },
    { tab: "compare", kicker: "Compare sites", title: "Can we call home?", cta: "Compare two sites", tint: "earth", sunAz: 300,
      text: "Earth hangs low in the northern sky. A hill can hide it and cut the direct radio link. Put two sites side by side and see which one keeps Earth, and the Sun, in view for longer.",
      credit: "Light blue: how often Earth is in view, long-run average (NASA Goddard PGDA). Relief: NASA LOLA." },
    { tab: "moon3d", kicker: "3D Moon", title: "Stand on the Moon", cta: "Open the 3D view", tint: "relief", sunAz: 40,
      text: "Real terrain at true scale, with the Sun and Earth where they really are at the hour you choose. In your browser, or in a VR headset.",
      credit: "Relief: NASA LOLA, lit by a low Sun." },
  ];

  return (
    <div className="home">
      <section className="home-hero">
        <Stars />
        <div className="hero-globe">
          <PoleArt disc animate className="globe" sunEl={6} turnS={80}
            label="The Moon's south pole, 440 km across, from NASA's laser altimeter, lit by a Sun that circles the horizon" />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Lunar Landing Site Navigator · NASA Space Apps 2026</p>
          <h1 className="display">Choose where to land before you fly</h1>
          <p className="hero-text">
            At the Moon's south pole the Sun never rises far, so every hill decides who gets power and who can see
            Earth. Claude's P.L.A.N (Polar Lunar Augmented Navigation) turns NASA's terrain and lighting data into
            two answers: where it is safe to land, and when.
          </p>
          <TabLink tab="overview" className="btn-outline">Explore <Arrow /></TabLink>
        </div>
      </section>

      {s && (
        <section className="home-stats" aria-label="The analysis in numbers">
          <div><b>{fmt(s.region_km2)} km²</b><span>of ground tested, 120 m at a time</span></div>
          <div><b>{s.pass_pct_of_region} %</b><span>passes every NASA Artemis III limit</span></div>
          <div><b>{fmt(s.zones)}</b><span>separate safe zones, ranked</span></div>
          <div><b>{s.artemis.length}</b><span>Artemis candidate regions checked</span></div>
        </section>
      )}

      {features.map((f, i) => (
        <section key={f.tab} className={i % 2 ? "feature flip" : "feature"}>
          <div className="feature-art">
            <PoleArt tint={f.tint} sunAz={f.sunAz} sunEl={8} label={f.credit} />
          </div>
          <div className="feature-copy">
            <p className="eyebrow">{f.kicker}</p>
            <h2 className="display">{f.title}</h2>
            <p>{f.text}</p>
            <TabLink tab={f.tab} className="round-link"><span className="round"><Arrow /></span>{f.cta}</TabLink>
            <p className="credit">{f.credit}</p>
          </div>
        </section>
      ))}

      <section className="home-data">
        <p className="eyebrow">Open data</p>
        <h2 className="display">Every number, yours to check</h2>
        <p>
          Everything on this site is published as open data under CC BY 4.0, with how we computed it and how we
          checked it against NASA and JPL.
        </p>
        <div className="home-data-links">
          <TabLink tab="data" className="round-link"><span className="round"><Arrow /></span>Get the data</TabLink>
          <TabLink tab="method" className="round-link"><span className="round"><Arrow /></span>How it works</TabLink>
        </div>
      </section>
    </div>
  );
}
