// The horizon as seen from the lander: terrain silhouette, the Sun's and Earth's paths over the window,
// and their positions at the cursor. x = azimuth centred on north (S, W, N, E, S), because from the south pole
// Earth always sits roughly north. y = elevation in degrees. Everything is labelled on the chart itself.
import { area, line, scaleLinear } from "d3";
import { useMemo } from "react";
import { horizonAt, type Horizon, type Series } from "../lib/analysis";
import { useWidth } from "./useWidth";

const M = { l: 40, r: 12, t: 16, b: 28 };
const CHAR = 6.5, LINE_H = 16; // rough size of a 13 px label, for placing labels without overlaps
/** Plot coordinate u in [0, 360): u = 180 is north. */
const toU = (az: number) => (az + 180) % 360;

interface Props { series: Series; horizon: Horizon; cursor: number; sunR: number }
interface Box { x0: number; y0: number; x1: number; y1: number }
interface Placed { text: string; x: number; y: number; anchor: "start" | "middle" | "end"; cls: string; box: Box; pill: boolean }
type Candidate = [x: number, y: number, anchor: Placed["anchor"]];

const boxOf = (text: string, [x, y, anchor]: Candidate): Box => {
  const w = text.length * CHAR;
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return { x0, y0: y - LINE_H + 3, x1: x0 + w, y1: y + 4 };
};
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function SkyPanorama({ series, horizon, cursor, sunR }: Props) {
  const [wrap, W] = useWidth<HTMLDivElement>();
  const H = W < 600 ? 280 : 340;
  const n = series.sunEl.length;
  const k = Math.min(Math.max(0, cursor), n - 1);

  const { x, y, terrainPath, crestPath, ticksY } = useMemo(() => {
    let lo = -2, hi = 6;
    for (let i = 0; i < horizon.elevDeg.length; i++) hi = Math.max(hi, horizon.elevDeg[i] + 1);
    for (let i = 0; i < n; i++) {
      hi = Math.max(hi, series.sunEl[i] + 1, series.earthEl[i] + 1.5);
      lo = Math.min(lo, Math.max(-6, Math.min(series.sunEl[i], series.earthEl[i]) - 1));
    }
    hi = Math.min(hi, 90);
    const x = scaleLinear().domain([0, 360]).range([M.l, W - M.r]);
    const y = scaleLinear().domain([lo, hi]).range([H - M.b, M.t]).nice();
    const pts: [number, number][] = [];
    for (let u = 0; u <= 360; u += 0.5) pts.push([u, horizonAt(horizon, (u + 180) % 360)]);
    const terrainPath = area<[number, number]>()
      .x((d) => x(d[0])).y0(H - M.b).y1((d) => y(d[1]))(pts) ?? "";
    const crestPath = line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1]))(pts) ?? "";
    return { x, y, terrainPath, crestPath, ticksY: y.ticks(5) };
  }, [horizon, series, n, W, H]);

  // Paths split where they wrap around 0/360 so lines never streak across the chart.
  const pathOf = (az: Float64Array, el: Float64Array) => {
    const segs: [number, number][][] = [[]];
    for (let i = 0; i < n; i++) {
      const cur = segs[segs.length - 1];
      const u = toU(az[i]);
      if (cur.length && Math.abs(u - cur[cur.length - 1][0]) > 180) segs.push([]);
      segs[segs.length - 1].push([u, el[i]]);
    }
    const gen = line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1]));
    return segs.map((s) => gen(s) ?? "").join("");
  };

  const sunPath = useMemo(() => pathOf(series.sunAz, series.sunEl), [series, x, y]); // eslint-disable-line react-hooks/exhaustive-deps
  const earthPath = useMemo(() => pathOf(series.earthAz, series.earthEl), [series, x, y]); // eslint-disable-line react-hooks/exhaustive-deps
  if (n === 0) return <div ref={wrap} className="sky-wrap" />;

  // The Sun is 0.53 deg across: draw it to scale, but never smaller than a few pixels.
  const pxPerDeg = Math.abs(y(1) - y(0));
  const sunPx = Math.max(5, sunR * pxPerDeg);
  const earthPx = Math.max(7, 0.95 * pxPerDeg);
  const lit = series.sunlit[k] === 1, earthUp = series.earthVis[k] === 1;
  const top = M.t, bottom = H - M.b, left = M.l, right = W - M.r;
  const clampY = (v: number) => Math.max(top + 6, Math.min(bottom - 6, v));
  const sx = x(toU(series.sunAz[k])), sy = y(series.sunEl[k]);
  const ex = x(toU(series.earthAz[k])), ey = y(series.earthEl[k]);
  const sunInPlot = sy <= bottom && sy >= top, earthInPlot = ey <= bottom && ey >= top;
  const hiddenWord = horizon.flat ? "below the horizon" : "behind the ridge";

  // Terrain label: inside the ground, where the ground is tallest across the label's width.
  const groundText = horizon.flat ? "Flat horizon: terrain not modelled here" : "Real skyline from NASA terrain";
  const gw = groundText.length * 7.2;
  let gBest = -1, gRoom = 0;
  for (let px = left + 8; px + gw < right - 8; px += 8) {
    let room = Infinity;
    for (let q = px; q <= px + gw; q += 8) room = Math.min(room, bottom - y(horizonAt(horizon, (x.invert(q) + 180) % 360)));
    if (room > gRoom) { gRoom = room; gBest = px; }
  }
  const groundInside = gRoom >= 22;

  // Labels: try each candidate position in turn and keep the first that stays inside the plot and clear of
  // the discs and of the labels already placed.
  const taken: Box[] = [
    { x0: sx - sunPx - 2, y0: clampY(sy) - sunPx - 2, x1: sx + sunPx + 2, y1: clampY(sy) + sunPx + 2 },
    { x0: ex - earthPx - 2, y0: clampY(ey) - earthPx - 2, x1: ex + earthPx + 2, y1: clampY(ey) + earthPx + 2 },
  ];
  if (groundInside) taken.push({ x0: gBest - 4, y0: bottom - 26, x1: gBest + gw + 4, y1: bottom });
  const crestY = (px: number) => y(horizonAt(horizon, (x.invert(px) + 180) % 360));
  /** True if any part of the box lies over the terrain: sky labels must stay in the sky. */
  const overGround = (b: Box) => {
    for (let px = b.x0; px <= b.x1 + 4; px += 4) if (crestY(Math.min(px, b.x1)) < b.y1 + 2) return true;
    return false;
  };
  const placed: Placed[] = [];
  const place = (text: string, cls: string, candidates: Candidate[], pill = false) => {
    for (const c of candidates) {
      const b = boxOf(text, c);
      if (b.x0 < left + 2 || b.x1 > right - 2 || b.y0 < top || b.y1 > bottom) continue;
      if (taken.some((t) => overlaps(t, b))) continue;
      if (!pill && overGround(b)) continue;
      taken.push(b);
      placed.push({ text, x: c[0], y: c[1], anchor: c[2], cls, box: b, pill });
      return;
    }
  };
  const around = (cx: number, cy: number, r: number): Candidate[] => [
    [cx + r + 8, cy + 4, "start"], [cx - r - 8, cy + 4, "end"], [cx, cy - r - 8, "middle"], [cx, cy + r + 16, "middle"],
    [cx + r + 8, cy - r - 6, "start"], [cx - r - 8, cy - r - 6, "end"],
    [cx, cy - r - 28, "middle"], [cx, cy + r + 36, "middle"], [cx + r + 8, cy - r - 26, "end"], [cx - r - 8, cy - r - 26, "start"],
  ];
  place(lit ? "Sun now" : `Sun now, ${hiddenWord}`, "lbl sun now", around(sx, clampY(sy), sunPx), !lit);
  place(earthUp ? "Earth now" : `Earth now, ${hiddenWord}`, "lbl earth now", around(ex, clampY(ey), earthPx), !earthUp);

  // Earth's wobble: label beside the small loop Earth traces. Sun's path: label above its highest point.
  let eTop = 0, eLo = Infinity, eHi = -Infinity, sTop = 0;
  for (let i = 0; i < n; i++) {
    if (series.earthEl[i] > series.earthEl[eTop]) eTop = i;
    if (series.sunEl[i] > series.sunEl[sTop]) sTop = i;
    const u = x(toU(series.earthAz[i]));
    eLo = Math.min(eLo, u); eHi = Math.max(eHi, u);
  }
  const eTopY = clampY(y(series.earthEl[eTop])), eMidX = (eLo + eHi) / 2;
  let eBot = eTopY;
  for (let i = 0; i < n; i++) eBot = Math.max(eBot, clampY(y(series.earthEl[i])));
  place("Earth's wobble", "lbl earth", [
    [eHi + 8, eTopY + 14, "start"], [eLo - 8, eTopY + 14, "end"], [eMidX, eTopY - 8, "middle"],
    [eHi + 8, eTopY + 34, "start"], [eLo - 8, eTopY + 34, "end"],
  ]);
  taken.push({ x0: eLo - 4, y0: eTopY - 4, x1: eHi + 4, y1: eBot + 4 }); // keep the Sun's label off Earth's loop
  const sunAt = (i: number): Candidate[] => {
    const px = x(toU(series.sunAz[i])), py = clampY(y(series.sunEl[i]));
    return [[px, py - 8, "middle"], [px, py + 18, "middle"], [px + 10, py - 8, "start"], [px - 10, py - 8, "end"]];
  };
  place("Sun's path over your mission", "lbl sun",
    [...sunAt(sTop), ...sunAt(Math.floor(n / 4)), ...sunAt(Math.floor((3 * n) / 4)), ...sunAt(0), ...sunAt(n - 1)]);

  if (!groundInside) {
    place(groundText, "lbl ground-sky", [[right - 6, top + 14, "end"], [left + 6, top + 14, "start"],
      [right - 6, top + 32, "end"], [left + 6, top + 32, "start"]]);
  }

  return (
    <div ref={wrap} className="sky-wrap">
      <svg className="sky" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`The horizon around the site, unrolled from south through west, north and east back to south. Sun ${lit ? "above the skyline" : hiddenWord}, Earth ${earthUp ? "above the skyline" : hiddenWord}.`}>
        <defs>
          <clipPath id="plot"><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath>
          <radialGradient id="sunGlow">
            <stop offset="0%" stopColor="var(--sunlight)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--sunlight)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} className="sky-bg" />
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={left} x2={right} y1={y(t)} y2={y(t)} className={t === 0 ? "grid zero" : "grid"} />
            <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">{t}°</text>
          </g>
        ))}
        <g clipPath="url(#plot)">
          <path d={sunPath} className="path sun" />
          <path d={earthPath} className="path earth" />
          {lit && <circle cx={sx} cy={sy} r={sunPx * 4} fill="url(#sunGlow)" />}
          <circle cx={ex} cy={ey} r={earthPx} className="earth-disc" />
          <circle cx={sx} cy={sy} r={sunPx} className="sun-disc" />
          <path d={terrainPath} className="terrain" />
          <path d={crestPath} className="crest" />
          {!lit && sunInPlot && <circle cx={sx} cy={sy} r={sunPx} className="ghost sun" />}
          {!earthUp && earthInPlot && <circle cx={ex} cy={ey} r={earthPx} className="ghost earth" />}
          {groundInside && <text x={gBest} y={bottom - 9} className="lbl ground">{groundText}</text>}
        </g>
        <rect x={0} y={bottom} width={W} height={M.b} className="axis-bg" />
        {[0, 90, 180, 270, 360].map((a, i) => (
          <text key={a} x={x(a)} y={H - 9} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className="tick">
            {["South", "West", "North", "East", "South"][i]}
          </text>
        ))}
        {placed.map((p) => (
          <g key={p.text}>
            {p.pill && <rect x={p.box.x0 - 6} y={p.box.y0 - 2} width={p.box.x1 - p.box.x0 + 12} height={p.box.y1 - p.box.y0 + 4} rx={3} className="pill" />}
            <text x={p.x} y={p.y} textAnchor={p.anchor} className={p.pill ? `${p.cls} on-pill` : p.cls}>{p.text}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
