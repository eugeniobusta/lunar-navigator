// Explore a site: what it is like to stand at one landing site, in four plain steps.
// 1 pick a site and a date, 2 look around (the horizon with the real Sun and Earth), 3 what it means for a lander,
// 4 how it compares with another site. Holds what used to be Overview and Compare sites.
import type { ReactNode } from "react";
import { SkyPanorama } from "../charts/SkyPanorama";
import { Timeline } from "../charts/Timeline";
import { SiteSelect } from "../components/ui";
import { MissionControls } from "../components/ui/MissionControls";
import { WhyHere } from "../components/ui/WhyHere";
import type { Metrics } from "../lib/analysis";
import { explainFor, valuesFromRow } from "../lib/analysis/explain";
import { flippedTerms } from "../lib/analysis/suitability";
import { useCriteriaTables, useLandSelection, useTickedTerms } from "../state/criteria";
import { fmtDate, fmtHours, idxToMs, useSiteView } from "../state/derived";
import { useStore } from "../state/store";
import { verdict } from "./verdict";
import { xrUrl } from "./xr";

/** One numbered step: a question in plain words, one line on how to read what follows, then the content. */
export function Step({ n, question, hint, children }: { n: number; question: string; hint: ReactNode; children: ReactNode }) {
  return (
    <section className="step" aria-labelledby={`step-${n}`}>
      <div className="step-num" aria-hidden="true">{n}</div>
      <div className="step-body">
        <h2 id={`step-${n}`}>{question}</h2>
        <p className="step-hint">{hint}</p>
        {children}
      </div>
    </section>
  );
}

/** The three numbers that matter, each with what it means for a lander. */
function Vitals({ m }: { m: Metrics }) {
  return (
    <div className="vitals">
      <div className="sun"><b>{m.sunPct.toFixed(0)}%</b><span>of the time in <strong>sunlight</strong></span><small>Solar panels make power only in sunlight.</small></div>
      <div className="earth"><b>{m.earthPct.toFixed(0)}%</b><span>of the time with <strong>Earth in view</strong></span><small>You can radio home directly only while Earth is above the hills.</small></div>
      <div className={m.longestDarkH > 100 ? "dark bad" : "dark"}><b>{fmtHours(m.longestDarkH)}</b><span><strong>longest night</strong></span><small>The batteries must keep the lander alive this long.</small></div>
    </div>
  );
}

const DUEL: [string, (m: Metrics) => string, (m: Metrics) => number, boolean][] = [
  ["Sunlight", (m) => `${m.sunPct.toFixed(0)}%`, (m) => m.sunPct, true],
  ["Earth in view", (m) => `${m.earthPct.toFixed(0)}%`, (m) => m.earthPct, true],
  ["Longest night", (m) => fmtHours(m.longestDarkH), (m) => m.longestDarkH, false],
];

export function Explore() {
  const st = useStore();
  const eph = st.eph;
  const site = st.sites.find((s) => s.id === st.siteId);
  const hz = st.horizons[st.siteId];
  const view = useSiteView(st.siteId);
  const other = useSiteView(st.compareId);
  const tables = useCriteriaTables();
  const ticked = useTickedTerms(tables);
  const flips = flippedTerms(useLandSelection(tables));
  if (!eph || !site) return null;
  const n = view?.series.sunlit.length ?? 1;
  const k = Math.min(st.cursor, n - 1);
  const siteRow = tables?.siteValues.find((r) => r.id === site.id);
  const why = tables && siteRow ? explainFor(valuesFromRow(siteRow), tables.criteria, ticked, flips) : [];
  const nameOf = (id: string) => st.sites.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="steps">
      <Step n={1} question="Where do you want to stand, and when?"
        hint="Pick one of NASA's nine candidate sites for the Artemis landings (or a past landing), a date and how long you stay. Everything below follows your choice.">
        <MissionControls />
      </Step>

      <Step n={2} question="What would you see?"
        hint={<>This is the whole horizon around you at <strong>{site.name}</strong>, unrolled flat like a panorama photo: both edges are south, the middle is north, towards Earth. Drag the slider to move through time and watch the Sun slide along the hills.</>}>
        {view && hz ? (
          <>
            <SkyPanorama series={view.series} horizon={hz.value} cursor={st.cursor} sunR={eph.sunSemiDiam[st.startIdx] ?? 0.27} />
            <label className="scrub">
              <span>{fmtDate(idxToMs(view.series.startIdx + k))}</span>
              <input type="range" min={0} max={n - 1} value={k} onChange={(e) => st.setCursor(+e.target.value)} aria-label="Time within the mission window" />
            </label>
            <ul className="key read-key">
              <li><span className="swatch sun" />Gold line: where the Sun moves</li>
              <li><span className="swatch earth" />Blue loop: where Earth moves</li>
              <li><span className="swatch ground" />Grey: real hills and mountains, which can hide both</li>
            </ul>
            <Timeline series={view.series} startMs={idxToMs(view.series.startIdx)} stepS={eph.stepS} cursor={k} onCursor={st.setCursor} />
            <ul className="key">
              <li><span className="swatch sun" />Sunlight: power</li>
              <li><span className="swatch earth" />Earth in view: radio link home</li>
              <li><span className="swatch eclipse" />Dark, or no link</li>
            </ul>
            <div className="step-actions">
              <a className="btn-outline small" href={xrUrl(st.siteId, idxToMs(st.startIdx + k))}>Stand there in 3D / VR</a>
            </div>
            <p className="note credit-line">
              Skyline: NASA LOLA terrain, to scale. Earth: NASA, Apollo 17 (AS17-148-22727), lit in its phase as seen from
              the Moon. Sun: NASA/GSFC/SDO (PIA26681). The rock texture is illustration.
            </p>
          </>
        ) : <p className="note">Loading the terrain…</p>}
      </Step>

      <Step n={3} question="Is it a good place for a lander?"
        hint="A lander needs sunlight for power and Earth in view to talk to mission control. Here is how often it gets both during your stay.">
        {view ? (
          <>
            <p className="verdict">{verdict(view.metrics)}</p>
            <Vitals m={view.metrics} />
            {why.length > 0 && (
              <details className="fold small">
                <summary>Why is this site good or bad? The full checklist</summary>
                <WhyHere title={`${site.name} against NASA's landing criteria`} list={why} />
              </details>
            )}
          </>
        ) : <p className="note">Loading…</p>}
      </Step>

      <Step n={4} question="How does it compare with another site?"
        hint="Same dates, another place. Green marks the better of the two.">
        <div className="controls"><SiteSelect label="Compare with" sites={st.sites} value={st.compareId} onChange={st.setCompare} /></div>
        {view && other ? (
          <div className="duel" role="table" aria-label="The two sites, measure by measure">
            <div className="duel-row duel-names" role="row">
              <span role="columnheader" />
              <b role="columnheader">{site.name}</b>
              <b role="columnheader">{nameOf(st.compareId)}</b>
            </div>
            {DUEL.map(([label, fmt, value, more]) => {
              const va = value(view.metrics), vb = value(other.metrics);
              const max = more ? 100 : Math.max(1, va, vb);
              const cells = [[va, fmt(view.metrics), "var(--bone)", more ? va > vb : va < vb], [vb, fmt(other.metrics), "var(--regolith)", more ? vb > va : vb < va]] as const;
              return (
                <div key={label} className="duel-row" role="row">
                  <span className="duel-label" role="rowheader">{label}<small>{more ? "more is better" : "shorter is better"}</small></span>
                  {cells.map(([v, text, colour, better], i) => (
                    <span key={i} className={better ? "duel-cell better" : "duel-cell"} role="cell">
                      <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(v / max) * 100}%`, background: colour }} /></span>
                      <b>{text}</b>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        ) : <p className="note">Loading both sites…</p>}
      </Step>
    </div>
  );
}
