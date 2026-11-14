// The horizon as seen from the lander: terrain silhouette, the Sun's and Earth's paths over the window,
// and their positions at the cursor. x = azimuth centred on north (S, W, N, E, S), because from the south pole
// Earth always sits roughly north. y = elevation in degrees.
import { area, line, scaleLinear } from "d3";
import { useMemo } from "react";
import { horizonAt, type Horizon, type Series } from "../lib/analysis";

const W = 1000, H = 300, M = { l: 44, r: 12, t: 14, b: 30 };
/** Plot coordinate u in [0, 360): u = 180 is north. */
const toU = (az: number) => (az + 180) % 360;

interface Props { series: Series; horizon: Horizon; cursor: number; sunR: number }

export function SkyPanorama({ series, horizon, cursor, sunR }: Props) {
  const n = series.sunEl.length;
  const k = Math.min(Math.max(0, cursor), n - 1);

  const { x, y, terrainPath, ticksY } = useMemo(() => {
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
    return { x, y, terrainPath, ticksY: y.ticks(5) };
  }, [horizon, series, n]);

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
  if (n === 0) return null;

  // The Sun is 0.53 deg across: draw it to scale, but never smaller than a few pixels.
  const pxPerDeg = Math.abs(y(1) - y(0));
  const sunPx = Math.max(5, sunR * pxPerDeg);
  const earthPx = Math.max(7, 0.95 * pxPerDeg);
  const lit = series.sunlit[k] === 1, earthUp = series.earthVis[k] === 1;
  const sx = x(toU(series.sunAz[k])), sy = y(series.sunEl[k]);
  const ex = x(toU(series.earthAz[k])), ey = y(series.earthEl[k]);

  return (
    <svg className="sky" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Sky from the site. Sun ${lit ? "above" : "below"} the horizon, Earth ${earthUp ? "visible" : "hidden"}.`}>
      <defs>
        <clipPath id="plot"><rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} /></clipPath>
        <radialGradient id="sunGlow">
          <stop offset="0%" stopColor="var(--sun)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--sun)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {ticksY.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? "grid zero" : "grid"} />
          <text x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tick">{t}°</text>
        </g>
      ))}
      {[0, 90, 180, 270, 360].map((a, i) => (
        <text key={a} x={x(a)} y={H - 10} textAnchor="middle" className="tick">{["S", "W", "N", "E", "S"][i]}</text>
      ))}
      <g clipPath="url(#plot)">
        <path d={sunPath} className="path sun" />
        <path d={earthPath} className="path earth" />
        {lit && <circle cx={sx} cy={sy} r={sunPx * 4} fill="url(#sunGlow)" />}
        <circle cx={ex} cy={ey} r={earthPx} className={earthUp ? "earth-disc" : "earth-disc hidden"} />
        <circle cx={sx} cy={sy} r={sunPx} className={lit ? "sun-disc" : "sun-disc hidden"} />
        <path d={terrainPath} className="terrain" />
      </g>
      <text x={W - M.r - 4} y={M.t + 14} textAnchor="end" className="caption">
        {horizon.flat ? "Terrain not modelled here (flat horizon)" : "Terrain from LOLA 120 m elevation data"}
      </text>
    </svg>
  );
}
