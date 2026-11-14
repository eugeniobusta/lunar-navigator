// Site Map (demo): every landing factor as a coloured layer over the south pole, plus the combined score.
// Factor layers: one colour each, opacity = that factor's score. Combined: red (worst) -> green (best), and any
// chosen factor at 0 makes it 0. Colour-blind mode swaps to Okabe-Ito hues and a blue -> yellow ramp.
// Number mode shows raw values and lets enthusiasts edit every threshold. Click a point for its numbers and a
// button that opens it in the 3D view.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  combineScores, combinedColour, decodeLayer, factorColour, factorScore, latLonToXY, pixelToXY, xyToLatLon,
  type ColourMode, type FactorLayer, type FactorMeta, type SiteMapMeta, type Thresholds,
} from "../../lib/analysis/factors";
import "../../styles/sitemap.css";

const BASE = `${import.meta.env.BASE_URL}data/`;
const OFF_BY_DEFAULT = new Set(["ice_depth_m"]);
/** What "no value" means for a factor whose missing value has a meaning of its own. */
const EMPTY_MEANS: Record<string, string> = { ice_depth_m: "no stable ice" };

export interface MapSite { id: string; name: string; lat: number; lon: number; terrain: string }

interface Loaded {
  meta: SiteMapMeta; layers: FactorLayer[]; shade: Uint8ClampedArray;
}

interface RawMeta {
  size: number; pixel_m: number; x_min_m: number; y_max_m: number;
  factors: { key: string; name: string; unit: string; file: string; enc_min: number; enc_max: number;
    reject: number; ideal: number; weight: number; available: boolean; source: string; explain: string }[];
}

async function bytes(path: string): Promise<Uint8Array> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Grey hillshade (light from the upper left) from the section-8 height grid, as the map's base. */
function hillshade(h: Uint16Array, size: number, hMin: number, hMax: number, pixelM: number): Uint8ClampedArray {
  const k = (hMax - hMin) / 65535;
  const out = new Uint8ClampedArray(size * size);
  const lx = -0.6, ly = 0.6, lz = 0.53; // unit-ish light vector
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      const i = r * size + c;
      const dzdx = ((h[i + 1] - h[i - 1]) * k) / (2 * pixelM);
      const dzdy = ((h[i - size] - h[i + size]) * k) / (2 * pixelM);
      const n = Math.hypot(dzdx, dzdy, 1);
      const shade = (-dzdx * lx - dzdy * ly + lz) / n;
      out[i] = 40 + 120 * Math.max(0, Math.min(1, shade));
    }
  }
  return out;
}

async function load(): Promise<Loaded> {
  const raw = (await (await fetch(BASE + "sitemap/layers.json")).json()) as RawMeta;
  const meta: SiteMapMeta = {
    size: raw.size, pixelM: raw.pixel_m, xMinM: raw.x_min_m, yMaxM: raw.y_max_m,
    factors: raw.factors.map((f) => ({ key: f.key, name: f.name, unit: f.unit, file: f.file, encMin: f.enc_min,
      encMax: f.enc_max, reject: f.reject, ideal: f.ideal, weight: f.weight, available: f.available,
      source: f.source, explain: f.explain })),
  };
  const avail = meta.factors.filter((f) => f.available);
  const layers = await Promise.all(avail.map(async (f) => decodeLayer(f, await bytes("sitemap/" + f.file))));
  const pole = (await (await fetch(BASE + "terrain/south_pole.json")).json()) as
    { height_min_m: number; height_max_m: number; files: { height: string } };
  const hb = await bytes("terrain/" + pole.files.height);
  const h = new Uint16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2);
  return { meta, layers, shade: hillshade(h, meta.size, pole.height_min_m, pole.height_max_m, meta.pixelM) };
}

function fmtLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(3)}° ${lon < 0 ? "W" : "E"}`;
}

function fmtValue(v: number, unit: string, key = ""): string {
  if (!Number.isFinite(v)) return EMPTY_MEANS[key] ?? "no data";
  const d = Math.abs(v) >= 100 ? 0 : 1;
  return `${v.toFixed(d)} ${unit}`;
}

export function SiteMap({ sites, onGoTo3D }:
  { sites: MapSite[]; onGoTo3D: (siteId: string, lat: number, lon: number) => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"layers" | "combined">("combined");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ColourMode>("normal");
  const [numbers, setNumbers] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [th, setTh] = useState<Record<string, Thresholds>>({});
  const [pick, setPick] = useState<{ row: number; col: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    load().then((d) => {
      setData(d);
      // Buried ice is off by default: sunny ridges have no stable ice, so it would veto every good landing spot.
      setChosen(new Set(d.layers.map((l) => l.meta.key).filter((k) => !OFF_BY_DEFAULT.has(k))));
      setTh(Object.fromEntries(d.layers.map((l) => [l.meta.key, { reject: l.meta.reject, ideal: l.meta.ideal, weight: l.meta.weight }])));
    }).catch((e) => setError(String(e)));
  }, []);

  const active = useMemo(() => data?.layers.filter((l) => chosen.has(l.meta.key)) ?? [], [data, chosen]);

  // Draw: hillshade, then either each chosen factor in its colour (alpha = score) or the combined ramp.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !data) return;
    const n = data.meta.size;
    cv.width = n; cv.height = n;
    const img = new ImageData(n, n);
    const px = img.data;
    const shade = data.shade;
    const cols = active.map((l) => factorColour(l.meta.key, mode));
    const ths = active.map((l) => th[l.meta.key] ?? { reject: l.meta.reject, ideal: l.meta.ideal, weight: 1 });
    const s = new Float64Array(active.length), w = ths.map((t) => t.weight);
    for (let i = 0; i < n * n; i++) {
      let r = shade[i], g = shade[i], b = shade[i];
      let any = false;
      for (let j = 0; j < active.length; j++) {
        s[j] = factorScore(active[j].values[i], ths[j].reject, ths[j].ideal);
        if (Number.isFinite(s[j])) any = true;
      }
      if (any && view === "combined") {
        const c = combineScores(s, w);
        if (Number.isFinite(c)) {
          const [cr, cg, cb] = combinedColour(c, mode);
          r = r * 0.35 + cr * 0.65; g = g * 0.35 + cg * 0.65; b = b * 0.35 + cb * 0.65;
        }
      } else if (any) {
        for (let j = 0; j < active.length; j++) {
          if (!Number.isFinite(s[j])) continue;
          const a = (0.85 * s[j]) / Math.max(1, Math.sqrt(active.length));
          r += (cols[j][0] - r) * a; g += (cols[j][1] - g) * a; b += (cols[j][2] - b) * a;
        }
      }
      px[4 * i] = r; px[4 * i + 1] = g; px[4 * i + 2] = b; px[4 * i + 3] = 255;
    }
    cv.getContext("2d")!.putImageData(img, 0, 0);
  }, [data, active, mode, view, th]);

  if (error) return <p className="note">Site Map data not found ({error}). Run scripts/build_site_map.py.</p>;
  if (!data) return <p className="note">Loading the factor layers…</p>;

  const m = data.meta;
  const toPct = (lat: number, lon: number) => {
    const [x, y] = latLonToXY(lat, lon);
    return [((x - m.xMinM) / (m.pixelM * m.size)) * 100, ((m.yMaxM - y) / (m.pixelM * m.size)) * 100];
  };
  const polar = sites.filter((s) => s.terrain === "dem");

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * m.size);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * m.size);
    if (row >= 0 && row < m.size && col >= 0 && col < m.size) setPick({ row, col });
  };

  // The clicked point: coordinates, each factor's value and score, combined, and the nearest site for 3D.
  let popup = null;
  if (pick) {
    const i = pick.row * m.size + pick.col;
    const [x, y] = pixelToXY(m, pick.row, pick.col);
    const [lat, lon] = xyToLatLon(x, y);
    const shown = view === "layers" ? active : data.layers;
    const scores = active.map((l) => factorScore(l.values[i], th[l.meta.key].reject, th[l.meta.key].ideal));
    const combined = combineScores(scores, active.map((l) => th[l.meta.key].weight));
    let near: { s: MapSite; km: number } | null = null;
    for (const s of polar) {
      const [sx, sy] = latLonToXY(s.lat, s.lon);
      const km = Math.hypot(sx - x, sy - y) / 1000;
      if (!near || km < near.km) near = { s, km };
    }
    popup = (
      <div className="sm-popup" role="dialog" aria-label="Point details">
        <button className="sm-close" onClick={() => setPick(null)} aria-label="Close">×</button>
        <h3>{fmtLatLon(lat, lon)}</h3>
        {numbers && <p className="sm-small">x {Math.round(x)} m, y {Math.round(y)} m (polar stereographic), pixel {pick.row}, {pick.col}</p>}
        <p className="sm-combined">
          Combined score <b>{Number.isFinite(combined) ? Math.round(combined * 100) : "–"}</b>/100
          <span className="sm-swatch" style={{ background: `rgb(${combinedColour(Number.isFinite(combined) ? combined : 0, mode).join(",")})` }} />
          {combined === 0 && <span className="sm-warn">⚠ fails at least one factor</span>}
        </p>
        <table className="sm-table">
          <tbody>
            {shown.map((l) => {
              const t = th[l.meta.key];
              const sc = factorScore(l.values[i], t.reject, t.ideal);
              const c = factorColour(l.meta.key, mode);
              return (
                <tr key={l.meta.key} className={chosen.has(l.meta.key) ? "" : "sm-off"}>
                  <td><span className="sm-dot" style={{ background: `rgb(${c.join(",")})` }} />{l.meta.name}</td>
                  {numbers && <td className="num">{fmtValue(l.values[i], l.meta.unit, l.meta.key)}</td>}
                  <td className="num">{Number.isFinite(sc) ? (sc === 0 ? "0 ⚠" : sc.toFixed(2)) : (EMPTY_MEANS[l.meta.key] ?? "–")}</td>
                  <td className="sm-bar"><span style={{ width: `${(Number.isFinite(sc) ? sc : 0) * 100}%`, background: `rgb(${c.join(",")})` }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {near && (
          <button className="primary sm-go" onClick={() => onGoTo3D(near!.s.id, lat, lon)}>
            Go to 3D view ({near.km < 30 ? `near ${near.s.name}` : `nearest terrain: ${near.s.name}, ${near.km.toFixed(0)} km away`})
          </button>
        )}
      </div>
    );
  }

  const toggle = (k: string) => setChosen((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <section className="panel sm">
      <p className="lede">
        Every factor that decides a landing site, mapped over the south pole from NASA data. Each layer has its own
        colour and is more opaque where that factor scores better. The combined view runs from red (worst) to green
        (best); a spot that fails any chosen factor is red.
      </p>
      <div className="sm-controls">
        <div className="sm-seg" role="group" aria-label="View">
          <button className={view === "combined" ? "chip on" : "chip"} onClick={() => setView("combined")}>Combined</button>
          <button className={view === "layers" ? "chip on" : "chip"} onClick={() => setView("layers")}>Factor layers</button>
        </div>
        <label className="field check"><input type="checkbox" checked={mode === "colourblind"}
          onChange={(e) => setMode(e.target.checked ? "colourblind" : "normal")} /><span>Colour-blind mode</span></label>
        <label className="field check"><input type="checkbox" checked={numbers}
          onChange={(e) => setNumbers(e.target.checked)} /><span>Number mode</span></label>
        <label className="field"><span>Zoom</span>
          <select value={zoom} onChange={(e) => setZoom(+e.target.value)}>
            {[1, 2, 4].map((z) => <option key={z} value={z}>{z}×</option>)}
          </select>
        </label>
      </div>
      <div className="sm-factors">
        {data.layers.map((l) => {
          const c = factorColour(l.meta.key, mode);
          return (
            <label key={l.meta.key} className={chosen.has(l.meta.key) ? "sm-factor on" : "sm-factor"} title={l.meta.explain}>
              <input type="checkbox" checked={chosen.has(l.meta.key)} onChange={() => toggle(l.meta.key)} />
              <span className="sm-dot" style={{ background: `rgb(${c.join(",")})` }} />
              {l.meta.name}
            </label>
          );
        })}
        {m.factors.filter((f) => !f.available).map((f) => (
          <span key={f.key} className="sm-factor off" title="Source file not downloaded when the layers were built">{f.name} (no data)</span>
        ))}
      </div>

      <div className="sm-wrap">
        <div className="sm-scroll">
          <div className="sm-map" style={{ width: `${zoom * 100}%` }}>
            <canvas ref={canvas} onClick={onClick} aria-label="South pole factor map; click a point for its scores" />
            <svg className="sm-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {polar.map((s) => { const [cx, cy] = toPct(s.lat, s.lon); return <circle key={s.id} cx={cx} cy={cy} r={0.6 / zoom} className="sm-site" />; })}
              {pick && <circle cx={((pick.col + 0.5) / m.size) * 100} cy={((pick.row + 0.5) / m.size) * 100} r={1 / zoom} className="sm-pick" />}
            </svg>
            {polar.map((s) => { const [cx, cy] = toPct(s.lat, s.lon); return <span key={s.id} className="sm-label" style={{ left: `${cx}%`, top: `${cy}%` }}>{s.name}</span>; })}
          </div>
        </div>
        {popup}
      </div>

      <div className="sm-legend">
        {view === "combined" ? (
          <>
            <span>Worst</span>
            <span className="sm-ramp" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${combinedColour(t, mode).join(",")})`).join(",")})` }} />
            <span>Best</span>
            <span className="sm-small">· Grid {Math.round(m.pixelM)} m per pixel · each pixel shows its best 120 m spot</span>
          </>
        ) : (
          <span className="sm-small">Opacity = score: solid colour where that factor is ideal, invisible where it fails.</span>
        )}
      </div>

      {numbers && (
        <details className="sm-numbers" open>
          <summary>Thresholds (edit to explore; score 0 at "reject", 1 at "ideal", straight line between)</summary>
          <table className="sm-table">
            <thead><tr><th>Factor</th><th>Reject (0)</th><th>Ideal (1)</th><th>Weight</th><th>Source</th></tr></thead>
            <tbody>
              {data.layers.map((l) => {
                const t = th[l.meta.key];
                const set = (k: keyof Thresholds) => (e: React.ChangeEvent<HTMLInputElement>) =>
                  setTh({ ...th, [l.meta.key]: { ...t, [k]: +e.target.value } });
                return (
                  <tr key={l.meta.key}>
                    <td>{l.meta.name} <span className="sm-small">({l.meta.unit})</span></td>
                    <td><input type="number" value={t.reject} step="any" onChange={set("reject")} /></td>
                    <td><input type="number" value={t.ideal} step="any" onChange={set("ideal")} /></td>
                    <td><input type="number" value={t.weight} min={0} step="any" onChange={set("weight")} /></td>
                    <td className="sm-small">{l.meta.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

export type { FactorMeta };
