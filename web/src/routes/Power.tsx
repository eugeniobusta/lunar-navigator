// Battery survival: does this lander make it through the dark hours of this window?
import { scaleLinear, line, area } from "d3";
import { useMemo, useState } from "react";
import { NumberField, Stat } from "../components/ui";
import { simulatePower, type PanelMode, type PowerConfig } from "../lib/power";
import { fmtHours, useSiteView } from "../state/derived";
import { useStore } from "../state/store";

const MODES: [PanelMode, string][] = [["vertical_tracking", "Vertical, turns to face the Sun"],
  ["vertical_fixed", "Vertical, fixed direction"], ["horizontal", "Flat on the deck"]];

export function Power() {
  const siteId = useStore((s) => s.siteId);
  const eph = useStore((s) => s.eph);
  const view = useSiteView(siteId);
  const [cfg, setCfg] = useState<PowerConfig>({ mode: "vertical_tracking", panelAzDeg: 0, areaM2: 3,
    efficiency: 0.28, batteryWh: 4000, loadW: 200, initialSocPct: 100 });
  const res = useMemo(() => (view && eph ? simulatePower(view.series, cfg, eph.stepS) : null), [view, eph, cfg]);
  if (!view || !eph || !res) return <p className="note">Loading the site…</p>;
  const set = (k: keyof PowerConfig) => (v: number) => setCfg({ ...cfg, [k]: v });

  const W = 1000, H = 220, M = { l: 44, r: 12, t: 10, b: 24 };
  const n = res.socWh.length;
  const x = scaleLinear().domain([0, n]).range([M.l, W - M.r]);
  const y = scaleLinear().domain([0, 100]).range([H - M.b, M.t]);
  const maxGen = Math.max(1, ...res.genW);
  const yg = scaleLinear().domain([0, maxGen]).range([H - M.b, M.t]);
  const idx = Array.from({ length: n }, (_, i) => i);
  const socPath = line<number>().x((i) => x(i)).y((i) => y((100 * res.socWh[i]) / cfg.batteryWh))(idx) ?? "";
  const genPath = area<number>().x((i) => x(i)).y0(H - M.b).y1((i) => yg(res.genW[i]))(idx) ?? "";
  const loadY = yg(cfg.loadW);

  return (
    <section className="panel">
      <div className="controls">
        <label className="field">
          <span>Solar panels</span>
          <select value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value as PanelMode })}>
            {MODES.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
          </select>
        </label>
        {cfg.mode === "vertical_fixed" && <NumberField label="Panel faces" unit="° from north" value={cfg.panelAzDeg} min={0} max={359} onChange={set("panelAzDeg")} />}
        <NumberField label="Panel area" unit="m²" value={cfg.areaM2} min={0.1} step={0.1} onChange={set("areaM2")} />
        <NumberField label="Cell efficiency" unit="%" value={Math.round(cfg.efficiency * 100)} min={1} max={45} onChange={(v) => setCfg({ ...cfg, efficiency: v / 100 })} />
        <NumberField label="Battery" unit="Wh" value={cfg.batteryWh} min={10} step={100} onChange={set("batteryWh")} />
        <NumberField label="Average load" unit="W" value={cfg.loadW} min={1} step={10} onChange={set("loadW")} />
      </div>
      <div className="stats">
        <Stat tone={res.survived ? "good" : "bad"} value={res.survived ? "Survives" : "Runs out"}
          label={res.survived ? "the whole window" : `${fmtHours(res.hoursBelowZero)} without power`} />
        <Stat value={`${res.minSocPct.toFixed(0)}%`} label="lowest battery charge" />
        <Stat value={`${Math.ceil(res.batteryNeededWh).toLocaleString()} Wh`} label="battery needed to never run out" />
        <Stat tone="sun" value={`${(res.energyGenWh / 1000).toFixed(0)} kWh`} label="generated over the window" />
      </div>
      <svg className="soc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Battery charge and solar generation over the window">
        <path d={genPath} className="gen" />
        <line x1={M.l} x2={W - M.r} y1={loadY} y2={loadY} className="load" />
        <path d={socPath} className="socline" />
        {[0, 50, 100].map((t) => (
          <text key={t} x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">{t}%</text>
        ))}
        <text x={W - M.r} y={loadY - 6} textAnchor="end" className="tick">load {cfg.loadW} W</text>
      </svg>
      <p className="note">Amber area: solar power. Line: battery charge. Panels flat on the deck catch almost nothing at the pole, because the Sun never climbs more than a few degrees.</p>
    </section>
  );
}
