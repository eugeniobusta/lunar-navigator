// Drawing the traffic-light classes of rag.ts as pixels. Pure TypeScript (no DOM), shared with the VR view.
// Display settings live here and only here: they turn class codes into colours. Nothing in this file can change
// a class or a score, which is why opacity never changes a score (paint.test.ts).
import { CODE, UNSAFE } from "./rag";

export type RGB = [number, number, number];
/** How the classes are drawn. `opacity` 0..1 for the classes; `unsafeOpacity` 0..1 for ground failing a NASA limit. */
export interface PaintStyle { red: RGB; amber: RGB; green: RGB; grey: RGB; opacity: number; unsafeOpacity: number }

const CLASS_ALPHA = 0.74, UNSAFE_ALPHA = 0.36, GREY_ALPHA = 0.7;

/**
 * RGBA pixels for a grid of class codes (rag.classGrid). Unsafe ground is red; as `unsafeOpacity` goes to 0 the
 * class of the ticked parameters shows through. Ground that passes with nothing ticked stays clear (the relief shows).
 */
export function paintClasses(codes: ArrayLike<number>, style: PaintStyle, out?: Uint8ClampedArray): Uint8ClampedArray {
  const rgba = out ?? new Uint8ClampedArray(4 * codes.length);
  const colour = [style.red, style.amber, style.green, style.grey];
  const a = Math.min(1, Math.max(0, style.opacity)), u = Math.min(1, Math.max(0, style.unsafeOpacity));
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i], cls = code & 7, o = 4 * i;
    let c: RGB = style.grey, alpha = 0;
    if (code === CODE.grey) { c = style.grey; alpha = GREY_ALPHA * a; }
    else if (code & UNSAFE) {
      const under = cls === CODE.unscored ? null : colour[cls];
      const underAlpha = under ? CLASS_ALPHA * a : 0;
      alpha = underAlpha + (UNSAFE_ALPHA - underAlpha) * u;
      c = under ? [0, 1, 2].map((k) => under[k] + (style.red[k] - under[k]) * u) as RGB : style.red;
    } else if (cls !== CODE.unscored) { c = colour[cls]; alpha = CLASS_ALPHA * a; }
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255 * alpha;
  }
  return rgba;
}

/** Alpha mask (RGBA, white) of the cells that fail a NASA limit: the map draws its hatch through it. */
export function unsafeMask(codes: ArrayLike<number>, out?: Uint8ClampedArray): Uint8ClampedArray {
  const rgba = out ?? new Uint8ClampedArray(4 * codes.length);
  for (let i = 0; i < codes.length; i++) {
    const on = codes[i] !== CODE.grey && codes[i] & UNSAFE ? 255 : 0;
    rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = 255; rgba[4 * i + 3] = on;
  }
  return rgba;
}
