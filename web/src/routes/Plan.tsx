// Plan a landing, in three plain steps: where is it safe (Site Finder), when can you land there (Window Finder, on the
// skyline computed at the chosen zone itself), and will the batteries last the night (a one-line Battery check on the
// first good landing). Holds what used to be Site Finder, Window Finder and Battery.
import { useCallback, useEffect, useMemo, useState } from "react";
import { NumberField } from "../components/ui";
import { computeSeries, type Horizon } from "../lib/analysis";
import { demHorizon, parseHeightGrid, stereoXY, heightAt, type HeightGrid, type HeightGridMeta } from "../lib/analysis/demHorizon";
import { simulatePower, type PowerConfig } from "../lib/power";
import { fmtDate, fmtHours, idxToMs } from "../state/derived";
import { useStore } from "../state/store";
import { Step } from "./Explore";
import { WhereToLand } from "./WhereToLand";
import { Windows, type FirstLanding } from "./Windows";

const BASE = `${import.meta.env.BASE_URL}data/`;
const getJson = <T,>(p: string) => fetch(BASE + p).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(p))));
const getBytes = (p: string) => fetch(BASE + p).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(p))));

// The terrain grids, loaded once: the south pole at ~430 m, and the 120 m tile around each Artemis site.
let poleP: Promise<HeightGrid> | null = null;
const loadPole = () => (poleP ??= Promise.all([getJson<HeightGridMeta>("terrain/south_pole.json"), getBytes("terrain/south_pole_height.u16")])
  .then(([m, b]) => parseHeightGrid(m, b)));
const tiles = new Map<string, Promise<{ grid: HeightGrid; far: HeightGrid }>>();
function loadTile(siteId: string) {
  if (!tiles.has(siteId)) {
    const dir = `terrain/sites/${siteId}/`;
    tiles.set(siteId, getJson<HeightGridMeta & { far: HeightGridMeta; files: Record<string, string> }>(dir + "tile.json")
      .then((m) => Promise.all([getBytes(dir + m.files.height), getBytes(dir + m.files.far)])
        .then(([h, f]) => ({ grid: parseHeightGrid(m, h), far: parseHeightGrid(m.far, f) }))));
  }
  return tiles.get(siteId)!;
}

/** The skyline at the chosen zone: from the 120 m tile of the nearest Artemis site where it covers the zone, else from
 *  the south-pole grid; the same computation as the 3D view (lib/analysis/demHorizon.ts). */
function useZoneHorizon(zone: Record<string, string> | null, siteId: string | undefined): Horizon | null {
  const [hz, setHz] = useState<{ key: string; value: Horizon } | null>(null);
  const key = zone ? `${zone.rank}` : "";
  useEffect(() => {
    if (!zone) return;
    let live = true;
    const lat = +zone.lat, lon = +zone.lon;
    Promise.all([loadPole(), siteId ? loadTile(siteId).catch(() => null) : Promise.resolve(null)]).then(([pole, tile]) => {
      const [x, y] = stereoXY(lat, lon);
      const inTile = tile && !Number.isNaN(heightAt(tile.grid, x, y));
      const value = inTile ? demHorizon(tile!.grid, [pole, tile!.far], lat, lon) : demHorizon(pole, [pole], lat, lon);
      if (live) setHz({ key, value });
    }).catch(() => { /* step 2 then says it could not load */ });
    return () => { live = false; };
  }, [key, siteId]); // eslint-disable-line react-hooks/exhaustive-deps
  return hz && hz.key === key ? hz.value : null;
}

const kWh = (wh: number) => `${(wh / 1000).toLocaleString("en-GB", { maximumFractionDigits: wh < 10000 ? 1 : 0 })} kWh`;

function BatteryCheck({ horizon, place, landing }: { horizon: Horizon | null; place: string; landing: FirstLanding | null }) {
  const eph = useStore((s) => s.eph);
  const [cfg, setCfg] = useState<PowerConfig>({ mode: "vertical_tracking", panelAzDeg: 0, areaM2: 3,
    efficiency: 0.28, batteryWh: 4000, loadW: 200, initialSocPct: 100 });
  const res = useMemo(() => {
    if (!eph || !horizon || !landing) return null;
    const steps = Math.round((landing.durationH * 3600) / eph.stepS);
    return simulatePower(computeSeries(eph, horizon, landing.startIdx, landing.startIdx + steps), cfg, eph.stepS);
  }, [eph, horizon, landing, cfg]);
  if (!landing) return <p className="note">Find a landing day first (step 2): none was found in the months searched.</p>;
  if (!res) return <p className="note">Working it out…</p>;
  const days = Math.round((landing.durationH / 24) * 10) / 10;
  return (
    <>
      <p className="verdict">
        Landing at {place} on {fmtDate(idxToMs(landing.startIdx))} for {days} days:{" "}
        {res.batteryNeededWh < 1
          ? <span className="good-text">the Sun never sets during the stay, so the battery is barely needed. Choosing the right day is what keeps a lander alive.</span>
          : res.survived
          ? <span className="good-text">a {kWh(cfg.batteryWh)} battery lasts the whole stay.</span>
          : <span className="bad-text">a {kWh(cfg.batteryWh)} battery runs out, leaving {fmtHours(res.hoursBelowZero)} without power.</span>}
      </p>
      <div className="vitals">
        <div className={res.survived ? "good" : "bad"}><b>{res.survived ? "Survives" : "Runs out"}</b><span>with a <strong>{kWh(cfg.batteryWh)}</strong> battery</span><small>About the battery of a small electric scooter.</small></div>
        <div><b>{res.batteryNeededWh < 1 ? "None" : kWh(Math.ceil(res.batteryNeededWh))}</b><span>battery <strong>needed</strong> to never run out</span><small>For the {cfg.loadW} W the lander uses all the time.</small></div>
        <div className="sun"><b>{kWh(res.energyGenWh)}</b><span>made by the <strong>solar panels</strong></span><small>{cfg.areaM2} m² of panels that turn to face the Sun.</small></div>
      </div>
      <details className="fold small">
        <summary>Try another battery</summary>
        <div className="controls">
          <NumberField label="Battery" unit="Wh" value={cfg.batteryWh} min={10} step={500} onChange={(v) => setCfg({ ...cfg, batteryWh: v })} />
          <NumberField label="Power the lander uses" unit="W" value={cfg.loadW} min={1} step={10} onChange={(v) => setCfg({ ...cfg, loadW: v })} />
          <NumberField label="Solar panel area" unit="m²" value={cfg.areaM2} min={0.1} step={0.5} onChange={(v) => setCfg({ ...cfg, areaM2: v })} />
        </div>
      </details>
    </>
  );
}

export function Plan() {
  const sites = useStore((s) => s.sites);
  const [zone, setZone] = useState<Record<string, string> | null>(null);
  const [landing, setLanding] = useState<FirstLanding | null>(null);
  const onZone = useCallback((z: Record<string, string>) => setZone((old) => (old?.rank === z.rank ? old : z)), []);
  const onResult = useCallback((r: FirstLanding | null) => setLanding(r), []);
  const near = zone ? sites.find((s) => s.group === "artemis" && s.name === zone.nearest_artemis_region) : undefined;
  const horizon = useZoneHorizon(zone, near?.id);
  const place = zone ? `zone #${zone.rank}` : "";
  const placeProp = useMemo(() => (horizon && zone ? { horizon, name: place, key: `zone-${zone.rank}` } : undefined), [horizon, zone, place]);

  return (
    <div className="steps">
      <Step n={1} question="Where is it safe to land?"
        hint={<>We checked every 120 m square near the south pole against NASA's safety rules for Artemis: flat enough to land, close enough to the pole, and enough sunlight and contact with Earth. <strong>Green ground passes.</strong> Choose what matters most for your mission; the numbered circles are the best places for it, and a click shows one.</>}>
        <WhereToLand compact onZone={onZone} />
      </Step>

      <Step n={2} question="When can you land there?"
        hint={<>{zone ? <>We worked out the real skyline around <strong>{place}</strong> (near {zone.nearest_artemis_region}) from NASA's terrain map. </> : null}Then we check every day of the next 12 months, hour by hour, for a landing time when the Sun and Earth stay up long enough for the whole mission. <strong>Green days work.</strong></>}>
        {placeProp ? <Windows place={placeProp} compact onResult={onResult} /> : <p className="note">Working out the skyline at your zone…</p>}
      </Step>

      <Step n={3} question="Will the batteries last the night?"
        hint="When the Sun drops behind the hills, the lander runs on its batteries until it comes back. Here is the first good landing from step 2, with a typical small lander.">
        <BatteryCheck horizon={horizon} place={place} landing={landing} />
      </Step>
    </div>
  );
}
