// Relief shading of a height grid, for pictures (the homepage art). Not used for any result.
// Lambert shading: brightness = max(0, n . s), n the surface normal, s the unit vector towards the Sun.
// Directions are in the grid frame: x = +column (east on the polar grid), y = -row (row 0 is the northern edge),
// z = up. Sun azimuth is clockwise from +y, as everywhere else in the app.
import type { HeightGrid } from "./demHorizon";

const D2R = Math.PI / 180;

/** Heights (m) of a grid averaged over factor x factor blocks: a smaller grid with the same extent. */
export function downsample(g: HeightGrid, factor: number): { size: number; pixelM: number; h: Float32Array } {
  const n = Math.floor(g.size / factor);
  const h = new Float32Array(n * n);
  const scale = (g.heightMaxM - g.heightMinM) / 65535;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let sum = 0;
      for (let dr = 0; dr < factor; dr++) {
        const row = (r * factor + dr) * g.size + c * factor;
        for (let dc = 0; dc < factor; dc++) sum += g.data[row + dc];
      }
      h[r * n + c] = g.heightMinM + (sum / (factor * factor)) * scale;
    }
  }
  return { size: n, pixelM: g.pixelM * factor, h };
}

/** Unit surface normals (nx, ny, nz per cell) by central differences; edges use one-sided differences.
 *  `exaggeration` multiplies heights, which steepens the relief for a picture (1 = true slopes). */
export function surfaceNormals(h: Float32Array, size: number, pixelM: number, exaggeration = 1): Float32Array {
  const out = new Float32Array(size * size * 3);
  for (let r = 0; r < size; r++) {
    const rn = Math.max(0, r - 1), rs = Math.min(size - 1, r + 1);
    for (let c = 0; c < size; c++) {
      const cw = Math.max(0, c - 1), ce = Math.min(size - 1, c + 1);
      // y grows northwards, i.e. towards smaller rows.
      const dzdx = ((h[r * size + ce] - h[r * size + cw]) / ((ce - cw) * pixelM)) * exaggeration;
      const dzdy = ((h[rn * size + c] - h[rs * size + c]) / ((rs - rn) * pixelM)) * exaggeration;
      const inv = 1 / Math.hypot(dzdx, dzdy, 1);
      const k = 3 * (r * size + c);
      out[k] = -dzdx * inv; out[k + 1] = -dzdy * inv; out[k + 2] = inv;
    }
  }
  return out;
}

/** Unit vector towards the Sun at azimuth `azDeg` (clockwise from +y) and elevation `elDeg`. */
export function sunVector(azDeg: number, elDeg: number): [number, number, number] {
  const a = azDeg * D2R, e = elDeg * D2R;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}

/** Lambert brightness 0..1 of every cell for one Sun direction, written into `out` (length = number of cells). */
export function shade(normals: Float32Array, azDeg: number, elDeg: number, out: Float32Array): Float32Array {
  const [sx, sy, sz] = sunVector(azDeg, elDeg);
  for (let i = 0, k = 0; i < out.length; i++, k += 3) {
    const d = normals[k] * sx + normals[k + 1] * sy + normals[k + 2] * sz;
    out[i] = d > 0 ? d : 0;
  }
  return out;
}
