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

const ROWS: [string, (m: Metrics) => string, (m: Metrics) => number][] = [
  ["Sunlight", (m) => `${m.sunPct.toFixed(0)}%`, (m) => m.sunPct],
  ["Earth in view", (m) => `${m.earthPct.toFixed(0)}%`, (m) => m.earthPct],
  ["Both", (m) => `${m.bothPct.toFixed(0)}%`, (m) => m.bothPct],
  ["Longest darkness", (m) => fmtHours(m.longestDarkH), (m) => -m.longestDarkH],
  ["Longest without Earth", (m) => fmtHours(m.longestNoEarthH), (m) => -m.longestNoEarthH],
];

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
          <h3>{nameOf(st.siteId)}</h3>
          <Timeline series={a.series} startMs={idxToMs(a.series.startIdx)} stepS={st.eph.stepS} />
          <h3>{nameOf(st.compareId)}</h3>
          <Timeline series={b.series} startMs={idxToMs(b.series.startIdx)} stepS={st.eph.stepS} />
          <table className="compare">
            <thead><tr><th /><th>{nameOf(st.siteId)}</th><th>{nameOf(st.compareId)}</th></tr></thead>
            <tbody>
              {ROWS.map(([label, fmt, score]) => {
                const sa = score(a.metrics), sb = score(b.metrics);
                return (
                  <tr key={label}>
                    <th>{label}</th>
                    <td className={sa > sb ? "better" : ""}>{fmt(a.metrics)}</td>
                    <td className={sb > sa ? "better" : ""}>{fmt(b.metrics)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
