// The Layers view of "Where to land" is an adapter over suitability.ts: it must show the same scores as the zones.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../data/csv";
import {
  GRID, cellAt, cellCentre, failedLimits, latLonToXY, layerValue, layerValueText, ramp3, readPoint, xyToLatLon,
  type LayerInfo,
} from "./factors";
import { BALANCED, LAYER_KEYS, decodeScore, mapScore, rankZones, type Preset } from "./suitability";

const SUIT = new URL("../../../public/data/suitability/", import.meta.url);
const bytes = (p: string) => new Uint8Array(readFileSync(new URL(p, SUIT)));
const text = (p: string) => readFileSync(new URL(p, SUIT), "utf8");
const config = JSON.parse(text("weights.json")) as { layers: LayerInfo[]; presets: Preset[] };
const layers = LAYER_KEYS.map((k) => bytes(`layers/south_pole_${k}.u8`));
const score = bytes("south_pole_score.u8");

describe("one scoring engine", () => {
  it("the Layers view reads every pixel's score through suitability.mapScore", () => {
    const i = cellAt(-2027, 123072); // Malapert Massif
    const p = readPoint(layers, score, i, BALANCED);
    expect(p.q.length).toBe(LAYER_KEYS.length);
    expect(p.score).toBe(mapScore(p.q, BALANCED));
    for (const preset of config.presets) expect(readPoint(layers, score, i, preset.weights).score).toBe(mapScore(p.q, preset.weights));
  });
  it("under Balanced it shows exactly the published score at every pixel", () => {
    let checked = 0, wrong = 0;
    for (let i = 0; i < score.length; i++) {
      const d = decodeScore(score[i]);
      if (!d) continue;
      checked++;
      const p = readPoint(layers, score, i, BALANCED);
      if (p.score !== d.score || p.passes !== d.passes) wrong++;
    }
    expect(checked).toBe(GRID.size * GRID.size);
    expect(wrong).toBe(0);
  });
  it("under Balanced a zone's pixel shows the zone's own map score (zones.csv), and the zone scores are the same table", () => {
    const zones = parseCsv(text("zones.csv"));
    const zq = parseCsv(text("zones_layers.csv"));
    let same = 0;
    zones.forEach((z, k) => {
      // The zone's best 120 m cell, scored by the engine from its own layer bytes: exactly zones.csv.
      expect(mapScore(LAYER_KEYS.map((key) => +zq[k][key]), BALANCED)).toBe(+z.map_score);
      // The ~430 m map pixel holding it shows its best cell, so it can only show that score or a better neighbour.
      const p = readPoint(layers, score, cellAt(+z.x_m, +z.y_m), BALANCED);
      expect(p.passes).toBe(true);
      expect(p.score).toBeGreaterThanOrEqual(+z.map_score);
      if (p.score === +z.map_score) same++;
    });
    expect(same / zones.length).toBeGreaterThan(0.8); // 86 % in this build
    // The zone scores both views show come from one call, rankZones, which reproduces zones.csv.
    const ranked = rankZones(zones.map((z, k) => ({ id: +z.rank, q: LAYER_KEYS.map((key) => +zq[k][key]), darkH: +z.longest_dark_h,
      noEarthH: +z.longest_no_earth_h, stayOk: z.stay_window_ok === "True", areaKm2: +z.area_km2 })), BALANCED);
    expect(ranked.map((r) => r.score)).toEqual(zones.map((z) => +z.score));
  });
  it("the layers in weights.json are the engine's layers, with the bounds of docs/criteria.csv", () => {
    expect(config.layers.map((l) => l.key)).toEqual([...LAYER_KEYS]);
    const bound = (key: string) => { const l = config.layers.find((x) => x.key === key)!; return [l.reject, l.ideal]; };
    expect(bound("landing_slope")).toEqual([10, 5]);
    expect(bound("ice")).toEqual([1, 0]);
    expect(bound("hollow")).toEqual([70, 0]);
    for (const p of config.presets) expect(Object.keys(p.weights).sort()).toEqual([...LAYER_KEYS, "darkness", "no_earth"].sort());
    expect(BALANCED.ice).toBe(0);
    expect(BALANCED.hollow).toBe(0);
  });
});

describe("reading a layer byte back", () => {
  const slope: LayerInfo = { key: "landing_slope", label: "Flat landing ground", unit: "deg", reject: 10, ideal: 5 };
  const sun: LayerInfo = { key: "sunlight", label: "Sunlight", unit: "% of time", reject: 25, ideal: 70 };
  it("is linear between the bounds", () => {
    expect(layerValue(0, slope)).toBe(10);
    expect(layerValue(255, slope)).toBe(5);
    expect(layerValue(127.5, sun)).toBeCloseTo(47.5, 9);
  });
  it("says 'or more' / 'or less' at the ends, where the layer is clipped", () => {
    expect(layerValueText(102, slope)).toBe("8 deg");
    expect(layerValueText(255, slope)).toBe("5 deg or less");
    expect(layerValueText(0, slope)).toBe("10 deg or more");
    expect(layerValueText(255, sun)).toBe("70 % of time or more");
    expect(layerValueText(0, sun)).toBe("25 % of time or less");
  });
  it("names the hard limits that fail", () => {
    expect(failedLimits(0)).toEqual([]);
    expect(failedLimits(1 | 16)).toEqual(["landing slope of 10° or more", "more than 6° from the pole"]);
    expect(failedLimits(255)).toEqual([]);
  });
});

describe("where a pixel is", () => {
  it("lat/lon <-> x/y: lon 0 is +y, lon 90 E is +x, the pole is the origin", () => {
    const [x, y] = latLonToXY(-85.9425, -0.94365); // Malapert, as in terrain/south_pole.json
    expect(x).toBeCloseTo(-2027.2, 0);
    expect(y).toBeCloseTo(123071.7, 0);
    const [lat, lon] = xyToLatLon(x, y);
    expect(lat).toBeCloseTo(-85.9425, 6);
    expect(lon).toBeCloseTo(-0.94365, 6);
    expect(xyToLatLon(100000, 0)[1]).toBeCloseTo(90, 9);
  });
  it("cells: row 0 is the northern edge, and a cell's centre falls back into the same cell", () => {
    expect(cellAt(-219999, 219999)).toBe(0);
    expect(cellAt(219999, -219999)).toBe(GRID.size * GRID.size - 1);
    expect(cellAt(221000, 0)).toBe(-1);
    for (const i of [0, 12345, 524288, 1048575]) expect(cellAt(...cellCentre(i))).toBe(i);
  });
  it("colour-blind ramp runs from its first stop to its last", () => {
    const stops: [[number, number, number], [number, number, number], [number, number, number]] = [[0, 32, 77], [124, 123, 120], [253, 231, 55]];
    expect(ramp3(stops, 0)).toEqual([0, 32, 77]);
    expect(ramp3(stops, 0.5)).toEqual([124, 123, 120]);
    expect(ramp3(stops, 1)).toEqual([253, 231, 55]);
    expect(ramp3(stops, 2)).toEqual([253, 231, 55]);
  });
});
