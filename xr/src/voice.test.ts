import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDITS } from './hud.js';
import { JOURNEY_SITES, MOMENTS, type MomentId } from './journey.js';
import { EFFECT_OF, EFFECT_PEAK, EFFECT_S, VoiceRules, clipOf, fileOf } from './voice.js';
import { FRONT, HANDLE_H_M, facingYaw, frontSpot, isBehind } from './vrpanel.js';

const ROOT = join(__dirname, '..', '..');
const DIR = join(ROOT, 'xr', 'public', 'voice');
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), 'utf8');
const recorded = JSON.parse(readFileSync(join(DIR, 'lines.json'), 'utf8')) as { voice: string; lines: Record<string, string> };
const clips = Object.entries(recorded.lines);
const numbers = (text: string) => (text.match(/\d+(\.\d+)?/gu) ?? []).map(Number);

describe('the recorded clips', () => {
  it('belong to moments of the journey, one per place for the landing, each with its file', () => {
    for (const [clip] of clips) {
      const [moment, site] = clip.split(':');
      expect(MOMENTS, clip).toContain(moment);
      expect(site == null || (moment === 'landed' && JOURNEY_SITES.some((s) => s.id === site)), clip).toBe(true);
    }
    for (const s of JOURNEY_SITES) {
      expect(recorded.lines[clipOf('landed', s.id)], s.id).toBeTruthy();
    }
    expect(clips.length).toBe(17);
  });

  it('are short: at most about 12 seconds (64 kbit/s MP3, so 8000 bytes a second)', () => {
    for (const [clip, text] of clips) {
      const seconds = statSync(join(DIR, fileOf(clip))).size / 8000;
      expect(seconds, clip).toBeGreaterThan(4);
      expect(seconds, clip).toBeLessThan(13.5);
      expect(text.split(/\s+/u).length, clip).toBeLessThanOrEqual(40);
    }
  });

  it('are the lines of scripts/make_voice.mjs, generated ahead of time with ElevenLabs', () => {
    const script = read('scripts', 'make_voice.mjs');
    for (const [, text] of clips) {
      expect(script).toContain(`'${text}'`);
    }
    expect(recorded.voice).toContain('ElevenLabs');
    // The app plays files; only the script talks to ElevenLabs, and the key is not in the repository.
    expect(read('xr', 'src', 'voice.ts')).not.toContain('api.elevenlabs.io');
    expect(script).not.toMatch(/sk_[0-9a-f]{20,}/u);
  });

  it('general clips say no number that depends on the place or the time', () => {
    for (const [clip, text] of clips.filter(([c]) => !c.startsWith('landed:'))) {
      // 61 km: the width of a site's ground (docs/NARRATION.md, fixed figures). Speeds are spelled out.
      expect(numbers(text).filter((n) => n !== 61), clip).toEqual([]);
    }
    expect(recorded.lines.teleport).toContain('61 kilometres');
    expect(read('docs', 'NARRATION.md')).toContain('61.44 km across');
  });

  it('site clips only use the long-run figures of the table in docs/NARRATION.md', () => {
    const doc = read('docs', 'NARRATION.md');
    for (const s of JOURNEY_SITES) {
      const row = doc.split('\n').find((l) => l.startsWith('|') && l.includes(`(${s.id})`))!;
      const [, , lat, sun, night, earth] = row.split('|').map((c) => parseFloat(c));
      const text = recorded.lines[clipOf('landed', s.id)];
      expect(text, s.id).toContain('Over three years');
      const allowed = [Math.round(sun), Math.round(earth), night, Math.round(night / 24), ...numbers(s.label), 2025];
      for (const n of numbers(text)) {
        expect(allowed, `${s.id}: ${n}`).toContain(n);
      }
      if (text.includes('one hundred percent')) {
        expect(earth).toBe(100);
      }
      if (text.includes('sunniest')) {
        expect(doc).toContain(`| ${lat} S | ${sun.toFixed(1)} % |`);
      }
    }
    expect(doc).toContain('1157 days'); // "over three years"
    expect(doc).toContain('landed 6 March 2025');
  });

  it('name the buttons as the panel does', () => {
    const journey = read('xr', 'src', 'journey.ts');
    expect(recorded.lines['moon-intro']).toContain('green Start button');
    expect(journey).toContain("'Pause' : 'Start', go: true");
    expect(recorded.lines['start-motion']).toContain('press South Pole');
    expect(journey).toContain("label: 'South Pole'");
    expect(recorded.lines['landed:mma01']).toContain('green Play button');
    expect(journey).toContain("label: s.playing ? 'Pause' : 'Play', go: true");
    // The recommended marker is Sun yellow (experience.ts).
    expect(recorded.lines['site-recommended']).toContain('in yellow');
    expect(read('xr', 'src', 'experience.ts')).toContain('siteMarker(k.id === RECOMMENDED_SITE ? PALETTE.sunlight');
  });
});

describe('VoiceRules', () => {
  const has = (clip: string) => clip in recorded.lines;

  it('speaks a moment the first time only', () => {
    const r = new VoiceRules();
    expect(r.moment('start-motion', null, has)).toBe('start-motion');
    r.began('start-motion');
    expect(r.moment('start-motion', null, has)).toBeNull();
    expect(r.moment('pause-motion', null, has)).toBeNull(); // no clip
    expect(r.moment('fly-to-pole', null, has)).toBeNull();
  });

  it('has one landing clip per place, each once', () => {
    const r = new VoiceRules();
    expect(r.moment('landed', 'mma01', has)).toBe('landed:mma01');
    r.began('landed:mma01');
    expect(r.moment('landed', 'mma01', has)).toBeNull();
    expect(r.moment('landed', 'hw02', has)).toBe('landed:hw02');
    expect(r.moment('landed', 'somewhere-else', has)).toBeNull();
    expect(fileOf('landed:hw02')).toBe('landed-hw02.mp3');
  });

  it('on entering VR speaks the clip of the stage, whose moment fired in silence', () => {
    const r = new VoiceRules();
    expect(r.enter('moon', null, has)).toBe('moon-intro');
    expect(r.enter('pole', null, has)).toBe('pole-arrived');
    expect(r.enter('surface', 'im2', has)).toBe('landed:im2');
    expect(r.enter('flight', 'im2', has)).toBeNull();
    r.began('moon-intro');
    expect(r.enter('moon', null, has)).toBeNull();
  });
});

describe('sound effects', () => {
  it('are short and quieter than the voice', () => {
    expect(EFFECT_S.click).toBeLessThan(0.15);
    expect(EFFECT_S.whoosh).toBeLessThanOrEqual(0.6);
    expect(EFFECT_S.tone).toBeLessThanOrEqual(0.6);
    for (const peak of Object.values(EFFECT_PEAK)) {
      expect(peak).toBeLessThanOrEqual(0.1); // the voice plays at 1
    }
  });

  it('a whoosh to the pole and on a move, a low tone on landing', () => {
    expect(EFFECT_OF).toEqual({ 'fly-to-pole': 'whoosh', teleport: 'whoosh', landed: 'tone' });
    for (const id of Object.keys(EFFECT_OF)) {
      expect(MOMENTS).toContain(id as MomentId);
    }
  });
});

describe('the AI voice is disclosed', () => {
  it('on screen and in the documents', () => {
    const line = 'Voice: AI-generated with ElevenLabs';
    expect(CREDITS).toContain(line);
    for (const path of [['docs', 'CREDITS.md'], ['docs', 'NARRATION.md'], ['docs', 'XR.md'], ['README.md']]) {
      expect(read(...path), path.join('/')).toContain(line);
    }
  });
});

describe('the movable panel', () => {
  it('has a handle large enough to point at', () => {
    expect(HANDLE_H_M).toBeGreaterThanOrEqual(0.06);
  });

  it('turns to face the head', () => {
    expect(facingYaw([0, 0, -1], [0, 0, 0])).toBeCloseTo(0, 9); // straight ahead: front towards +z
    expect(facingYaw([-1, 0, 0], [0, 0, 0])).toBeCloseTo(Math.PI / 2, 9); // on the left: turned to the right
    expect(facingYaw([1, 0, 0], [0, 0, 0])).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('knows when it is behind the visitor, and where in front to go', () => {
    const head: [number, number, number] = [0, 1.6, 0];
    expect(isBehind(head, [0, 0, -1], [-0.62, 1.25, -0.95])).toBe(false);
    expect(isBehind(head, [0, 0, 1], [-0.62, 1.25, -0.95])).toBe(true);
    const p = frontSpot(head, [0, 0, -1]);
    expect(p[0]).toBeCloseTo(-0.62, 2);
    expect(p[1]).toBe(FRONT.heightM);
    expect(p[2]).toBeCloseTo(-0.95, 2);
    const q = frontSpot(head, [0, -0.3, 1]);
    expect(q[0]).toBeCloseTo(0.62, 2);
    expect(q[2]).toBeCloseTo(0.95, 2);
    expect(isBehind(head, [0, 0, 1], q)).toBe(false);
  });
});
