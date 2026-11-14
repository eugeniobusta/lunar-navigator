// The demo start, the priorities, "Why here?" and the tour captions, against the published data and the analysis
// library they are built on.
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
  TOUR_PLAY_H,
  answer,
  buildZones,
  captionGoldilocks,
  captionPole,
  captionStand,
  captionZone,
  longRunMetrics,
  mapLegend,
  nextSunUp,
  paintStyle,
  poleSunMaxDeg,
  priorities,
  rankAll,
  showingKey,
  shownSelection,
  whyFromRow,
  zoneRag,
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

describe('layers: presets, ranking, classes', () => {
  const prio = priorities(json('suitability/weights.json'));
  const only = (...ticked: Selection['ticked']): Selection => ({ ticked });
  const preset = (key: string) => presetSelection(presets.find((p) => p.key === key)!);

  it('opens with everything ticked; the presets are the website\'s', () => {
    expect(sameSelection(prio.initial, EVERYTHING)).toBe(true);
    expect(prio.presets.map((p) => p.key)).toEqual(['balanced', 'everything', 'power', 'radio', 'ice']);
    expect(prio.labels.darkness).toBe('Short nights');
    // Without the file there is only the published ranking.
    expect(sameSelection(priorities(null).initial, preset('balanced'))).toBe(true);
  });

  it('NASA-style balance gives the published order and scores', () => {
    const ranked = rankAll(zones(), preset('balanced'));
    expect(ranked.length).toBeGreaterThan(1000);
    expect(ranked.every((z, i) => z.rank === i + 1 && z.id === i + 1)).toBe(true);
    expect(ranked.every((z) => z.score === Number(z.row.score))).toBe(true);
  });

  it('every other preset is a re-ranking: a permutation, confirmed stays first, best score first', () => {
    for (const p of presets.filter((k) => k.key !== 'balanced')) {
      const ranked = rankAll(zones(), presetSelection(p));
      expect(new Set(ranked.map((z) => z.id)).size).toBe(ranked.length);
      const ok = ranked.filter((z) => z.stayOk);
      expect(ranked.slice(0, ok.length).every((z) => z.stayOk)).toBe(true);
      expect(ok.every((z, i) => i === 0 || ok[i - 1].score >= z.score)).toBe(true);
      console.log(p.key, 'top 3:', ranked.slice(0, 3).map((z) => `zone ${z.id} score ${z.score}`).join('; '));
    }
  });

  it('turning a direction round re-ranks: the zone that was best for cold ground is not best for warm', () => {
    const cold = rankAll(zones(), only('temperature'))[0].id;
    const warm = rankAll(zones(), { ticked: ['temperature'], flipped: ['temperature'] });
    expect(warm[0].id).not.toBe(cold);
    expect(warm.every((z, i) => !z.stayOk || i === 0 || !warm[i - 1].stayOk || warm[i - 1].score >= z.score)).toBe(true);
  });

  it('the class colours are the website\'s tokens', () => {
    const css = readFileSync(new URL('../../web/src/styles/tokens.css', import.meta.url), 'utf8');
    const pairs: [string, string][] = [
      ['--go', RAG_COLOR.green], ['--caution', RAG_COLOR.amber], ['--stop', RAG_COLOR.red], ['--nodata', RAG_COLOR.grey],
      ['--cb-high', CB_COLOR.green], ['--cb-mid', CB_COLOR.amber], ['--cb-low', CB_COLOR.red],
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

  it('shownSelection: one ticked parameter alone, with its direction; the ticks otherwise', () => {
    const sel: Selection = { ticked: ['sunlight', 'temperature', 'darkness'], flipped: ['temperature'] };
    expect(shownSelection(sel, null)).toBe(sel);
    expect(shownSelection(sel, 'temperature')).toEqual({ ticked: ['temperature'], flipped: ['temperature'] });
    expect(shownSelection(sel, 'ice')).toBe(sel); // not ticked: nothing to show alone
    expect(showingKey(shownSelection(sel, 'temperature'))).toBe('temperature');
    expect(showingKey(sel)).toBe('combined');
    expect(showingKey(only('darkness', 'no_earth'))).toBe('limits');
    expect(showingKey(only())).toBe('limits');
  });

  it('the legend says what the website says', () => {
    const page = readFileSync(new URL('../../web/src/routes/LandingMap.tsx', import.meta.url), 'utf8');
    for (const words of ['Green, good: ', 'Amber, acceptable: ', 'Red, poor: ', 'Hatched: unsafe, fails a NASA limit', 'Grey: no data',
      'Clear ground passes every NASA limit. Tick a parameter to score it.', 'Combined score of all ten parameters', 'NASA safety limits only']) {
      expect(page).toContain(words);
    }
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

  it('zoneRag: the class of the score, or of the one ticked parameter at the zone', () => {
    const all = zones();
    const best = rankAll(all, EVERYTHING)[0];
    expect(zoneRag(best, EVERYTHING)).toBe(classifyScore(best.score));
    expect(zoneRag(best, only())).toBe('grey');
    const z = all[0];
    expect(zoneRag(z, only('sunlight'))).toBe(Number(z.row.sun_pct) >= 70 ? 'green' : Number(z.row.sun_pct) < 25 ? 'red' : 'amber');
    const dark = Number(z.row.longest_dark_h);
    expect(zoneRag(z, only('darkness'))).toBe(dark <= 85 ? 'green' : dark >= 354 ? 'red' : 'amber');
  });

  it('the answer names what is ticked, counts when the list is long, and gives the best zone\'s class', () => {
    const all = zones();
    const n = all.length.toLocaleString('en-US');
    const best = (sel: Selection) => rankAll(all, sel)[0];
    const two = only('sunlight', 'darkness');
    const b2 = best(two);
    expect(answer(two, prio, all.length, b2)).toBe(
      `Best landing spots for Sunlight + Short nights: ${n} zones. The best scores ${b2.score} of 100 (${zoneRag(b2, two) === 'green' ? 'good' : zoneRag(b2, two) === 'amber' ? 'acceptable' : 'poor'})${b2.near ? `, near ${b2.near}` : ''}.`,
    );
    const every = answer(EVERYTHING, prio, all.length, best(EVERYTHING));
    expect(every).toContain(`Best landing spots for everything on the list: ${n} zones.`);
    expect(answer(preset('balanced'), prio, all.length, best(preset('balanced')))).toContain('for 8 of 10 parameters:');
    expect(answer(only(), prio, all.length, all[0])).toBe(`Nothing is ticked, so nothing is ranked. Clear ground passes every NASA limit: ${n} zones.`);
    console.log(every);
    console.log(answer(two, prio, all.length, b2));
  });

  it('"Why here?" keeps the hard limits, leaves out what is not ticked, and follows a turned-round direction', () => {
    const z = zones()[0];
    const full = whyFromRow('zone', z.row, criteria);
    const power = whyFromRow('zone', z.row, criteria, ['sunlight', 'darkness']);
    expect(power.lines.length).toBeLessThan(full.lines.length);
    expect(power.lines.some((l) => l.head.startsWith('Landing slope'))).toBe(true); // a NASA limit: always there
    expect(power.lines.some((l) => /temperature/i.test(l.head))).toBe(false);
    const usual = whyFromRow('zone', z.row, criteria, ['temperature']).lines.find((l) => /temperature/i.test(l.head))!;
    const turned = whyFromRow('zone', z.row, criteria, ['temperature'], ['temperature']).lines.find((l) => /temperature/i.test(l.head))!;
    const swap = { good: 'rejected', acceptable: 'acceptable', rejected: 'good' } as const;
    expect(turned.verdict).toBe(swap[usual.verdict]);
    console.log('why lines: everything', full.lines.length, ', power', power.lines.length);
  });
});

describe('why here and the tour', () => {
  it('a zone row gives one line per criterion, each with a verdict', () => {
    const z = zones()[0];
    const w = whyFromRow('zone #1', z.row, criteria);
    expect(w.lines).toHaveLength(9);
    expect(w.lines.every((l) => /: (good|acceptable|rejected)$/u.test(l.head) && l.detail.length > 20)).toBe(true);
    expect(w.summary).toMatch(/^Passes every hard limit/u);
    expect(captionZone(z, 'Everything', w)).toContain(`score ${z.row.score} of 100`);
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
