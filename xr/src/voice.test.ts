import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOMENTS } from './journey.js';
import { EFFECT_OF, EFFECT_PEAK, EFFECT_S, LINE_IDS, VoiceRules, type VoiceLine } from './voice.js';
import { FRONT, GRAB_RANGE_M, HANDLE_H_M, clampGrab, facingYaw, frontSpot, isBehind } from './vrpanel.js';

const DIR = join(__dirname, '..', 'public', 'voice');
const recorded = JSON.parse(readFileSync(join(DIR, 'lines.json'), 'utf8')) as { voice: string; lines: VoiceLine[] };

describe('the recorded lines', () => {
  it('are the six the app knows, each under 12 words, each with its file', () => {
    expect(recorded.lines.map((l) => l.id)).toEqual([...LINE_IDS]);
    for (const l of recorded.lines) {
      expect(l.text.split(/\s+/u).length, l.text).toBeLessThan(12);
      const bytes = statSync(join(DIR, l.file)).size;
      expect(bytes, l.file).toBeGreaterThan(5000);
      expect(bytes, l.file).toBeLessThan(40000);
    }
  });

  it('are the list in scripts/make_voice.sh', () => {
    const script = readFileSync(join(__dirname, '..', '..', 'scripts', 'make_voice.sh'), 'utf8');
    for (const l of recorded.lines) {
      expect(script).toContain(`"${l.id}|${l.text}"`);
    }
  });

  it('name the buttons as the panel does', () => {
    const journey = readFileSync(join(__dirname, 'journey.ts'), 'utf8');
    const text = (id: string) => recorded.lines.find((l) => l.id === id)!.text;
    expect(text('moon')).toContain('Press Start');
    expect(journey).toContain("'Pause' : 'Start'");
    expect(text('surface')).toContain('green Play button');
    expect(journey).toContain("label: s.playing ? 'Pause' : 'Play', go: true");
    // The recommended marker is Sun yellow (experience.ts), so the pole's line says yellow.
    expect(text('pole')).toContain('Yellow');
    expect(readFileSync(join(__dirname, 'experience.ts'), 'utf8')).toContain('siteMarker(k.id === RECOMMENDED_SITE ? PALETTE.sunlight');
  });
});

describe('VoiceRules', () => {
  it('speaks the stage line on entering VR, then how to move the menu, once', () => {
    const r = new VoiceRules();
    expect(r.enter('moon')).toEqual(['moon', 'handle']);
    r.began('moon');
    r.began('handle');
    expect(r.enter('moon')).toEqual(['moon']);
    expect(r.enter('flight')).toEqual([]);
    expect(r.enter('loading')).toEqual([]);
  });

  it('speaks each stage line once per visit to its stage', () => {
    const r = new VoiceRules();
    r.began('handle');
    expect(r.moment('pole-arrived')).toEqual(['pole']);
    expect(r.moment('colours-on')).toEqual([]);
    expect(r.moment('flight')).toEqual([]);
    expect(r.moment('landed')).toEqual(['surface', 'walk']);
    r.began('walk');
    expect(r.moment('play')).toEqual(['play']);
    expect(r.moment('pause')).toEqual([]);
    expect(r.moment('play')).toEqual([]); // once per visit to the surface
    expect(r.moment('back-to-pole')).toEqual(['pole']);
    expect(r.moment('landed')).toEqual(['surface']); // "walk" only once per session
    expect(r.moment('play')).toEqual(['play']);
    expect(r.moment('back-to-moon')).toEqual(['moon']);
  });

  it('offers a once-per-session line again if it was cut off before it began', () => {
    const r = new VoiceRules();
    expect(r.moment('landed')).toEqual(['surface', 'walk', 'handle']);
    r.began('surface'); // Play pressed before "walk" began
    expect(r.moment('landed')).toEqual(['surface', 'walk', 'handle']);
  });
});

describe('sound effects', () => {
  it('are short and quieter than the voice', () => {
    expect(EFFECT_S.click).toBeLessThan(0.15);
    expect(EFFECT_S.whoosh).toBeLessThan(0.6);
    expect(EFFECT_S.chime).toBeLessThan(0.6);
    for (const peak of Object.values(EFFECT_PEAK)) {
      expect(peak).toBeLessThanOrEqual(0.1); // the voice plays at 1
    }
  });

  it('belong to moments that exist', () => {
    for (const id of Object.keys(EFFECT_OF)) {
      expect(MOMENTS).toContain(id);
    }
    expect(EFFECT_OF.play).toBe('chime');
    expect(EFFECT_OF.teleport).toBe('whoosh');
  });
});

describe('the movable panel', () => {
  it('is held between 0.5 and 3 m', () => {
    expect(GRAB_RANGE_M).toEqual([0.5, 3]);
    expect(clampGrab(0.2)).toBe(0.5);
    expect(clampGrab(1.1)).toBe(1.1);
    expect(clampGrab(7)).toBe(3);
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
    // Looking along -z, the spot is where the panel starts: (-0.62, 1.25, -0.95).
    const p = frontSpot(head, [0, 0, -1]);
    expect(p[0]).toBeCloseTo(-0.62, 2);
    expect(p[1]).toBe(FRONT.heightM);
    expect(p[2]).toBeCloseTo(-0.95, 2);
    // Turned round, it is in front again and on the left (which is now +x), facing the head.
    const q = frontSpot(head, [0, -0.3, 1]);
    expect(q[0]).toBeCloseTo(0.62, 2);
    expect(q[2]).toBeCloseTo(0.95, 2);
    expect(isBehind(head, [0, 0, 1], q)).toBe(false);
  });
});
