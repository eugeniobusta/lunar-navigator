// Window Finder: choose a mission, get every landing day that works over the next months.
// The search runs by itself whenever the mission, the site or the start date changes.
import { scaleSequential } from "d3";
import { useEffect, useMemo, useState } from "react";
import { NumberField } from "../components/ui";
import { Donut, HBars, type BarRow } from "../components/ui/Charts";
import { findWindows, type DayResult, type Horizon, type MissionSpec } from "../lib/analysis";
import { fmtDate, idxToMs } from "../state/derived";
import { useStore } from "../state/store";

const PRESETS: { name: string; line: string; spec: MissionSpec }[] = [
  { name: "Short lander", line: "2 weeks, like IM-2", spec: { durationH: 14 * 24, minSunPct: 70, minEarthPct: 50, maxDarkH: 48, requireLitAndEarthAtLanding: true } },
  { name: "Crewed surface stay", line: "6.5 days, like Artemis III", spec: { durationH: 156, minSunPct: 90, minEarthPct: 80, maxDarkH: 12, requireLitAndEarthAtLanding: true } },
  { name: "Long-lived rover", line: "30 days", spec: { durationH: 30 * 24, minSunPct: 60, minEarthPct: 40, maxDarkH: 96, requireLitAndEarthAtLanding: true } },
];

/** The first good landing found: when, and for how long (the Plan page's battery check uses it). */
export interface FirstLanding { startIdx: number; durationH: number }

/** `place`: search this skyline instead of the selected site's (the Plan page passes the one it computed at the chosen
 *  zone), with a name and a key that changes when the place does. `compact`: no section titles of its own.
 *  `onResult`: hears the first good landing, or null if none. */
export function Windows({ place, compact = false, onResult }:
  { place?: { horizon: Horizon; name: string; key: string }; compact?: boolean; onResult?: (r: FirstLanding | null) => void } = {}) {
  const st = useStore();
  const siteId = st.siteId;
  const hzValue = place?.horizon ?? st.horizons[siteId]?.value;
  const ensureHorizon = st.ensureHorizon;
  useEffect(() => { void ensureHorizon(siteId); }, [siteId, ensureHorizon]);
  const [spec, setSpec] = useState<MissionSpec>(PRESETS[0].spec);
  const [months, setMonths] = useState(12);
  const [ran, setRan] = useState<{ key: string; days: DayResult[] } | null>(null);
  const placeName = place?.name ?? st.sites.find((s) => s.id === siteId)?.name;
  const key = JSON.stringify([place?.key ?? siteId, spec, months, st.startIdx]);

  const run = () => {
    if (!st.eph || !hzValue) return;
    const to = st.startIdx + Math.round((months * 30.44 * 86400) / st.eph.stepS);
    setRan({ key, days: findWindows(st.eph, hzValue, spec, st.startIdx, to) });
  };
  // Search again shortly after anything changes (typing a number changes it once per key press).
  useEffect(() => {
    if (!hzValue || ran?.key === key) return;
    const id = setTimeout(run, ran ? 250 : 0);
    return () => clearTimeout(id);
  }, [key, hzValue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onResult || !ran || ran.key !== key) return;
    const first = ran.days.find((d) => d.feasible && d.bestStartIdx !== null);
    onResult(first ? { startIdx: first.bestStartIdx!, durationH: spec.durationH } : null);
  }, [ran, key, onResult, spec.durationH]);

  const byMonth = useMemo(() => {
    if (!ran) return [];
    const m = new Map<string, DayResult[]>();
    for (const d of ran.days) {
      const ms = idxToMs(d.dayIdx * Math.round(86400 / (st.eph?.stepS ?? 3600)));
      const k = new Date(ms).toISOString().slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return [...m.entries()];
  }, [ran, st.eph]);

  const color = scaleSequential([0, 1], (t) => `color-mix(in oklab, var(--rim), var(--lichen) ${Math.round(60 + t * 40)}%)`).clamp(true);
  const feasible = ran ? ran.days.filter((d) => d.feasible).length : 0;
  // Runs of consecutive days that work, as text: the calendar is wide, and this reads at a glance.
  const clusters = useMemo(() => {
    const out: [number, number][] = [];
    for (const d of ran?.days ?? []) {
      if (!d.feasible) continue;
      const last = out[out.length - 1];
      if (last && d.dayIdx === last[1] + 1) last[1] = d.dayIdx; else out.push([d.dayIdx, d.dayIdx]);
    }
    return out;
  }, [ran]);
  const dayLabel = (dayIdx: number) => new Date(idxToMs(dayIdx * 24)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const monthLabel = (month: string) => new Date(month + "-01T00:00:00Z").toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const set = (k: keyof MissionSpec) => (v: number) => setSpec({ ...spec, [k]: v });
  const longest = clusters.reduce((m, [a, b]) => Math.max(m, b - a + 1), 0);
  const monthBars: BarRow[] = byMonth.map(([month, days]) => {
    const ok = days.filter((d) => d.feasible).length;
    return { key: month, label: monthLabel(month), value: ok, text: `${ok}`, colour: "var(--lichen)", faint: ok === 0 };
  });
  const bestMonth = monthBars.reduce<BarRow | null>((b, r) => (!b || r.value > b.value ? r : b), null);
  const chosen = PRESETS.find((p) => JSON.stringify(p.spec) === JSON.stringify(spec));

  return (
    <section className="panel">
      {!compact && <h2 className="section-title first">1. Choose the mission</h2>}
      <div className="mission-cards" role="group" aria-label="Missions">
        {PRESETS.map((p) => {
          const on = chosen === p;
          return (
            <button key={p.name} className={on ? "mission-card on" : "mission-card"} aria-pressed={on} onClick={() => setSpec(p.spec)}>
              <b>{p.name}</b>
              <span>{p.line}</span>
              <small>Sun {p.spec.minSunPct}%+ · Earth {p.spec.minEarthPct}%+ · nights under {p.spec.maxDarkH} h</small>
            </button>
          );
        })}
      </div>
      <details className="fold small">
        <summary>Adjust the needs</summary>
        <div className="controls">
          <NumberField label="Mission length" unit="days" value={spec.durationH / 24} min={1} max={60} step={0.5} onChange={(v) => set("durationH")(v * 24)} />
          <NumberField label="Minimum sunlight" unit="%" value={spec.minSunPct} min={0} max={100} onChange={set("minSunPct")} />
          <NumberField label="Minimum Earth in view" unit="%" value={spec.minEarthPct} min={0} max={100} onChange={set("minEarthPct")} />
          <NumberField label="Longest darkness allowed" unit="h" value={spec.maxDarkH} min={0} max={720} onChange={set("maxDarkH")} />
          <NumberField label="Search ahead" unit="months" value={months} min={1} max={36} onChange={setMonths} />
          <label className="field check">
            <input type="checkbox" checked={spec.requireLitAndEarthAtLanding}
              onChange={(e) => setSpec({ ...spec, requireLitAndEarthAtLanding: e.target.checked })} />
            <span>Sun and Earth up at touchdown</span>
          </label>
        </div>
      </details>
      <div className="run-row">
        <button className="primary big" onClick={run} disabled={!hzValue}>Find landing days</button>
        <p className="note">Every UTC day is checked hour by hour for a landing time whose whole mission meets these needs at {placeName}.</p>
      </div>

      {ran && (
        <>
          {!compact && <h2 className="section-title">2. When you can land</h2>}
          <div className="window-head">
            <Donut label={`${feasible} of ${ran.days.length} days work`} centre={`${feasible}`} sub={`of ${ran.days.length} days`}
              parts={[
                { label: "Days with a landing time that works", value: feasible, colour: "var(--lichen)" },
                { label: "Days without", value: ran.days.length - feasible, colour: "color-mix(in oklab, var(--regolith) 45%, var(--dust))" },
              ]} />
            <div className="window-copy">
              <h3 className="headline">{feasible} of {ran.days.length} days have a landing time that works</h3>
              <div className="tiles three">
                <div><b>{clusters.length ? dayLabel(clusters[0][0]) : "none"}</b><span>Next chance to land</span></div>
                <div><b>{longest ? `${longest} day${longest === 1 ? "" : "s"}` : "–"}</b><span>Longest run of good days</span></div>
                <div><b>{bestMonth && bestMonth.value ? bestMonth.label : "–"}</b><span>Best month</span></div>
              </div>
              {clusters.length > 0 && (
                <p className="note">
                  First chances: {clusters.slice(0, 3).map(([a, b]) => (a === b ? dayLabel(a) : `${dayLabel(a)} to ${dayLabel(b)}`)).join("; ")}
                  {clusters.length > 3 ? `; then ${clusters.length - 3} more.` : "."}
                </p>
              )}
            </div>
          </div>

          <div className="window-body">
            <div className="card">
              <h3>Good days per month</h3>
              <HBars rows={monthBars} max={Math.max(4, ...monthBars.map((r) => r.value))} label="Days per month with a landing time that works" />
            </div>
            <div className="card cal-card">
              <h3>Calendar: choose a day</h3>
              <p className="note cal-hint">Scroll the calendar sideways to see the whole month.</p>
              <div className="cal" role="grid">
                {byMonth.map(([month, days]) => (
                  <div key={month} className="cal-row" role="row">
                    <span className="cal-month">{monthLabel(month)}</span>
                    {days.map((d) => (
                      <button key={d.dayIdx} role="gridcell" className={d.feasible ? "cal-day ok" : "cal-day"}
                        style={d.feasible ? { background: color(d.score) } : undefined}
                        title={d.feasible && d.bestStartIdx !== null
                          ? `Land ${fmtDate(idxToMs(d.bestStartIdx))}: ${d.metrics?.sunPct.toFixed(0)}% sun, ${d.metrics?.earthPct.toFixed(0)}% Earth`
                          : "No landing time meets the needs"}
                        disabled={!d.feasible}
                        onClick={() => { if (d.bestStartIdx !== null && !place) { st.setStartIdx(d.bestStartIdx); st.setWindowDays(Math.max(1, Math.round(spec.durationH / 24))); st.setTab("explore"); } }}>
                        {new Date(idxToMs(d.dayIdx * 24)).getUTCDate()}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <p className="note">Green days work; stronger green means more margin above the mission's needs. {place ? "Point at a green day for its best landing time." : "Click a green day to explore that landing."}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
