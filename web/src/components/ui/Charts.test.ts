// Chart helpers: known answers.
import { describe, expect, it } from "vitest";
import { arcPath, binCounts } from "./Charts";

describe("chart helpers", () => {
  it("bins: half-open ranges, the top value falls in the last bin, outside values are dropped", () => {
    expect(binCounts([0, 4.9, 5, 99, 100, -1, 101, NaN], 0, 100, 5)).toEqual([2, 1, ...new Array(17).fill(0), 2]);
    expect(binCounts([], 0, 100, 25)).toEqual([0, 0, 0, 0]);
  });
  it("a quarter ring starts at 12 o'clock and ends at 3 o'clock", () => {
    const d = arcPath(60, 60, 40, 56, 0, Math.PI / 2);
    expect(d.startsWith("M60.000 4.000A56 56 0 0 1 116.000 60.000L100.000 60.000A40 40 0 0 0 60.000 20.000Z")).toBe(true);
  });
});
