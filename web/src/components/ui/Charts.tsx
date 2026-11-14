// Small charts for the pages: a donut (a share of a whole), horizontal bars (a few named values on one scale) and a
// histogram (how many of something fall in each range). Plain SVG, sized by the container. Colours are the
// meaning tokens of tokens.css (a colour follows the thing it stands for); text stays in the text colours.
// Every mark has a tooltip (<title>), and each chart has a text alternative.
import type { ReactNode } from "react";

const TAU = 2 * Math.PI;

/** SVG path of a ring segment from angle a0 to a1 (radians, clockwise from 12 o'clock). */
export function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(3)} ${(cy - r * Math.cos(a)).toFixed(3)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)}A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}

export interface DonutPart { label: string; value: number; colour: string; detail?: string }

/** A ring split into parts, with a headline in the middle. A 2-unit gap separates the parts. */
export function Donut({ parts, centre, sub, label }: { parts: DonutPart[]; centre: ReactNode; sub?: string; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 0.025 : 0;
  let a = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={label}>
        {parts.map((p) => {
          const span = (p.value / total) * TAU, a0 = a + gap / 2, a1 = a + span - gap / 2;
          a += span;
          return span <= gap ? null : (
            <path key={p.label} d={arcPath(60, 60, 40, 56, a0, Math.min(a1, a0 + TAU - 1e-4))} fill={p.colour}>
              <title>{`${p.label}: ${p.detail ?? `${((p.value / total) * 100).toFixed(1)} %`}`}</title>
            </path>
          );
        })}
        <text x="60" y={sub ? 60 : 66} textAnchor="middle" className="donut-centre">{centre}</text>
        {sub && <text x="60" y="76" textAnchor="middle" className="donut-sub">{sub}</text>}
      </svg>
      <ul className="key">
        {parts.map((p) => <li key={p.label}><span className="swatch" style={{ background: p.colour }} />{p.label}{p.detail ? `: ${p.detail}` : ""}</li>)}
      </ul>
    </div>
  );
}

export interface BarRow { key: string; label: string; value: number; colour: string; text?: string; faint?: boolean; note?: string }

/** Horizontal bars on one scale, 0..max. Label on the left, value on the right; faint rows are not counted. */
export function HBars({ rows, max = 100, label }: { rows: BarRow[]; max?: number; label: string }) {
  return (
    <ul className="hbars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className={r.faint ? "faint" : undefined} title={`${r.label}: ${r.text ?? r.value}${r.note ? ` (${r.note})` : ""}`}>
          <span className="hbar-label">{r.label}{r.note && <small>{r.note}</small>}</span>
          <span className="hbar-track" aria-hidden="true">
            <span className="hbar-fill" style={{ width: `${Math.max(0, Math.min(1, r.value / max)) * 100}%`, background: r.colour }} />
          </span>
          <span className="hbar-value">{r.text ?? r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Counts of `values` in bins of `step` from `lo` to `hi`. The last bin includes `hi`. */
export function binCounts(values: number[], lo: number, hi: number, step: number): number[] {
  const n = Math.ceil((hi - lo) / step);
  const out = new Array<number>(n).fill(0);
  for (const v of values) {
    if (!(v >= lo && v <= hi)) continue;
    out[Math.min(n - 1, Math.floor((v - lo) / step))]++;
  }
  return out;
}

/** A histogram of scores 0..100 in bins of `step`; the bin holding `mark` is drawn in full colour. */
export function Histogram({ values, step = 5, mark, colour, label, unit = "zones" }:
  { values: number[]; step?: number; mark?: number; colour: string; label: string; unit?: string }) {
  const counts = binCounts(values, 0, 100, step);
  const top = Math.max(1, ...counts);
  const w = 300, h = 120, pad = { l: 4, r: 4, t: 8, b: 20 };
  const bw = (w - pad.l - pad.r) / counts.length;
  const markBin = mark === undefined ? -1 : Math.min(counts.length - 1, Math.floor(mark / step));
  return (
    <svg className="histogram" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {counts.map((c, i) => {
        const bh = (c / top) * (h - pad.t - pad.b);
        return (
          <g key={i}>
            <rect x={pad.l + i * bw + 1} y={h - pad.b - bh} width={Math.max(1, bw - 2)} height={bh} rx={Math.min(3, bh / 2)}
              fill={colour} fillOpacity={i === markBin ? 1 : 0.45} />
            <rect x={pad.l + i * bw} y={pad.t} width={bw} height={h - pad.t - pad.b} fill="transparent">
              <title>{`Score ${i * step} to ${Math.min(100, (i + 1) * step)}: ${c.toLocaleString("en-GB")} ${unit}`}</title>
            </rect>
          </g>
        );
      })}
      <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} className="axis-line" />
      {[0, 25, 50, 75, 100].map((t) => (
        <text key={t} x={pad.l + (t / 100) * (w - pad.l - pad.r)} y={h - 5} textAnchor={t === 0 ? "start" : t === 100 ? "end" : "middle"} className="tick">{t}</text>
      ))}
    </svg>
  );
}
