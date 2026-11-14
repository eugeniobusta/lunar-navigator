// Traffic lights (rag.ts): every class boundary, flipped directions, missing data, the hard-limit override, and
// that nothing here moves the published scores.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../data/csv";
import { explainFor, strengths, weaknesses } from "./explain";
import {
  BOUNDS, CODE, GROUPS, HARD_LIMITS, NO_DATA, SCORE_AMBER, SCORE_GREEN, UNSAFE, byteValue, classGrid, classRanges,
  classifyByte, classifyCell, classifyScore, classifyValue, codeRag, failedLimitNames, groupState, legend, mapMode,
  prefers, termClasses, toggleGroup, unsafeLabel,
} from "./rag";
import {
  BALANCED, EVERYTHING, FLIPPABLE, LAYER_KEYS, TERM_KEYS, decodeScore, mapScore, rankZonesFor, sameSelection,
  selectionWeights, toggleFlip, toggleTerm, type LayerKey, type Selection, type TermKey, type ZoneInput,
} from "./suitability";

const DATA = new URL("../../../public/data/", import.meta.url);
const bytes = (p: string) => new Uint8Array(readFileSync(new URL(p, DATA)));
const text = (p: string) => readFileSync(new URL(p, DATA), "utf8");
const only = (...ticked: TermKey[]): Selection => ({ ticked });
const balanced: Selection = { ticked: TERM_KEYS.filter((k) => BALANCED[k] > 0), weights: BALANCED };

describe("one parameter: green in the good range, amber acceptable, red rejected", () => {
  it("from a layer byte: 255 is green, 0 is red, everything between is amber", () => {
    for (const k of ["shadow", "temperature", "ice", "hollow"] as LayerKey[]) {
      expect(classifyByte(k, 255)).toBe("green");
      expect(classifyByte(k, 254)).toBe("amber");
      expect(classifyByte(k, 1)).toBe("amber");
      expect(classifyByte(k, 0)).toBe("red");
    }
  });
  it("where the reject bound is a NASA limit, the limit decides red, not the rounded byte", () => {
    // Sunlight of exactly 25 % has byte 0 and passes the limit: acceptable. Under 25 % the limit fails: red.
    expect(classifyByte("sunlight", 0, 0)).toBe("amber");
    expect(classifyByte("sunlight", 0, 4)).toBe("red");
    expect(classifyByte("sunlight", 1, 4)).toBe("red");     // byte nudged by one step, limit still fails
    expect(classifyByte("landing_slope", 0, 1)).toBe("red");
    expect(classifyByte("landing_slope", 255, 0)).toBe("green");
    expect(classifyByte("earth", 130, 0)).toBe("amber");
    expect(classifyByte("walkable", 40, 2)).toBe("red");
    // Another limit failing does not colour this parameter: slope fails, sunlight itself is fine.
    expect(classifyByte("sunlight", 255, 1)).toBe("green");
  });
  it("from a value, at every boundary of docs/criteria.csv", () => {
    const at = (k: TermKey, v: number) => classifyValue(k, v);
    expect([at("sunlight", 70), at("sunlight", 69.9), at("sunlight", 25), at("sunlight", 24.9)]).toEqual(["green", "amber", "amber", "red"]);
    expect([at("earth", 70), at("earth", 69.9), at("earth", 25), at("earth", 24.9)]).toEqual(["green", "amber", "amber", "red"]);
    expect([at("landing_slope", 5), at("landing_slope", 5.1), at("landing_slope", 9.9), at("landing_slope", 10.1)]).toEqual(["green", "amber", "amber", "red"]);
    expect([at("walkable", 95), at("walkable", 94), at("walkable", 50), at("walkable", 49)]).toEqual(["green", "amber", "amber", "red"]);
    expect([at("shadow", 2), at("shadow", 2.1), at("shadow", 19.9), at("shadow", 20)]).toEqual(["green", "amber", "amber", "red"]);
    expect([at("temperature", 150), at("temperature", 149), at("temperature", 110), at("temperature", 109)]).toEqual(["green", "amber", "amber", "red"]);
    expect([at("ice", 0), at("ice", 0.01), at("ice", 0.99), at("ice", 1), at("ice", Infinity)]).toEqual(["green", "amber", "amber", "red", "red"]);
    expect([at("hollow", -10), at("hollow", 0), at("hollow", 1), at("hollow", 69), at("hollow", 70)]).toEqual(["green", "green", "amber", "amber", "red"]);
    expect([at("darkness", 85), at("darkness", 86), at("darkness", 353), at("darkness", 354)]).toEqual(["green", "amber", "amber", "red"]);
    expect([at("no_earth", 0), at("no_earth", 1), at("no_earth", 335), at("no_earth", 336)]).toEqual(["green", "amber", "amber", "red"]);
  });
  it("a byte reads back as a value between the bounds", () => {
    expect(byteValue("sunlight", 0)).toBe(25);
    expect(byteValue("sunlight", 255)).toBe(70);
    expect(byteValue("landing_slope", 255)).toBe(5);
    expect(byteValue("landing_slope", 0)).toBe(10);
    expect(byteValue("temperature", 51)).toBeCloseTo(118, 9);
  });
});

describe("missing data is grey, never green", () => {
  it("a missing value or a no-data cell", () => {
    for (const k of TERM_KEYS) {
      expect(classifyValue(k, undefined)).toBe("grey");
      expect(classifyValue(k, NaN)).toBe("grey");
      expect(classifyValue(k, undefined, true)).toBe("grey");
    }
    for (const k of LAYER_KEYS) expect(classifyByte(k, 255, NO_DATA)).toBe("grey");
    expect(classifyScore(NaN)).toBe("grey");
    const cell = classifyCell([255, 255, 255, 255, 255, 255, 255, 255], NO_DATA, EVERYTHING);
    expect(cell).toEqual({ rag: "grey", score: null, unsafe: null, failed: [], under: null });
  });
  it("in a grid: no-data cells are grey with no score, whatever the layers hold", () => {
    const layers = LAYER_KEYS.map(() => new Uint8Array([255, 255]));
    const score = new Uint8Array(2);
    const codes = classGrid(layers, new Uint8Array([NO_DATA, 0]), EVERYTHING, undefined, score);
    expect([...codes]).toEqual([CODE.grey, CODE.green]);
    expect([...score]).toEqual([255, 100]);
    expect(codeRag(codes[0])).toBe("grey");
  });
  it("'no stable ice' is an answer, not a gap: red, and green only if the user asks for the opposite", () => {
    expect(classifyValue("ice", Infinity)).toBe("red");
    expect(classifyValue("ice", Infinity, true)).toBe("green");
  });
});

describe("flipping a direction swaps green and red for that parameter only", () => {
  it("only five parameters can flip", () => {
    expect([...FLIPPABLE].sort()).toEqual(["hollow", "ice", "landing_slope", "shadow", "temperature"]);
    expect(toggleFlip(EVERYTHING, "sunlight")).toBe(EVERYTHING);
    expect(toggleFlip(EVERYTHING, "temperature").flipped).toEqual(["temperature"]);
    expect(toggleFlip(toggleFlip(EVERYTHING, "temperature"), "temperature").flipped).toEqual([]);
  });
  it("default directions come from the bounds of criteria.csv", () => {
    expect(TERM_KEYS.filter((k) => prefers(k) === "more")).toEqual(["sunlight", "earth", "walkable", "temperature"]);
    expect(prefers("temperature", true)).toBe("less");
    expect(prefers("landing_slope", true)).toBe("more");
  });
  it("classes swap, amber stays", () => {
    expect([classifyByte("temperature", 255, 0, true), classifyByte("temperature", 100, 0, true), classifyByte("temperature", 0, 0, true)])
      .toEqual(["red", "amber", "green"]);
    expect([classifyValue("temperature", 160, true), classifyValue("temperature", 130, true), classifyValue("temperature", 90, true)])
      .toEqual(["red", "amber", "green"]);
    expect(classifyValue("shadow", 25, true)).toBe("green");
  });
  it("the score turns that layer round and leaves the others alone", () => {
    const q = [10, 20, 30, 40, 50, 255, 70, 80];
    const cold = toggleFlip(only("temperature"), "temperature");
    expect(classifyCell(q, 0, only("temperature")).score).toBe(100);
    expect(classifyCell(q, 0, cold).score).toBe(0);
    const two = only("sunlight", "temperature");
    expect(classifyCell(q, 0, toggleFlip(two, "temperature")).score).toBe(mapScore([10, 0, 0, 0, 0, 0, 0, 0], selectionWeights(two)));
    // Flipping a parameter that is not ticked changes nothing.
    expect(sameSelection(toggleFlip(only("sunlight"), "temperature"), only("sunlight"))).toBe(true);
    expect(sameSelection(cold, only("temperature"))).toBe(false);
    // Unticking drops the flip; the grid agrees with the single cell.
    expect(toggleTerm(cold, "temperature").flipped).toEqual([]);
  });
  it("NASA's limits never flip: steeper ground can be preferred, but 10 degrees or more is still unsafe", () => {
    const steep = toggleFlip(only("landing_slope"), "landing_slope");
    expect(classifyByte("landing_slope", 0, 1, true)).toBe("red");
    expect(classifyValue("landing_slope", 12, true)).toBe("red");
    expect(classifyValue("landing_slope", 3, true)).toBe("red");    // flat ground is what this user does not want
    expect(classifyValue("landing_slope", 7, true)).toBe("amber");
    const cell = classifyCell([0, 0, 0, 0, 0, 0, 0, 0], 1, steep);
    expect(cell.rag).toBe("red");
    expect(cell.unsafe).toBe("unsafe: fails landing slope under 10°");
    expect(legend(steep).green).toMatch(/unsafe/);
  });
  it("zones are re-ranked with the flipped direction", () => {
    const zones: ZoneInput[] = [
      { id: 1, q: [0, 0, 0, 0, 0, 255, 0, 0], darkH: 0, noEarthH: 0, stayOk: true, areaKm2: 1 },
      { id: 2, q: [0, 0, 0, 0, 0, 0, 0, 0], darkH: 0, noEarthH: 0, stayOk: true, areaKm2: 1 },
    ];
    expect(rankZonesFor(zones, only("temperature")).map((z) => z.id)).toEqual([1, 2]);
    expect(rankZonesFor(zones, toggleFlip(only("temperature"), "temperature")).map((z) => z.id)).toEqual([2, 1]);
  });
  it("'Why here?' swaps the verdict and says so; a broken NASA limit stays rejected", () => {
    const list = explainFor({ tempK: 90, landingSlopeDeg: 12 }, [], ["temperature", "landing_slope"], ["temperature", "landing_slope"]);
    const temp = list.find((e) => e.key === "tempK")!, slope = list.find((e) => e.key === "landingSlopeDeg")!;
    expect(temp.verdict).toBe("good");
    expect(temp.sentence).toMatch(/You chose to prefer less/);
    expect(slope.verdict).toBe("rejected");
    expect(strengths(list).map((e) => e.key)).toEqual(["tempK"]);
    expect(weaknesses(list).map((e) => e.key)).toEqual(["landingSlopeDeg"]);
  });
});

describe("groups", () => {
  it("four groups cover every parameter once", () => {
    expect(GROUPS.map((g) => g.label)).toEqual(["Safe ground", "Power and heat", "Radio link", "Ice and science"]);
    expect(GROUPS.flatMap((g) => g.terms).sort()).toEqual([...TERM_KEYS].sort());
  });
  it("a group tick is all its parameters", () => {
    const radio = GROUPS[2];
    const sel = toggleGroup(only("sunlight"), radio);
    expect(sel.ticked).toEqual(["sunlight", "earth", "no_earth"]);
    expect(groupState(sel, radio)).toBe("all");
    expect(groupState(only("earth"), radio)).toBe("some");
    expect(groupState(only("sunlight"), radio)).toBe("none");
    expect(toggleGroup(sel, radio).ticked).toEqual(["sunlight"]);
    expect(toggleGroup(only("earth"), radio).ticked).toEqual(["earth", "no_earth"]); // partly ticked -> all
  });
});

describe("combined map: the weighted score, then green from 70, amber from 40, red below", () => {
  it("score classes at their boundaries", () => {
    expect([SCORE_GREEN, SCORE_AMBER]).toEqual([70, 40]);
    expect([100, 70, 69, 40, 39, 0].map(classifyScore)).toEqual(["green", "green", "amber", "amber", "red", "red"]);
  });
  it("what the map shows follows the ticks", () => {
    expect(mapMode(only("sunlight"))).toEqual({ kind: "single", term: "sunlight" });
    expect(mapMode(only("sunlight", "darkness"))).toEqual({ kind: "single", term: "sunlight" }); // darkness has no map
    expect(mapMode(only("sunlight", "earth"))).toEqual({ kind: "combined" });
    expect(mapMode(only("darkness", "no_earth"))).toEqual({ kind: "limits" });
    expect(mapMode(only())).toEqual({ kind: "limits" });
  });
  it("a hard limit always wins: a perfect score on unsafe ground is red and says why", () => {
    const perfect = [255, 255, 255, 255, 255, 255, 255, 255];
    for (const limit of HARD_LIMITS) {
      const cell = classifyCell(perfect, limit.bit, EVERYTHING);
      expect(cell).toMatchObject({ rag: "red", score: 100, under: "green", unsafe: `unsafe: fails ${limit.name}`, failed: [limit.name] });
    }
    expect(unsafeLabel(1 | 8)).toBe("unsafe: fails landing slope under 10°, Earth in view");
    expect(unsafeLabel(0)).toBeNull();
    expect(failedLimitNames(NO_DATA)).toEqual([]);
    expect(classifyCell(perfect, 0, EVERYTHING)).toMatchObject({ rag: "green", unsafe: null });
  });
  it("grid codes: the class, plus the unsafe flag where a limit fails", () => {
    const col = (...v: number[]) => new Uint8Array(v);
    // four cells: perfect, middling, poor, perfect but too steep
    const layers = LAYER_KEYS.map(() => col(255, 140, 50, 255));
    const codes = classGrid(layers, col(0, 0, 0, 1), EVERYTHING);
    expect([...codes]).toEqual([CODE.green, CODE.amber, CODE.red, CODE.green | UNSAFE]);
    expect([...codes].map(codeRag)).toEqual(["green", "amber", "red", "red"]);
    // nothing ticked that has a map: passing ground is "unscored", unsafe ground still red
    const none = classGrid(layers, col(0, 0, 0, 1), only("darkness"));
    expect([...none].map(codeRag)).toEqual(["unscored", "unscored", "unscored", "red"]);
    // one parameter by itself uses its own ranges, not the score classes
    const sun = classGrid(layers, col(0, 0, 4, 0), only("sunlight"));
    expect([...sun].map(codeRag)).toEqual(["green", "amber", "red", "green"]);
  });
  it("the legend gives real units for one parameter and score ranges for several", () => {
    expect(classRanges("sunlight")).toEqual({ green: "70 % of the time or more", amber: "25 to 70 % of the time", red: "under 25 % of the time" });
    expect(classRanges("landing_slope")).toEqual({ green: "5° or less", amber: "5 to 10°", red: "10° or more" });
    expect(classRanges("temperature", true)).toEqual({ green: "under 110 K", amber: "110 to 150 K", red: "150 K or more" });
    expect(legend(only("sunlight", "earth"))).toEqual({ title: "combined", green: "score 70 to 100", amber: "score 40 to 69", red: "score under 40" });
    expect(legend(only("shadow")).red).toBe("more than 20 km");
    for (const k of TERM_KEYS) expect(BOUNDS[k].unit).toBeTruthy();
  });
  it("classes at real values, for zones and sites", () => {
    const got = termClasses({ sunlight: 80, earth: 30, darkness: 400 }, only("sunlight", "earth", "darkness", "ice"));
    expect(got).toEqual([{ term: "sunlight", rag: "green" }, { term: "earth", rag: "amber" }, { term: "ice", rag: "grey" }, { term: "darkness", rag: "red" }]);
  });
});

describe("on the published data", () => {
  const layers = LAYER_KEYS.map((k) => bytes(`suitability/layers/south_pole_${k}.u8`));
  const limits = bytes("suitability/south_pole_limits.u8"), published = bytes("suitability/south_pole_score.u8");
  it("NASA-style balance still reproduces every published score, and the classes follow from it", () => {
    const score = new Uint8Array(limits.length);
    const codes = classGrid(layers, limits, balanced, undefined, score);
    let green = 0, unsafeGreen = 0;
    for (let i = 0; i < limits.length; i++) {
      const pub = decodeScore(published[i]);
      if (!pub) { expect(codes[i]).toBe(CODE.grey); continue; }
      if (score[i] !== pub.score || !!(codes[i] & UNSAFE) === pub.passes) throw new Error(`cell ${i}: ${score[i]} vs ${pub.score}`);
      if (codeRag(codes[i]) === "green") green++;
      if (codes[i] & UNSAFE && (codes[i] & 7) === CODE.green) unsafeGreen++;
    }
    expect(green).toBeGreaterThan(0);
    // Ground that scores 70 or more but breaks a NASA limit exists, and is never shown green.
    expect(unsafeGreen).toBeGreaterThan(0);
  });
  it("steep ground is never green, under any preset or single parameter", () => {
    const config = JSON.parse(text("suitability/weights.json")) as { presets: { ticked: TermKey[] }[] };
    const selections = [...config.presets.map((p) => ({ ticked: p.ticked })), ...LAYER_KEYS.map((k) => only(k)),
      toggleFlip(only("landing_slope"), "landing_slope")];
    for (const sel of selections) {
      const codes = classGrid(layers, limits, sel);
      for (let i = 0; i < codes.length; i++)
        if (limits[i] !== NO_DATA && limits[i] !== 0 && codeRag(codes[i]) !== "red") throw new Error(`cell ${i} fails a limit but is ${codeRag(codes[i])}`);
    }
  });
  it("the grid and the single-cell function agree", () => {
    const sel = toggleFlip(only("sunlight", "temperature", "shadow"), "temperature");
    const codes = classGrid(layers, limits, sel);
    for (let i = 0; i < codes.length; i += 997) {
      const cell = classifyCell(layers.map((l) => l[i]), limits[i], sel);
      expect(codeRag(codes[i])).toBe(cell.rag);
    }
  });
  it("zone values classify like their layer bytes (the zones' own numbers, from zones.csv)", () => {
    const zones = parseCsv(text("suitability/zones.csv")), zl = parseCsv(text("suitability/zones_layers.csv"));
    let differ = 0;
    zones.forEach((z, i) => {
      const pairs: [LayerKey, number][] = [["sunlight", +z.sun_pct], ["earth", +z.earth_pct], ["landing_slope", +z.landing_slope_deg],
        ["walkable", +z.eva_walkable_pct], ["shadow", +z.psr_distance_km]];
      for (const [k, v] of pairs) if (classifyValue(k, v) !== classifyByte(k, +zl[i][k], 0)) differ++;
    });
    // Published values are rounded (one decimal) and bytes are rounded to 1/255 of the range, so a few zones on a
    // boundary read differently; it must stay rare.
    expect(differ / (zones.length * 5)).toBeLessThan(0.02);
  });
});
