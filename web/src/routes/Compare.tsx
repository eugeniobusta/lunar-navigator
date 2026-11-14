// Two sites side by side, and what a launch slip does to each.
import { useState } from "react";
import { Timeline } from "../charts/Timeline";
import { SiteSelect } from "../components/ui";
import type { Metrics } from "../lib/analysis";
import { TERM_OF, explainFor, valuesFromRow } from "../lib/analysis/explain";
import { RAG_WORD, assessValues, failedLimitTokens } from "../lib/analysis/rag";
import { flippedTerms, parameter } from "../lib/analysis/suitability";
import { useCriteriaTables, useLandSelection } from "../state/criteria";
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

const KEY_OF = Object.fromEntries(Object.entries(TERM_OF).filter(([, t]) => t).map(([k, t]) => [t, k])) as Record<string, string>;

export function Compare() {
  const st = useStore();
  const [slip, setSlip] = useState(0);
  const a = useSiteView(st.siteId, slip);
  const b = useSiteView(st.compareId, slip);
  const nameOf = (id: string) => st.sites.find((s) => s.id === id)?.name ?? id;
  const tables = useCriteriaTables();
  const selection = useLandSelection(tables);
  if (!st.eph) return null;
  const wins = a && b ? ROWS.reduce((n, [, , v, more]) => n + ((more ? v(a.metrics) > v(b.metrics) : v(a.metrics) < v(b.metrics)) ? 1 : 0), 0) : 0;
  const winsB = a && b ? ROWS.reduce((n, [, , v, more]) => n + ((more ? v(b.metrics) > v(a.metrics) : v(b.metrics) < v(a.metrics)) ? 1 : 0), 0) : 0;

  // The landing criteria at both sites, for what is ticked on the Map page: long-run values at each site's own
  // 120 m square (suitability/site_values.csv), judged by the same rules as the map.
  const judge = (id: string) => {
    const row = tables?.siteValues.find((r) => r.id === id);
    if (!row || !tables) return null;
    const values = valuesFromRow(row), a = assessValues(values, selection);
    const text = explainFor(values, tables.criteria, a.terms.map((t) => t.term), flippedTerms(selection));
    return { a, failed: failedLimitTokens(row.failed_limits ?? ""), valueOf: (key: string) => text.find((e) => e.key === key)?.value ?? "no data", values };
  };
  const ja = judge(st.siteId), jb = judge(st.compareId);
  const better = (mine: NonNullable<typeof ja>, other: NonNullable<typeof ja>) =>
    mine.a.terms.filter((t, i) => t.subscore > other.a.terms[i].subscore + 0.02).map((t) => parameter(t.term).label.toLowerCase());
  const overall = (j: NonNullable<typeof ja>) => (j.failed.length
    ? <><span className="cls unsafe" aria-hidden="true" />Unsafe: fails {j.failed.join("; ")}</>
    : j.a.score === null ? <>Passes every NASA limit</> : <><span className={`cls ${j.a.rag}`} aria-hidden="true" />{RAG_WORD[j.a.rag]}, score {j.a.score}</>);

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

          <h3>As landing sites, for what you ticked on the map</h3>
          {ja && jb ? (
            <>
              <table className="compare criteria">
                <thead><tr><th /><th>{nameOf(st.siteId)}</th><th>{nameOf(st.compareId)}</th></tr></thead>
                <tbody>
                  <tr className="overall"><th>Overall</th><td>{overall(ja)}</td><td>{overall(jb)}</td></tr>
                  {ja.a.terms.map((t, i) => { const u = jb.a.terms[i]; const key = KEY_OF[t.term]; return (
                    <tr key={t.term}>
                      <th>{parameter(t.term).label}</th>
                      <td><span className={`cls ${t.rag}`} aria-hidden="true" />{ja.valueOf(key)} <span className="sr">{RAG_WORD[t.rag]}</span></td>
                      <td><span className={`cls ${u.rag}`} aria-hidden="true" />{jb.valueOf(key)} <span className="sr">{RAG_WORD[u.rag]}</span></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
              <p className="lede reasons-line"><strong>{nameOf(st.siteId)} is better for:</strong> {better(ja, jb).join(", ") || "nothing you ticked"}.</p>
              <p className="lede reasons-line"><strong>{nameOf(st.compareId)} is better for:</strong> {better(jb, ja).join(", ") || "nothing you ticked"}.</p>
              <p className="note">
                Green is good, amber acceptable, red poor, by the ranges on the Map page. Long-run values at each site's own 120 m square, not
                for the dates above. The score is the weighted mean of what you ticked, from the published site values; a site that fails a NASA
                limit is unsafe whatever it scores.
              </p>
            </>
          ) : <p className="note">The landing criteria are only computed near the south pole, so at least one of these sites has none.</p>}
        </>
      ) : <p className="note">Loading both sites…</p>}
    </section>
  );
}
