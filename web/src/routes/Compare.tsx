// Two sites side by side, and what a launch slip does to each.
import { useState } from "react";
import { Timeline } from "../charts/Timeline";
import { SiteSelect } from "../components/ui";
import type { Metrics } from "../lib/analysis";
import { fmtDate, fmtHours, idxToMs, useSiteView } from "../state/derived";
import { useStore } from "../state/store";

const ROWS: [string, (m: Metrics) => string, (m: Metrics) => number][] = [
  ["Sunlight", (m) => `${m.sunPct.toFixed(0)}%`, (m) => m.sunPct],
  ["Earth in view", (m) => `${m.earthPct.toFixed(0)}%`, (m) => m.earthPct],
  ["Both", (m) => `${m.bothPct.toFixed(0)}%`, (m) => m.bothPct],
  ["Longest darkness", (m) => fmtHours(m.longestDarkH), (m) => -m.longestDarkH],
  ["Longest without Earth", (m) => fmtHours(m.longestNoEarthH), (m) => -m.longestNoEarthH],
];

export function Compare() {
  const st = useStore();
  const [slip, setSlip] = useState(0);
  const a = useSiteView(st.siteId, slip);
  const b = useSiteView(st.compareId, slip);
  const nameOf = (id: string) => st.sites.find((s) => s.id === id)?.name ?? id;
  if (!st.eph) return null;

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
        </>
      ) : <p className="note">Loading both sites…</p>}
    </section>
  );
}
