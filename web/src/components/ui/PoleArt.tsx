// Pictures of the south pole drawn from our own published data (no stock images): NASA LOLA relief, shaded by
// lib/analysis/relief.ts, optionally tinted by NASA PGDA sunlight or Earth visibility, or by our suitability score.
// Used as homepage art. `animate` sends the Sun round the horizon, as it really goes round at the pole.
import { useEffect, useRef } from "react";
import { parseHeightGrid, type HeightGridMeta } from "../../lib/analysis/demHorizon";
import { downsample, shade, surfaceNormals } from "../../lib/analysis/relief";

export type ArtTint = "relief" | "sun" | "earth" | "score";

const BASE = `${import.meta.env.BASE_URL}data/`;
const FACTOR = 2; // 1024 -> 512 cells: sharp enough for a full-screen picture, cheap enough to animate
const EXAGGERATION = 2.5;

interface Relief { size: number; normals: Float32Array }
let reliefP: Promise<Relief> | null = null;
const tintP: Partial<Record<ArtTint, Promise<Float32Array | null>>> = {};

const bytes = (p: string) => fetch(BASE + p).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(p))));

function loadRelief(): Promise<Relief> {
  reliefP ??= Promise.all([fetch(`${BASE}terrain/south_pole.json`).then((r) => r.json() as Promise<HeightGridMeta>),
    bytes("terrain/south_pole_height.u16")]).then(([meta, buf]) => {
    const d = downsample(parseHeightGrid(meta, buf), FACTOR);
    return { size: d.size, normals: surfaceNormals(d.h, d.size, d.pixelM, EXAGGERATION) };
  });
  return reliefP;
}

/** Tint strength 0..1 per downsampled cell (mean of each block), or null for plain relief. */
function loadTint(tint: ArtTint): Promise<Float32Array | null> {
  if (tint === "relief") return Promise.resolve(null);
  const file = { sun: "terrain/south_pole_sun.u8", earth: "terrain/south_pole_earth.u8",
    score: "suitability/south_pole_score.u8" }[tint];
  tintP[tint] ??= bytes(file).then((buf) => {
    const src = new Uint8Array(buf), size = Math.round(Math.sqrt(src.length)), n = size / FACTOR;
    const out = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      let sum = 0;
      for (let dr = 0; dr < FACTOR; dr++) for (let dc = 0; dc < FACTOR; dc++) {
        const v = src[(r * FACTOR + dr) * size + c * FACTOR + dc];
        // PGDA percent (255 = no data); score: 0..100 passes every NASA limit, 101..201 fails one, 255 no data.
        sum += tint === "score" ? (v <= 100 ? 0.35 + 0.65 * (v / 100) : 0) : (v <= 100 ? v / 100 : 0);
      }
      out[r * n + c] = sum / (FACTOR * FACTOR);
    }
    return out;
  }).catch(() => null);
  return tintP[tint]!;
}

function cssRgb(name: string, fallback: [number, number, number]): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export interface PoleArtProps {
  tint?: ArtTint;
  /** Clip to a disc, like a globe seen from above. */
  disc?: boolean;
  /** Send the Sun round the horizon (one turn per `turnS` seconds). Off when the reader prefers less motion. */
  animate?: boolean;
  turnS?: number;
  sunAz?: number;
  sunEl?: number;
  className?: string;
  label: string;
}

export function PoleArt({ tint = "relief", disc = false, animate = false, turnS = 90, sunAz = 135, sunEl = 7, className, label }: PoleArtProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stop = false, raf = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);

    void Promise.all([loadRelief(), loadTint(tint)]).then(([relief, strength]) => {
      if (stop) return;
      const { size, normals } = relief;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(size, size);
      const light = new Float32Array(size * size);
      const ground = cssRgb("--bone", [239, 232, 220]);
      const colour = tint === "sun" ? cssRgb("--sunlight", [246, 185, 59]) : tint === "earth" ? cssRgb("--cloud", [220, 232, 255])
        : cssRgb("--lichen", [143, 194, 138]);
      // The disc: everything outside the inscribed circle is transparent, with a soft edge one cell wide.
      const half = size / 2, alpha = new Uint8ClampedArray(size * size).fill(255);
      if (disc) for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const d = Math.hypot(c + 0.5 - half, r + 0.5 - half);
        alpha[r * size + c] = Math.max(0, Math.min(255, (half - d) * 255));
      }

      const draw = (az: number) => {
        shade(normals, az, sunEl, light);
        const px = img.data;
        for (let i = 0, k = 0; i < light.length; i++, k += 4) {
          // A little ambient light so the shadows keep their shape; a gamma lift for the low Sun.
          const l = Math.pow(0.06 + 0.94 * light[i], 0.8);
          const t = strength ? strength[i] : 0;
          const g = strength ? 0.55 * l : l;
          px[k] = ground[0] * g * (1 - t) + colour[0] * (0.25 + 0.75 * l) * t;
          px[k + 1] = ground[1] * g * (1 - t) + colour[1] * (0.25 + 0.75 * l) * t;
          px[k + 2] = ground[2] * g * (1 - t) + colour[2] * (0.25 + 0.75 * l) * t;
          px[k + 3] = alpha[i];
        }
        ctx.putImageData(img, 0, 0);
      };

      const still = !animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      draw(sunAz);
      if (still) return;
      const t0 = performance.now();
      let last = 0;
      const tick = (now: number) => {
        if (stop) return;
        raf = requestAnimationFrame(tick);
        if (!visible || document.hidden || now - last < 33) return; // about 30 frames a second, only on screen
        last = now;
        draw(sunAz + ((now - t0) / 1000 / turnS) * 360);
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => { /* the picture is decoration: leave the background */ });

    return () => { stop = true; cancelAnimationFrame(raf); io.disconnect(); };
  }, [tint, disc, animate, turnS, sunAz, sunEl]);

  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}
