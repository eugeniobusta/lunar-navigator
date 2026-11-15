// The narrator and the sound effects of the VR journey. The narrator's clips are generated ahead of time with
// ElevenLabs (scripts/make_voice.mjs writes xr/public/voice/*.mp3 and lines.json; the app never calls ElevenLabs).
// A clip belongs to a moment of the journey (journey.ts) and plays the first time that moment is heard; a new
// moment stops the clip that is playing, so clips never overlap. The effects are WebAudio oscillators: no files.
// Nothing here runs per frame; a clip ends through `onended`. Sound starts only when the visitor enters VR (a
// user gesture), and one switch turns voice and effects off.
import type { MomentId, Stage } from './journey.js';

/** The clip of a moment: its own name, or for a landing the place's ("landed:mma01"). */
export const clipOf = (id: MomentId, siteId: string | null) => (id === 'landed' ? `landed:${siteId ?? ''}` : id);
/** The file of a clip in xr/public/voice/ (as scripts/make_voice.mjs names it). */
export const fileOf = (clip: string) => `${clip.replace(':', '-')}.mp3`;

export type Effect = 'click' | 'whoosh' | 'tone';
/** Length of each effect, seconds. */
export const EFFECT_S: Record<Effect, number> = { click: 0.07, whoosh: 0.5, tone: 0.6 };
/** Loudest point of each effect (its oscillators added), of full scale; the voice plays at 1. */
export const EFFECT_PEAK: Record<Effect, number> = { click: 0.1, whoosh: 0.08, tone: 0.1 };
/** The moments with a sound: a whoosh on the way to the pole and on a move, a low tone on landing. */
export const EFFECT_OF: Partial<Record<MomentId, Effect>> = { 'fly-to-pole': 'whoosh', teleport: 'whoosh', landed: 'tone' };

/**
 * Which clip to speak: a moment's clip the first time it can be heard (in VR that is the first time the moment
 * fires), never again. Pure, so it is tested (voice.test.ts).
 */
export class VoiceRules {
  private heard = new Set<string>();

  /** The clip of a moment that just fired, or null if it has none or was heard already. */
  moment(id: MomentId, siteId: string | null, has: (clip: string) => boolean): string | null {
    const clip = clipOf(id, siteId);
    return has(clip) && !this.heard.has(clip) ? clip : null;
  }

  /** The visitor enters VR in this stage, after its opening moment fired in silence: that moment's clip. */
  enter(stage: Stage, siteId: string | null, has: (clip: string) => boolean): string | null {
    const id: MomentId | null = stage === 'moon' ? 'moon-intro' : stage === 'pole' ? 'pole-arrived' : stage === 'surface' ? 'landed' : null;
    return id ? this.moment(id, siteId, has) : null;
  }

  began(clip: string): void {
    this.heard.add(clip);
  }
}

export class Narrator {
  /** The Voice switch: off silences the voice and the effects. */
  on = true;
  /** True while the visitor is in VR: sound starts on entering it and stops on leaving. */
  active = false;
  /** The clip now playing. */
  speaking: string | null = null;
  /** For the checks: the clips that began to play, and how many effects sounded. */
  readonly spoken: string[] = [];
  effects = 0;
  private rules = new VoiceRules();
  private ctx: AudioContext | null = null;
  private ready: Promise<void> | null = null;
  private lines = new Map<string, { text: string; buffer: AudioBuffer }>();
  private source: AudioBufferSourceNode | null = null;
  private has = (clip: string) => this.lines.has(clip);

  /** `onCaption`: the text of the clip that began, or null when the voice falls silent. */
  constructor(private onCaption: (text: string | null) => void) {}

  get loaded(): number {
    return this.lines.size;
  }

  /** How long the clip now playing lasts, seconds (0 when silent). */
  get speakingS(): number {
    return this.source?.buffer?.duration ?? 0;
  }

  /** Called when the visitor enters VR: starts the sound, loads the clips once, then speaks the stage's clip. */
  enter(where: () => { stage: Stage; siteId: string | null }): void {
    const Ctx = window.AudioContext;
    if (!Ctx) {
      return;
    }
    this.ctx ??= new Ctx();
    this.active = true;
    void this.ctx.resume();
    this.ready ??= this.load(this.ctx);
    void this.ready.then(() => {
      if (this.active && !this.source) {
        const w = where();
        this.say(this.rules.enter(w.stage, w.siteId, this.has));
      }
    });
  }

  leave(): void {
    this.active = false;
    this.stop();
  }

  private async load(ctx: AudioContext): Promise<void> {
    const base = `${import.meta.env.BASE_URL}voice/`;
    try {
      const res = await fetch(`${base}lines.json`);
      const list = ((await res.json()) as { lines: Record<string, string> }).lines;
      await Promise.all(
        Object.entries(list).map(async ([clip, text]) => {
          try {
            const bytes = await (await fetch(base + fileOf(clip))).arrayBuffer();
            this.lines.set(clip, { text, buffer: await ctx.decodeAudioData(bytes) });
          } catch {
            // a clip that cannot be fetched or decoded stays silent; the journey's own captions remain
          }
        }),
      );
    } catch {
      // no voice: the effects still work
    }
  }

  /** A moment of the journey: it stops the clip that is playing; then its effect, and its clip the first time. */
  moment(id: MomentId, siteId: string | null): void {
    if (!this.active) {
      return;
    }
    this.stop();
    const fx = EFFECT_OF[id];
    if (fx) {
      this.effect(fx);
    }
    this.say(this.rules.moment(id, siteId, this.has));
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!on) {
      this.stop();
    }
  }

  private say(clip: string | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.active || !this.on || !clip) {
      return;
    }
    this.stop();
    const line = this.lines.get(clip)!;
    const src = ctx.createBufferSource();
    src.buffer = line.buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.speaking = null;
        this.onCaption(null);
      }
    };
    this.source = src;
    this.speaking = clip;
    this.spoken.push(clip);
    this.rules.began(clip);
    this.onCaption(line.text);
    src.start();
  }

  private stop(): void {
    const src = this.source;
    this.source = null;
    if (src) {
      src.onended = null;
      src.stop();
      this.speaking = null;
      this.onCaption(null);
    }
  }

  /** A short, quiet sound made of one or two oscillators. */
  effect(kind: Effect): void {
    const ctx = this.ctx;
    if (!ctx || !this.active || !this.on) {
      return;
    }
    this.effects++;
    const t = ctx.currentTime;
    const dur = EFFECT_S[kind];
    const peak = EFFECT_PEAK[kind];
    const tone = (type: OscillatorType, f0: number, f1: number, level: number, rise: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(level, t + rise * dur);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    };
    if (kind === 'click') {
      tone('triangle', 880, 520, peak, 0.1);
    } else if (kind === 'whoosh') {
      tone('sine', 160, 640, peak * 0.75, 0.6);
      tone('triangle', 240, 960, peak * 0.25, 0.6);
    } else {
      // Landing: a low tone that settles, with its octave under it.
      tone('sine', 130, 98, peak * 0.6, 0.08);
      tone('sine', 65, 49, peak * 0.4, 0.08);
    }
  }
}
