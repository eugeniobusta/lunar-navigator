// Small shared controls.
import type { ReactNode } from "react";
import type { Metrics } from "../../lib/analysis";
import type { Site } from "../../lib/data";
import { fmtHours } from "../../state/derived";

const GROUPS: [Site["group"], string][] = [["artemis", "Artemis candidate regions"], ["mission", "Missions"],
  ["historic", "Contrast sites (terrain not modelled)"]];

export function SiteSelect({ sites, value, onChange, label }:
  { sites: Site[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {GROUPS.map(([g, name]) => {
          const list = sites.filter((s) => s.group === g);
          return list.length ? (
            <optgroup key={g} label={name}>
              {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ) : null;
        })}
      </select>
    </label>
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1, unit }:
  { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return (
    <label className="field">
      <span>{label}{unit ? ` (${unit})` : ""}</span>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
    </label>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: "sun" | "earth" | "bad" | "good" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function MetricGrid({ m }: { m: Metrics }) {
  return (
    <div className="stats">
      <Stat tone="sun" value={`${m.sunPct.toFixed(0)}%`} label="of hours in sunlight" />
      <Stat tone="earth" value={`${m.earthPct.toFixed(0)}%`} label="of hours with Earth in view" />
      <Stat value={`${m.bothPct.toFixed(0)}%`} label="with both: power and a link home" />
      <Stat tone={m.longestDarkH > 100 ? "bad" : undefined} value={fmtHours(m.longestDarkH)} label="longest darkness" />
      <Stat value={fmtHours(m.longestNoEarthH)} label="longest without Earth" />
      <Stat value={`${m.maxSunEl.toFixed(1)}°`} label="highest Sun" />
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}
