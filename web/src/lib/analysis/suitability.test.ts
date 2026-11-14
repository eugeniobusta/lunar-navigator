// The browser's scoring must reproduce the published suitability files exactly under the balanced weights,
// and agree with the Python pipeline for every preset (web/public/data/suitability/, INTERFACES.md sections 10-11).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../data/csv";
import {
  BALANCED, LAYER_KEYS, decodeScore, mapScore, mapScoreGrid, rankAmong, rankZones, subscore, zoneScore,
  type Preset, type Weights, type ZoneInput,
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
    expect(mapScore([0, 0, 0, 0, 0, 0], BALANCED)).toBe(0);
    expect(mapScore([255, 255, 255, 255, 255, 255], BALANCED)).toBe(100);
  });
  it("weights each layer by its share: sunlight alone is 30 % of the balanced map score", () => {
    expect(mapScore([255, 0, 0, 0, 0, 0], BALANCED)).toBe(30);
    expect(mapScore([0, 0, 0, 255, 0, 0], BALANCED)).toBe(15);  // permanent shadow nearby
    expect(mapScore([0, 0, 0, 0, 0, 255], BALANCED)).toBe(5);   // temperature
  });
  it("follows the weights: with only one term weighted, the score is that layer", () => {
    const only: Weights = { ...BALANCED, sunlight: 0, earth: 0, landing_slope: 0, walkable: 0, temperature: 0, shadow: 1 };
    expect(mapScore([255, 255, 255, 51, 255, 255], only)).toBe(20);
    expect(mapScore([1, 2, 3, 4, 5, 6], { ...only, shadow: 0 })).toBe(0); // no layer weighted at all
  });
  it("only ratios matter", () => {
    const doubled = Object.fromEntries(Object.entries(BALANCED).map(([k, v]) => [k, 2 * v])) as Weights;
    expect(mapScore([200, 13, 77, 140, 255, 9], doubled)).toBe(mapScore([200, 13, 77, 140, 255, 9], BALANCED));
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
    expect(config.default).toBe("balanced");
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
  });
});
