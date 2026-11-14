// "Why here?": a checklist of the landing criteria for a point (web/src/lib/analysis/explain.ts).
// Each row shows the criterion, its value and the verdict at a glance; the reason folds out on a click.
import { useState } from "react";
import { summarise, type Explanation } from "../../lib/analysis/explain";

const VERDICT_TEXT: Record<Explanation["verdict"], string> = { good: "good", acceptable: "acceptable", rejected: "rejected" };

/** The verdict as a shape as well as a colour: a tick, a dash, a cross. */
function Mark({ verdict }: { verdict: Explanation["verdict"] }) {
  const d = verdict === "good" ? "M7 12.5l3.2 3.2L17 9" : verdict === "acceptable" ? "M8 12h8" : "M8.5 8.5l7 7M15.5 8.5l-7 7";
  return (
    <svg className={`why-mark ${verdict}`} viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WhyHere({ title, list }: { title: string; list: Explanation[] }) {
  const [allOpen, setAllOpen] = useState(false);
  if (!list.length) return null;
  const count = (v: Explanation["verdict"]) => list.filter((e) => e.verdict === v).length;
  return (
    <div className="why">
      <h3>{title}</h3>
      <div className="why-head">
        <p className="why-summary">{summarise(list)}</p>
        <ul className="why-counts" aria-label="Count by verdict">
          <li className="good"><Mark verdict="good" />{count("good")} good</li>
          <li className="acceptable"><Mark verdict="acceptable" />{count("acceptable")} acceptable</li>
          <li className="rejected"><Mark verdict="rejected" />{count("rejected")} rejected</li>
        </ul>
        <button type="button" className="link why-all" onClick={() => setAllOpen(!allOpen)}>
          {allOpen ? "Hide all the reasons" : "Show all the reasons"}
        </button>
      </div>
      {/* Re-mounted when "all" changes, so every row opens or closes together; a row still opens on its own. */}
      <ul className="why-list" key={allOpen ? "open" : "closed"}>
        {list.map((e) => (
          <li key={e.key} className={e.verdict}>
            <details open={allOpen || undefined}>
              <summary>
                <Mark verdict={e.verdict} />
                <span className="why-name">{e.label}{e.hardLimit && <small>NASA limit</small>}</span>
                <span className="why-value">{e.value}</span>
                <span className={`why-verdict ${e.verdict}`}>{VERDICT_TEXT[e.verdict]}</span>
              </summary>
              <p className="why-detail">{e.detail}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
