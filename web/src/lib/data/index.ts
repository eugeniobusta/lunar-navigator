// Loads the generated data in public/data/ (docs/INTERFACES.md). Until the pipeline has produced a file,
// falls back to web/src/mocks/ and reports mock = true so the UI can say so.
import type { Ephemeris, Horizon } from "../analysis";
import mockSites from "../../mocks/sites.json";
import mockEph from "../../mocks/ephemeris.json";
import mockHz from "../../mocks/horizons/mma01.json";

export interface Site {
  id: string; name: string; group: "artemis" | "mission" | "historic";
  lat: number; lon: number; terrain: "dem" | "flat"; has_grid: boolean;
  note: string; source: string; coords_quality: "published" | "approximate" | "verify";
}

export interface Loaded<T> { value: T; mock: boolean }

interface EphemerisFile {
  start_utc: string; step_s: number; n: number;
  sun_dir: number[]; sun_semidiam_deg: number[]; earth_km: number[];
}
interface HorizonFile {
  site_id: string; lat: number; lon: number; surface_elev_m: number; observer_h_m: number;
  az_step_deg: number; elev_deg: number[]; dem: string;
}

const BASE = `${import.meta.env.BASE_URL}data/`;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + path);
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function parseEphemeris(f: EphemerisFile): Ephemeris {
  return {
    startMs: Date.parse(f.start_utc), stepS: f.step_s, n: f.n,
    sunDir: Float64Array.from(f.sun_dir), sunSemiDiam: Float64Array.from(f.sun_semidiam_deg),
    earthKm: Float64Array.from(f.earth_km),
  };
}

export function parseHorizon(f: HorizonFile): Horizon {
  return {
    siteId: f.site_id, lat: f.lat, lon: f.lon, surfaceElevM: f.surface_elev_m, observerHM: f.observer_h_m,
    azStepDeg: f.az_step_deg, elevDeg: Float64Array.from(f.elev_deg), flat: f.dem === "flat",
  };
}

export function flatHorizon(site: Site): Horizon {
  return { siteId: site.id, lat: site.lat, lon: site.lon, surfaceElevM: 0, observerHM: 2,
    azStepDeg: 0.5, elevDeg: new Float64Array(720), flat: true };
}

export async function loadSites(): Promise<Loaded<Site[]>> {
  const f = await getJson<{ sites: Site[] }>("sites.json");
  return f ? { value: f.sites, mock: false } : { value: mockSites.sites as Site[], mock: true };
}

export async function loadEphemeris(): Promise<Loaded<Ephemeris>> {
  const f = await getJson<EphemerisFile>("ephemeris.json");
  return f ? { value: parseEphemeris(f), mock: false } : { value: parseEphemeris(mockEph), mock: true };
}

export async function loadHorizon(site: Site): Promise<Loaded<Horizon>> {
  if (site.terrain === "flat") return { value: flatHorizon(site), mock: false };
  const f = await getJson<HorizonFile>(`horizons/${site.id}.json`);
  if (f) return { value: parseHorizon(f), mock: false };
  // No real mask yet: reuse the mock terrain shape at this site's coordinates.
  return { value: { ...parseHorizon(mockHz), siteId: site.id, lat: site.lat, lon: site.lon }, mock: true };
}
