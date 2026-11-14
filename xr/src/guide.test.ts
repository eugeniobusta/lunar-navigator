// The time a site opens at, the safe-landing colours and their legend, and tiles cut from the south-pole grid,
// against the published data and the analysis library they are built on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeSeries, type Ephemeris } from '../../web/src/lib/analysis';
import { demHorizon, heightAt, parseHeightGrid, stereoXY } from '../../web/src/lib/analysis/demHorizon';
import type { CriterionRow } from '../../web/src/lib/analysis/explain';
import { paintClasses } from '../../web/src/lib/analysis/paint';
import { classGrid, classRanges, classifyScore } from '../../web/src/lib/analysis/rag';
import { EVERYTHING, LAYER_KEYS, presetSelection, sameSelection, type Preset, type Selection } from '../../web/src/lib/analysis/suitability';
import { parseCsv } from '../../web/src/lib/data/csv';
import { resampleBytes, tileFromPole, type SouthPole } from './data';
import {
  CB_COLOR,
  RAG_COLOR,
  mapLegend,
  nextSunUp,
  paintStyle,
  priorities,
} from './guide';

const DATA = new URL('../../web/public/data/', import.meta.url);
const text = (p: string) => readFileSync(new URL(p, DATA), 'utf8');
const json = (p: string) => JSON.parse(text(p));
const bin = (p: string): ArrayBuffer => {
  const b = readFileSync(new URL(p, DATA));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const u8 = (p: string) => new Uint8Array(bin(p));

const e = json('ephemeris.json');
const eph: Ephemeris = {
  startMs: Date.parse(e.start_utc), stepS: e.step_s, n: e.n,
  sunDir: Float64Array.from(e.sun_dir), sunSemiDiam: Float64Array.from(e.sun_semidiam_deg), earthKm: Float64Array.from(e.earth_km),
};
const poleMeta = json('terrain/south_pole.json');
const poleGrid = parseHeightGrid(poleMeta, bin(`terrain/${poleMeta.files.height}`));
const tileMeta = json('terrain/sites/mma01/tile.json');
const tile = parseHeightGrid(tileMeta, bin('terrain/sites/mma01/height.u16'));
const far = parseHeightGrid(tileMeta.far, bin('terrain/sites/mma01/far.u16'));
const site = json('sites.json').sites.find((s: { id: string }) => s.id === 'mma01');
const hz = demHorizon(tile, [poleGrid, far], site.lat, site.lon, { observerHM: 2, siteId: 'mma01' });
const criteria = parseCsv(text('criteria.csv')) as unknown as CriterionRow[];
const presets: Preset[] = json('suitability/weights.json').presets;
const zones = () => buildZones(parseCsv(text('suitability/zones.csv')), parseCsv(text('suitability/zones_layers.csv')));

describe('demo start', () => {
  it('nextSunUp returns the first hour with the whole Sun above the skyline, and nothing earlier has it', () => {
    // Start in a dark hour, so the search has something to do.
    const all = computeSeries(eph, hz, 0, 2000);
    const from = all.sunlit.indexOf(0);
    expect(from).toBeGreaterThanOrEqual(0);
    const up = nextSunUp(eph, hz, from)!;
    expect(up).toBeGreaterThan(from);
    expect(all.sunFrac[up]).toBe(1);
    expect(all.sunMargin[up]).toBeGreaterThan(eph.sunSemiDiam[up]);
    expect(Array.from(all.sunFrac.subarray(from, up)).every((v) => v < 1)).toBe(true);
    // Already up: no shift. Too short a search for the whole disc: the first hour its centre is up, else null.
    expect(nextSunUp(eph, hz, up)).toBe(up);
    const centre = from + Array.from(all.sunlit.subarray(from)).indexOf(1);
    expect(centre).toBeLessThan(up);
    expect(nextSunUp(eph, hz, from, up - from)).toBe(centre);
    expect(nextSunUp(eph, hz, from, 1)).toBeNull();
  });

});

describe('safe landing colours', () => {
  const prio = priorities(json('suitability/weights.json'));
  const only = (...ticked: Selection['ticked']): Selection => ({ ticked });

  it('the class colours are the website\'s tokens', () => {
    const css = readFileSync(new URL('../../web/src/styles/tokens.css', import.meta.url), 'utf8');
    const pairs: [string, string][] = [
      ['--go', RAG_COLOR.green], ['--caution', RAG_COLOR.amber], ['--stop', RAG_COLOR.red], ['--nodata', RAG_COLOR.grey],
      ['--cb-high', CB_COLOR.green], ['--cb-mid', CB_COLOR.amber], ['--cb-low', CB_COLOR.red], ['--void', CB_COLOR.grey],
    ];
    for (const [token, hex] of pairs) {
      expect(css).toContain(`${token}: ${hex}`);
    }
    const st = paintStyle(false, 0.5, 0.25);
    expect(st.green).toEqual([0x6f, 0xbf, 0x73]);
    expect(st.opacity).toBe(0.5);
    expect(st.unsafeOpacity).toBe(0.25);
    expect(paintStyle(true, 1, 1).green).toEqual([0xfd, 0xe7, 0x37]);
  });

  it('opacity and palette never change a class or a score', () => {
    const limits = u8('suitability/sites/mma01_limits.u8');
    const layers = LAYER_KEYS.map((k) => u8(`suitability/layers/sites/mma01_${k}.u8`));
    const score = new Uint8Array(limits.length);
    const codes = classGrid(layers, limits, EVERYTHING, undefined, score);
    const before = [Uint8Array.from(codes), Uint8Array.from(score)];
    const a = paintClasses(codes, paintStyle(false, 1, 1));
    const b = paintClasses(codes, paintStyle(true, 0.25, 0));
    expect(codes).toEqual(before[0]);
    expect(score).toEqual(before[1]);
    expect(a).not.toEqual(b); // the pictures differ; the classes do not
    // Opacity 0 for both: nothing is drawn anywhere.
    const none = paintClasses(codes, paintStyle(false, 0, 0));
    let drawn = 0;
    for (let i = 3; i < none.length; i += 4) {
      drawn += none[i];
    }
    expect(drawn).toBe(0);
  });

  it('the legend says what the website says', () => {
    const page = readFileSync(new URL('../../web/src/routes/LandingMap.tsx', import.meta.url), 'utf8');
    // The page builds its lines from these pieces, one set per palette.
    for (const words of ['"Yellow" : "Green"}, good: {lg.green}', '"Grey" : "Amber"}, acceptable: {lg.amber}', '"Dark blue" : "Red"}, poor: {lg.red}',
      'Hatched: unsafe, fails a NASA limit', '"Black" : "Grey"}: no data',
      'Clear ground passes every NASA limit. Tick a parameter to score it.', 'Combined score of all ten parameters', 'NASA safety limits only']) {
      expect(page).toContain(words);
    }
    const cb = mapLegend(EVERYTHING, prio, true);
    expect(cb.lines.map((l) => l.text.split(/[,:]/)[0])).toEqual(['Yellow', 'Grey', 'Dark blue', 'Hatched', 'Black']);
    const all = mapLegend(EVERYTHING, prio);
    expect(all.what).toBe('Combined score of all ten parameters');
    expect(all.lines.map((l) => l.mark)).toEqual(['green', 'amber', 'red', 'unsafe', 'grey']);
    expect(all.lines[0].text).toBe('Green, good: score 70 to 100');
    expect(all.lines[2].text).toBe('Red, poor: score under 40');
    expect(all.lines[3].text).toBe('Hatched: unsafe, fails a NASA limit');
    const sun = mapLegend(only('sunlight'), prio);
    expect(sun.what).toBe('Sunlight alone');
    expect(sun.lines[0].text).toBe(`Green, good: ${classRanges('sunlight').green}`);
    expect(sun.lines[0].text).toContain('70');
    expect(mapLegend(only('sunlight', 'darkness', 'earth'), prio).what).toBe('Combined score of Sunlight + Earth in view');
    const none = mapLegend(only('darkness'), prio);
    expect(none.what).toBe('NASA safety limits only');
    expect(none.lines.map((l) => l.mark)).toEqual([null, 'unsafe', 'grey']);
  });

});

describe('tileFromPole', () => {
  const sunMap = u8(`terrain/${poleMeta.files.sun}`);
  const pole: SouthPole = { grid: poleGrid, sun: sunMap, earth: u8(`terrain/${poleMeta.files.earth}`) };
  const [x, y] = stereoXY(-87.2, 140);
  const t = tileFromPole('zone-x', pole, null, x, y);

  it('has the layout of a site tile, centred on the point', () => {
    expect(t.grid.size).toBe(512);
    expect(t.grid.pixelM).toBe(120);
    expect(t.far.pixelM).toBe(600);
    expect(t.grid.xMinM + 256 * 120).toBeCloseTo(x, 6);
    expect(t.coarse).toBe(true);
    expect(Array.from(t.slope).every((v) => v === 255)).toBe(true);
  });

  it('heights follow the south-pole grid and the NASA maps keep their pixels', () => {
    let worst = 0;
    for (const [dx, dy] of [[0, 0], [5000, -12000], [-25000, 25000], [29000, 3000]]) {
      worst = Math.max(worst, Math.abs(heightAt(t.grid, x + dx, y + dy) - heightAt(poleGrid, x + dx, y + dy)));
    }
    console.log('tileFromPole height error vs south-pole grid, worst of 4 points (m):', worst.toFixed(2));
    expect(worst).toBeLessThan(15);
    const g = poleGrid;
    const r = 100;
    const c = 400;
    const px = x - 256 * 120 + (c + 0.5) * 120;
    const py = y + 256 * 120 - (r + 0.5) * 120;
    const src = Math.floor((g.yMaxM - py) / g.pixelM) * g.size + Math.floor((px - g.xMinM) / g.pixelM);
    expect(t.sun[r * 512 + c]).toBe(sunMap[src]);
    expect(resampleBytes(sunMap, g, 1e7, 1e7, 4, 120)).toEqual(new Uint8Array(16).fill(255));
  });
});
