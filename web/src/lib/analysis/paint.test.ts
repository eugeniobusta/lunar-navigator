// Display settings (opacity, palette) only change how a class is drawn: never the class, never the score.
import { describe, expect, it } from "vitest";
import { paintClasses, unsafeMask, type PaintStyle } from "./paint";
import { CODE, UNSAFE, byteText, cellValues, classGrid } from "./rag";
import { explainFor } from "./explain";
import { EVERYTHING, LAYER_KEYS } from "./suitability";

const style = (opacity: number, unsafeOpacity = 1): PaintStyle =>
  ({ red: [229, 72, 77], amber: [240, 180, 41], green: [111, 191, 115], grey: [120, 120, 120], opacity, unsafeOpacity });
const codes = new Uint8Array([CODE.red, CODE.amber, CODE.green, CODE.grey, CODE.unscored, CODE.green | UNSAFE, CODE.unscored | UNSAFE]);

describe("painting the classes", () => {
  it("opacity changes only the alpha channel: colours, classes and scores stay the same", () => {
    const layers = LAYER_KEYS.map((_, k) => new Uint8Array([255, 140, 50, 200].map((v) => (v + 13 * k) % 256)));
    const limits = new Uint8Array([0, 0, 0, 1]);
    const score = new Uint8Array(4), before = classGrid(layers, limits, EVERYTHING, undefined, score);
    const snapshot = [[...before], [...score]];
    const solid = paintClasses(before, style(1)), faint = paintClasses(before, style(0.2)), hidden = paintClasses(before, style(0));
    for (let i = 0; i < 3; i++) { // the three cells that pass: same colour, alpha in proportion to opacity
      expect([...faint.slice(4 * i, 4 * i + 3)]).toEqual([...solid.slice(4 * i, 4 * i + 3)]);
      expect(faint[4 * i + 3]).toBeLessThan(solid[4 * i + 3]);
      expect(hidden[4 * i + 3]).toBe(0);
    }
    // Painting did not touch the classes or the scores, and classifying again gives the same answer.
    const after = new Uint8Array(4), afterCodes = classGrid(layers, limits, EVERYTHING, undefined, after);
    expect([[...before], [...score]]).toEqual(snapshot);
    expect([[...afterCodes], [...after]]).toEqual(snapshot);
  });
  it("each class gets its own colour; passing ground with nothing ticked stays clear", () => {
    const px = paintClasses(codes, style(1));
    const at = (i: number) => [...px.slice(4 * i, 4 * i + 4)];
    expect(at(0).slice(0, 3)).toEqual([229, 72, 77]);
    expect(at(1).slice(0, 3)).toEqual([240, 180, 41]);
    expect(at(2).slice(0, 3)).toEqual([111, 191, 115]);
    expect(at(3).slice(0, 3)).toEqual([120, 120, 120]);
    expect(at(4)[3]).toBe(0);
  });
  it("unsafe ground is red however good its score; fading the limits shows the class underneath", () => {
    const full = paintClasses(codes, style(1, 1)), off = paintClasses(codes, style(1, 0));
    expect([...full.slice(20, 23)]).toEqual([229, 72, 77]);
    expect([...off.slice(20, 23)]).toEqual([111, 191, 115]);
    expect(full[27]).toBeGreaterThan(0);  // unsafe and unscored: still red
    expect(off[27]).toBe(0);
  });
  it("the hatch mask covers exactly the unsafe cells", () => {
    const m = unsafeMask(codes);
    expect([...codes].map((_, i) => m[4 * i + 3])).toEqual([0, 0, 0, 0, 0, 255, 255]);
  });
});

describe("a cell's bytes as values and words", () => {
  it("in real units, with the range at the clipped ends", () => {
    expect(byteText("sunlight", 128)).toBe("47.6 % of the time");
    expect(byteText("sunlight", 255)).toBe("70 % of the time or more");
    expect(byteText("sunlight", 0, 4)).toBe("under 25 % of the time");
    expect(byteText("sunlight", 0, 0)).toBe("about 25 % of the time");
    expect(byteText("sunlight", 1, 4)).toBe("under 25 % of the time");
    expect(byteText("landing_slope", 0, 1)).toBe("10° or more");
    expect(byteText("temperature", 51)).toBe("118 K");
    expect(byteText("ice", 0)).toBe("deeper than 1 m, or no stable ice");
  });
  it("sentences for a cell agree with the exact limits", () => {
    const q = [0, 200, 0, 255, 255, 100, 0, 255];
    const bad = explainFor(cellValues(q, 4 | 1, -86), [], [...LAYER_KEYS]);
    expect(bad.find((e) => e.key === "sunPct")!.verdict).toBe("rejected");
    expect(bad.find((e) => e.key === "landingSlopeDeg")!.verdict).toBe("rejected");
    const ok = explainFor(cellValues(q, 0, -86), [], [...LAYER_KEYS]);
    expect(ok.find((e) => e.key === "sunPct")!.verdict).toBe("acceptable");
    expect(ok.find((e) => e.key === "landingSlopeDeg")!.verdict).toBe("acceptable");
    expect(ok.find((e) => e.key === "iceDepthM")!.verdict).toBe("rejected");
    expect(ok.find((e) => e.key === "shadowKm")!.verdict).toBe("good");
    expect(ok.some((e) => e.key === "longestDarkH")).toBe(false); // not known at a cell
  });
});
