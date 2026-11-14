// One site, one window: the sky, the two strips, the numbers, and what happens next.
import { Timeline } from "../charts/Timeline";
import { MetricGrid, Stat } from "../components/ui";
import { fmtDate, fmtHours, idxToMs, useSiteView } from "../state/derived";
import { useStore } from "../state/store";
import { verdict } from "./verdict";

export function Overview() {
  const siteId = useStore((s) => s.siteId);
  const eph = useStore((s) => s.eph);
  const cursor = useStore((s) => s.cursor);
  const setCursor = useStore((s) => s.setCursor);
  const site = useStore((s) => s.sites.find((x) => x.id === s.siteId));
  const view = useSiteView(siteId);
  if (!view || !eph || !site) return <p className="note">Loading the site…</p>;

  // Countdowns from the cursor, not from the window start.
  const s = view.series, k = Math.min(cursor, s.sunlit.length - 1);
  const next = (a: Uint8Array, v: number) => { for (let i = k + 1; i < a.length; i++) if (a[i] === v) return i - k; return null; };
  const stepH = eph.stepS / 3600;
  const lit = s.sunlit[k] === 1, earth = s.earthVis[k] === 1;
  const sunNext = next(s.sunlit, lit ? 0 : 1), earthNext = next(s.earthVis, earth ? 0 : 1);

  return (
    <section className="panel">
      <p className="verdict">{verdict(view.metrics)}</p>
      <Timeline series={s} startMs={idxToMs(s.startIdx)} stepS={eph.stepS} cursor={k} onCursor={setCursor} />
      <ul className="key">
        <li><span className="swatch sun" />Sunlight: power</li>
        <li><span className="swatch earth" />Earth in view: direct radio link</li>
        <li><span className="swatch eclipse" />Dark, or no link</li>
      </ul>
      <div className="now">
        <h2>{fmtDate(idxToMs(s.startIdx + k))}</h2>
        <div className="stats">
          <Stat tone={lit ? "sun" : "bad"} value={lit ? "Sun up" : "Dark"}
            label={sunNext === null ? `stays ${lit ? "up" : "down"} for the rest of the window` : `${lit ? "sets" : "rises"} in ${fmtHours(sunNext * stepH)}`} />
          <Stat tone={earth ? "earth" : "bad"} value={earth ? "Earth in view" : "No Earth link"}
            label={earthNext === null ? `stays ${earth ? "in view" : "hidden"} for the rest of the window` : `${earth ? "sets" : "rises"} in ${fmtHours(earthNext * stepH)}`} />
          <Stat value={`${s.sunEl[k].toFixed(2)}°`} label={`Sun elevation, ${s.sunMargin[k] >= 0 ? "+" : ""}${s.sunMargin[k].toFixed(2)}° over the terrain`} />
          <Stat value={`${s.earthEl[k].toFixed(2)}°`} label={`Earth elevation, ${s.earthMargin[k] >= 0 ? "+" : ""}${s.earthMargin[k].toFixed(2)}° over the terrain`} />
        </div>
      </div>
      <h3>Over the whole window</h3>
      <MetricGrid m={view.metrics} />
      <p className="note">{site.note} Coordinates: {site.lat.toFixed(4)}°, {site.lon.toFixed(4)}° ({site.coords_quality}). Source: {site.source}.</p>
    </section>
  );
}
