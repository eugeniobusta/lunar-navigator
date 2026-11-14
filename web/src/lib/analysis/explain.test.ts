import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../data/csv";
import { RULES, explain, summarise, valuesFromRow, verdictOf, type CriterionRow } from "./explain";

const DATA = new URL("../../../public/data/", import.meta.url);
const text = (p: string) => readFileSync(new URL(p, DATA), "utf8");
const criteria = parseCsv(text("criteria.csv")) as unknown as CriterionRow[];
const rule = (key: string) => RULES.find((r) => r.key === key)!;

describe("verdicts", () => {
  it("landing slope: good to 5, acceptable under 10, rejected from 10", () => {
    const r = rule("landingSlopeDeg");
    expect([3.4, 5, 5.1, 9.9, 10.1, 14.3].map((v) => verdictOf(r, v))).toEqual(["good", "good", "acceptable", "acceptable", "rejected", "rejected"]);
    expect(verdictOf(r, 10.0)).toBe("acceptable"); // published values are rounded: 9.96 shows as 10.0 and passes
  });
  it("sunlight and Earth: more is better", () => {
    expect([80, 70, 69.9, 25, 24.9].map((v) => verdictOf(rule("sunPct"), v))).toEqual(["good", "good", "acceptable", "acceptable", "rejected"]);
    expect(verdictOf(rule("earthPct"), 100)).toBe("good");
  });
  it("distance from the pole is pass or fail at 6 degrees", () => {
    expect([-84.44, -84, -83.9, -80.13].map((v) => verdictOf(rule("latDeg"), v))).toEqual(["good", "good", "rejected", "rejected"]);
  });
  it("darkness, time without Earth, shadow distance and temperature", () => {
    expect([74, 85, 86, 353, 354].map((v) => verdictOf(rule("longestDarkH"), v))).toEqual(["good", "good", "acceptable", "acceptable", "rejected"]);
    expect([0, 1, 335, 336].map((v) => verdictOf(rule("longestNoEarthH"), v))).toEqual(["good", "acceptable", "acceptable", "rejected"]);
    expect([0.3, 2, 2.1, 19.9, 20.4].map((v) => verdictOf(rule("shadowKm"), v))).toEqual(["good", "good", "acceptable", "acceptable", "rejected"]);
    expect([160, 150, 149, 110, 109].map((v) => verdictOf(rule("tempK"), v))).toEqual(["good", "good", "acceptable", "acceptable", "rejected"]);
  });
});

describe("sentences", () => {
  it("says the value, the verdict, the range and the reason from criteria.csv", () => {
    const [slope] = explain({ landingSlopeDeg: 3.4 }, criteria);
    expect(slope.sentence).toBe("Landing slope 3.4 degrees: good. 5 degrees or less is ideal, and the NASA Artemis III limit is 10. "
      + "Flatter ground leaves a margin for boulders and small craters the map cannot see.");
    expect(slope).toMatchObject({ label: "Landing slope", value: "3.4 degrees", verdict: "good", hardLimit: true });
  });
  it("explains only the values it is given, in a fixed order", () => {
    expect(explain({}, criteria)).toEqual([]);
    expect(explain({ earthPct: 100, latDeg: -85 }, criteria).map((e) => e.key)).toEqual(["latDeg", "earthPct"]);
    expect(explain({ tempK: Number.NaN, sunPct: 50 }, criteria).map((e) => e.key)).toEqual(["sunPct"]);
  });
  it("tells a hard failure from a soft zero", () => {
    const list = explain({ landingSlopeDeg: 14.3, shadowKm: 20.4 }, criteria);
    expect(list[0].sentence).toContain("rejected. 10 degrees or more breaks the NASA Artemis III limit.");
    expect(list[0].sentence).not.toContain("scores zero");
    expect(list[1].sentence).toContain("more than 20 km away: rejected.");
    expect(list[1].sentence).toContain("This scores zero but does not rule the spot out.");
    expect(summarise(list)).toBe("Ruled out by landing slope.");
  });
  it("works without the criteria table (no reason, still a full sentence)", () => {
    expect(explain({ longestNoEarthH: 0 })[0].sentence).toBe("Longest time without Earth 0 hours: good. Earth never drops below the skyline.");
  });
  it("every rule finds its reason in criteria.csv", () => {
    const all = explain({ latDeg: -85, landingSlopeDeg: 3, walkablePct: 99, sunPct: 60, earthPct: 60, shadowKm: 1, tempK: 140,
      longestDarkH: 100, longestNoEarthH: 10 }, criteria);
    expect(all.length).toBe(RULES.length);
    for (const e of all) {
      const r = rule(e.key);
      const row = criteria.filter((c) => c.parameter === r.parameter);
      expect(row.length, r.parameter).toBeGreaterThan(0);
      expect(e.sentence.endsWith((row.find((c) => c.kind === "soft") ?? row[0]).reason)).toBe(true);
    }
  });
});

describe("stays in step with the published thresholds", () => {
  it("bounds equal suitability/weights.json", () => {
    const w = JSON.parse(text("suitability/weights.json")) as { layers: { parameter: string; reject: number; ideal: number }[];
      zone_terms: { column: string; reject: number; ideal: number }[] };
    const byColumn: Record<string, string> = { sun_pct: "sunPct", earth_pct: "earthPct", landing_slope_deg: "landingSlopeDeg",
      psr_distance_km: "shadowKm", eva_walkable_pct: "walkablePct", temp_avg_k: "tempK", longest_dark_h: "longestDarkH",
      longest_no_earth_h: "longestNoEarthH" };
    for (const t of [...w.layers.map((l) => ({ column: l.parameter, ...l })), ...w.zone_terms]) {
      const r = rule(byColumn[t.column]);
      expect([t.column, r.reject, r.ideal]).toEqual([t.column, t.reject, t.ideal]);
    }
  });
  it("every zone passes its hard limits, and Artemis points fail where the pipeline says", () => {
    const zones = parseCsv(text("suitability/zones.csv"));
    for (const z of zones) {
      const blockers = explain(valuesFromRow(z), criteria).filter((e) => e.verdict === "rejected" && e.hardLimit);
      expect(blockers.map((e) => e.key)).toEqual([]);
    }
    const sites = parseCsv(text("suitability/site_values.csv"));
    const failed = (id: string) => explain(valuesFromRow(sites.find((s) => s.id === id)!), criteria)
      .filter((e) => e.verdict === "rejected" && e.hardLimit).map((e) => e.key);
    expect(failed("mma01")).toEqual([]);
    expect(failed("pcb03")).toEqual(["latDeg"]);
    expect(failed("nr208")).toEqual(["latDeg"]);
    expect(failed("mmp06")).toEqual(["sunPct"]);
    expect(summarise(explain(valuesFromRow(sites.find((s) => s.id === "mmp06")!), criteria))).toBe("Ruled out by sunlight.");
  });
});
