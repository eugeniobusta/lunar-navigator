// "Why here?": one plain sentence per criterion for a point (web/src/lib/analysis/explain.ts).
import { summarise, type Explanation } from "../../lib/analysis/explain";

export function WhyHere({ title, list }: { title: string; list: Explanation[] }) {
  if (!list.length) return null;
  return (
    <div className="why">
      <h3>{title}</h3>
      <p className="lede">{summarise(list)}</p>
      <ul>
        {list.map((e) => (
          <li key={e.key}>
            <strong>{e.label} {e.value}:</strong> <span className={`why-verdict ${e.verdict}`}>{e.verdict}</span>. {e.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
