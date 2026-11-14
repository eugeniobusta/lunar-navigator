// Site Finder (this file keeps the name LandingMap.tsx: the VR view's tests read its legend wording): the map of the lunar south pole within 6° of the pole, coloured green / amber / red for what is
// ticked, over shaded relief, inside Chinh's page: a sidebar with the choices that folds away, the chosen spot
// beside the map with its score big, then the region at a glance, the ten best zones and the "Why here?" checklist.
// `simple` is the same map and the same scoring for "Plan a landing": presets only, one combined map, the checklist.
// All classes and scores come from web/src/lib/analysis/ (rag.ts, suitability.ts, explain.ts); this file only
// loads the published files, keeps the choices and lays the page out.
// Data: web/public/data/suitability/ and basemap/ (docs/INTERFACES.md sections 10 to 12).
import { useEffect, useMemo, useState } from "react";
import { Donut, HBars, Histogram, type BarRow } from "../components/ui/Charts";
import { WhyHere } from "../components/ui/WhyHere";
import { explainFor, TERM_OF, valuesFromRow, type CriterionRow, type PointValues } from "../lib/analysis/explain";
import { cellAt, latLonToXY, xyToLatLon } from "../lib/analysis/factors";
import type { PaintStyle, RGB } from "../lib/analysis/paint";
import {
  BOUNDS, NO_DATA, byteText, cellValues, classGrid, classRanges, classifyByte, classifyCell, classifyScore, classifyValue,
  legend as legendOf, mapMode, RAG_WORD, type Rag,
} from "../lib/analysis/rag";
import {
  EVERYTHING, LAYER_KEYS, TERM_KEYS, countedTerms, flippedTerms, mapScore, parameter, presetSelection, rankAmong,
  rankZonesFor, sameSelection, selectionWeights, subscore, zoneScore, type LayerKey, type Preset, type Selection, type TermKey,
  type ZoneInput,
} from "../lib/analysis/suitability";
import { parseCsv } from "../lib/data/csv";
import { idxToMs } from "../state/derived";
import { useStore } from "../state/store";
import { LayerPanel } from "./map/LayerPanel";
import { MapView, type FeatureMark, type PlaceMark, type ZoneMark } from "./map/MapView";
import { SpotPanel, type Measurement, type Spot } from "./map/SpotPanel";
import { xrUrl } from "./xr";

const BASE = `${import.meta.env.BASE_URL}data/`;
const SHOWN_ZONES = 25;
type Row = Record<string, string>;
interface WeightsFile {
  layers: { key: LayerKey; label: string }[]; zone_terms: { key: TermKey; label: string }[];
  presets: Preset[]; default: string; confirmed_zones: number;
}
interface Summary {
  region_km2: number; pass_km2: number; pass_pct_of_region: number; zones: number; top20_near_artemis: number;
  artemis_near_km: number; signal_delay_s: { min: number; max: number }; artemis_points_passing: number;
  artemis_regions_with_a_zone: number; fail_pct_of_region: Record<string, number>;
}
interface Feature { name: string; lat: number; lon: number; rank: string; url: string }
interface Basemap { images: { file: string; half_width_m: number }[] }

const days = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`);
const km = (lat: number, lon: number): [number, number] => { const [x, y] = latLonToXY(lat, lon); return [x / 1000, y / 1000]; };
function cssColour(name: string): RGB {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}
const image = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });

/** A zone's own numbers (zones.csv and zones_layers.csv) as values per parameter. */
function zoneValues(zone: Row, extra: Row): PointValues {
  return valuesFromRow({ ...zone, ice_depth_m: extra.ice_depth_m, hollow_depth_m: extra.hollow_depth_m });
}
const VALUE_KEY = Object.fromEntries((Object.keys(TERM_OF) as (keyof PointValues)[]).filter((k) => TERM_OF[k]).map((k) => [TERM_OF[k], k])) as Record<TermKey, keyof PointValues>;

/** The place chosen on the map, for the pages that go on from it (Plan a landing: landing days, battery). */
export interface Place { lat: number; lon: number; name: string; key: string; nearestSiteId: string | null; nearestRegion: string }

export function SiteFinder({ simple = false, onPlace }: { simple?: boolean; onPlace?: (p: Place) => void } = {}) {
  const sites = useStore((s) => s.sites);
  const landPreset = useStore((s) => s.landPreset);
  const landSelection = useStore((s) => s.landSelection);
  const setLandChoice = useStore((s) => s.setLandChoice);
  const mapSpot = useStore((s) => s.mapSpot);
  const setMapSpot = useStore((s) => s.setMapSpot);
  const setSite = useStore((s) => s.setSite);
  const setCompare = useStore((s) => s.setCompare);
  const setTab = useStore((s) => s.setTab);
  const nowMs = useStore((s) => idxToMs(s.startIdx));

  const [zones, setZones] = useState<Row[]>([]);
  const [zoneLayers, setZoneLayers] = useState<Row[]>([]);
  const [criteria, setCriteria] = useState<Row[]>([]);
  const [missions, setMissions] = useState<Row[]>([]);
  const [points, setPoints] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [config, setConfig] = useState<WeightsFile | null>(null);
  const [layers, setLayers] = useState<Uint8Array[] | null>(null);
  const [limits, setLimits] = useState<Uint8Array | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [relief, setRelief] = useState<{ near: HTMLImageElement | null; wide: HTMLImageElement | null; wideHalfKm: number }>({ near: null, wide: null, wideHalfKm: 457.4 });
  const [failed, setFailed] = useState(false);

  const [solo, setSolo] = useState<LayerKey | null>(null);
  const [opacity, setOpacityState] = useState<Record<string, number>>({ combined: 1, limits: 1 });
  const [colourBlind, setColourBlind] = useState(false);
  // The choices: open on a wide screen until a spot is chosen, then folded away (a button brings them back).
  const [side, setSide] = useState(() => !simple && typeof window !== "undefined" && window.innerWidth > 900);
  const [focus, setFocus] = useState<{ x: number; y: number; k: number; nonce: number } | null>(null);
  const [tokens, setTokens] = useState(0); // bumps once the stylesheet's colours can be read

  useEffect(() => {
    const text = (p: string) => fetch(BASE + p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p))));
    const bytes = (p: string) => fetch(BASE + p).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(p)))).then((b) => new Uint8Array(b));
    Promise.all([text("suitability/zones.csv"), text("suitability/zones_layers.csv"), text("criteria.csv"), text("missions.csv"),
      text("suitability/summary.json"), text("suitability/weights.json"), text("suitability/artemis_points.csv")])
      .then(([z, zl, c, m, s, w, ap]) => {
        const file = JSON.parse(w) as WeightsFile;
        // Buttons: the default preset first, the published "NASA-style balance" last.
        const order = (p: Preset) => (p.key === file.default ? 0 : p.key === "balanced" ? 2 : 1);
        setZones(parseCsv(z)); setZoneLayers(parseCsv(zl)); setCriteria(parseCsv(c)); setMissions(parseCsv(m));
        setSummary(JSON.parse(s) as Summary); setConfig({ ...file, presets: [...file.presets].sort((a, b) => order(a) - order(b)) });
        setPoints(parseCsv(ap));
      }).catch(() => setFailed(true));
    Promise.all([...LAYER_KEYS.map((k) => bytes(`suitability/layers/south_pole_${k}.u8`)), bytes("suitability/south_pole_limits.u8")])
      .then((all) => { setLimits(all[LAYER_KEYS.length]); setLayers(all.slice(0, LAYER_KEYS.length)); })
      .catch(() => setFailed(true));
    // The relief and the names are a backdrop: the map still works if they fail to load.
    text("basemap/features.json").then((t) => setFeatures((JSON.parse(t) as { features: Feature[] }).features)).catch(() => undefined);
    text("basemap/basemap.json").then((t) => {
      const b = JSON.parse(t) as Basemap;
      void image(`${BASE}basemap/${b.images[0].file}`).then((near) => setRelief((r) => ({ ...r, near }))).catch(() => undefined);
      void image(`${BASE}basemap/${b.images[1].file}`).then((wide) => setRelief((r) => ({ ...r, wide, wideHalfKm: b.images[1].half_width_m / 1000 }))).catch(() => undefined);
    }).catch(() => undefined);
    setTokens(1);
  }, []);

  // What is ticked: a preset of suitability/weights.json, or ticks set by hand.
  const selection = useMemo<Selection>(() => {
    if (landSelection) return landSelection;
    const preset = config?.presets.find((p) => p.key === landPreset) ?? config?.presets.find((p) => p.key === config.default);
    return preset ? presetSelection(preset) : EVERYTHING;
  }, [landPreset, landSelection, config]);
  const counted = useMemo(() => countedTerms(selection), [selection]);
  const flips = useMemo(() => flippedTerms(selection), [selection]);
  const choose = (next: Selection) => {
    // A hand-set choice that equals a preset is that preset (shorter link, and its button lights up).
    const preset = config?.presets.find((p) => sameSelection(presetSelection(p), next));
    setLandChoice(preset ? preset.key : null, preset ? null : next);
  };
  const labelOf = (k: TermKey) => [...(config?.layers ?? []), ...(config?.zone_terms ?? [])].find((t) => t.key === k)?.label ?? parameter(k).label;

  // What the map draws: one parameter alone if asked, else what the ticks give.
  const soloOn = solo && counted.includes(solo) ? solo : null;
  const shown = useMemo<Selection>(() => (soloOn ? { ticked: [soloOn], flipped: selection.flipped } : selection), [soloOn, selection]);
  const mode = mapMode(shown);
  const showing = mode.kind === "single" ? mode.term : mode.kind;
  const codes = useMemo(() => (layers && limits ? classGrid(layers, limits, shown) : null), [layers, limits, shown]);
  const style = useMemo<PaintStyle>(() => {
    void tokens;
    const c = (plain: string, cb: string) => cssColour(colourBlind ? cb : plain);
    return { red: c("--stop", "--cb-low"), amber: c("--caution", "--cb-mid"), green: c("--go", "--cb-high"), grey: cssColour(colourBlind ? "--void" : "--nodata"),
      opacity: opacity[showing] ?? 1, unsafeOpacity: opacity.limits ?? 1 };
  }, [colourBlind, opacity, showing, tokens]);
  const setOpacity = (key: string, value: number) => setOpacityState((o) => ({ ...o, [key]: value }));

  // Zones scored and ranked for the ticks (always the ticks, also while one parameter is shown alone).
  const zoneInputs = useMemo<ZoneInput[]>(() => (zoneLayers.length !== zones.length ? [] : zones.map((r, i) => ({
    id: +r.rank, q: LAYER_KEYS.map((k) => +zoneLayers[i][k]), darkH: +r.longest_dark_h, noEarthH: +r.longest_no_earth_h,
    stayOk: r.stay_window_ok === "True", areaKm2: +r.area_km2 }))), [zones, zoneLayers]);
  const ranked = useMemo(() => rankZonesFor(zoneInputs, selection), [zoneInputs, selection]);
  const liveOf = useMemo(() => new Map(ranked.map((z) => [z.id, z])), [ranked]);
  const best = ranked[0];
  /** A zone's class: with one parameter ticked, that parameter's own range; otherwise the class of its score. */
  const zoneRag = (id: number, score: number): Rag => {
    if (counted.length !== 1) return counted.length ? classifyScore(score) : "grey";
    // A parameter with a map layer is judged from the zone's layer byte, as the map and the score are; the two
    // terms of our time model are judged from their hours.
    const term = counted[0], layer = (LAYER_KEYS as readonly string[]).indexOf(term);
    if (layer >= 0) return classifyByte(term as LayerKey, +zoneLayers[id - 1][term], 0, flips.includes(term));
    return classifyValue(term, zoneValues(zones[id - 1], zoneLayers[id - 1])[VALUE_KEY[term]], flips.includes(term));
  };
  const zoneMarks = useMemo<ZoneMark[]>(() => ranked.slice(0, SHOWN_ZONES).map((z) => {
    const row = zones[z.id - 1], [x, y] = km(+row.lat, +row.lon);
    return { id: z.id, rank: z.rank, x, y, score: z.score, rag: zoneRag(z.id, z.score) };
  }), [ranked, zones, zoneLayers, counted, flips]); // eslint-disable-line react-hooks/exhaustive-deps

  const artemisMarks = useMemo<PlaceMark[]>(() => sites.filter((s) => s.group === "artemis").map((s) => { const [x, y] = km(s.lat, s.lon); return { id: s.id, name: s.name, x, y }; }), [sites]);
  const missionMarks = useMemo<PlaceMark[]>(() => missions.filter((m) => m.lat !== "" && +m.lat < -80).map((m) => { const [x, y] = km(+m.lat, +m.lon); return { id: m.id, name: m.name, x, y, ok: m.outcome === "landed" }; }), [missions]);
  const featureMarks = useMemo<FeatureMark[]>(() => features.map((f) => { const [x, y] = km(f.lat, f.lon); return { name: f.name, x, y, major: f.rank === "major" }; }), [features]);

  // The spot the panel is about: the one clicked, or the best zone for the ticks until something is clicked.
  const bestRow0 = best ? zones[best.id - 1] : undefined;
  const shownSpot = useMemo<[number, number] | null>(() => mapSpot ?? (bestRow0 && counted.length ? [+bestRow0.lat, +bestRow0.lon] : null), [mapSpot, bestRow0, counted.length]);
  const spotCell = shownSpot ? cellAt(...latLonToXY(shownSpot[0], shownSpot[1])) : -1;
  // A spot in the map cell that holds a zone's best 120 m square is that zone (the best-ranked one, if several).
  const zoneOfCell = useMemo(() => {
    const m = new Map<number, number>();
    zones.forEach((z, i) => { const c = cellAt(...latLonToXY(+z.lat, +z.lon)); if (!m.has(c)) m.set(c, i + 1); });
    return m;
  }, [zones]);
  const spotZone = spotCell >= 0 ? zoneOfCell.get(spotCell) ?? null : null;
  const spot = useMemo<Spot | null>(() => {
    if (!shownSpot || spotCell < 0 || !layers || !limits || !config || limits[spotCell] === NO_DATA) return null;
    const [lat, lon] = shownSpot;
    const q = layers.map((l) => l[spotCell]), bits = limits[spotCell];
    const cell = classifyCell(q, bits, selection);
    let nearest: Spot["nearest"] = null;
    const [px, py] = latLonToXY(lat, lon);
    for (const s of sites.filter((x) => x.terrain === "dem")) {
      const [x, y] = latLonToXY(s.lat, s.lon), d = Math.hypot(x - px, y - py) / 1000;
      if (!nearest || d < nearest.km) nearest = { site: s, km: d };
    }
    const base = ["This map pixel is about 430 m across and shows its best 120 m square.",
      "Sunlight and Earth in view are NASA's long-run averages, not the dates of a mission. Temperature and ice depth are a thermal model on a 0.5 km mesh.",
      "The 120 m elevation map cannot see boulders or craters smaller than that: a good spot here is worth a closer look, not proven safe."];
    if (spotZone) {
      // A zone's best cell: the zone's own published numbers, with our hour-by-hour model's two terms.
      const row = zones[spotZone - 1], extra = zoneLayers[spotZone - 1], live = liveOf.get(spotZone)!;
      const values = zoneValues(row, extra);
      const why = explainFor(values, criteria as unknown as CriterionRow[], counted, flips);
      const all = explainFor(values, criteria as unknown as CriterionRow[], TERM_KEYS, flips);
      const measurements: Measurement[] = TERM_KEYS.map((k) => {
        const e = all.find((x) => x.key === VALUE_KEY[k]);
        return { key: k, label: labelOf(k), value: e?.value ?? "no data", ticked: counted.includes(k), rag: classifyValue(k, values[VALUE_KEY[k]], flips.includes(k)) };
      });
      const sunEarth = +row.longest_sun_and_earth_h;
      return { lat, lon, rag: zoneRag(spotZone, live.score), score: counted.length ? live.score : null, failed: [], measurements, why, nearest,
        zone: { id: spotZone, rank: live.rank, of: zones.length, areaKm2: +row.area_km2,
          stay: row.stay_window_ok === "True" ? `Our model finds ${days(sunEarth)} in a row with Sun and Earth both up: enough for a 6.5-day stay.` : `Our model finds at most ${days(sunEarth)} in a row with Sun and Earth both up: not enough for a 6.5-day stay.` },
        uncertainty: ["Numbers at the zone's best 120 m square, as published in zones.csv. The score here includes the longest night and the longest time without Earth from our hour-by-hour model (2026 to 2029).", ...base.slice(1)] };
    }
    const values = cellValues(q, bits, lat);
    const layerTerms = counted.filter((k): k is LayerKey => (LAYER_KEYS as readonly string[]).includes(k));
    const why = explainFor(values, criteria as unknown as CriterionRow[], layerTerms, flips)
      .map((e) => { const t = TERM_OF[e.key] as LayerKey | null; return t ? { ...e, value: byteText(t, q[LAYER_KEYS.indexOf(t)], bits) } : e; });
    const measurements: Measurement[] = LAYER_KEYS.map((k, i) => ({ key: k, label: labelOf(k), value: byteText(k, q[i], bits), ticked: counted.includes(k),
      rag: classifyByte(k, q[i], bits, flips.includes(k)) }));
    return { lat, lon, zone: null, rag: cell.under ?? "grey", score: cell.score, failed: cell.failed, measurements, why, nearest,
      uncertainty: [base[0], "Values are read back from the map layers: exact to 0.4 % of each parameter's range, and shown as a range at either end.",
        "The longest night and the longest time without Earth come from our hour-by-hour model. They are computed at zone centres and listed sites, not at every point, so they are not part of this spot's score.",
        ...base.slice(1)] };
  }, [shownSpot, spotCell, spotZone, layers, limits, config, selection, counted, flips, zones, zoneLayers, liveOf, criteria, sites]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickAt = (xKm: number, yKm: number) => {
    const cell = cellAt(xKm * 1000, yKm * 1000);
    if (cell < 0 || !limits || limits[cell] === NO_DATA) return;
    const [lat, lon] = xyToLatLon(xKm * 1000, yKm * 1000);
    setMapSpot([+lat.toFixed(4), +lon.toFixed(4)]);
    setSide(false);
  };
  const pickZone = (id: number, fly = false) => {
    const z = zones[id - 1];
    setMapSpot([+z.lat, +z.lon]);
    setSide(false);
    if (fly) { const [x, y] = km(+z.lat, +z.lon); setFocus({ x, y, k: 3, nonce: Date.now() }); }
  };
  const describe = (xKm: number, yKm: number): string | null => {
    const cell = cellAt(xKm * 1000, yKm * 1000);
    if (cell < 0 || !layers || !limits) return null;
    if (limits[cell] === NO_DATA) return "No data";
    const q = layers.map((l) => l[cell]), c = classifyCell(q, limits[cell], shown);
    const value = mode.kind === "single" ? `${labelOf(mode.term)} ${byteText(mode.term, q[LAYER_KEYS.indexOf(mode.term)], limits[cell])}` : c.score !== null ? `score ${c.score}` : "";
    if (c.unsafe) return `${c.unsafe.replace("unsafe", "Unsafe")}${value ? ` (${value})` : ""}`;
    return c.under ? `${RAG_WORD[c.under]}: ${value}` : "Passes every NASA limit";
  };

  // Where the nine Artemis points would stand among the confirmed zones, under each preset and under the ticks.
  const artemisRanks = useMemo(() => {
    if (!config || !zoneInputs.length) return [];
    const confirmed = zoneInputs.filter((z) => z.stayOk);
    const columns = [...config.presets.map((p) => p.weights), selectionWeights(selection)].map((w, col) => {
      const sel = col === config.presets.length ? selection : null;
      const bytes = (q: number[]) => (sel && flips.length ? LAYER_KEYS.map((k, i) => (flips.includes(k) ? 255 - q[i] : q[i])) : q);
      const zoneScores = confirmed.map((z) => zoneScore(mapScore(bytes(Array.from(z.q)), w), z.darkH, z.noEarthH, w));
      return points.map((pt) => {
        const score = zoneScore(mapScore(bytes(LAYER_KEYS.map((k) => +pt[k])), w), +pt.longest_dark_h, +pt.longest_no_earth_h, w);
        return { score, rank: rankAmong(score, zoneScores) };
      });
    });
    return points.map((pt, i) => ({ pt, cells: columns.map((c) => c[i]) }));
  }, [config, zoneInputs, points, selection, flips]);

  // Tell the page around us which place is chosen (Plan a landing searches landing days there).
  const placeKey = spot ? `${spot.lat},${spot.lon}` : "";
  useEffect(() => {
    if (!onPlace || !spot) return;
    const zoneRow = spot.zone ? zones[spot.zone.id - 1] : null;
    onPlace({ lat: spot.lat, lon: spot.lon, key: placeKey, name: spot.zone ? `zone ${spot.zone.id}` : "your spot",
      nearestSiteId: spot.nearest?.site.id ?? null, nearestRegion: zoneRow?.nearest_artemis_region ?? spot.nearest?.site.name ?? "" });
  }, [placeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <section className="panel"><p className="note">The suitability files could not be loaded. They are in web/public/data/suitability/ in the repository.</p></section>;
  if (!summary || !config || !best) return <section className="panel"><p className="note">Loading the landing map…</p></section>;

  const lg = legendOf(shown);
  const cls = (name: "green" | "amber" | "red") => `cls ${name}`;
  const what = mode.kind === "single" ? `${labelOf(mode.term)} alone` : mode.kind === "combined"
    ? (counted.length === TERM_KEYS.length ? "Combined score of all ten parameters" : `Combined score of ${counted.filter((k) => (LAYER_KEYS as readonly string[]).includes(k)).map(labelOf).join(" + ")}`)
    : "NASA safety limits only";
  const bestRow = zones[best.id - 1];
  const bestRag = zoneRag(best.id, best.score);
  const spotXY = shownSpot ? km(shownSpot[0], shownSpot[1]) : null;
  const goSite = (tab: "overview" | "windows") => { if (spot?.nearest) { setSite(spot.nearest.site.id); setTab(tab); window.scrollTo({ top: 0 }); } };
  const ragColour = (r: Rag) => `var(${r === "green" ? "--go" : r === "amber" ? "--caution" : r === "red" ? "--stop" : "--nodata"})`;
  const unsafe = !!spot && spot.failed.length > 0;
  const zoneRow = spot?.zone ? zones[spot.zone.id - 1] : null;
  // The chosen spot, parameter by parameter: 0 at the reject bound, 100 at the ideal; unticked ones are faint.
  const spotBars: BarRow[] = spot && spotCell >= 0 && layers ? TERM_KEYS.filter((k) => (LAYER_KEYS as readonly string[]).includes(k) || zoneRow).map((k) => {
    const li = (LAYER_KEYS as readonly string[]).indexOf(k), m = spot.measurements.find((x) => x.key === k);
    const zl = spot.zone ? zoneLayers[spot.zone.id - 1] : null;
    let v = li >= 0 ? (zl ? +zl[k] : layers[li][spotCell]) / 255 : subscore(k === "darkness" ? +zoneRow!.longest_dark_h : +zoneRow!.longest_no_earth_h, BOUNDS[k].reject, BOUNDS[k].ideal);
    if (flips.includes(k)) v = 1 - v;
    const pct = Math.round(v * 100);
    return { key: k, label: labelOf(k), value: pct, text: `${pct}`, colour: ragColour(m?.rag ?? "grey"), faint: !counted.includes(k) };
  }) : [];
  // Why ground fails, as a share of the whole region; one square can fail several limits.
  const failNames: Record<string, string> = { landing_slope: "Slope of 10° or more", eva_slope: "Too little walkable ground", sunlight: "Too little sunlight", earth: "Earth in view too rarely" };
  const failBars: BarRow[] = Object.entries(summary.fail_pct_of_region).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: failNames[k] ?? k, value: v, text: `${v} %`, colour: "var(--stop)" }));
  const answer = (
    <p className="answer" role="status">
      <strong>{summary.pass_pct_of_region}% of the ground within 6° of the pole passes every NASA Artemis III limit.</strong>{" "}
      {colourBlind ? `Yellow is good, grey acceptable, dark blue poor for what you ${simple ? "choose" : "tick"}; hatched is unsafe.` : `Green is good, amber acceptable, red poor for what you ${simple ? "choose" : "tick"}; hatched red is unsafe.`}{" "}
      {counted.length > 0 && <>Best zone now: <button className="link" onClick={() => pickZone(best.id, true)}>zone {best.id}</button>, score {best.score} ({RAG_WORD[bestRag].toLowerCase()}), at {(-bestRow.lat).toFixed(2)}° S, {Math.abs(+bestRow.lon).toFixed(2)}° {+bestRow.lon < 0 ? "W" : "E"}.</>}
    </p>
  );
  const map = (
    <div className="map-col">
      <MapView relief={relief.near} reliefWide={relief.wide} wideHalfKm={relief.wideHalfKm} codes={codes} style={style}
        zones={zoneMarks} selectedZone={spotZone} onZone={(id) => pickZone(id)} artemis={artemisMarks} missions={missionMarks}
        features={featureMarks} pick={spotXY} onPick={pickAt} describe={describe} focus={focus}
        label="Map of the lunar south pole within 6 degrees of the pole, coloured by landing suitability. Drag to move, scroll or pinch to zoom, click a spot for its numbers." />
      {!codes && <p className="map-loading" role="status">Loading the map layers…</p>}
      <div className="map-legend" aria-label="Legend">
        <p className="legend-title">On the map: <strong>{what}</strong>
          {soloOn && <button className="link" onClick={() => setSolo(null)}>Back to the combined map</button>}
        </p>
        <ul>
          {mode.kind !== "limits" ? (
            <>
              <li><span className={cls("green")} />{colourBlind ? "Yellow" : "Green"}, good: {lg.green}</li>
              <li><span className={cls("amber")} />{colourBlind ? "Grey" : "Amber"}, acceptable: {lg.amber}</li>
              <li><span className={cls("red")} />{colourBlind ? "Dark blue" : "Red"}, poor: {lg.red}</li>
            </>
          ) : <li>Clear ground passes every NASA limit. Tick a parameter to score it.</li>}
          <li><span className="cls unsafe" />Hatched: unsafe, fails a NASA limit</li>
          <li><span className="cls grey" />{colourBlind ? "Black" : "Grey"}: no data</li>
          <li>Beyond the 84° S circle: more than 6° from the pole, outside NASA's limit</li>
          <li><span className="key-mark zone" />Best zones (rank)</li>
          <li><span className="key-mark artemis" />Artemis candidate</li>
          <li><span className="key-mark mission" />Past landing</li>
        </ul>
        <p className="legend-foot">
          <label className="check"><input type="checkbox" checked={colourBlind} onChange={(e) => setColourBlind(e.target.checked)} /><span>Colour-blind palette</span></label>
          <span>Relief: shading of NASA's LOLA elevation map, not real sunlight. Names: IAU Gazetteer of Planetary Nomenclature.</span>
        </p>
      </div>
    </div>
  );
  /** The headline of the chosen spot, in Chinh's style: the score big, in the colour of its class. */
  const headline = spot && (
    <>
      <h3 className="spot-title">{spot.zone ? `Rank ${spot.zone.rank.toLocaleString("en-GB")}: zone ${spot.zone.id}` : "Your spot"}{!mapSpot && spot.zone ? " (the best for your choice)" : ""}</h3>
      <div className={`score-big ${unsafe ? "unsafe" : spot.rag}`}>
        <b>{spot.score ?? "–"}</b>
        <span>{spot.score === null ? "nothing ticked" : unsafe ? "of 100 if it were safe" : "of 100 for your choice"}</span>
      </div>
    </>
  );
  const whyList = spot ? spot.why : [];

  if (simple) {
    return (
      <section className={colourBlind ? "panel finder-page landing cb simple" : "panel finder-page landing simple"}>
        <div className="presets big" role="group" aria-label="What matters most for your mission">
          {config.presets.map((p) => {
            const on = sameSelection(presetSelection(p), selection);
            return <button key={p.key} className={on ? "chip on" : "chip"} aria-pressed={on} onClick={() => setLandChoice(p.key, null)}>{p.label}</button>;
          })}
        </div>
        {answer}
        <div className="land">
          {map}
          <div className="land-side">
            {spot ? (
              <>
                {headline}
                <p className={`verdict-line ${unsafe ? "unsafe" : spot.rag}`}>
                  <span className={`cls ${unsafe ? "unsafe" : spot.rag}`} aria-hidden="true" />
                  <strong>{unsafe ? "Unsafe" : RAG_WORD[spot.rag]}</strong>
                  <span className="score">{Math.abs(spot.lat).toFixed(3)}° S, {Math.abs(spot.lon).toFixed(3)}° {spot.lon < 0 ? "W" : "E"}</span>
                </p>
                {unsafe
                  ? <p className="fails">Fails {spot.failed.length === 1 ? "a NASA limit" : `${spot.failed.length} NASA limits`}: {spot.failed.join("; ")}. Ground that fails a limit is ruled out whatever it scores.</p>
                  : <p className="note">Passes every NASA safety limit.{spot.zone ? ` ${spot.zone.stay}` : ""}</p>}
                <div className="step-actions two">
                  <button className="btn-outline small" onClick={() => goSite("overview")} disabled={!spot.nearest}>See its sky</button>
                  {spot.nearest && <a className="btn-outline small" href={xrUrl(spot.nearest.site.id, nowMs, false, [spot.lat, spot.lon])}>Stand here in VR</a>}
                </div>
                {spot.nearest && <p className="note">The sky is modelled at listed sites. Nearest: {spot.nearest.site.name}, {spot.nearest.km < 1 ? "at this spot" : `${spot.nearest.km.toFixed(0)} km away`}.</p>}
              </>
            ) : <p className="note">Click anywhere on the map, or a numbered circle, to check that spot.</p>}
          </div>
        </div>
        {spot && <WhyHere title={`Why here? ${spot.zone ? `Zone ${spot.zone.id}` : "Your spot"} against what matters for this mission`} list={whyList} />}
      </section>
    );
  }

  const sideToggle = (
    <button type="button" className={side ? "side-toggle on" : "side-toggle"} aria-expanded={side} aria-controls="finder-side"
      aria-label="What matters for your mission?" onClick={() => setSide(!side)}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <span>What matters?</span>
    </button>
  );

  return (
    <section className={colourBlind ? "panel finder-page landing cb" : "panel finder-page landing"}>
      <div className={side ? "finder" : "finder closed"}>
        <aside id="finder-side" className="finder-side" hidden={!side} aria-label="What matters for your mission?">
          <div className="side-head">
            <h2>What matters for your mission?</h2>
            <button type="button" className="side-close" aria-label="Hide the choices" onClick={() => setSide(false)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <LayerPanel presets={config.presets} selection={selection} choose={choose} choosePreset={(key) => setLandChoice(key, null)}
            labelOf={labelOf} solo={soloOn} setSolo={setSolo} opacity={opacity} setOpacity={setOpacity} showing={showing} />
        </aside>

        <div className="finder-main">
          <div className="finder-bar">
            {!side && sideToggle}
            {answer}
          </div>
          <div className="land">
            {map}
            <div className="land-side">
              {spot ? (
                <>
                  {headline}
                  {zoneRow && (
                    <div className="tiles">
                      <div><b className="sun">{(+zoneRow.sun_pct).toFixed(0)}%</b><span>Sunlight, long-run</span></div>
                      <div><b className="earth">{(+zoneRow.earth_pct).toFixed(0)}%</b><span>Earth in view</span></div>
                      <div><b>{days(+zoneRow.longest_dark_h)}</b><span>Longest darkness</span></div>
                      <div><b>{zoneRow.landing_slope_deg}°</b><span>Landing slope</span></div>
                    </div>
                  )}
                  <h4 className="mini-title">Parameter by parameter (0 to 100)</h4>
                  <HBars rows={spotBars} label="The chosen spot, each parameter scored 0 to 100" />
                  <SpotPanel spot={spot} nothingTicked={counted.length === 0} sites={sites} onSky={() => goSite("overview")} onWindows={() => goSite("windows")}
                    onCompare={(other) => { if (spot?.nearest) { setSite(spot.nearest.site.id); setCompare(other); setTab("compare"); window.scrollTo({ top: 0 }); } }}
                    xrHref={spot?.nearest ? xrUrl(spot.nearest.site.id, nowMs, false, [spot.lat, spot.lon]) : null} />
                </>
              ) : <SpotPanel spot={null} nothingTicked={counted.length === 0} sites={sites} onSky={() => undefined} onWindows={() => undefined} onCompare={() => undefined} xrHref={null} />}
            </div>
          </div>
        </div>
      </div>

      <section className="glance" aria-label="The south pole at a glance">
        <div className="card">
          <h3>How much ground passes</h3>
          <Donut label={`${summary.pass_pct_of_region}% of the ground within 6° of the pole passes every NASA limit`}
            centre={`${summary.pass_pct_of_region}%`} sub="passes"
            parts={[
              { label: "Passes every NASA limit", value: summary.pass_km2, colour: "var(--bone)", detail: `${summary.pass_km2.toLocaleString("en-GB")} km²` },
              { label: "Fails at least one (hatched)", value: summary.region_km2 - summary.pass_km2, colour: "var(--stop)",
                detail: `${(summary.region_km2 - summary.pass_km2).toLocaleString("en-GB")} km²` },
            ]} />
        </div>
        <div className="card">
          <h3>Why the rest fails</h3>
          <HBars rows={failBars} label="Share of the ground that fails each NASA limit" />
          <p className="note">Share of all the ground within 6° of the pole. One square can fail more than one limit.</p>
        </div>
        <div className="card">
          <h3>Zone scores for your choice</h3>
          {counted.length ? (
            <>
              <Histogram values={ranked.map((r) => r.score)} mark={best.score} colour={ragColour(bestRag)}
                label={`How the ${zones.length} zones score for your choice; the best scores ${best.score}`} />
              <p className="note">{zones.length.toLocaleString("en-GB")} zones by score; the brighter bar holds the best, zone {best.id} ({best.score}). Green starts at 70, amber at 40.</p>
            </>
          ) : <p className="note">Tick something to score the zones.</p>}
        </div>
      </section>

      {counted.length > 0 ? (
        <>
          <h3 className="section-title">The ten best for your choice</h3>
          <p className="note">A zone is a connected area where every NASA limit passes; zones whose 6.5-day stay our model confirms come first.</p>
          <div className="table-scroll zones-list">
            <table className="compare wide ranked">
              <thead><tr><th>Rank</th><th>Zone</th><th>Where</th><th>Score</th><th>Area</th><th>Nearest Artemis region</th></tr></thead>
              <tbody>
                {ranked.slice(0, 10).map((r) => { const z = zones[r.id - 1], rag = zoneRag(r.id, r.score); return (
                  <tr key={r.id} className={r.id === spotZone ? "on" : undefined}>
                    <td>{r.rank}</td>
                    <th><button className="link" onClick={() => pickZone(r.id, true)} aria-label={`Zone ${r.id}`}>{r.id}</button></th>
                    <td>{(-z.lat).toFixed(2)}° S, {Math.abs(+z.lon).toFixed(2)}° {+z.lon < 0 ? "W" : "E"}</td>
                    <td><span className="bar" aria-hidden="true"><span style={{ width: `${r.score}%`, background: ragColour(rag) }} /></span> {r.score} <span className="sr">{RAG_WORD[rag]}</span></td>
                    <td>{(+z.area_km2).toFixed(+z.area_km2 < 10 ? 2 : 0)} km²</td>
                    <td>{z.nearest_artemis_region}, {z.nearest_artemis_km} km</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="note zones-list">Nothing is ticked, so nothing is ranked. The map shows where the NASA limits pass: {zones.length.toLocaleString("en-GB")} zones.</p>}

      {spot && <WhyHere title={`Why here? ${spot.zone ? `Zone ${spot.zone.id}` : "Your spot"} against what you ticked`} list={whyList} />}

      <details className="fold">
        <summary>Where the nine Artemis candidate points rank</summary>
        <p className="note">
          Not as our top picks: {summary.top20_near_artemis} of our top 20 zones under NASA-style balance {summary.top20_near_artemis === 1 ? "lies" : "lie"} inside
          or within 5 km of an Artemis candidate region. But {summary.artemis_points_passing} of the 9 candidate points pass every limit where
          they stand, and {summary.artemis_regions_with_a_zone} of the 9 have a passing zone within {summary.artemis_near_km} km. We rank single
          120 m squares; the Artemis regions are about 15 km across and were also chosen for science goals and launch windows.
          Below: each point scored like a zone and placed among the {config.confirmed_zones.toLocaleString("en-GB")} zones with a
          confirmed 6.5-day window: rank, then score in brackets.
        </p>
        <div className="table-scroll">
          <table className="compare wide">
            <thead><tr><th>Artemis point</th>{config.presets.map((p) => <th key={p.key}>{p.label}</th>)}<th>Your ticks</th></tr></thead>
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
      </details>
      <details className="fold">
        <summary>The criteria: what is good, acceptable and rejected, and why</summary>
        <div className="table-scroll">
          <table className="compare wide">
            <thead><tr><th>What</th><th>Good</th><th>Acceptable</th><th>Rejected</th><th>Why it matters</th></tr></thead>
            <tbody>
              {criteria.map((c) => (
                <tr key={`${c.parameter} ${c.kind}`}>
                  <th>{c.parameter}{c.kind === "hard" ? " (NASA limit)" : c.kind === "reported" ? " (reported only)" : ""}<span className="unit">{c.unit}</span></th>
                  <td>{c.ideal}</td><td>{c.acceptable}</td><td>{c.reject}</td><td>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Several parameters together: the weighted score, then green from 70, amber from 40, red below ({classRanges("sunlight").green} is green for sunlight alone, and so on for each).
          Sources for every threshold are in the criteria files on the Data &amp; Method page. A radio signal takes {summary.signal_delay_s.min.toFixed(2)} to{" "}
          {summary.signal_delay_s.max.toFixed(2)} seconds to cross from the Moon to Earth, the same from every site, so the delay does not help choose between them.
        </p>
      </details>
      <details className="fold">
        <summary>What past landings teach</summary>
        <div className="table-scroll">
          <table className="compare wide">
            <thead><tr><th>Mission</th><th>Date</th><th>Outcome</th><th>Lesson</th></tr></thead>
            <tbody>
              {[...missions].reverse().map((m) => (
                <tr key={m.id}>
                  <th><a href={m.source_url}>{m.name}</a></th><td>{m.landing_date_utc}</td>
                  <td className={m.outcome === "landed" ? "outcome ok" : "outcome"}>{m.outcome}</td><td>{m.lesson}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
