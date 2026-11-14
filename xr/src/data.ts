// Loads the published data in /data/ (docs/INTERFACES.md). Nothing here invents a number: a file that is missing
// yields null and the feature that needs it stays hidden.
import type { Ephemeris } from '../../web/src/lib/analysis';
import {
  parseHeightGrid,
  type HeightGrid,
  type HeightGridMeta,
} from '../../web/src/lib/analysis/demHorizon';
import { heightAt } from '../../web/src/lib/analysis/demHorizon';
import { LAYER_KEYS } from '../../web/src/lib/analysis/suitability';
import { priorities, type Priorities } from './guide.js';

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
  /** True if the tile was resampled from the ~430 m south-pole grid (a zone outside every 120 m site tile). */
  coarse: boolean;
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
    coarse: false,
  };
}

/** Presets, default selection and bounds of suitability/weights.json; only the published weights if it is missing. */
export const loadPriorities = async (): Promise<Priorities> => priorities(await json('suitability/weights.json'));

/** The per-criterion layers of a grid, in LAYER_KEYS order. Null unless all of them are there. */
async function loadLayers(path: (key: string) => string, size: number): Promise<Uint8Array[] | null> {
  const bufs = await Promise.all(LAYER_KEYS.map((k) => bytes(path(k))));
  if (bufs.some((b) => !b || b.byteLength !== size * size)) {
    return null;
  }
  return bufs.map((b) => new Uint8Array(b!));
}
export const loadPoleLayers = (size: number) => loadLayers((k) => `suitability/layers/south_pole_${k}.u8`, size);

/** Nearest-pixel copy of a byte grid of `g` onto a `size` x `size` grid of `pixelM` centred on x, y. 255 outside. */
export function resampleBytes(src: Uint8Array, g: HeightGrid, x: number, y: number, size: number, pixelM: number): Uint8Array {
  const out = new Uint8Array(size * size).fill(255);
  const half = (size * pixelM) / 2;
  for (let r = 0; r < size; r++) {
    const sr = Math.floor((g.yMaxM - (y + half - (r + 0.5) * pixelM)) / g.pixelM);
    if (sr < 0 || sr >= g.size) {
      continue;
    }
    for (let c = 0; c < size; c++) {
      const sc = Math.floor((x - half + (c + 0.5) * pixelM - g.xMinM) / g.pixelM);
      if (sc >= 0 && sc < g.size) {
        out[r * size + c] = src[sr * g.size + sc];
      }
    }
  }
  return out;
}

function resampleHeights(g: HeightGrid, x: number, y: number, size: number, pixelM: number): HeightGrid {
  const data = new Uint16Array(size * size);
  const half = (size * pixelM) / 2;
  const span = g.heightMaxM - g.heightMinM;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const h = heightAt(g, x - half + (c + 0.5) * pixelM, y + half - (r + 0.5) * pixelM);
      // Outside the south-pole grid nothing is known: the reference sphere (height 0) stands in.
      data[r * size + c] = Math.round((Math.max(0, Math.min(1, ((Number.isNaN(h) ? 0 : h) - g.heightMinM) / span))) * 65535);
    }
  }
  return { size, pixelM, xMinM: x - half, yMaxM: y + half, heightMinM: g.heightMinM, heightMaxM: g.heightMaxM, data };
}

/**
 * A tile around stereographic x, y for a zone that no 120 m site tile covers, on the same layout as a site tile
 * (512 x 512 at 120 m, far field 512 x 512 at 600 m) but resampled from the ~430 m south-pole grid: the heights
 * are interpolated, the NASA maps keep their own pixels, and there is no slope map.
 */
export function tileFromPole(id: string, pole: SouthPole, suit: Suitability | null, x: number, y: number): SiteTile {
  const g = pole.grid;
  const grid = resampleHeights(g, x, y, 512, 120);
  const pick = (src: Uint8Array) => resampleBytes(src, g, x, y, 512, 120);
  const raw = suit ? pick(suit.raw) : null;
  return {
    siteId: id,
    grid,
    far: resampleHeights(g, x, y, 512, 600),
    sun: pick(pole.sun),
    earth: pick(pole.earth),
    slope: new Uint8Array(512 * 512).fill(255),
    suitability: raw && suit ? { raw, passScore: raw.map((v) => (v <= 100 ? v : 255)), limits: suit.limits ? pick(suit.limits) : null } : null,
    site: { x_m: x, y_m: y, height_m: heightAt(grid, x, y) },
    coarse: true,
  };
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
