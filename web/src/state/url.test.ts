import { describe, expect, it } from "vitest";
import { buildQuery, formatDate, parseQuery, type UrlContext } from "./url";

const startMs = Date.parse("2026-11-01T00:00:00Z");
const ctx: UrlContext = {
  siteIds: ["mma01", "hw02", "nr107"],
  tabs: ["overview", "compare", "windows"],
  startMs,
  stepS: 3600,
  n: 24 * 365,
};

describe("parseQuery", () => {
  it("reads every field", () => {
    expect(parseQuery("?site=hw02&compare=nr107&date=2026-11-03&days=14&tab=compare", ctx)).toEqual({
      siteId: "hw02", compareId: "nr107", startIdx: 48, windowDays: 14, tab: "compare",
    });
  });

  it("reads a date with an hour", () => {
    expect(parseQuery("?date=2026-11-02T05:00Z", ctx).startIdx).toBe(29);
    expect(parseQuery("?date=2026-11-02T05", ctx).startIdx).toBe(29);
  });

  it("drops unknown or out-of-range values", () => {
    expect(parseQuery("?site=nope&compare=&tab=evil&days=0&date=2020-01-01", ctx)).toEqual({});
    expect(parseQuery("?days=2.5", ctx)).toEqual({});
    expect(parseQuery("?days=99999", ctx)).toEqual({});
    expect(parseQuery("?date=2027-11-01", ctx)).toEqual({}); // one past the last sample
    expect(parseQuery("?date=not-a-date", ctx)).toEqual({});
  });

  it("returns nothing for an empty query", () => {
    expect(parseQuery("", ctx)).toEqual({});
  });
});

describe("formatDate", () => {
  it("omits the time at midnight and keeps it otherwise", () => {
    expect(formatDate(48, startMs, 3600)).toBe("2026-11-03");
    expect(formatDate(29, startMs, 3600)).toBe("2026-11-02T05:00Z");
  });
});

describe("buildQuery", () => {
  it("round-trips through parseQuery", () => {
    const v = { siteId: "mma01", compareId: "hw02", startIdx: 1234, windowDays: 7, tab: "windows" };
    const q = buildQuery(v, startMs, 3600);
    expect(q).toBe("?site=mma01&compare=hw02&date=2026-12-22T10:00Z&days=7&tab=windows");
    expect(parseQuery(q, ctx)).toEqual(v);
  });
});

describe("Where to land priorities", () => {
  const base = { siteId: "mma01", compareId: "hw02", startIdx: 48, windowDays: 30, tab: "land" };
  it("a preset travels by its key; balanced is the default and is left out", () => {
    expect(buildQuery({ ...base, preset: "ice" }, startMs, 3600)).toBe("?site=mma01&compare=hw02&date=2026-11-03&days=30&tab=land&preset=ice");
    expect(buildQuery({ ...base, preset: "balanced" }, startMs, 3600)).not.toContain("preset");
    expect(parseQuery("?preset=ice", ctx)).toEqual({ preset: "ice" });
    expect(parseQuery("?preset=<script>", ctx)).toEqual({});
  });
  it("custom slider values travel as w= and round-trip", () => {
    const weights = [80, 15, 20, 10, 5, 10, 0, 0, 60, 0];
    const q = buildQuery({ ...base, weights }, startMs, 3600);
    expect(q).toContain("&w=80,15,20,10,5,10,0,0,60,0");
    expect(parseQuery(q, { ...ctx, tabs: ["land"] }).weights).toEqual(weights);
    expect(parseQuery("?w=1,2,3", ctx)).toEqual({});              // wrong length
    expect(parseQuery("?w=101,0,0,0,0,0,0,0,0,0", ctx)).toEqual({}); // out of range
    expect(parseQuery("?w=a,b", ctx)).toEqual({});
  });
});
