import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads quoted fields with commas, doubled quotes and both line endings", () => {
    const rows = parseCsv('id,name,note\r\na,"Luna 9","first, soft ""landing"""\nb,Plain,\n');
    expect(rows).toEqual([
      { id: "a", name: "Luna 9", note: 'first, soft "landing"' },
      { id: "b", name: "Plain", note: "" },
    ]);
  });
  it("handles a file without a trailing newline", () => {
    expect(parseCsv("x,y\n1,2")).toEqual([{ x: "1", y: "2" }]);
  });
});
