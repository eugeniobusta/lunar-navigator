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

/** Adds "in" to every .reveal element once it scrolls into view (the text fades up as you reach it). */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".home .reveal")];
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { threshold: 0.15 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  });
}

export function Home() {
  const s = useSummary();
  useReveal();
  const fmt = (n: number) => n.toLocaleString("en-GB");
  const features: Feature[] = [
    { tab: "overview", kicker: "Overview", title: "Stand at a site", cta: "See a site hour by hour",
      photo: { file: "apollo8-earthrise.jpg", alt: "Earth rising over the grey lunar horizon, photographed from Apollo 8 in 1968", focus: "50% 72%" },
      text: "Pick a landing site and a date. See its whole skyline, where the Sun and Earth are hour by hour, and how long the nights last.",
      credit: "Photo: NASA, Apollo 8, Earthrise (AS08-14-2383), 1968." },
    { tab: "land", kicker: "Site Finder", title: "Where is it safe to land?", cta: "Find a landing site", tint: "score", sunAz: 120,
      text: s ? `We tested every 120 m square within 6° of the pole against NASA's Artemis III limits. ${s.pass_pct_of_region} % of the ground passes, in ${fmt(s.zones)} separate zones. Tick what matters for your mission and we rank them for it.`
        : "We tested every 120 m square within 6° of the pole against NASA's Artemis III limits. Tick what matters for your mission and we rank the safe zones for it.",
      credit: "Our map: green is ground that passes every NASA limit. Relief: NASA LOLA." },
    { tab: "windows", kicker: "Window Finder", title: "When does the Sun shine?", cta: "Find a landing day",
      photo: { file: "artemis2-lunar-day-shadows.jpg", alt: "Craters at the edge of lunar day, with long shadows cast by a low Sun", focus: "70% 50%" },
      text: "At the pole the Sun skims the horizon, so a single ridge can mean days of darkness. Pick a site and we search the calendar, hour by hour, for landings with sunlight and Earth in view for the whole stay.",
      credit: "Photo: NASA, Artemis II crew, Shadows at the Edge of Lunar Day (art002e009281), 2026." },
    { tab: "compare", kicker: "Compare sites", title: "Can we call home?", cta: "Compare two sites",
      photo: { file: "artemis2-earthset.jpg", alt: "Earth setting behind the curved edge of the Moon, seen from the Orion spacecraft", focus: "35% 50%" },
      text: "Earth hangs low in the northern sky. A hill can hide it and cut the direct radio link. Put two sites side by side and see which one keeps Earth, and the Sun, in view for longer.",
      credit: "Photo: NASA, Artemis II crew, Earthset from Orion (art002e021278), 2026." },
    { tab: "power", kicker: "Battery", title: "Will the power last the night?", cta: "Test a battery",
      photo: { file: "artemis3-lighting-test.jpg", alt: "A bright lamp low over a model of lunar ground, as NASA engineers test south-pole lighting", focus: "50% 40%" },
      text: "A low Sun means long shadows and long nights. Size the solar panels and the battery, and see whether a lander keeps its power through the dark hours.",
      credit: "Photo: NASA/Charles Beason, lunar lighting test for Artemis III at Marshall Space Flight Center (CEB_1528), 2025." },
    { tab: "moon3d", kicker: "3D Moon", title: "Stand on the Moon", cta: "Open the 3D view",
      photo: { file: "apollo15-rover.jpg", alt: "Astronaut James Irwin beside the lunar rover, with a mountain behind, Apollo 15", focus: "30% 50%" },
      text: "Real terrain at true scale, with the Sun and Earth where they really are at the hour you choose. In your browser, or in a VR headset.",
      credit: "Photo: NASA, Apollo 15, James Irwin and the Lunar Roving Vehicle (AS15-86-11603), 1971." },
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
            At the Moon's south pole the Sun never rises far, so every hill decides who gets power and who can see
            Earth. Claude's P.L.A.N (Polar Lunar Augmented Navigation) turns NASA's terrain and lighting data into
            two answers: where it is safe to land, and when.
          </p>
          <TabLink tab="overview" className="btn-outline">Explore <Arrow /></TabLink>
        </div>
        <p className="hero-credit">Moon: NASA Goddard, from LRO laser-altimeter data.</p>
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
            {f.photo
              ? <img src={MEDIA + f.photo.file} alt={f.photo.alt} loading="lazy" style={f.photo.focus ? { objectPosition: f.photo.focus } : undefined} />
              : <PoleArt tint={f.tint} sunAz={f.sunAz} sunEl={8} label={f.credit} />}
          </div>
          <div className="feature-copy reveal">
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
        <div className="reveal">
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
        </div>
      </section>
    </div>
  );
}
