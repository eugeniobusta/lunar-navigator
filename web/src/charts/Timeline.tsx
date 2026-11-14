// Two strips over the window: hours with sunlight and hours with Earth in view. Click or drag to move the cursor.
import { scaleLinear } from "d3";
import { useWidth } from "./useWidth";
import type { Series } from "../lib/analysis";

const ROW = 18, GAP = 6, LABEL = 70;

/** Runs of 1s as [start, end) pairs, so a 30-day window draws a handful of rects, not 720. */
function runs(a: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= a.length; i++) {
    const on = i < a.length && a[i] === 1;
    if (on && s < 0) s = i;
    if (!on && s >= 0) { out.push([s, i]); s = -1; }
  }
  return out;
}

interface Props {
  series: Series; startMs: number; stepS: number; cursor?: number;
  onCursor?: (i: number) => void; label?: string;
}

export function Timeline({ series, startMs, stepS, cursor, onCursor, label }: Props) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const n = series.sunlit.length;
  const x = scaleLinear().domain([0, Math.max(1, n)]).range([LABEL, W]);
  const H = 2 * ROW + GAP + 20;
  const days = Math.round((n * stepS) / 86400);
  const room = Math.max(1, Math.floor((W - LABEL) / 64)); // one date label needs about 64 px
  const tickEvery = [1, 2, 7, 14, 30, 60, 90].find((d) => days / d <= room) ?? 180;
  const ticks: number[] = [];
  for (let d = 0; d <= days; d += tickEvery) ticks.push(Math.round((d * 86400) / stepS));

  const pick = (clientX: number, svg: SVGSVGElement) => {
    if (!onCursor) return;
    const r = svg.getBoundingClientRect();
    const vx = clientX - r.left;
    onCursor(Math.max(0, Math.min(n - 1, Math.floor(x.invert(vx)))));
  };

  return (
    <div ref={ref}>
    <svg className="timeline" width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); pick(e.clientX, e.currentTarget); }}
      onPointerMove={(e) => { if (e.buttons) pick(e.clientX, e.currentTarget); }}
      aria-label={label ?? "Sunlight and Earth visibility over the window"}>
      <text x={0} y={ROW / 2} dy="0.32em" className="row-label">Sunlight</text>
      <text x={0} y={ROW + GAP + ROW / 2} dy="0.32em" className="row-label">Earth</text>
      <rect x={LABEL} y={0} width={W - LABEL} height={ROW} className="strip-bg" />
      <rect x={LABEL} y={ROW + GAP} width={W - LABEL} height={ROW} className="strip-bg" />
      {runs(series.sunlit).map(([a, b]) => (
        <rect key={`s${a}`} x={x(a)} y={0} width={Math.max(1, x(b) - x(a))} height={ROW} className="strip sun" />
      ))}
      {runs(series.earthVis).map(([a, b]) => (
        <rect key={`e${a}`} x={x(a)} y={ROW + GAP} width={Math.max(1, x(b) - x(a))} height={ROW} className="strip earth" />
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - 4} className="tick" textAnchor={t === 0 ? "start" : x(t) > W - 24 ? "end" : "middle"}>
          {new Date(startMs + t * stepS * 1000).toISOString().slice(5, 10)}
        </text>
      ))}
      {cursor !== undefined && (
        <line x1={x(cursor + 0.5)} x2={x(cursor + 0.5)} y1={-2} y2={2 * ROW + GAP + 2} className="cursor" />
      )}
    </svg>
    </div>
  );
}
