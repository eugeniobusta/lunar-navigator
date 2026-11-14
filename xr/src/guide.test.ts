// The demo start, the priorities, "Why here?" and the tour captions, against the published data and the analysis
// library they are built on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeSeries, type Ephemeris } from '../../web/src/lib/analysis';
import { demHorizon, heightAt, parseHeightGrid, stereoXY } from '../../web/src/lib/analysis/demHorizon';
import type { CriterionRow } from '../../web/src/lib/analysis/explain';
import { LAYER_KEYS, mapScore, type Preset } from '../../web/src/lib/analysis/suitability';
import { parseCsv } from '../../web/src/lib/data/csv';
import { resampleBytes, tileFromPole, type SouthPole } from './data';
import {
  TOUR_PLAY_H,
  buildZones,
  captionGoldilocks,
  captionPole,
  captionStand,
  captionZone,
  longRunMetrics,
  nextSunUp,
  poleSunMaxDeg,
  rankAll,
  rescore,
  whyFromRow,
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

  it('the long-run darkness of our model matches site_values.csv at Malapert', () => {
    const row = parseCsv(text('suitability/site_values.csv')).find((r) => r.id === 'mma01')!;
    const m = longRunMetrics(eph, hz);
    console.log('mma01 longest dark / no Earth, VR:', m.longestDarkH, m.longestNoEarthH, 'published:', row.longest_dark_h, row.longest_no_earth_h);
    expect(Math.abs(m.longestDarkH - Number(row.longest_dark_h))).toBeLessThanOrEqual(24);
    expect(Math.abs(m.longestNoEarthH - Number(row.longest_no_earth_h))).toBeLessThanOrEqual(24);
  });
});

describe('priorities', () => {
  it('balanced weights give the published order and scores', () => {
    const ranked = rankAll(zones(), presets.find((p) => p.key === 'balanced')!.weights);
    expect(ranked.length).toBeGreaterThan(1000);
    expect(ranked.every((z, i) => z.rank === i + 1 && z.id === i + 1)).toBe(true);
    expect(ranked.every((z) => z.score === Number(z.row.score))).toBe(true);
  });

  it('every other preset is a re-ranking: a permutation, confirmed stays first, best score first', () => {
    for (const p of presets.filter((k) => k.key !== 'balanced')) {
      const ranked = rankAll(zones(), p.weights);
      expect(new Set(ranked.map((z) => z.id)).size).toBe(ranked.length);
      const ok = ranked.filter((z) => z.stayOk);
      expect(ranked.slice(0, ok.length).every((z) => z.stayOk)).toBe(true);
      expect(ok.every((z, i) => i === 0 || ok[i - 1].score >= z.score)).toBe(true);
      console.log(p.key, 'top 3:', ranked.slice(0, 3).map((z) => `zone ${z.id} score ${z.score}`).join('; '));
    }
  });

  it('rescore keeps the hard limits and agrees with mapScore cell by cell', () => {
    const raw = u8('suitability/sites/mma01_score.u8');
    const layers = LAYER_KEYS.map((k) => u8(`suitability/layers/sites/mma01_${k}.u8`));
    const shown = new Uint8Array(raw.length);
    const all = new Uint8Array(raw.length);
    const power = presets.find((p) => p.key === 'power')!.weights;
    rescore(layers, raw, power, shown, all);
    let pass = 0;
    for (let i = 0; i < raw.length; i += 97) {
      expect(all[i]).toBe(mapScore(layers.map((l) => l[i]), power));
      expect(shown[i]).toBe(raw[i] <= 100 ? all[i] : 255);
      pass += raw[i] <= 100 ? 1 : 0;
    }
    expect(pass).toBeGreaterThan(0);
    // With the balanced weights the layers reproduce the published score to within one point.
    rescore(layers, raw, presets.find((p) => p.key === 'balanced')!.weights, shown, all);
    let worst = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] <= 100) {
        worst = Math.max(worst, Math.abs(all[i] - raw[i]));
      }
    }
    console.log('balanced layers vs published score, worst difference:', worst);
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe('why here and the tour', () => {
  it('a zone row gives one line per criterion, each with a verdict', () => {
    const z = zones()[0];
    const w = whyFromRow('zone #1', z.row, criteria);
    expect(w.lines).toHaveLength(9);
    expect(w.lines.every((l) => /: (good|acceptable|rejected)$/u.test(l.head) && l.detail.length > 20)).toBe(true);
    expect(w.summary).toMatch(/^Passes every hard limit/u);
    expect(captionZone(z, 'Balanced', w)).toContain(`score ${z.row.score} of 100`);
  });

  it('captions carry numbers from the data', () => {
    const max = poleSunMaxDeg(eph);
    expect(max).toBeGreaterThan(1.3); // the Moon's axis is tilted 1.54 deg to the ecliptic
    expect(max).toBeLessThan(1.8);
    expect(captionPole(eph)).toContain(`${max.toFixed(1)} degrees`);
    const s = json('suitability/summary.json');
    expect(captionGoldilocks(s)).toContain(`(${s.pass_pct_of_region} %)`);
    expect(captionGoldilocks(null)).not.toContain("km2");
    const from = nextSunUp(eph, hz, 0)!;
    const c = captionStand(computeSeries(eph, hz, from, from + TOUR_PLAY_H + 1), TOUR_PLAY_H);
    const turn = Number(/moves (\d+) degrees/u.exec(c)![1]);
    expect(turn).toBeGreaterThan(20); // 360 deg in 29.5 days: about 24 deg in 2 days
    expect(turn).toBeLessThan(29);
    console.log(captionPole(eph), '|', captionGoldilocks(s), '|', c);
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
