// Terrain horizon at any point, computed in the browser from the exported height grids.
// Formulas: docs/SCIENCE.md section 3 (same march as engine/horizon.py). Grids: docs/INTERFACES.md sections 8 and 9.
// Near field: the site tile (120 m). Far field, out to 150 km: terrain/south_pole.* (~430 m pixel means) where it
// reaches, then the site's own far.u16 (600 m pixel means), because the outer sites look beyond the south-pole grid.
import type { Horizon } from ".";

const R_M = 1737400;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** A square height grid in polar stereographic x/y. Row 0 = northern edge (largest y), column 0 = smallest x. */
export interface HeightGrid {
  size: number; pixelM: number; xMinM: number; yMaxM: number;
  heightMinM: number; heightMaxM: number; data: Uint16Array;
}

/** The grid fields shared by tile.json and south_pole.json. */
export interface HeightGridMeta {
  size: number; pixel_m: number; x_min_m: number; y_max_m: number; height_min_m: number; height_max_m: number;
}

export function parseHeightGrid(meta: HeightGridMeta, buf: ArrayBuffer): HeightGrid {
  if (buf.byteLength !== 2 * meta.size * meta.size) throw new Error("height grid: unexpected byte length");
  return {
    size: meta.size, pixelM: meta.pixel_m, xMinM: meta.x_min_m, yMaxM: meta.y_max_m,
    heightMinM: meta.height_min_m, heightMaxM: meta.height_max_m, data: new Uint16Array(buf),
  };
}

/** South polar stereographic x/y (m) of latitude / east longitude (deg): lon 0 towards +y, lon 90 E towards +x. */
export function stereoXY(latDeg: number, lonDeg: number): [number, number] {
  const rho = 2 * R_M * Math.tan((90 + latDeg) * 0.5 * D2R);
  return [rho * Math.sin(lonDeg * D2R), rho * Math.cos(lonDeg * D2R)];
}

/** Latitude / east longitude (deg) of south polar stereographic x/y (m). */
export function stereoLatLon(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y);
  return [2 * Math.atan(rho / (2 * R_M)) * R2D - 90, Math.atan2(x, y) * R2D];
}

/** Bilinear height (m) at stereographic x/y between pixel centres. NaN outside the grid. */
export function heightAt(g: HeightGrid, x: number, y: number): number {
  const fc = (x - g.xMinM) / g.pixelM - 0.5;
  const fr = (g.yMaxM - y) / g.pixelM - 0.5;
  const last = g.size - 1;
  if (!(fc >= 0 && fc <= last && fr >= 0 && fr <= last)) return NaN;
  const c0 = Math.min(Math.floor(fc), last - 1), r0 = Math.min(Math.floor(fr), last - 1);
  const tc = fc - c0, tr = fr - r0;
  const i = r0 * g.size + c0;
  const d = g.data;
  const v = (1 - tr) * ((1 - tc) * d[i] + tc * d[i + 1]) + tr * ((1 - tc) * d[i + g.size] + tc * d[i + g.size + 1]);
  return g.heightMinM + (v / 65535) * (g.heightMaxM - g.heightMinM);
}

/** 1-pixel steps out to nearM, then each step grows by `growth` (1.5 %) out to maxM. Metres. */
export function marchDistances(pixelM = 120, nearM = 5000, growth = 0.015, maxM = 150000): Float64Array {
  const d: number[] = [];
  for (let k = 1; k * pixelM <= nearM + 1e-9; k++) d.push(k * pixelM);
  let last = d[d.length - 1];
  while (last < maxM) {
    last = Math.min(last * (1 + growth), maxM);
    d.push(last);
  }
  return Float64Array.from(d);
}

export interface DemHorizonOptions { observerHM?: number; azStepDeg?: number; maxRangeKm?: number; siteId?: string; }

/**
 * Horizon mask for an observer at lat / east lon (deg), standing observerHM above the tile's surface.
 * Heights come from `tile` where it covers the sample, else from the first grid in `far` that does;
 * samples outside every grid are skipped.
 */
export function demHorizon(tile: HeightGrid, far: HeightGrid[], latDeg: number, lonDeg: number,
  opts: DemHorizonOptions = {}): Horizon {
  const observerHM = opts.observerHM ?? 2, azStepDeg = opts.azStepDeg ?? 0.5, maxRangeKm = opts.maxRangeKm ?? 150;
  const [x0, y0] = stereoXY(latDeg, lonDeg);
  const surface = heightAt(tile, x0, y0);
  if (Number.isNaN(surface)) throw new Error("demHorizon: the observer is outside the site tile");
  const hO = surface + observerHM;
  const dist = marchDistances(tile.pixelM, 5000, 0.015, maxRangeKm * 1000);
  const nd = dist.length;
  const sinD = new Float64Array(nd), cosD = new Float64Array(nd);
  for (let j = 0; j < nd; j++) { sinD[j] = Math.sin(dist[j] / R_M); cosD[j] = Math.cos(dist[j] / R_M); }
  const phi = latDeg * D2R, lam = lonDeg * D2R;
  const sinP = Math.sin(phi), cosP = Math.cos(phi);
  const nAz = Math.round(360 / azStepDeg);
  const elev = new Float64Array(nAz);
  for (let i = 0; i < nAz; i++) {
    const a = i * azStepDeg * D2R;
    const sinA = Math.sin(a), cosA = Math.cos(a);
    let best = -Infinity;
    for (let j = 0; j < nd; j++) {
      const sinLat2 = Math.max(-1, Math.min(1, sinP * cosD[j] + cosP * sinD[j] * cosA));
      const lon2 = lam + Math.atan2(sinA * sinD[j] * cosP, cosD[j] - sinP * sinLat2);
      // Stereographic radius: 2R tan((90 + lat) / 2) = 2R cos(lat) / (1 - sin(lat)).
      const rho = 2 * R_M * Math.sqrt(1 - sinLat2 * sinLat2) / (1 - sinLat2);
      const x = rho * Math.sin(lon2), y = rho * Math.cos(lon2);
      let hT = heightAt(tile, x, y);
      for (let g = 0; g < far.length && Number.isNaN(hT); g++) hT = heightAt(far[g], x, y);
      if (Number.isNaN(hT)) continue;
      const theta = Math.atan2((R_M + hT) * cosD[j] - (R_M + hO), (R_M + hT) * sinD[j]);
      if (theta > best) best = theta;
    }
    elev[i] = best * R2D;
  }
  return {
    siteId: opts.siteId ?? "custom", lat: latDeg, lon: lonDeg, surfaceElevM: surface, observerHM,
    azStepDeg, elevDeg: elev, flat: false,
  };
}
