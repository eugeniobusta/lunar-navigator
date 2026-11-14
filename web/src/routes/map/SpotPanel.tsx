// What the landing map says about one spot: where it is, its class and score for what is ticked, the measurements,
// what is good and what is weak (sentences from explain.ts, generated from the values), which NASA limits fail,
// how far the numbers can be trusted, and where to go next.
import type { Explanation } from "../../lib/analysis/explain";
import { strengths, weaknesses } from "../../lib/analysis/explain";
import { RAG_WORD, type Rag } from "../../lib/analysis/rag";
import type { Site } from "../../lib/data";
import { Arrow, Calendar, Compare, Cube, Sky } from "./icons";



export interface Measurement { key: string; label: string; value: string; rag: Rag; ticked: boolean }
export interface Spot {
  lat: number; lon: number;
  /** Zone the spot belongs to (its published number) and its rank for the current ticks, if it is a zone's best cell. */
  zone: { id: number; rank: number; of: number; areaKm2: number; stay: string } | null;
  rag: Rag;
  score: number | null;
  /** Names of the NASA limits that fail here. */
  failed: string[];
  measurements: Measurement[];
  why: Explanation[];
  uncertainty: string[];
  nearest: { site: Site; km: number } | null;
}

interface Props {
  spot: Spot | null;
  nothingTicked: boolean;
  sites: Site[];
  onSky: () => void;
  onWindows: () => void;
  onCompare: (otherId: string) => void;
  xrHref: string | null;
}

const coord = (lat: number, lon: number) => `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(3)}° ${lon < 0 ? "W" : "E"}`;
const first = (text: string) => text.split(". ")[0].replace(/\.$/, "");

export function SpotPanel({ spot, nothingTicked, sites, onSky, onWindows, onCompare, xrHref }: Props) {
  if (!spot) {
    return (
      <div className="spot empty">
        <h2>Pick a spot</h2>
        <p>Click anywhere on the map, or a numbered zone, to see its measurements, what is good and weak there, and what to do next.</p>
      </div>
    );
  }
  const unsafe = spot.failed.length > 0;
  const good = strengths(spot.why), weak = weaknesses(spot.why).filter((e) => !(e.hardLimit && e.verdict === "rejected"));
  return (
    <div className="spot">
      <h2>{coord(spot.lat, spot.lon)}</h2>
      {spot.zone && <p className="sub">Zone {spot.zone.id}: rank {spot.zone.rank.toLocaleString("en-GB")} of {spot.zone.of.toLocaleString("en-GB")} for what you ticked, {spot.zone.areaKm2.toFixed(spot.zone.areaKm2 < 10 ? 2 : 0)} km². {spot.zone.stay}</p>}

      <p className={`verdict-line ${unsafe ? "unsafe" : spot.rag}`}>
        <span className={`cls ${unsafe ? "unsafe" : spot.rag}`} aria-hidden="true" />
        <strong>{unsafe ? "Unsafe" : spot.rag === "grey" ? (nothingTicked ? "Passes every NASA limit" : "No data") : RAG_WORD[spot.rag]}</strong>
        {spot.score !== null && <span className="score">{unsafe ? "would score" : "score"} <b>{spot.score}</b> of 100</span>}
      </p>
      {unsafe
        ? <p className="fails">Fails {spot.failed.length === 1 ? "a NASA limit" : `${spot.failed.length} NASA limits`}: {spot.failed.join("; ")}. Ground that fails a limit is ruled out whatever it scores.</p>
        : <p className="sub">Passes every NASA safety limit.</p>}

      <h3>Measurements</h3>
      <table className="measure">
        <tbody>
          {spot.measurements.map((m) => (
            <tr key={m.key} className={m.ticked ? undefined : "unticked"}>
              <th>{m.label}{m.ticked ? "" : " (not ticked)"}</th>
              <td>{m.value}</td>
              <td><span className={`cls ${m.rag}`} aria-hidden="true" />{RAG_WORD[m.rag].toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {good.length > 0 && (
        <>
          <h3>Good here</h3>
          <ul className="reasons">{good.map((e) => <li key={e.key}><b>{e.label} {e.value}.</b> {first(e.detail)}.</li>)}</ul>
        </>
      )}
      {weak.length > 0 && (
        <>
          <h3>Weak here</h3>
          <ul className="reasons">{weak.map((e) => <li key={e.key}><b>{e.label} {e.value}</b> ({e.verdict === "rejected" ? "scores zero" : "acceptable"}). {first(e.detail)}.</li>)}</ul>
        </>
      )}

      <h3>How sure is this?</h3>
      <ul className="reasons quiet">{spot.uncertainty.map((u) => <li key={u}>{u}</li>)}</ul>

      <h3>Next</h3>
      {spot.nearest ? (
        <>
          <p className="sub">
            Hour-by-hour sky is modelled at listed sites. Nearest: <b>{spot.nearest.site.name}</b>,{" "}
            {spot.nearest.km < 1 ? "at this spot" : `${spot.nearest.km.toFixed(0)} km away`}.
          </p>
          <div className="actions">
            <button onClick={onSky}><Sky />See its sky<Arrow /></button>
            <button onClick={onWindows}><Calendar />Find landing days<Arrow /></button>
            <label className="as-button">
              <Compare /><span>Compare with…</span>
              <select aria-label="Compare with another site" value="" onChange={(e) => { if (e.target.value) onCompare(e.target.value); }}>
                <option value="">choose a site</option>
                {sites.filter((s) => s.id !== spot.nearest!.site.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            {xrHref && <a className="as-button" href={xrHref}><Cube />Stand here in 3D / VR<Arrow /></a>}
          </div>
        </>
      ) : <p className="sub">No modelled site is listed yet.</p>}
    </div>
  );
}
