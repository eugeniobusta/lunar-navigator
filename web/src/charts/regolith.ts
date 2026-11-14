// A tileable moon-ground texture for the sky panorama's terrain, drawn once in the browser: fractal value noise
// shaded by a light from the upper left, in the colours of lunar regolith, with a scatter of small pebbles.
// Decoration only: the shape of the skyline is the real terrain; this is only its surface.

/** Periodic value noise: `cells` cells across a tile of `size` pixels, smooth (cosine) interpolation. */
function noiseLayer(size: number, cells: number, rnd: () => number): Float32Array {
  const g = new Float32Array(cells * cells).map(() => rnd());
  const out = new Float32Array(size * size);
  const s = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells, y0 = Math.floor(fy), ty = s(fy - y0), y1 = (y0 + 1) % cells;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, x0 = Math.floor(fx), tx = s(fx - x0), x1 = (x0 + 1) % cells;
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
      out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

let cached: string | null = null;

/** Data URL of a size x size PNG that tiles seamlessly. */
export function regolithTexture(size = 256): string {
  if (cached) return cached;
  let seed = 20261114;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const h = new Float32Array(size * size);
  for (const [cells, w] of [[4, 0.5], [8, 0.25], [16, 0.14], [32, 0.08], [64, 0.05]] as const) {
    const l = noiseLayer(size, cells, rnd);
    for (let i = 0; i < h.length; i++) h[i] += w * l[i];
  }
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Slope towards the light (upper left) brightens, away from it darkens.
    const shade = Math.max(0.35, Math.min(1.35, 0.85 + 9 * (at(x - 1, y - 1) - at(x + 1, y + 1))));
    const tone = 0.8 + 0.4 * h[y * size + x];
    const v = shade * tone, k = 4 * (y * size + x);
    img.data[k] = 150 * v; img.data[k + 1] = 141 * v; img.data[k + 2] = 128 * v; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Pebbles: a lit top and a shadow below each.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size, y = rnd() * size, r = 0.6 + rnd() * 1.6;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(x + r * 0.5, y + r * 0.7, r * 1.3, r * 0.6, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "rgba(225,215,198,0.7)"; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0, 0, 2 * Math.PI); ctx.fill();
  }
  cached = c.toDataURL("image/png");
  return cached;
}
