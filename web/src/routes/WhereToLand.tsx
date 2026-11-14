// Where to land: the suitability map of the south pole, the zones that pass every hard limit, past landings,
// and the criteria as a plain table. Data: web/public/data/suitability/ (docs/INTERFACES.md section 10).
import { useEffect, useMemo, useRef, useState } from "react";
import { useWidth } from "../charts/useWidth";
import { parseCsv } from "../lib/data/csv";
import { useStore } from "../state/store";

const BASE = `${import.meta.env.BASE_URL}data/`;
const GRID = 1024, GRID_HALF_KM = 220, VIEW_HALF_KM = 190; // the score grid, and the part of it the map shows
const R_KM = 1737.4;
const SHOWN_ZONES = 40;

type Row = Record<string, string>;
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

function cssColour(name: string): [number, number, number] {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function drawScore(canvas: HTMLCanvasElement, grid: Uint8Array) {
  const shadow = cssColour("--shadow"), dust = cssColour("--dust"), regolith = cssColour("--regolith");
  const rim = cssColour("--rim"), lichen = cssColour("--lichen");
  const img = new ImageData(GRID, GRID);
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    // Passing ground is green (brighter = higher score); failing ground stays grey; 255 = no data.
    const c = v === 255 ? shadow : v <= 100 ? mix(rim, lichen, 0.35 + 0.65 * (v / 100)) : mix(dust, regolith, 0.05 + 0.4 * ((v - 101) / 100));
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState<Uint8Array | null>(null);
  const [zones, setZones] = useState<Row[]>([]);
  const [criteria, setCriteria] = useState<Row[]>([]);
  const [missions, setMissions] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [rank, setRank] = useState(1);
  const [mapRef, mapPx] = useWidth<HTMLDivElement>(640, 200);

  useEffect(() => {
    const text = (p: string) => fetch(BASE + p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p))));
    Promise.all([
      fetch(`${BASE}suitability/south_pole_score.u8`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("score")))),
      text("suitability/zones.csv"), text("criteria.csv"), text("missions.csv"), text("suitability/summary.json"),
    ]).then(([buf, z, c, m, s]) => {
      setGrid(new Uint8Array(buf)); setZones(parseCsv(z)); setCriteria(parseCsv(c)); setMissions(parseCsv(m));
      setSummary(JSON.parse(s) as Summary);
    }).catch(() => setFailed(true));
  }, []);
  useEffect(() => { if (grid && canvas.current) drawScore(canvas.current, grid); }, [grid]);

  const shown = useMemo(() => zones.slice(0, mapPx < 500 ? SHOWN_ZONES / 2 : SHOWN_ZONES), [zones, mapPx]);
  const zone = zones[rank - 1];
  const artemis = sites.filter((s) => s.group === "artemis");
  const polar = missions.filter((m) => m.lat !== "" && Math.hypot(...toXY(+m.lat, +m.lon)) < VIEW_HALF_KM);
  // SVG user units are km, with y flipped so north-of-chart (lon 0, towards Earth) is up.
  const pt = (lat: number, lon: number) => { const [x, y] = toXY(lat, lon); return { x, y: -y }; };
  const ring84 = 2 * R_KM * Math.tan((6 * Math.PI) / 360);
  // One SVG unit is a kilometre; u converts screen pixels to units so labels and markers keep their size on a phone.
  const u = (2 * VIEW_HALF_KM) / mapPx;
  const font = { fontSize: 11 * u, strokeWidth: 3 * u };

  if (failed) return <section className="panel"><p className="note">The suitability files could not be loaded. They are in web/public/data/suitability/ in the repository.</p></section>;
  if (!grid || !summary || !zone) return <section className="panel"><p className="note">Loading the suitability map…</p></section>;

  const facts: [string, string][] = [
    ["Score", `${zone.score} of 100`],
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
          The best ones are ranked by a 0 to 100 score for sunlight, Earth in view, flat ground, short nights and
          permanent shadow nearby, where ice may be.
        </p>
      </div>

      <div className="land">
        <div className="land-map" ref={mapRef}>
          <canvas ref={canvas} width={880} height={880} aria-hidden="true" />
          <svg viewBox={`${-VIEW_HALF_KM} ${-VIEW_HALF_KM} ${2 * VIEW_HALF_KM} ${2 * VIEW_HALF_KM}`} role="img"
            aria-label="Map of the lunar south pole coloured by landing suitability, with the best zones, the Artemis candidate points and past landings.">
            <circle cx={0} cy={0} r={ring84} className="map-ring" strokeWidth={1.2 * u} strokeDasharray={`${6 * u} ${6 * u}`} />
            <text x={0} y={ring84 - 6 * u} textAnchor="middle" className="map-text" style={font}>6° from the pole</text>
            <text x={0} y={-VIEW_HALF_KM + 13 * u} textAnchor="middle" className="map-text" style={font}>Towards Earth</text>
            <path d={`M${-6 * u} 0H${6 * u}M0 ${-6 * u}V${6 * u}`} className="map-pole" strokeWidth={1.5 * u} />
            <text x={8 * u} y={-6 * u} className="map-text" style={font}>South pole</text>
            {artemis.map((s) => { const p = pt(s.lat, s.lon); return (
              <g key={s.id}><rect x={p.x - 4 * u} y={p.y - 4 * u} width={8 * u} height={8 * u} strokeWidth={1.5 * u} className="map-artemis" transform={`rotate(45 ${p.x} ${p.y})`} /><title>{`Artemis candidate: ${s.name}`}</title></g>
            ); })}
            {shown.map((z) => { const p = pt(+z.lat, +z.lon); const on = +z.rank === rank; return (
              <g key={z.rank} className={on ? "map-zone on" : "map-zone"} role="button" tabIndex={0} aria-label={`Zone ${z.rank}, score ${z.score}`}
                onClick={() => setRank(+z.rank)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRank(+z.rank); } }}>
                <circle cx={p.x} cy={p.y} r={(on ? 9 : 6) * u} strokeWidth={1.5 * u} />
                {(+z.rank <= 10 || on) && <text x={p.x} y={p.y - 10 * u} textAnchor="middle" className="map-text" style={font}>{z.rank}</text>}
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

        <div className="land-side">
          <h3>Zone {zone.rank}: {(-zone.lat).toFixed(2)}° S, {Math.abs(+zone.lon).toFixed(2)}° {+zone.lon < 0 ? "W" : "E"}</h3>
          <p className="note">
            Numbers at the zone's best 120 m square.{" "}
            {zone.stay_window_ok === "True"
              ? `Our own model finds ${days(num(zone, "longest_sun_and_earth_h"))} in a row with Sun and Earth both up, enough for a 6.5-day stay.`
              : `Our own model finds at most ${days(num(zone, "longest_sun_and_earth_h"))} in a row with Sun and Earth both up: not enough for a 6.5-day stay.`}
          </p>
          <table className="compare facts">
            <tbody>{facts.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
          </table>
          <ul className="key">
            <li><span className="swatch ok" />Passes every hard limit (brighter = higher score)</li>
            <li><span className="swatch ground" />Fails at least one</li>
            <li><span className="mark zone" />Best zones (choose one)</li>
            <li><span className="mark artemis" />Artemis candidate point</li>
            <li><span className="mark mission" />Past landing attempt</li>
          </ul>
        </div>
      </div>

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
