// Window Finder: describe the mission, get every landing day that works over the next months.
import { scaleSequential } from "d3";
import { useMemo, useState } from "react";
import { NumberField } from "../components/ui";
import { findWindows, type DayResult, type MissionSpec } from "../lib/analysis";
import { fmtDate, idxToMs } from "../state/derived";
import { useStore } from "../state/store";

const PRESETS: [string, MissionSpec][] = [
  ["Short lander (2 weeks, like IM-2)", { durationH: 14 * 24, minSunPct: 70, minEarthPct: 50, maxDarkH: 48, requireLitAndEarthAtLanding: true }],
  ["Crewed surface stay (6.5 days)", { durationH: 156, minSunPct: 90, minEarthPct: 80, maxDarkH: 12, requireLitAndEarthAtLanding: true }],
  ["Long-lived rover (30 days)", { durationH: 30 * 24, minSunPct: 60, minEarthPct: 40, maxDarkH: 96, requireLitAndEarthAtLanding: true }],
];

export function Windows() {
  const st = useStore();
  const hz = st.horizons[st.siteId];
  const [spec, setSpec] = useState<MissionSpec>(PRESETS[0][1]);
  const [months, setMonths] = useState(12);
  const [ran, setRan] = useState<{ key: string; days: DayResult[] } | null>(null);
  const site = st.sites.find((s) => s.id === st.siteId);
  const key = JSON.stringify([st.siteId, spec, months, st.startIdx]);

  const run = () => {
    if (!st.eph || !hz) return;
    const to = st.startIdx + Math.round((months * 30.44 * 86400) / st.eph.stepS);
    setRan({ key, days: findWindows(st.eph, hz.value, spec, st.startIdx, to) });
  };

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
  const set = (k: keyof MissionSpec) => (v: number) => setSpec({ ...spec, [k]: v });

  return (
    <section className="panel">
      <p className="lede">Describe the mission. Every UTC day is checked hour by hour for a landing time whose whole mission meets these needs at {site?.name}.</p>
      <div className="presets">
        {PRESETS.map(([name, p]) => (
          <button key={name} className={JSON.stringify(p) === JSON.stringify(spec) ? "chip on" : "chip"} onClick={() => setSpec(p)}>{name}</button>
        ))}
      </div>
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
        <button className="primary" onClick={run} disabled={!hz}>Find landing days</button>
      </div>
      {ran && ran.key !== key && <p className="note">Settings changed. Run the search again to update the calendar.</p>}
      {ran && (
        <>
          <h3>{feasible} of {ran.days.length} days have a landing time that works</h3>
          {clusters.length > 0 && (
            <p className="lede">
              First chances to land: {clusters.slice(0, 3).map(([a, b]) => (a === b ? dayLabel(a) : `${dayLabel(a)} to ${dayLabel(b)}`)).join("; ")}
              {clusters.length > 3 ? `; then ${clusters.length - 3} more.` : "."}
            </p>
          )}
          <p className="note cal-hint">Scroll the calendar sideways to see the whole month.</p>
          <div className="cal" role="grid">
            {byMonth.map(([month, days]) => (
              <div key={month} className="cal-row" role="row">
                <span className="cal-month">{new Date(month + "-01T00:00:00Z").toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}</span>
                {days.map((d) => (
                  <button key={d.dayIdx} role="gridcell" className={d.feasible ? "cal-day ok" : "cal-day"}
                    style={d.feasible ? { background: color(d.score) } : undefined}
                    title={d.feasible && d.bestStartIdx !== null
                      ? `Land ${fmtDate(idxToMs(d.bestStartIdx))}: ${d.metrics?.sunPct.toFixed(0)}% sun, ${d.metrics?.earthPct.toFixed(0)}% Earth`
                      : "No landing time meets the needs"}
                    disabled={!d.feasible}
                    onClick={() => { if (d.bestStartIdx !== null) { st.setStartIdx(d.bestStartIdx); st.setWindowDays(Math.max(1, Math.round(spec.durationH / 24))); st.setTab("overview"); } }}>
                    {new Date(idxToMs(d.dayIdx * 24)).getUTCDate()}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="note">Green days work. Stronger green means more safety margin above the mission's needs. Choose a day to open that mission in Overview.</p>
        </>
      )}
    </section>
  );
}
