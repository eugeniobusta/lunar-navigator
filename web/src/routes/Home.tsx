// Homepage: what this is in one screen, then one full-width section per thing you can do.
// Pictures: NASA public-domain photos (web/public/media/CREDITS.md), and for Site Finder our own map drawn from the
// published data (NASA LOLA relief and our suitability score).
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { PoleArt, type ArtTint } from "../components/ui/PoleArt";
import { useStore, type Tab } from "../state/store";

const BASE = `${import.meta.env.BASE_URL}data/`;
const MEDIA = `${import.meta.env.BASE_URL}media/`;

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

/** A NASA photo: file in web/public/media/, what it shows, and where to keep its centre when it is cropped. */
interface Photo { file: string; alt: string; focus?: string }
interface Feature { tab: Tab; kicker: string; title: string; text: string; cta: string; credit: string; photo?: Photo; tint?: ArtTint; sunAz?: number }

export function Home() {
  const s = useSummary();
  const fmt = (n: number) => n.toLocaleString("en-GB");
  const features: Feature[] = [
    { tab: "explore", kicker: "Step 1", title: "Explore a site", cta: "Explore a site",
      photo: { file: "apollo8-earthrise.jpg", alt: "Earth rising over the grey lunar horizon, photographed from Apollo 8 in 1968", focus: "50% 72%" },
      text: "Stand at one of NASA's candidate landing sites. See the real hills around you, where the Sun and Earth move, and how long the nights last.",
      credit: "Photo: NASA, Apollo 8, Earthrise (AS08-14-2383), 1968." },
    { tab: "plan", kicker: "Step 2", title: "Plan a landing", cta: "Plan a landing", tint: "score", sunAz: 120,
      text: s ? `Find the safest ground (only ${s.pass_pct_of_region} % of it passes NASA's rules), the days you can land there, and whether the batteries last the night.`
        : "Find the safest ground, the days you can land there, and whether the batteries last the night.",
      credit: "Our map: green is ground that passes every NASA safety rule. Relief: NASA LOLA." },
  ];

  return (
    <div className="home">
      <section className="home-hero">
        <Stars />
        <div className="hero-globe photo">
          <img className="globe" src={`${MEDIA}moon-gibbous.jpg`}
            alt="The Moon, two-thirds lit, rendered by NASA from the Lunar Orbiter Laser Altimeter's terrain map" />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Lunar Landing Site Navigator · NASA Space Apps 2026</p>
          <h1 className="display">Choose where to land before you fly</h1>
          <p className="hero-text">
            The Moon's south pole may hold water ice, and NASA's Artemis astronauts will land there. But the Sun sits
            so low that a single hill can block it. We use NASA's own maps to show <strong>where</strong> and{" "}
            <strong>when</strong> a lander gets sunlight for power and can talk to Earth.
          </p>
          <div className="hero-buttons">
            <TabLink tab="explore" className="btn-outline">Explore a site <Arrow /></TabLink>
            <TabLink tab="plan" className="btn-outline">Plan a landing <Arrow /></TabLink>
          </div>
        </div>
        <p className="hero-credit">Moon: NASA Goddard, from LRO laser-altimeter data.</p>
      </section>

      {s && (
        <section className="home-stats" aria-label="The analysis in numbers">
          <div><b>{fmt(s.region_km2)} km²</b><span>of ground tested, 120 m at a time</span></div>
          <div><b>{s.pass_pct_of_region} %</b><span>passes NASA's safety rules for landing</span></div>
          <div><b>{fmt(s.zones)}</b><span>safe zones, ranked for your mission</span></div>
        </section>
      )}

      {features.map((f, i) => (
        <section key={f.tab} className={i % 2 ? "feature flip" : "feature"}>
          <div className="feature-art">
            {f.photo
              ? <img src={MEDIA + f.photo.file} alt={f.photo.alt} loading="lazy" style={f.photo.focus ? { objectPosition: f.photo.focus } : undefined} />
              : <PoleArt tint={f.tint} sunAz={f.sunAz} sunEl={8} label={f.credit} />}
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
        <img className="home-data-bg" src={`${MEDIA}artemis2-moon-and-earth.jpg`} alt="" loading="lazy" />
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
        <p className="credit">Photo: NASA, Artemis II crew, A New View of the Moon (art002e009287), 2026. NASA photos are
          public domain; we use them with credit and no NASA logo, and they imply no NASA endorsement.</p>
      </section>
    </div>
  );
}
