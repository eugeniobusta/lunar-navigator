import { describe, expect, it } from 'vitest';
import { LiveSender, SEND_EVERY_MS, WAIT_MS, WATCH_FOV, WATCH_H, WATCH_W, liveUrl, pickMime, recordingName, smoothing, type LiveState } from './spectator.js';

const state = () => ({ t: 0 }) as unknown as LiveState;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the live view', () => {
  it('sends only to a trycloudflare address made of plain words', () => {
    expect(liveUrl('able-bird-cat-dog')).toBe('https://able-bird-cat-dog.trycloudflare.com/pose');
    expect(liveUrl(null)).toBeNull();
    expect(liveUrl('')).toBeNull();
    expect(liveUrl('evil.example.com/x')).toBeNull();
    expect(liveUrl('a-b.attacker.net#')).toBeNull();
    expect(liveUrl('Able-Bird')).toBeNull();
  });

  it('shows 90 degrees across at 1920 x 1080', () => {
    expect([WATCH_W, WATCH_H]).toEqual([1920, 1080]);
    const horizontal = (2 * Math.atan(Math.tan((WATCH_FOV * Math.PI) / 360) * (WATCH_W / WATCH_H)) * 180) / Math.PI;
    expect(horizontal).toBeCloseTo(90, 9);
    expect(WATCH_FOV).toBeCloseTo(58.72, 2);
    expect(WAIT_MS).toBe(2000);
  });

  it('smooths the camera lightly: most of the way in a tenth of a second', () => {
    expect(smoothing(0)).toBe(0);
    expect(smoothing(1 / 60)).toBeCloseTo(0.188, 3);
    expect(1 - (1 - smoothing(1 / 60)) ** 6).toBeGreaterThan(0.7); // after 0.1 s at 60 fps
    expect(smoothing(10)).toBeCloseTo(1, 6);
    expect(smoothing(-1)).toBe(0);
  });

  it('names a recording by its time and format, preferring MP4 (H.264)', () => {
    const at = new Date(2026, 10, 15, 14, 30, 5);
    expect(recordingName(at, 'video/mp4;codecs=avc1.640028,mp4a.40.2')).toBe('claudes-plan-vr-20261115-143005.mp4');
    expect(recordingName(at, 'video/webm;codecs=vp9,opus')).toBe('claudes-plan-vr-20261115-143005.webm');
    expect(pickMime(() => true)).toMatch(/^video\/mp4;codecs=avc1/u);
    expect(pickMime((m) => m.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickMime(() => false)).toBe('');
  });
});

describe('LiveSender', () => {
  it('sends about 20 times a second, one request in flight at most', async () => {
    const waiting: ((ok: boolean) => void)[] = [];
    let built = 0;
    const s = new LiveSender('u', () => undefined, () => new Promise((r) => waiting.push(r)));
    const build = () => (built++, state());
    expect(SEND_EVERY_MS).toBe(50);
    s.tick(1000, build);
    s.tick(1010, build); // too soon
    s.tick(1060, build); // the first is still in flight: skipped
    s.tick(1200, build);
    expect(waiting.length).toBe(1);
    expect(built).toBe(1); // the state is only built when it is sent
    waiting[0](true);
    await flush();
    s.tick(1210, build);
    expect(waiting.length).toBe(2);
    expect(s.sent).toBe(1);
  });

  it('shows LIVE only while sends succeed, and never throws', async () => {
    let changes = 0;
    let mode: 'ok' | 'fail' | 'throw' | 'reject' = 'fail';
    const s = new LiveSender('u', () => changes++, () => {
      if (mode === 'throw') {
        throw new Error('no network');
      }
      return mode === 'reject' ? Promise.reject(new Error('reset')) : Promise.resolve(mode === 'ok');
    });
    const now = () => performance.now();
    s.tick(now(), state);
    await flush();
    s.tick(now() + 60, state);
    expect(s.ok).toBe(false);
    mode = 'ok';
    await flush();
    s.tick(now() + 120, state);
    await flush();
    s.tick(now() + 180, state);
    expect(s.ok).toBe(true);
    expect(changes).toBe(1);
    for (const m of ['throw', 'reject'] as const) {
      mode = m;
      await flush();
      expect(() => s.tick(now() + 5000, state)).not.toThrow();
      await flush();
    }
    s.tick(now() + 10000, () => {
      throw new Error('state failed');
    });
    await flush();
    expect(s.ok).toBe(false); // nothing got through for more than 1.5 s
  });
});
