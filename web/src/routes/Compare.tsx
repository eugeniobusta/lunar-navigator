// Two sites side by side, and what a launch slip does to each.
import { useState } from "react";
import { Timeline } from "../charts/Timeline";
import { SiteSelect } from "../components/ui";
import type { Metrics } from "../lib/analysis";
import { fmtDate, fmtHours, idxToMs, useSiteView } from "../state/derived";
import { useStore } from "../state/store";

/** One measure: label, text, value for the bar, and whether more is better. */
const ROWS: [string, (m: Metrics) => string, (m: Metrics) => number, boolean][] = [
  ["Sunlight", (m) => `${m.sunPct.toFixed(0)}%`, (m) => m.sunPct, true],
  ["Earth in view", (m) => `${m.earthPct.toFixed(0)}%`, (m) => m.earthPct, true],
  ["Sun and Earth both", (m) => `${m.bothPct.toFixed(0)}%`, (m) => m.bothPct, true],
  ["Longest darkness", (m) => fmtHours(m.longestDarkH), (m) => m.longestDarkH, false],
  ["Longest without Earth", (m) => fmtHours(m.longestNoEarthH), (m) => m.longestNoEarthH, false],
];
// A colour per site, kept for every bar of that site.
const A = "var(--bone)", B = "var(--regolith)";

export function Compare() {
  const st = useStore();
  const [slip, setSlip] = useState(0);
  const a = useSiteView(st.siteId, slip);
  const b = useSiteView(st.compareId, slip);
  const nameOf = (id: string) => st.sites.find((s) => s.id === id)?.name ?? id;
  if (!st.eph) return null;
  const wins = a && b ? ROWS.reduce((n, [, , v, more]) => n + ((more ? v(a.metrics) > v(b.metrics) : v(a.metrics) < v(b.metrics)) ? 1 : 0), 0) : 0;
  const winsB = a && b ? ROWS.reduce((n, [, , v, more]) => n + ((more ? v(b.metrics) > v(a.metrics) : v(b.metrics) < v(a.metrics)) ? 1 : 0), 0) : 0;

  return (
    <section className="panel">
      <div className="controls">
        <SiteSelect label="Compare with" sites={st.sites} value={st.compareId} onChange={st.setCompare} />
        <label className="field grow">
          <span>Launch slip: {slip === 0 ? "on time" : `${slip > 0 ? "+" : ""}${slip} days`}
            {a ? ` (window starts ${fmtDate(idxToMs(a.series.startIdx), false)})` : ""}</span>
          <input type="range" min={-30} max={60} value={slip} onChange={(e) => setSlip(+e.target.value)} />
        </label>
      </div>
      {a && b ? (
        <>
          <div className="duel-head">
            <div><span className="swatch" style={{ background: A }} /><b>{nameOf(st.siteId)}</b><small>wins {wins} of {ROWS.length}</small></div>
            <span className="vs" aria-hidden="true">vs</span>
            <div><span className="swatch" style={{ background: B }} /><b>{nameOf(st.compareId)}</b><small>wins {winsB} of {ROWS.length}</small></div>
          </div>
          <div className="duel" role="table" aria-label="The two sites, measure by measure">
            {ROWS.map(([label, fmt, value, more]) => {
              const va = value(a.metrics), vb = value(b.metrics);
              const max = more ? 100 : Math.max(1, va, vb);
              const betterA = more ? va > vb : va < vb, betterB = more ? vb > va : vb < va;
              return (
                <div key={label} className="duel-row" role="row">
                  <span className="duel-label" role="rowheader">{label}<small>{more ? "more is better" : "shorter is better"}</small></span>
                  {([[va, fmt(a.metrics), A, betterA, st.siteId], [vb, fmt(b.metrics), B, betterB, st.compareId]] as const).map(([v, text, colour, better, id]) => (
                    <span key={id} className={better ? "duel-cell better" : "duel-cell"} role="cell" title={`${nameOf(id)}: ${text}`}>
                      <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(v / max) * 100}%`, background: colour }} /></span>
                      <b>{text}</b>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="duel-lines">
            <div className="card">
              <h3><span className="swatch" style={{ background: A }} />{nameOf(st.siteId)}</h3>
              <Timeline series={a.series} startMs={idxToMs(a.series.startIdx)} stepS={st.eph.stepS} />
            </div>
            <div className="card">
              <h3><span className="swatch" style={{ background: B }} />{nameOf(st.compareId)}</h3>
              <Timeline series={b.series} startMs={idxToMs(b.series.startIdx)} stepS={st.eph.stepS} />
            </div>
          </div>
          <p className="note">Drag the slip slider: at the south pole a delay of days can turn a well-lit site into one that lands at nightfall.</p>
        </>
      ) : <p className="note">Loading both sites…</p>}
    </section>
  );
}
