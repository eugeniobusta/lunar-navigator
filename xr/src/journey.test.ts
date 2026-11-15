// The journey: the moments and their captions, the panel of each stage and its first-time hints, the clock of
// the 30 days, and the angle the picture of the Earth is turned by.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeMetrics, computeSeries, type Ephemeris } from '../../web/src/lib/analysis';
import { demHorizon, parseHeightGrid } from '../../web/src/lib/analysis/demHorizon';
import {
  FASTER,
  JOURNEY_SITES,
  Journey,
  MOMENTS,
  MOON_HOURS_PER_S,
  NOTE_SCALE,
  NOTE_SURFACE,
  RECOMMENDED_SITE,
  SURFACE_HOURS_PER_S,
  WINDOW_H,
  caption,
  dayOf,
  earthRotationAngle,
  latLabel,
  skyMoment,
  stageView,
  type ViewState,
} from './journey';
import { BUTTON_M } from './vrpanel';

const R2D = 180 / Math.PI;
const state = (over: Partial<ViewState>): ViewState => ({
  stage: 'moon', message: null, caption: '', playing: false, faster: false, colours: false, coloursReady: true, siteId: null, siteName: null,
  sunUp: null, earthUp: null, date: '2026-11-18', tH: 0, legend: null, pressed: new Set(), help: false, stats: null, inXR: false, extraNote: null,
  ...over,
});
const ids = (v: { rows: { id: string }[][] }) => v.rows.flat().map((b) => b.id);

describe('time', () => {
  it('a month in 30 s over the whole Moon, a day in 10 s on the surface, four times that with Faster', () => {
    expect(WINDOW_H / MOON_HOURS_PER_S).toBe(30);
    expect(24 / SURFACE_HOURS_PER_S).toBe(10);
    expect(24 / (SURFACE_HOURS_PER_S * FASTER)).toBe(2.5);
  });

  it('dayOf counts 1 to 30', () => {
    expect(dayOf(0)).toBe(1);
    expect(dayOf(23.99)).toBe(1);
    expect(dayOf(24)).toBe(2);
    expect(dayOf(719.9)).toBe(30);
    expect(dayOf(720)).toBe(30);
    expect(latLabel(-85.9425)).toBe('85.9 S');
  });

  it('earthRotationAngle: 280.4606 deg at J2000.0, one turn per sidereal day', () => {
    const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
    expect(earthRotationAngle(j2000) * R2D).toBeCloseTo(280.4606, 3);
    const sidereal = 86164.0989 * 1000;
    expect(earthRotationAngle(j2000 + sidereal) * R2D).toBeCloseTo(280.4606, 2);
    // After one solar day the Earth has turned 360.9856 deg: 0.9856 deg more than a turn.
    expect(((earthRotationAngle(j2000 + 86400000) - earthRotationAngle(j2000)) * R2D + 360) % 360).toBeCloseTo(0.9856, 3);
  });
});

describe('the Earth faces the right way', () => {
  // The chain that turns the picture of the Earth: Earth-fixed -> celestial (earthRotationAngle) -> MOON_ME (the
  // quaternions of stars.json). Run backwards on the Sun's direction it must give the longitude where it is noon.
  const data = (p: string) => JSON.parse(readFileSync(new URL(`../../web/public/data/${p}`, import.meta.url), 'utf8'));
  const eph = data('ephemeris.json');
  const stars = data('stars.json');

  it('at 12:00 UTC the Sun stands over the Greenwich meridian, within the equation of time', () => {
    const lons: number[] = [];
    for (const utc of ['2026-11-18T12:00:00Z', '2027-02-11T12:00:00Z', '2027-06-21T12:00:00Z']) {
      const ms = Date.parse(utc);
      const i = Math.round((ms - Date.parse(eph.start_utc)) / (eph.step_s * 1000));
      const k = Math.round((ms - Date.parse(stars.start_utc)) / (stars.step_s * 1000));
      const [x, y, z, w] = stars.quat_xyzw.slice(4 * k, 4 * k + 4) as number[];
      const s = eph.sun_dir.slice(3 * i, 3 * i + 3) as number[];
      // v_icrf = conj(q) v q: the inverse of the rotation ICRF -> MOON_ME.
      const cx = -x, cy = -y, cz = -z;
      const tx = 2 * (cy * s[2] - cz * s[1]), ty = 2 * (cz * s[0] - cx * s[2]), tz = 2 * (cx * s[1] - cy * s[0]);
      const v = [s[0] + w * tx + (cy * tz - cz * ty), s[1] + w * ty + (cz * tx - cx * tz), s[2] + w * tz + (cx * ty - cy * tx)];
      const lon = ((Math.atan2(v[1], v[0]) - earthRotationAngle(ms)) * R2D + 540) % 360 - 180;
      lons.push(lon);
      expect(Math.abs(lon), utc).toBeLessThan(4.5); // the equation of time is at most 16.5 minutes = 4.1 deg
    }
    console.log(`longitude under the Sun at 12:00 UTC on three dates: ${lons.map((l) => l.toFixed(2)).join(', ')} deg E`);
    // 18 November: the Sun is 14.9 minutes early (equation of time), 3.7 deg west of Greenwich at 12:00 UTC.
    expect(lons[0]).toBeCloseTo(-3.7, 0);
  });
});

describe('moments', () => {
  it('every moment has a caption of one short line', () => {
    const facts = { siteName: 'de Gerlache Rim 2', latDeg: -88.1408, sunPct: 71.4, earthPct: 100, longestDarkH: 123.6, movedM: 1234.4 };
    for (const id of MOMENTS) {
      const c = caption(id, facts);
      expect(c.length, id).toBeGreaterThan(5);
      expect(c.length, `${id}: ${c}`).toBeLessThanOrEqual(72);
      expect(c).not.toMatch(/undefined|NaN/u);
    }
  });

  it('captions quote the numbers they are given, rounded', () => {
    expect(caption('flight', { siteName: 'Malapert Massif', latDeg: -85.9425 })).toBe('Flying to Malapert Massif, 85.9 S');
    expect(caption('play-first-sunrise', { sunPct: 71.4 })).toBe('Sunrise. Here the Sun is up 71 % of these 30 days.');
    expect(caption('sunset', { longestDarkH: 123.6 })).toBe('Sunset. The longest night of these 30 days lasts 124 hours.');
    expect(caption('earth-in-view', { earthPct: 100 })).toContain('100 %');
    expect(caption('teleport', { movedM: 41.7 })).toBe('Moved 42 m.');
    expect(caption('start-motion')).toContain('30 seconds');
    expect(caption('play')).toContain('10 seconds');
  });

  it('Journey announces each moment to its listeners and keeps the latest caption', () => {
    const j = new Journey();
    const seen: string[] = [];
    j.on((e) => seen.push(`${e.id}:${e.count}`));
    j.emit('moon-intro');
    j.emit('start-motion');
    j.emit('start-motion');
    expect(seen).toEqual(['moon-intro:1', 'start-motion:1', 'start-motion:2']);
    expect(j.caption).toBe(caption('start-motion'));
    expect(j.fired('moon-intro')).toBe(true);
    expect(j.fired('landed')).toBe(false);
  });

  it('skyMoment: the first sunrise has its own name; the Sun wins over the Earth', () => {
    const s = (sunUp: boolean, earthUp: boolean) => ({ sunUp, earthUp });
    expect(skyMoment(s(false, true), s(true, true), false)).toBe('play-first-sunrise');
    expect(skyMoment(s(false, true), s(true, true), true)).toBe('sunrise');
    expect(skyMoment(s(true, true), s(false, true), true)).toBe('sunset');
    expect(skyMoment(s(true, false), s(true, true), false)).toBe('earth-in-view');
    expect(skyMoment(s(true, true), s(true, false), false)).toBe('earth-hidden');
    expect(skyMoment(s(true, true), s(false, false), false)).toBe('sunset');
    expect(skyMoment(s(true, true), s(true, true), false)).toBeNull();
  });
});

describe('the panel of each stage', () => {
  it('whole Moon: three buttons, the hint on Start and then on South Pole', () => {
    const v = stageView(state({}));
    expect(ids(v)).toEqual(['moon', 'pole', 'start']);
    expect(v.rows[0][0].on).toBe(true);
    expect(v.rows[2][0]).toMatchObject({ label: 'Start', go: true, hint: true });
    expect(v.rows[1][0].hint).toBe(false);
    expect(v.notes).toContain(NOTE_SCALE);
    const running = stageView(state({ playing: true, pressed: new Set(['start']), tH: 49 }));
    expect(running.rows[2][0]).toMatchObject({ label: 'Pause', hint: false });
    expect(running.rows[1][0].hint).toBe(true);
    expect(running.status[0].text).toBe('2026-11-18, day 3 of 30');
  });

  it('south pole: back, the colour switch, six places with the recommended one first', () => {
    const v = stageView(state({ stage: 'pole' }));
    expect(ids(v)).toEqual(['moon', 'colours', ...JOURNEY_SITES.map((s) => `site:${s.id}`)]);
    expect(v.rows.flat().filter((b) => b.id.startsWith('site:')).map((b) => b.label)).toEqual([
      'Malapert Massif', 'Mons Mouton', 'Haworth', 'Nobile Rim 1', 'de Gerlache Rim 2', "IM-2 Athena's landing spot",
    ]);
    expect(v.rows[2][0].note).toBe('Recommended: Earth always in the sky, the Sun skims a giant ridge');
    expect(v.rows[2][0].hint).toBe(true);
    expect(v.legend).toEqual([]);
    const legend = { lines: [{ mark: 'green' as const, text: 'Green, good: score 70 to 100' }, { mark: 'unsafe' as const, text: 'Hatched: unsafe, fails a NASA limit' }], colors: { green: '#6FBF73', red: '#E5484D' } };
    const on = stageView(state({ stage: 'pole', colours: true, legend, pressed: new Set(['site']) }));
    expect(on.rows[1][0]).toMatchObject({ toggle: true, on: true });
    expect(on.legend).toEqual([
      { text: 'Green, good: score 70 to 100', color: '#6FBF73', hatch: false },
      { text: 'Hatched: unsafe, fails a NASA limit', color: '#E5484D', hatch: true },
    ]);
    expect(on.rows[2][0].hint).toBe(false);
    // Without the map there is no switch to press.
    expect(ids(stageView(state({ stage: 'pole', coloursReady: false })))).not.toContain('colours');
    expect(stageView(state({ stage: 'flight', siteId: 'mma01', siteName: 'Malapert Massif' })).title).toBe('Flying to Malapert Massif');
  });

  it('surface: Play, Faster, back, and the two status lines with the day', () => {
    const v = stageView(state({ stage: 'surface', siteName: 'Haworth', sunUp: false, earthUp: true, tH: 700 }));
    expect(ids(v)).toEqual(['play', 'faster', 'pole']);
    expect(v.title).toBe('Haworth');
    expect(v.rows[0][0]).toMatchObject({ label: 'Play', go: true, hint: true });
    expect(v.status).toEqual([
      { icon: 'sun', text: 'Sun: below the hills', ok: false },
      { icon: 'earth', text: 'Earth: in view', ok: true },
      { icon: 'day', text: '2026-11-18, day 30 of 30', ok: true },
    ]);
    expect(v.notes).toEqual([NOTE_SURFACE]);
    const up = stageView(state({ stage: 'surface', sunUp: true, earthUp: false, playing: true }));
    expect(up.status.slice(0, 2).map((s) => s.text)).toEqual(['Sun: up', 'Earth: hidden']);
    expect(up.rows[0][0].label).toBe('Pause');
  });

  it('every stage has at most one green button, and help fits one screen', () => {
    for (const stage of ['moon', 'pole', 'surface'] as const) {
      expect(stageView(state({ stage })).rows.flat().filter((b) => b.go).length).toBeLessThanOrEqual(1);
      const help = stageView(state({ stage, help: true, inXR: true, stats: '72 fps' }));
      expect(ids(help)).toEqual(['close', 'stats', 'exit']);
      expect(help.help!.length).toBeLessThanOrEqual(4);
      expect(help.help).toContain('72 fps');
    }
    expect(ids(stageView(state({ help: true })))).toEqual(['close', 'stats']);
  });

  it('buttons in the headset are at least 6 cm high', () => {
    expect(BUTTON_M).toBeGreaterThanOrEqual(0.06);
  });
});

describe('the six places, from the data', () => {
  // What docs/NARRATION.md quotes: our model (demHorizon + computeSeries, 2 m above each site's own point) over
  // the whole ephemeris. The recommendation printed on the Malapert button must hold in it.
  const DATA = new URL('../../web/public/data/', import.meta.url);
  const json = (p: string) => JSON.parse(readFileSync(new URL(p, DATA), 'utf8'));
  const bin = (p: string): ArrayBuffer => {
    const b = readFileSync(new URL(p, DATA));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  const e = json('ephemeris.json');
  const eph: Ephemeris = {
    startMs: Date.parse(e.start_utc), stepS: e.step_s, n: e.n,
    sunDir: Float64Array.from(e.sun_dir), sunSemiDiam: Float64Array.from(e.sun_semidiam_deg), earthKm: Float64Array.from(e.earth_km),
  };
  const poleMeta = json('terrain/south_pole.json');
  const pole = parseHeightGrid(poleMeta, bin(`terrain/${poleMeta.files.height}`));
  const sites: { id: string; name: string; lat: number; lon: number }[] = json('sites.json').sites;

  it('every place is in sites.json with terrain, and Malapert Massif has Earth in view all the time', () => {
    const rows: string[] = [];
    let malapertEarth = -1;
    for (const k of JOURNEY_SITES) {
      const s = sites.find((q) => q.id === k.id)!;
      expect(s, k.id).toBeDefined();
      const meta = json(`terrain/sites/${k.id}/tile.json`);
      const tile = parseHeightGrid(meta, bin(`terrain/sites/${k.id}/height.u16`));
      const far = parseHeightGrid(meta.far, bin(`terrain/sites/${k.id}/far.u16`));
      const hz = demHorizon(tile, [pole, far], s.lat, s.lon, { observerHM: 2, siteId: k.id });
      const series = computeSeries(eph, hz, 0, eph.n);
      const m = computeMetrics(series, eph.stepS / 3600);
      let lo = Infinity;
      let hi = -Infinity;
      for (const el of series.earthEl) {
        lo = Math.min(lo, el);
        hi = Math.max(hi, el);
      }
      rows.push(`${k.id} ${k.label}: ${latLabel(s.lat)}, Sun up ${m.sunPct.toFixed(1)} %, longest night ${m.longestDarkH.toFixed(0)} h, Earth in view ${m.earthPct.toFixed(1)} %, Earth ${lo.toFixed(1)} to ${hi.toFixed(1)} deg above the horizon`);
      if (k.id === RECOMMENDED_SITE) {
        malapertEarth = m.earthPct;
      }
    }
    console.log(`our model over the whole ephemeris (${e.start_utc} + ${(eph.n * eph.stepS) / 86400} days):\n${rows.join('\n')}`);
    expect(malapertEarth).toBe(100);
  }, 120000);
});
