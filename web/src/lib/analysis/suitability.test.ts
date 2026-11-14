// The browser's scoring must reproduce the published suitability files exactly under the balanced weights,
// and agree with the Python pipeline for every preset (web/public/data/suitability/, INTERFACES.md sections 10-11).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../data/csv";
import {
  BALANCED, EVERYTHING, IMPORTANCE, LAYER_KEYS, PARAMETERS, TERM_KEYS, countedTerms, decodeScore, mapScore, mapScoreGrid,
  presetSelection, rankAmong, rankZones, rankZonesFor, sameSelection, selectionWeights, setImportance, subscore, toggleTerm,
  zoneScore, type Preset, type Selection, type Weights, type ZoneInput,
} from "./suitability";

const SUIT = new URL("../../../public/data/suitability/", import.meta.url);
const bytes = (p: string) => new Uint8Array(readFileSync(new URL(p, SUIT)));
const text = (p: string) => readFileSync(new URL(p, SUIT), "utf8");
const config = JSON.parse(text("weights.json")) as { presets: Preset[]; default: string; confirmed_zones: number;
  zone_terms: { key: string; reject: number; ideal: number }[] };
const preset = (key: string): Weights => config.presets.find((p) => p.key === key)!.weights;

function loadZones(): { zones: ZoneInput[]; rows: Record<string, string>[] } {
  const rows = parseCsv(text("zones.csv"));
  const q = parseCsv(text("zones_layers.csv"));
  const zones = rows.map((r, i) => {
    expect(q[i].rank).toBe(r.rank);
    return { id: +r.rank, q: LAYER_KEYS.map((k) => +q[i][k]), darkH: +r.longest_dark_h, noEarthH: +r.longest_no_earth_h,
      stayOk: r.stay_window_ok === "True", areaKm2: +r.area_km2 };
  });
  return { zones, rows };
}

describe("score formula", () => {
  it("is 0 with every layer at 0 and 100 with every layer at 255", () => {
    expect(mapScore([0, 0, 0, 0, 0, 0, 0, 0], BALANCED)).toBe(0);
    expect(mapScore([255, 255, 255, 255, 255, 255, 255, 255], BALANCED)).toBe(100);
    expect(mapScore([255, 255, 255, 255, 255, 255, 0, 0], BALANCED)).toBe(100); // ice and hollow carry no weight here
  });
  it("weights each layer by its share: sunlight alone is 30 % of the balanced map score", () => {
    expect(mapScore([255, 0, 0, 0, 0, 0, 0, 0], BALANCED)).toBe(30);
    expect(mapScore([0, 0, 0, 255, 0, 0, 0, 0], BALANCED)).toBe(15);  // permanent shadow nearby
    expect(mapScore([0, 0, 0, 0, 0, 255, 0, 0], BALANCED)).toBe(5);   // temperature
  });
  it("follows the weights: with only one term weighted, the score is that layer", () => {
    const only: Weights = { ...BALANCED, sunlight: 0, earth: 0, landing_slope: 0, walkable: 0, temperature: 0, shadow: 1 };
    expect(mapScore([255, 255, 255, 51, 255, 255, 255, 255], only)).toBe(20);
    expect(mapScore([1, 2, 3, 4, 5, 6, 7, 8], { ...only, shadow: 0 })).toBe(0); // no layer weighted at all
  });
  it("only ratios matter", () => {
    const doubled = Object.fromEntries(Object.entries(BALANCED).map(([k, v]) => [k, 2 * v])) as Weights;
    expect(mapScore([200, 13, 77, 140, 255, 9, 30, 40], doubled)).toBe(mapScore([200, 13, 77, 140, 255, 9, 30, 40], BALANCED));
  });
  it("zone score is 70 % map score + 15 % darkness + 15 % time without Earth under balanced", () => {
    expect(zoneScore(100, 85, 0, BALANCED)).toBe(100);
    expect(zoneScore(100, 400, 400, BALANCED)).toBe(70);
    expect(zoneScore(50, 219.5, 168, BALANCED)).toBe(50);
    expect(zoneScore(80, 400, 400, { ...BALANCED, darkness: 0, no_earth: 0 })).toBe(80);
    expect(zoneScore(65, 560, 0, BALANCED)).toBe(60);   // 60.5: exact halves go to the even number
    expect(zoneScore(55, 85, 336, BALANCED)).toBe(54);  // 53.5
  });
  it("matches the bounds published in weights.json", () => {
    expect(config.default).toBe("everything");
    expect(preset("balanced")).toEqual(BALANCED);
    expect(config.zone_terms.map((t) => [t.key, t.reject, t.ideal])).toEqual([["darkness", 354, 85], ["no_earth", 336, 0]]);
    expect(subscore(354, 354, 85)).toBe(0);
    expect(subscore(85, 354, 85)).toBe(1);
    expect(rankAmong(50, [60, 50, 40, 70])).toBe(3);
    expect(decodeScore(255)).toBeNull();
    expect(decodeScore(181)).toEqual({ passes: false, score: 80 });
  });
});

describe("reproduces the published files under balanced", () => {
  it("south-pole grid: every pixel of south_pole_score.u8", () => {
    const published = bytes("south_pole_score.u8");
    const ours = mapScoreGrid(LAYER_KEYS.map((k) => bytes(`layers/south_pole_${k}.u8`)), BALANCED);
    let checked = 0, wrong = 0;
    for (let i = 0; i < published.length; i++) {
      const d = decodeScore(published[i]);
      if (!d) continue;
      checked++;
      if (d.score !== ours[i]) wrong++;
    }
    expect(checked).toBe(1024 * 1024);
    expect(wrong).toBe(0);
  });
  it("site tiles: every cell of sites/<id>_score.u8", () => {
    for (const id of ["mma01", "hw02", "pcb03", "im2"]) {
      const published = bytes(`sites/${id}_score.u8`);
      const ours = mapScoreGrid(LAYER_KEYS.map((k) => bytes(`layers/sites/${id}_${k}.u8`)), BALANCED);
      let wrong = 0;
      for (let i = 0; i < published.length; i++) if (decodeScore(published[i])!.score !== ours[i]) wrong++;
      expect(published.length).toBe(512 * 512);
      expect(wrong).toBe(0);
    }
  });
  it("zones: every score, every map score and the whole ranking of zones.csv", () => {
    const { zones, rows } = loadZones();
    const ranked = rankZones(zones, BALANCED);
    expect(ranked.length).toBe(rows.length);
    expect(ranked.map((z) => z.id)).toEqual(rows.map((r) => +r.rank));
    expect(ranked.map((z) => z.score)).toEqual(rows.map((r) => +r.score));
    expect(ranked.map((z) => z.mapScore)).toEqual(rows.map((r) => +r.map_score));
  });
});

describe("selections: ticked parameters with an importance each", () => {
  it("a selection's weights are its ticks: low 0.5, normal 1, high 2 (as 1, 2, 4), unticked 0", () => {
    expect(IMPORTANCE).toEqual({ low: 1, normal: 2, high: 4 });
    const sel: Selection = { ticked: ["sunlight", "darkness", "ice"], importance: { sunlight: "high", ice: "low" } };
    const w = selectionWeights(sel);
    expect([w.sunlight, w.darkness, w.ice]).toEqual([4, 2, 1]);
    expect(TERM_KEYS.filter((k) => w[k] > 0)).toEqual(["sunlight", "ice", "darkness"]);
    expect(countedTerms(sel)).toEqual(["sunlight", "ice", "darkness"]);
  });
  it("the score is the weighted mean of the ticked parameters", () => {
    const q = [255, 0, 51, 102, 0, 0, 153, 0]; // sunlight 100 %, landing slope 20 %, ice nearby 40 %, ice depth 60 %
    const only = (ticked: Selection["ticked"], importance?: Selection["importance"]) => mapScore(q, selectionWeights({ ticked, importance }));
    expect(only(["sunlight"])).toBe(100);
    expect(only(["shadow"])).toBe(40);
    expect(only(["shadow", "ice"])).toBe(50);                       // (40 + 60) / 2
    expect(only(["sunlight", "landing_slope"])).toBe(60);           // (100 + 20) / 2
    expect(only(["sunlight", "landing_slope"], { sunlight: "high" })).toBe(73);  // (2 * 100 + 20) / 3
    expect(only(["sunlight", "landing_slope"], { sunlight: "low" })).toBe(47);   // (0.5 * 100 + 20) / 1.5
    expect(only([])).toBe(0);
    expect(only(["darkness"])).toBe(0);                             // no per-pixel layer: the map has nothing to show
  });
  it("zone terms join the mean at the zones: short nights and never out of contact", () => {
    const w = selectionWeights({ ticked: ["sunlight", "darkness"] });
    expect(zoneScore(80, 85, 300, w)).toBe(90);    // sunlight 80, night 85 h is ideal (100): mean 90; Earth is not ticked
    expect(zoneScore(80, 354, 0, w)).toBe(40);     // a 354 h night scores 0
    expect(zoneScore(0, 85, 0, selectionWeights({ ticked: ["darkness"] }))).toBe(100);
    expect(zoneScore(50, 219.5, 168, selectionWeights({ ticked: [...TERM_KEYS] }))).toBeGreaterThan(0);
  });
  it("ticking, unticking and importance give plain selections", () => {
    const a = toggleTerm({ ticked: ["sunlight"] }, "earth");
    expect(a.ticked).toEqual(["sunlight", "earth"]);
    expect(toggleTerm(a, "sunlight").ticked).toEqual(["earth"]);
    expect(setImportance(a, "earth", "high")).toEqual({ ticked: ["sunlight", "earth"], importance: { earth: "high" } });
    const exact: Selection = { ticked: ["sunlight"], weights: BALANCED };
    expect(toggleTerm(exact, "hollow").weights).toBeUndefined();   // editing an exact-weights selection makes it plain
    expect(toggleTerm(exact, "hollow").ticked).toContain("hollow");
    expect(sameSelection({ ticked: ["earth", "sunlight"] }, { ticked: ["sunlight", "earth"], importance: { earth: "normal" } })).toBe(true);
    expect(sameSelection({ ticked: ["earth"] }, { ticked: ["earth"], importance: { earth: "high" } })).toBe(false);
  });
  it("the checkbox list covers every parameter once, with a label, a line and a colour token", () => {
    expect(PARAMETERS.map((p) => p.key).sort()).toEqual([...TERM_KEYS].sort());
    for (const p of PARAMETERS) { expect(p.explain.length).toBeGreaterThan(20); expect(p.token.startsWith("--")).toBe(true); }
    const labels = Object.fromEntries([...(JSON.parse(text("weights.json")).layers as { key: string; label: string }[]),
      ...(JSON.parse(text("weights.json")).zone_terms as { key: string; label: string }[])].map((t) => [t.key, t.label]));
    for (const p of PARAMETERS) expect(labels[p.key]).toBe(p.label);
  });
});

describe("presets are selections", () => {
  const sel = (key: string) => presetSelection(config.presets.find((p) => p.key === key)!);
  it("the five presets, in order, with what they tick", () => {
    // "balanced" is first in the file so a reader that takes the first preset (the VR view) keeps the published ranking.
    expect(config.presets.map((p) => [p.key, p.label])).toEqual([["balanced", "NASA-style balance"], ["everything", "Everything"],
      ["power", "Power first"], ["radio", "Radio link"], ["ice", "Ice science"]]);
    expect(sel("everything")).toEqual({ ticked: [...TERM_KEYS] });
    expect(sameSelection(sel("everything"), EVERYTHING)).toBe(true);
    expect(sel("power")).toEqual({ ticked: ["sunlight", "darkness"] });
    expect(sel("radio")).toEqual({ ticked: ["earth", "no_earth"] });
    expect(sel("ice")).toEqual({ ticked: ["shadow", "ice"] });
  });
  it("every plain preset's published weights are what its ticks give", () => {
    for (const key of ["everything", "power", "radio", "ice"]) expect(selectionWeights(sel(key))).toEqual(preset(key));
  });
  it("NASA-style balance keeps the exact published weights, which no plain selection can give", () => {
    const b = sel("balanced");
    expect(b.weights).toEqual(BALANCED);
    expect(selectionWeights(b)).toEqual(BALANCED);
    expect(b.ticked).toEqual(TERM_KEYS.filter((k) => BALANCED[k] > 0));
  });
  it("each preset ranks all the zones, and what it favours is what it ticks", () => {
    const { zones, rows } = loadZones();
    const meanTop = (key: string, column: string) => {
      const top = rankZonesFor(zones, sel(key)).slice(0, 20);
      expect(rankZonesFor(zones, sel(key)).length).toBe(zones.length);
      return top.reduce((a, z) => a + +rows[z.id - 1][column], 0) / top.length;
    };
    expect(meanTop("power", "sun_pct")).toBeGreaterThan(meanTop("radio", "sun_pct"));
    expect(meanTop("power", "longest_dark_h")).toBeLessThan(meanTop("everything", "longest_dark_h"));
    expect(meanTop("radio", "earth_pct")).toBeGreaterThan(meanTop("power", "earth_pct"));
    expect(meanTop("radio", "longest_no_earth_h")).toBeLessThan(1); // hours: Earth practically never sets
    expect(meanTop("ice", "psr_distance_km")).toBeLessThan(meanTop("everything", "psr_distance_km"));
    // NASA-style balance is the published ranking itself.
    expect(rankZonesFor(zones, sel("balanced")).map((z) => z.id)).toEqual(rows.map((r) => +r.rank));
  });
});

describe("presets", () => {
  it("re-rank the zones, and the Artemis points land where the Python pipeline says", () => {
    const { zones } = loadZones();
    const confirmed = zones.filter((z) => z.stayOk);
    expect(confirmed.length).toBe(config.confirmed_zones);
    const points = parseCsv(text("artemis_points.csv"));
    expect(points.length).toBe(9);
    for (const p of config.presets) {
      const zoneScores = confirmed.map((z) => zoneScore(mapScore(z.q, p.weights), z.darkH, z.noEarthH, p.weights));
      for (const pt of points) {
        const score = zoneScore(mapScore(LAYER_KEYS.map((k) => +pt[k]), p.weights), +pt.longest_dark_h, +pt.longest_no_earth_h, p.weights);
        expect([pt.id, p.key, score]).toEqual([pt.id, p.key, +pt[`score_${p.key}`]]);
        expect([pt.id, p.key, rankAmong(score, zoneScores)]).toEqual([pt.id, p.key, +pt[`rank_${p.key}`]]);
      }
    }
  });
  it("ice science first favours zones next to permanent shadow", () => {
    const { zones, rows } = loadZones();
    const top = (w: Weights) => rankZones(zones, w).slice(0, 20).map((z) => +rows[z.id - 1].psr_distance_km);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(top(preset("ice")))).toBeLessThan(mean(top(BALANCED)));
    expect(Math.max(...top(preset("ice")))).toBeLessThanOrEqual(2.5); // ice nearby is ideal within 2 km
  });
});
