// Where to land: the suitability map of the south pole, the zones that pass every hard limit, past landings,
// and the criteria as a plain table. A checkbox list says what matters for the mission: one parameter ticked
// shows that parameter's own heat map, two or more show the combined score, and the zones are re-ranked live.
// Two ways to read the map: the ranked zones, or click any spot for its numbers (Chinh's Site Map, folded in).
// All scoring is web/src/lib/analysis/suitability.ts.
// Data: web/public/data/suitability/ (docs/INTERFACES.md sections 10 and 11).
import { useEffect, useMemo, useRef, useState } from "react";
import { useWidth } from "../charts/useWidth";
import {
  BALANCED, EVERYTHING, LAYER_KEYS, TERM_KEYS, countedTerms, mapScore, mapScoreGrid, parameter, presetSelection,
  rankAmong, rankZones, sameSelection, selectionWeights, setImportance, subscore, toggleTerm, zoneScore,
  type Importance, type LayerKey, type Preset, type Selection, type TermKey, type Weights, type ZoneInput,
} from "../lib/analysis/suitability";
import { WhyHere } from "../components/ui/WhyHere";
import { explainFor, valuesFromRow, type CriterionRow } from "../lib/analysis/explain";
import {
  cellAt, cellCentre, failedLimits, latLonToXY, layerValueText, ramp3, readPoint, xyToLatLon, type LayerInfo,
} from "../lib/analysis/factors";
import { parseCsv } from "../lib/data/csv";
import { useStore } from "../state/store";

const BASE = `${import.meta.env.BASE_URL}data/`;
const GRID = 1024, GRID_HALF_KM = 220, VIEW_HALF_KM = 190; // the score grid, and the part of it the map shows
const R_KM = 1737.4;
const SHOWN_ZONES = 40;

type Row = Record<string, string>;
interface WeightsFile {
  layers: LayerInfo[]; zone_terms: { key: TermKey; label: string; unit: string; reject: number; ideal: number }[];
  presets: Preset[]; default: string;
  confirmed_zones: number;
}
const sameWeights = (a: Weights, b: Weights) => TERM_KEYS.every((k) => a[k] === b[k]);
/** The checkbox list, grouped the way a mission planner thinks: power, radio, ground, ice. */
const LIST_ORDER: TermKey[] = ["sunlight", "darkness", "earth", "no_earth", "landing_slope", "walkable", "shadow", "ice", "temperature", "hollow"];
const LEVELS: [Importance, string][] = [["low", "Low"], ["normal", "Normal"], ["high", "High"]];
interface Summary {
  region_km2: number; pass_km2: number; pass_pct_of_region: number; zones: number; zones_stay_window_ok: number;
  zones_1km2_or_more: number; top20_near_artemis: number; top20_nearest_regions: string[]; artemis_near_km: number;
  region_pct_near_artemis: number; pass_pct_near_artemis: number; signal_delay_s: { min: number; max: number };
  fail_pct_of_region: Record<string, number>;
  artemis_points_passing: number; artemis_regions_with_a_zone: number;
}

/** Polar stereographic x/y in km (lon 0 up, lon 90 E right) for a latitude / east longitude. */
function toXY(lat: number, lon: number): [number, number] {
  const rho = 2 * R_KM * Math.tan(((90 + lat) * Math.PI) / 360);
  return [rho * Math.sin((lon * Math.PI) / 180), rho * Math.cos((lon * Math.PI) / 180)];
}

function cssColour(name: string): RGB {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

type RGB = [number, number, number];

/**
 * Paints the map. `grid` is the score grid (0..100 passes, 101..201 fails, 255 no data). With `layer` it shows that
 * one parameter by itself: black where it scores 0, its own colour where it is ideal. The colour-blind palette
 * replaces every ramp with dark blue -> grey -> yellow.
 */
function drawMap(canvas: HTMLCanvasElement, grid: Uint8Array, layer: Uint8Array | null, token: string, colourBlind: boolean) {
  const shadow = cssColour("--shadow"), dust = cssColour("--dust"), regolith = cssColour("--regolith");
  const rim = cssColour("--rim"), lichen = cssColour("--lichen"), hue = cssColour(token), black = cssColour("--void");
  const cb: [RGB, RGB, RGB] = [cssColour("--cb-low"), cssColour("--cb-mid"), cssColour("--cb-high")];
  const img = new ImageData(GRID, GRID);
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    let c: number[];
    if (v === 255) c = shadow;
    else if (layer) c = colourBlind ? ramp3(cb, layer[i] / 255) : mix(black, hue, (layer[i] / 255) ** 0.75);
    // Passing ground is green (brighter = higher score); failing ground stays grey.
    else if (v <= 100) c = colourBlind ? ramp3(cb, 0.35 + 0.65 * (v / 100)) : mix(rim, lichen, 0.35 + 0.65 * (v / 100));
    else c = mix(dust, regolith, 0.05 + 0.4 * ((v - 101) / 100));
    img.data.set([c[0], c[1], c[2], 255], 4 * i);
  }
  const off = document.createElement("canvas");
  off.width = off.height = GRID;
  off.getContext("2d")!.putImageData(img, 0, 0);
  const crop = (GRID * VIEW_HALF_KM) / GRID_HALF_KM, start = (GRID - crop) / 2;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, start, start, crop, crop, 0, 0, canvas.width, canvas.height);
}

const num = (r: Row | undefined, k: string) => (r ? Number(r[k]) : NaN);
const days = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`);

export function WhereToLand() {
  const sites = useStore((s) => s.sites);
  const goTo3D = useStore((s) => s.goTo3D);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState<Uint8Array | null>(null);
  const [zones, setZones] = useState<Row[]>([]);
  const [criteria, setCriteria] = useState<Row[]>([]);
  const [missions, setMissions] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  // The zone the reader chose (a zone's published rank is its id, shown as #id), remembered for the choice of
  // parameters it was made under: change the ticks and the panel goes back to the best zone.
  const [chosen, setChosen] = useState<{ id: number; under: string } | null>(null);
  const [explainOpen, setExplainOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 640);
  const [config, setConfig] = useState<WeightsFile | null>(null);
  const [zoneLayers, setZoneLayers] = useState<Row[]>([]);
  const [points, setPoints] = useState<Row[]>([]);
  // The choice lives in the store (a preset, or hand-set ticks) so it survives a reload and travels in the link
  // (web/src/state/url.ts).
  const landPreset = useStore((s) => s.landPreset);
  const landSelection = useStore((s) => s.landSelection);
  const setLandChoice = useStore((s) => s.setLandChoice);
  const [layers, setLayers] = useState<Uint8Array[] | null>(null);
  const [limits, setLimits] = useState<Uint8Array | null>(null);
  const [view, setView] = useState<"zones" | "layers">("zones");
  const [colourBlind, setColourBlind] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pick, setPick] = useState<number | null>(null); // a cell of the south-pole grid
  const [mapRef, mapPx] = useWidth<HTMLDivElement>(640, 200);

  useEffect(() => {
    const text = (p: string) => fetch(BASE + p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p))));
    Promise.all([
      fetch(`${BASE}suitability/south_pole_score.u8`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("score")))),
      text("suitability/zones.csv"), text("criteria.csv"), text("missions.csv"), text("suitability/summary.json"),
      text("suitability/weights.json"), text("suitability/zones_layers.csv"), text("suitability/artemis_points.csv"),
    ]).then(([buf, z, c, m, s, w, zl, ap]) => {
      setGrid(new Uint8Array(buf)); setZones(parseCsv(z)); setCriteria(parseCsv(c)); setMissions(parseCsv(m));
      // Buttons: the default preset first, the published "NASA-style balance" last.
      const file = JSON.parse(w) as WeightsFile;
      const order = (p: Preset) => (p.key === file.default ? 0 : p.key === "balanced" ? 2 : 1);
      setSummary(JSON.parse(s) as Summary); setConfig({ ...file, presets: [...file.presets].sort((a, b) => order(a) - order(b)) });
      setZoneLayers(parseCsv(zl)); setPoints(parseCsv(ap));
    }).catch(() => setFailed(true));
  }, []);

  // What is ticked: a preset of suitability/weights.json, or ticks set by hand.
  const selection = useMemo<Selection>(() => {
    if (landSelection) return landSelection;
    const preset = config?.presets.find((p) => p.key === landPreset) ?? config?.presets.find((p) => p.key === config.default);
    return preset ? presetSelection(preset) : EVERYTHING;
  }, [landPreset, landSelection, config]);
  const weights = useMemo(() => selectionWeights(selection), [selection]);
  const counted = useMemo(() => countedTerms(selection), [selection]);
  const choose = (next: Selection) => {
    // A hand-set choice that equals a preset is that preset (shorter link, and its button lights up).
    const preset = config?.presets.find((p) => sameSelection(presetSelection(p), next));
    setLandChoice(preset ? preset.key : null, preset ? null : next);
  };
  const labelOf = (k: TermKey) => [...(config?.layers ?? []), ...(config?.zone_terms ?? [])].find((t) => t.key === k)?.label ?? parameter(k).label;

  // One parameter ticked: its own heat map, if it is known everywhere. Short nights and never out of contact come
  // from our hour-by-hour model, so they are only known at zone centres.
  const single = counted.length === 1 ? counted[0] : null;
  const singleLayer = single && (LAYER_KEYS as readonly string[]).includes(single) ? (single as LayerKey) : null;
  const zoneOnly = counted.length > 0 && counted.every((k) => !(LAYER_KEYS as readonly string[]).includes(k));

  // The layer grids (1 MB each) and the limits grid. The published score grid already answers the NASA-style
  // balance, so the map can show that one while they load.
  const balanced = sameWeights(weights, BALANCED);
  useEffect(() => {
    if (layers) return;
    let live = true;
    const get = (p: string) => fetch(`${BASE}suitability/${p}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(p))));
    Promise.all([...LAYER_KEYS.map((k) => get(`layers/south_pole_${k}.u8`)), get("south_pole_limits.u8")])
      .then((bufs) => {
        if (!live) return;
        setLimits(new Uint8Array(bufs[LAYER_KEYS.length]));
        setLayers(bufs.slice(0, LAYER_KEYS.length).map((b) => new Uint8Array(b)));
      })
      .catch(() => setFailed(true));
    return () => { live = false; };
  }, [layers]);

  // The map for the current choice: same pass / fail as published, the score of the ticked parameters.
  const liveGrid = useMemo(() => {
    if (!grid || balanced) return grid;
    if (!layers) return null;
    const score = mapScoreGrid(layers, weights);
    const flat = counted.length === 0 || zoneOnly; // nothing to colour by: show where the NASA limits pass
    const out = new Uint8Array(grid.length);
    for (let i = 0; i < grid.length; i++) out[i] = grid[i] === 255 ? 255 : grid[i] <= 100 ? (flat ? 45 : score[i]) : 101 + (flat ? 30 : score[i]);
    return out;
  }, [grid, layers, weights, balanced, counted, zoneOnly]);
  useEffect(() => {
    if (!liveGrid || !canvas.current) return;
    const layer = singleLayer && layers ? layers[LAYER_KEYS.indexOf(singleLayer)] : null;
    drawMap(canvas.current, liveGrid, layer, single ? parameter(single).token : "--lichen", colourBlind);
  }, [liveGrid, single, singleLayer, layers, colourBlind]);

  // Zones re-scored and re-ranked under the current weights.
  const zoneInputs = useMemo<ZoneInput[]>(() => (zoneLayers.length !== zones.length ? [] : zones.map((r, i) => ({
    id: +r.rank, q: LAYER_KEYS.map((k) => +zoneLayers[i][k]), darkH: +r.longest_dark_h, noEarthH: +r.longest_no_earth_h,
    stayOk: r.stay_window_ok === "True", areaKm2: +r.area_km2 }))), [zones, zoneLayers]);
  const ranked = useMemo(() => rankZones(zoneInputs, weights), [zoneInputs, weights]);
  const liveOf = useMemo(() => new Map(ranked.map((z) => [z.id, z])), [ranked]);
  const shown = useMemo(() => ranked.slice(0, mapPx < 500 ? SHOWN_ZONES / 2 : SHOWN_ZONES).map((z) => zones[z.id - 1]),
    [ranked, zones, mapPx]);
  const best = ranked[0];
  // With one zone-only parameter ticked, the markers carry its colour: full colour where it is ideal.
  const markerShade = (id: number): string | undefined => {
    if (!single || singleLayer || !config) return undefined;
    const term = config.zone_terms.find((t) => t.key === single);
    const z = zones[id - 1];
    if (!term || !z) return undefined;
    const s = subscore(single === "darkness" ? +z.longest_dark_h : +z.longest_no_earth_h, term.reject, term.ideal);
    return `color-mix(in oklab, var(--void), var(${colourBlind ? "--cb-high" : parameter(single).token}) ${Math.round(100 * s ** 0.75)}%)`;
  };
  const under = TERM_KEYS.map((k) => weights[k]).join(",");
  const selected = chosen && chosen.under === under ? chosen.id : ranked[0]?.id ?? 1;
  const setSelected = (id: number) => setChosen({ id, under });
  const zone = zones[selected - 1];
  const live = liveOf.get(selected);

  // Where the nine Artemis points would stand among the confirmed zones, under each preset and under "yours".
  const artemisRanks = useMemo(() => {
    if (!config || !zoneInputs.length) return [];
    const confirmed = zoneInputs.filter((z) => z.stayOk);
    const columns = [...config.presets.map((p) => p.weights), weights].map((w) => {
      const zoneScores = confirmed.map((z) => zoneScore(mapScore(z.q, w), z.darkH, z.noEarthH, w));
      return points.map((pt) => {
        const score = zoneScore(mapScore(LAYER_KEYS.map((k) => +pt[k]), w), +pt.longest_dark_h, +pt.longest_no_earth_h, w);
        return { score, rank: rankAmong(score, zoneScores) };
      });
    });
    return points.map((pt, i) => ({ pt, cells: columns.map((c) => c[i]) }));
  }, [config, zoneInputs, points, weights]);
  const artemis = sites.filter((s) => s.group === "artemis");
  const polar = missions.filter((m) => m.lat !== "" && Math.hypot(...toXY(+m.lat, +m.lon)) < VIEW_HALF_KM);
  // SVG user units are km, with y flipped so north-of-chart (lon 0, towards Earth) is up.
  const pt = (lat: number, lon: number) => { const [x, y] = toXY(lat, lon); return { x, y: -y }; };
  const ring84 = 2 * R_KM * Math.tan((6 * Math.PI) / 360);
  // One SVG unit is a kilometre; u converts screen pixels to units so labels and markers keep their size on a phone.
  const u = (2 * VIEW_HALF_KM) / mapPx;
  const font = { fontSize: 11 * u, strokeWidth: 3 * u };

  if (failed) return <section className="panel"><p className="note">The suitability files could not be loaded. They are in web/public/data/suitability/ in the repository.</p></section>;
  if (!grid || !summary || !zone || !config || !live || !best) return <section className="panel"><p className="note">Loading the suitability map…</p></section>;

  // Layers view: what the picked cell holds, scored by the same engine as the zones.
  const point = pick !== null && layers ? readPoint(layers, grid, pick, weights) : null;
  const pickXY = pick !== null ? cellCentre(pick) : null;
  const pickLatLon = pickXY ? xyToLatLon(pickXY[0], pickXY[1]) : null;
  let nearest: { id: string; name: string; km: number } | null = null;
  if (pickXY) {
    for (const s of sites.filter((x) => x.terrain === "dem")) {
      const [sx, sy] = latLonToXY(s.lat, s.lon);
      const km = Math.hypot(sx - pickXY[0], sy - pickXY[1]) / 1000;
      if (!nearest || km < nearest.km) nearest = { id: s.id, name: s.name, km };
    }
  }
  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (view !== "layers") return;
    const r = e.currentTarget.getBoundingClientRect();
    const xKm = (((e.clientX - r.left) / r.width) * 2 - 1) * VIEW_HALF_KM;
    const yKm = -(((e.clientY - r.top) / r.height) * 2 - 1) * VIEW_HALF_KM;
    const cell = cellAt(xKm * 1000, yKm * 1000);
    if (cell >= 0 && grid[cell] !== 255) setPick(cell);
  };

  // Legend: one parameter in its real units, or the combined (Goldilocks) score.
  const bounds = single ? [...config.layers, ...config.zone_terms].find((t) => t.key === single) : undefined;
  const legend = (
    <ul className="key legend">
      {single && bounds ? (
        <li>
          <span className={colourBlind ? "swatch cb" : "swatch ramp"} style={colourBlind ? undefined : { background: `linear-gradient(90deg, var(--void), var(${parameter(single).token}))` }} />
          {labelOf(single)}: {bounds.reject} {bounds.unit} (dark) to {bounds.ideal} {bounds.unit}{bounds.ideal > bounds.reject ? " or more" : " or less"} (full colour)
        </li>
      ) : (
        <>
          <li><span className={colourBlind ? "swatch cb" : "swatch ok"} />Passes every NASA limit (brighter = better for your choice)</li>
          <li><span className="swatch ground" />Fails at least one</li>
        </>
      )}
    </ul>
  );

  const facts: [string, string][] = [
    ["Score", `${live.score} of 100`],
    ["Area of the zone", `${(+zone.area_km2).toFixed(+zone.area_km2 < 10 ? 2 : 0)} km²`],
    ["Landing slope (120 m)", `${zone.landing_slope_deg}°`],
    ["Slope over 2 km", `${zone.eva_slope_deg}°`],
    ["Walkable ground within 2 km", `${zone.eva_walkable_pct}%`],
    ["Sunlight, long-run", `${(+zone.sun_pct).toFixed(0)}%`],
    ["Earth in view, long-run", `${(+zone.earth_pct).toFixed(0)}%`],
    ["Longest darkness, 2026 to 2029", days(num(zone, "longest_dark_h"))],
    ["Longest time without Earth", days(num(zone, "longest_no_earth_h"))],
    ["Nearest permanent shadow", +zone.psr_distance_km >= 20.4 ? "more than 20 km" : `${(+zone.psr_distance_km).toFixed(1)} km`],
    ["Mean ground temperature", zone.temp_avg_k ? `${zone.temp_avg_k} K (${Math.round(+zone.temp_avg_k - 273.15)} °C)` : "no data"],
    ["Height", `${(+zone.elevation_m).toLocaleString("en-GB")} m`],
    ["Nearest Artemis region", `${zone.nearest_artemis_region}, ${zone.nearest_artemis_km} km`],
  ];

  return (
    <section className="panel">
      <div className="prose">
        <h2>Where to land</h2>
        <p className="lede">
          We tested every 120 m square within 6° of the south pole against NASA's Artemis III site requirements.{" "}
          <strong>{summary.pass_pct_of_region}% of the ground passes all of them</strong> ({summary.pass_km2.toLocaleString("en-GB")} of{" "}
          {summary.region_km2.toLocaleString("en-GB")} km²), in {summary.zones.toLocaleString("en-GB")} separate zones.
          Tick what matters for your mission and the zones are ranked for it.
        </p>
      </div>

      <div className="priorities">
        <h3>What matters for your mission?</h3>
        <div className="presets" role="group" aria-label="Presets">
          {config.presets.map((p) => {
            const on = sameSelection(presetSelection(p), selection);
            return <button key={p.key} className={on ? "chip on" : "chip"} aria-pressed={on} onClick={() => setLandChoice(p.key, null)}>{p.label}</button>;
          })}
        </div>
        <ul className={explainOpen ? "ticks" : "ticks compact"}>
          <li className="tick locked">
            <label>
              <input type="checkbox" checked disabled />
              <span className="chip-colour limits" aria-hidden="true" />
              <span><b>NASA safety limits</b> <span className="why-line always">Slope under 10°, within 6° of the pole, and the rest of NASA's Artemis III limits. Always on.</span></span>
            </label>
          </li>
          {LIST_ORDER.map((k) => {
            const info = parameter(k), on = counted.includes(k);
            return (
              <li key={k} className={on ? "tick on" : "tick"}>
                <label>
                  <input type="checkbox" checked={on} onChange={() => choose(toggleTerm(selection, k))} />
                  <span className="chip-colour" style={{ background: `var(${info.token})` }} aria-hidden="true" />
                  <span><b>{labelOf(k)}</b> <span className="why-line">{info.explain}</span></span>
                </label>
              </li>
            );
          })}
        </ul>
        <button className="link explain-toggle" aria-expanded={explainOpen} onClick={() => setExplainOpen(!explainOpen)}>
          {explainOpen ? "Hide what each one means" : "What does each one mean?"}
        </button>
        {counted.length > 0 && !selection.weights && (
          <details className="weights">
            <summary>Fine-tune importance</summary>
            <div className="levels">
              {LIST_ORDER.filter((k) => counted.includes(k)).map((k) => (
                <fieldset key={k}>
                  <legend>{labelOf(k)}</legend>
                  {LEVELS.map(([level, name]) => (
                    <label key={level}>
                      <input type="radio" name={`importance-${k}`} checked={(selection.importance?.[k] ?? "normal") === level}
                        onChange={() => choose(setImportance(selection, k, level))} />{name}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </details>
        )}
        {selection.weights && (
          <p className="note">
            {balanced ? "NASA-style balance uses its own fixed weights (docs/criteria.md): it is the ranking of the published files." : "This link carries its own exact weights."}{" "}
            Tick or untick anything to go back to equal importance.
          </p>
        )}
      </div>

      <p className="lede answer" role="status">
        {counted.length === 0 ? (
          <>Nothing is ticked, so nothing is ranked. The map shows where the NASA safety limits pass: {zones.length.toLocaleString("en-GB")} zones.</>
        ) : single && bounds ? (
          <>
            Showing <strong>{labelOf(single)}</strong> by itself: {bounds.reject} {bounds.unit} (dark) to {bounds.ideal} {bounds.unit}
            {bounds.ideal > bounds.reject ? " or more" : " or less"} (full colour). Best of {zones.length.toLocaleString("en-GB")} zones:
            #{best.id} (score {best.score}).
          </>
        ) : (
          <>
            Best landing spots for{" "}
            <strong>{counted.length === TERM_KEYS.length ? "everything on the list" : LIST_ORDER.filter((k) => counted.includes(k)).map(labelOf).join(" + ")}</strong>:{" "}
            {zones.length.toLocaleString("en-GB")} zones; best is #{best.id} (score {best.score}).
          </>
        )}
      </p>
      {single && !singleLayer && (
        <p className="note">
          {labelOf(single)} comes from our hour-by-hour model, so it is known at the zones, not at every point: the
          map shows where the NASA limits pass, and the zone markers carry the colour.
        </p>
      )}
      {!liveGrid && <p className="note">Loading the map layers…</p>}

      <div className="map-bar">
        <div className="presets" role="group" aria-label="Map view">
          <button className={view === "zones" ? "chip on" : "chip"} aria-pressed={view === "zones"} onClick={() => setView("zones")}>Ranked zones</button>
          <button className={view === "layers" ? "chip on" : "chip"} aria-pressed={view === "layers"} onClick={() => setView("layers")}>Click any spot</button>
        </div>
        <label className="field check"><input type="checkbox" checked={colourBlind} onChange={(e) => setColourBlind(e.target.checked)} /><span>Colour-blind palette</span></label>
        <label className="field check"><input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /><span>Show the numbers</span></label>
        <label className="field"><span>Zoom</span>
          <select value={zoom} onChange={(e) => setZoom(+e.target.value)}>{[1, 2, 4].map((z) => <option key={z} value={z}>{z}×</option>)}</select>
        </label>
      </div>
      <div className="land">
        <div className="land-scroll">
        <div className="land-map" ref={mapRef} style={{ width: `${zoom * 100}%` }}>
          <canvas ref={canvas} width={880} height={880} aria-hidden="true" />
          <svg viewBox={`${-VIEW_HALF_KM} ${-VIEW_HALF_KM} ${2 * VIEW_HALF_KM} ${2 * VIEW_HALF_KM}`} role="img" onClick={onMapClick}
            className={view === "layers" ? "pickable" : undefined}
            aria-label="Map of the lunar south pole coloured by landing suitability, with the best zones, the Artemis candidate points and past landings.">
            <circle cx={0} cy={0} r={ring84} className="map-ring" strokeWidth={1.2 * u} strokeDasharray={`${6 * u} ${6 * u}`} />
            <text x={0} y={ring84 - 6 * u} textAnchor="middle" className="map-text" style={font}>6° from the pole</text>
            <text x={0} y={-VIEW_HALF_KM + 13 * u} textAnchor="middle" className="map-text" style={font}>Towards Earth</text>
            <path d={`M${-6 * u} 0H${6 * u}M0 ${-6 * u}V${6 * u}`} className="map-pole" strokeWidth={1.5 * u} />
            <text x={8 * u} y={-6 * u} className="map-text" style={font}>South pole</text>
            {artemis.map((s) => { const p = pt(s.lat, s.lon); return (
              <g key={s.id}><rect x={p.x - 4 * u} y={p.y - 4 * u} width={8 * u} height={8 * u} strokeWidth={1.5 * u} className="map-artemis" transform={`rotate(45 ${p.x} ${p.y})`} /><title>{`Artemis candidate: ${s.name}`}</title></g>
            ); })}
            {view === "layers" && pickXY && <circle cx={pickXY[0] / 1000} cy={-pickXY[1] / 1000} r={8 * u} strokeWidth={2 * u} className="map-pick" />}
            {view === "zones" && shown.map((z) => { const p = pt(+z.lat, +z.lon); const id = +z.rank; const on = id === selected; const now = liveOf.get(id)!; return (
              <g key={id} className={on ? "map-zone on" : "map-zone"} role="button" tabIndex={0} aria-label={`Rank ${now.rank}: zone #${id}, score ${now.score}`}
                onClick={() => setSelected(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(id); } }}>
                <circle cx={p.x} cy={p.y} r={(on ? 9 : 6) * u} strokeWidth={1.5 * u} style={markerShade(id) ? { fill: markerShade(id), fillOpacity: 1 } : undefined} />
                {(now.rank <= 10 || on) && <text x={p.x} y={p.y - 10 * u} textAnchor="middle" className="map-text" style={font}>{now.rank}</text>}
              </g>
            ); })}
            {polar.map((m) => { const p = pt(+m.lat, +m.lon); return (
              <g key={m.id} className={m.outcome === "landed" ? "map-mission ok" : "map-mission"}>
                <path strokeWidth={2.5 * u} d={`M${p.x - 5 * u} ${p.y - 5 * u}L${p.x + 5 * u} ${p.y + 5 * u}M${p.x - 5 * u} ${p.y + 5 * u}L${p.x + 5 * u} ${p.y - 5 * u}`} />
                <text x={p.x + 8 * u} y={p.y + 4 * u} className="map-text" style={font}>{m.name}</text>
                <title>{`${m.name}: ${m.outcome}`}</title>
              </g>
            ); })}
          </svg>
        </div>
        </div>

        {view === "layers" && (
          <div className="land-side">
            {!layers ? <p className="note">Loading the map layers…</p> : !point || !pickLatLon ? (
              <>
                <h3>Pick a spot</h3>
                <p className="note">Click anywhere on the map for that spot's numbers: pass or fail, its score for what you ticked, and every criterion by itself.</p>
              </>
            ) : (
              <>
                <h3>{Math.abs(pickLatLon[0]).toFixed(3)}° S, {Math.abs(pickLatLon[1]).toFixed(3)}° {pickLatLon[1] < 0 ? "W" : "E"}</h3>
                <p className="note">
                  {point.passes
                    ? "Passes every hard limit."
                    : `Fails a hard limit: ${failedLimits(limits?.[pick!] ?? 255).join(", ") || "see the criteria"}.`}{" "}
                  Each map pixel shows its best 120 m square.
                </p>
                <table className="compare facts">
                  <tbody>
                    <tr><th>Score for your choice</th><td>{counted.length ? `${point.score} of 100` : "nothing ticked"}</td></tr>
                    {config.layers.map((l, k) => (
                      <tr key={l.key} className={counted.includes(l.key) ? undefined : "unticked"}>
                        <th><span className="chip-colour small" style={{ background: `var(${parameter(l.key).token})` }} aria-hidden="true" />{l.label}{counted.includes(l.key) ? "" : " (not ticked)"}
                          {numbers && <span className="unit">{layerValueText(point.q[k], l)}</span>}</th>
                        <td><span className="bar" aria-hidden="true"><span style={{ width: `${(point.q[k] / 255) * 100}%` }} /></span> {Math.round((point.q[k] / 255) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {numbers && pickXY && (
                  <p className="note">
                    x {Math.round(pickXY[0]).toLocaleString("en-GB")} m, y {Math.round(pickXY[1]).toLocaleString("en-GB")} m (polar stereographic);
                    grid row {Math.floor(pick! / GRID)}, column {pick! % GRID}. Percentages are sub-scores: 0% at the
                    criterion's reject bound, 100% at its ideal.
                  </p>
                )}
                {nearest && (
                  <button className="primary" onClick={() => goTo3D(nearest!.id, pickLatLon)}>
                    Open the 3D view at {nearest.name} ({nearest.km < 1 ? "here" : `${nearest.km.toFixed(0)} km away`})
                  </button>
                )}
              </>
            )}
            {legend}
            <ul className="key">
              <li><span className="mark artemis" />Artemis candidate point</li>
              <li><span className="mark mission" />Past landing attempt</li>
            </ul>
            {numbers && (
              <div className="table-scroll">
                <table className="compare">
                  <thead><tr><th>Parameter</th><th>Scores 0 at</th><th>Scores 100 at</th><th>Counts</th></tr></thead>
                  <tbody>
                    {config.layers.map((l) => (
                      <tr key={l.key}><th>{l.label}</th><td>{l.reject} {l.unit}</td><td>{l.ideal} {l.unit}</td><td>{weights[l.key] ? `x ${weights[l.key] / 2}` : "no"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === "zones" && (
        <div className="land-side">
          <h3>Rank {live.rank}: zone #{zone.rank}</h3>
          <p className="note">
            {(-zone.lat).toFixed(2)}° S, {Math.abs(+zone.lon).toFixed(2)}° {+zone.lon < 0 ? "W" : "E"}.
            Numbers at the zone's best 120 m square.{" "}
            {zone.stay_window_ok === "True"
              ? `Our own model finds ${days(num(zone, "longest_sun_and_earth_h"))} in a row with Sun and Earth both up, enough for a 6.5-day stay.`
              : `Our own model finds at most ${days(num(zone, "longest_sun_and_earth_h"))} in a row with Sun and Earth both up: not enough for a 6.5-day stay.`}
          </p>
          <table className="compare facts">
            <tbody>{facts.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
          </table>
          {legend}
          <ul className="key">
            <li><span className="mark zone" />Best zones for your choice (choose one)</li>
            <li><span className="mark artemis" />Artemis candidate point</li>
            <li><span className="mark mission" />Past landing attempt</li>
          </ul>
          {numbers && (
            <table className="compare facts">
              <tbody>
                <tr><th>Map score at the best square</th><td>{live.mapScore} of 100</td></tr>
                {config.layers.map((l) => (
                  <tr key={l.key} className={counted.includes(l.key) ? undefined : "unticked"}><th>{l.label}{counted.includes(l.key) ? "" : " (not ticked)"}</th>
                    <td>{Math.round((+zoneLayers[selected - 1][l.key] / 255) * 100)}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}
      </div>

      {counted.length > 0 && (
        <>
          <div className="prose"><h3>The ten best for your choice</h3></div>
          <div className="table-scroll">
            <table className="compare wide ranked">
              <thead><tr><th>Rank</th><th>Zone</th><th>Where</th><th>Score</th><th>Area</th><th>Nearest Artemis region</th></tr></thead>
              <tbody>
                {ranked.slice(0, 10).map((r) => { const z = zones[r.id - 1]; return (
                  <tr key={r.id} className={r.id === selected ? "on" : undefined}>
                    <td>{r.rank}</td>
                    <th><button className="link" onClick={() => { setSelected(r.id); setView("zones"); }}>#{r.id}</button></th>
                    <td>{(-z.lat).toFixed(2)}° S, {Math.abs(+z.lon).toFixed(2)}° {+z.lon < 0 ? "W" : "E"}</td>
                    <td>{r.score}</td>
                    <td>{(+z.area_km2).toFixed(+z.area_km2 < 10 ? 2 : 0)} km²</td>
                    <td>{z.nearest_artemis_region}, {z.nearest_artemis_km} km</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <WhyHere title={`Why here? Zone #${zone.rank} against what you ticked`}
        list={explainFor(valuesFromRow({ ...zone, ice_depth_m: zoneLayers[selected - 1].ice_depth_m, hollow_depth_m: zoneLayers[selected - 1].hollow_depth_m }),
          criteria as unknown as CriterionRow[], counted)} />

      <div className="prose">
        <h3>Does this find NASA's own regions?</h3>
        <p>
          Not as its top picks: {summary.top20_near_artemis} of our top 20 zones {summary.top20_near_artemis === 1 ? "lies" : "lie"} inside
          or within 5 km of an Artemis candidate region. But {summary.artemis_points_passing} of the 9 candidate points pass
          every limit where they stand, and {summary.artemis_regions_with_a_zone} of the 9 have a passing zone
          within {summary.artemis_near_km} km. The lists differ because we rank single 120 m squares, while the Artemis
          regions are about 15 km across and were also chosen for science goals and launch windows, which our filter
          does not know about.
        </p>
        <h3>Where the nine Artemis points rank</h3>
        <p className="note">
          Each point scored like a zone and placed among the {config.confirmed_zones.toLocaleString("en-GB")} zones
          with a confirmed 6.5-day window: rank, then score in brackets. Three points fail a hard limit where they
          stand; their rank says where they would be if they passed.
        </p>
      </div>
      <div className="table-scroll">
        <table className="compare wide">
          <thead>
            <tr><th>Artemis point</th>{config.presets.map((p) => <th key={p.key}>{p.label}</th>)}<th>Your ticks</th></tr>
          </thead>
          <tbody>
            {artemisRanks.map(({ pt: a, cells }) => (
              <tr key={a.id}>
                <th>{a.name}{a.passes_hard_limits === "no" ? <span className="unit">fails: {a.failed_limits.replace("latitude", "more than 6° from the pole").replace("sunlight", "too little sunlight")}</span> : null}</th>
                {cells.map((c, i) => <td key={i}>{c.rank.toLocaleString("en-GB")} ({c.score})</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="prose">
        <h3>The criteria</h3>
      </div>
      <div className="table-scroll">
        <table className="compare wide">
          <thead><tr><th>What</th><th>Good</th><th>Acceptable</th><th>Rejected</th><th>Why it matters</th></tr></thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={`${c.parameter} ${c.kind}`}>
                <th>
                  {c.parameter}{c.kind === "hard" ? " (hard limit)" : c.kind === "reported" ? " (reported only)" : ""}
                  <span className="unit">{c.unit}</span>
                </th>
                <td>{c.ideal}</td><td>{c.acceptable}</td><td>{c.reject}</td><td>{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Sources for every threshold, and the score formula, are in the criteria files on the Data tab. A radio signal
        takes {summary.signal_delay_s.min.toFixed(2)} to {summary.signal_delay_s.max.toFixed(2)} seconds to cross from the Moon to Earth, the same
        from every site, so the delay does not help choose between them.
      </p>

      <div className="prose"><h3>What past landings teach</h3></div>
      <div className="table-scroll">
        <table className="compare wide">
          <thead><tr><th>Mission</th><th>Date</th><th>Outcome</th><th>Lesson</th></tr></thead>
          <tbody>
            {[...missions].reverse().map((m) => (
              <tr key={m.id}>
                <th><a href={m.source_url}>{m.name}</a></th>
                <td>{m.landing_date_utc}</td>
                <td className={m.outcome === "landed" ? "outcome ok" : "outcome"}>{m.outcome}</td>
                <td>{m.lesson}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
