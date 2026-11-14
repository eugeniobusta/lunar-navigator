// Loads the published data in /data/ (docs/INTERFACES.md). Nothing here invents a number: a file that is missing
// yields null and the feature that needs it stays hidden.
import type { Ephemeris } from '../../web/src/lib/analysis';
import {
  parseHeightGrid,
  type HeightGrid,
  type HeightGridMeta,
} from '../../web/src/lib/analysis/demHorizon';

export const DATA_URL = '/data/';

export interface Site {
  id: string;
  name: string;
  group: 'artemis' | 'mission' | 'historic';
  lat: number;
  lon: number;
  terrain: 'dem' | 'flat';
  note: string;
}

export interface SouthPole {
  grid: HeightGrid;
  sun: Uint8Array;
  earth: Uint8Array;
}

export interface SiteTile {
  siteId: string;
  grid: HeightGrid;
  far: HeightGrid;
  sun: Uint8Array;
  earth: Uint8Array;
  slope: Uint8Array;
  suitability: Suitability | null;
  site: { x_m: number; y_m: number; height_m: number };
}

export interface Zone {
  rank: number;
  /** The zone's best cell. */
  lat: number;
  lon: number;
  score: number | null;
  areaKm2: number;
  /** Nearest Artemis region, by name. */
  near: string;
  sunPct: number | null;
  earthPct: number | null;
}

export interface Mission {
  name: string;
  lat: number;
  lon: number;
  outcome: 'landed' | 'tipped' | 'crashed';
  year: string;
  lesson: string;
}

async function get(path: string): Promise<Response | null> {
  try {
    const r = await fetch(DATA_URL + path);
    // A single-page host answers unknown paths with index.html: treat that as "missing".
    if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) {
      return null;
    }
    return r;
  } catch {
    return null;
  }
}
const json = async <T>(p: string) => {
  const r = await get(p);
  return r ? ((await r.json()) as T) : null;
};
const bytes = async (p: string) => {
  const r = await get(p);
  return r ? await r.arrayBuffer() : null;
};
async function need<T>(p: Promise<T | null>, what: string): Promise<T> {
  const v = await p;
  if (v == null) {
    throw new Error(`missing data file: ${what}`);
  }
  return v;
}

export async function loadSites(): Promise<Site[]> {
  return (await need(json<{ sites: Site[] }>('sites.json'), 'sites.json')).sites;
}

export async function loadEphemeris(): Promise<Ephemeris> {
  const f = await need(
    json<{
      start_utc: string;
      step_s: number;
      n: number;
      sun_dir: number[];
      sun_semidiam_deg: number[];
      earth_km: number[];
    }>('ephemeris.json'),
    'ephemeris.json',
  );
  return {
    startMs: Date.parse(f.start_utc),
    stepS: f.step_s,
    n: f.n,
    sunDir: Float64Array.from(f.sun_dir),
    sunSemiDiam: Float64Array.from(f.sun_semidiam_deg),
    earthKm: Float64Array.from(f.earth_km),
  };
}

export async function loadSouthPole(): Promise<SouthPole> {
  type Meta = HeightGridMeta & { files: Record<string, string> };
  const meta = await need(json<Meta>('terrain/south_pole.json'), 'terrain/south_pole.json');
  const [h, sun, earth] = await Promise.all(
    ['height', 'sun', 'earth'].map((k) =>
      need(bytes(`terrain/${meta.files[k]}`), meta.files[k]),
    ),
  );
  return {
    grid: parseHeightGrid(meta, h),
    sun: new Uint8Array(sun),
    earth: new Uint8Array(earth),
  };
}

export async function loadSiteTile(siteId: string): Promise<SiteTile> {
  type Meta = HeightGridMeta & {
    far: HeightGridMeta;
    files: Record<string, string>;
    site: { x_m: number; y_m: number; height_m: number };
  };
  const dir = `terrain/sites/${siteId}/`;
  const meta = await need(json<Meta>(dir + 'tile.json'), dir + 'tile.json');
  const suitability = loadSiteSuitability(siteId, meta.size);
  const [h, far, sun, earth, slope] = await Promise.all(
    ['height', 'far', 'sun', 'earth', 'slope'].map((k) =>
      need(bytes(dir + meta.files[k]), dir + meta.files[k]),
    ),
  );
  return {
    siteId,
    grid: parseHeightGrid(meta, h),
    far: parseHeightGrid(meta.far, far),
    sun: new Uint8Array(sun),
    earth: new Uint8Array(earth),
    slope: new Uint8Array(slope),
    suitability: await suitability,
    site: meta.site,
  };
}

/** suitability/zones.geojson (docs/INTERFACES.md section 10): the best zones as points at their best cell. */
export async function loadZones(): Promise<Zone[] | null> {
  type Feature = { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: number[] } };
  const f = await json<{ features?: Feature[] }>('suitability/zones.geojson');
  if (!f?.features) {
    return null;
  }
  const zones: Zone[] = [];
  for (const feat of f.features) {
    const p = feat.properties ?? {};
    const g = feat.geometry;
    if (g?.type !== 'Point' || typeof p.rank !== 'number') {
      continue;
    }
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    zones.push({
      rank: p.rank,
      lat: g.coordinates[1],
      lon: g.coordinates[0],
      score: num(p.score),
      areaKm2: num(p.area_km2) ?? 0,
      near: typeof p.nearest_artemis_region === 'string' ? p.nearest_artemis_region : '',
      sunPct: num(p.sun_pct),
      earthPct: num(p.earth_pct),
    });
  }
  return zones.sort((a, b) => a.rank - b.rank);
}

/** Decoded suitability grids on a height grid's layout (docs/INTERFACES.md section 10). */
export interface Suitability {
  /** 0..100 where every hard limit passes, 255 elsewhere (fails or no data): what the heat map shows. */
  passScore: Uint8Array;
  /** The raw score byte: 0..100 pass, 101..201 fail (score = v - 101), 255 no data. */
  raw: Uint8Array;
  /** Bit flags of the failing hard limits, or null if the limits grid is missing. */
  limits: Uint8Array | null;
}

export const LIMIT_NAMES: [number, string][] = [
  [1, 'landing slope'],
  [2, 'EVA slope'],
  [4, 'sunlight'],
  [8, 'Earth in view'],
  [16, 'more than 6 deg from the pole'],
];

async function loadSuitability(scorePath: string, limitsPath: string, size: number): Promise<Suitability | null> {
  const [score, limits] = await Promise.all([bytes(scorePath), bytes(limitsPath)]);
  if (!score || score.byteLength !== size * size) {
    return null;
  }
  const raw = new Uint8Array(score);
  return {
    raw,
    passScore: raw.map((v) => (v <= 100 ? v : 255)),
    limits: limits && limits.byteLength === size * size ? new Uint8Array(limits) : null,
  };
}

export const loadPoleSuitability = (size: number) =>
  loadSuitability('suitability/south_pole_score.u8', 'suitability/south_pole_limits.u8', size);
export const loadSiteSuitability = (siteId: string, size: number) =>
  loadSuitability(`suitability/sites/${siteId}_score.u8`, `suitability/sites/${siteId}_limits.u8`, size);

export interface Stars {
  n: number;
  /** x, y, z (ICRF unit vector) and V magnitude per star. */
  stars: Float32Array;
  startMs: number;
  stepS: number;
  nRot: number;
  /** ICRF -> MOON_ME quaternions (x, y, z, w), one every stepS. */
  quat: Float64Array;
}

/** stars.json (docs/INTERFACES.md section 11). Null if it is missing: then no stars are drawn. */
export async function loadStars(): Promise<Stars | null> {
  const f = await json<{ n_stars: number; stars: number[]; start_utc: string; step_s: number; n: number; quat_xyzw: number[] }>('stars.json');
  if (!f) {
    return null;
  }
  return {
    n: f.n_stars,
    stars: Float32Array.from(f.stars),
    startMs: Date.parse(f.start_utc),
    stepS: f.step_s,
    nRot: f.n,
    quat: Float64Array.from(f.quat_xyzw),
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** /data/missions.csv: past landings with outcome and one-line lesson. Null until it exists. */
export async function loadMissions(): Promise<Mission[] | null> {
  const r = await get('missions.csv');
  if (!r) {
    return null;
  }
  const lines = (await r.text()).split(/\r?\n/u).filter((l) => l.trim());
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iName = col('name', 'mission');
  const iLat = col('lat');
  const iLon = col('lon');
  const iOut = col('outcome', 'status', 'result');
  const iYear = col('year', 'landing_date', 'date');
  const iLesson = col('lesson');
  if (iName < 0 || iLat < 0 || iLon < 0) {
    return null;
  }
  const missions: Mission[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const lat = Number(c[iLat]);
    const lon = Number(c[iLon]);
    if (!c[iName] || !Number.isFinite(lat) || !Number.isFinite(lon) || c[iLat] === '') {
      continue;
    }
    const o = (c[iOut] ?? '').toLowerCase();
    missions.push({
      name: c[iName],
      lat,
      lon,
      outcome: o.includes('tip') ? 'tipped' : o.includes('crash') || o.includes('fail') || o.includes('lost') ? 'crashed' : 'landed',
      year: (c[iYear] ?? '').slice(0, 4),
      lesson: c[iLesson] ?? '',
    });
  }
  return missions;
}
