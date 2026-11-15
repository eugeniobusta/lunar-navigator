// The narrator and the sound effects of the VR journey. The narrator speaks one short pre-recorded line per stage
// (scripts/make_voice.sh records them with the macOS voice and writes xr/public/voice/lines.json, which is also the
// text shown in the caption line while a line plays). The effects are WebAudio oscillators: no audio files.
// One channel: a new line stops the one playing. Nothing here runs per frame; a line ends through `onended`.
// Sound starts only when the visitor enters VR (a user gesture), and one switch turns voice and effects off.
import type { MomentId, Stage } from './journey.js';

export const LINE_IDS = ['moon', 'pole', 'surface', 'play', 'walk', 'handle'] as const;
export type LineId = (typeof LINE_IDS)[number];
/** Spoken once per session, after a stage's line: how to walk (on the surface), how to move the menu. */
const ONCE: LineId[] = ['walk', 'handle'];

export interface VoiceLine {
  id: LineId;
  text: string;
  file: string;
}

export type Effect = 'click' | 'whoosh' | 'chime';
/** Length of each effect, seconds: the click under 0.15, the others under 0.6. */
export const EFFECT_S: Record<Effect, number> = { click: 0.07, whoosh: 0.5, chime: 0.55 };
/** Loudest point of each effect (its oscillators added), of full scale; the voice plays at 1. */
export const EFFECT_PEAK: Record<Effect, number> = { click: 0.1, whoosh: 0.08, chime: 0.09 };
/** The moments with a sound: a rising whoosh when the stage changes or the visitor moves, a chime when Play starts. */
export const EFFECT_OF: Partial<Record<MomentId, Effect>> = {
  'fly-to-pole': 'whoosh',
  'back-to-moon': 'whoosh',
  flight: 'whoosh',
  'back-to-pole': 'whoosh',
  teleport: 'whoosh',
  play: 'chime',
};

/**
 * Which lines to speak, and when: a stage's line each time the visitor arrives in it, "play" once per visit to
 * the surface, "walk" and "handle" once per session. Pure, so it is tested (voice.test.ts).
 */
export class VoiceRules {
  private started = new Set<LineId>();
  private playSaid = false;

  private arrive(line: LineId): LineId[] {
    if (line === 'surface') {
      this.playSaid = false;
    }
    return [line, ...ONCE.filter((id) => !this.started.has(id) && (id !== 'walk' || line === 'surface'))];
  }

  /** The visitor enters VR in this stage. */
  enter(stage: Stage): LineId[] {
    return stage === 'moon' || stage === 'pole' || stage === 'surface' ? this.arrive(stage) : [];
  }

  /** A moment of the journey happened (journey.ts). The first line stops what is playing; the rest follow it. */
  moment(id: MomentId): LineId[] {
    if (id === 'back-to-moon') {
      return this.arrive('moon');
    }
    if (id === 'pole-arrived' || id === 'back-to-pole') {
      return this.arrive('pole');
    }
    if (id === 'landed') {
      return this.arrive('surface');
    }
    if (id === 'play' && !this.playSaid) {
      this.playSaid = true;
      return ['play'];
    }
    return [];
  }

  /** A line began to play: a once-per-session line that was cut off before it began is offered again. */
  began(id: LineId): void {
    this.started.add(id);
  }
}

export class Narrator {
  /** The Voice switch: off silences the voice and the effects. */
  on = true;
  /** The line now playing. */
  speaking: LineId | null = null;
  /** For the checks: the lines that began to play, and how many effects sounded. */
  readonly spoken: LineId[] = [];
  effects = 0;
  /** True while the visitor is in VR: sound starts on entering it and stops on leaving. */
  active = false;
  private rules = new VoiceRules();
  private ctx: AudioContext | null = null;
  private ready: Promise<void> | null = null;
  private lines = new Map<LineId, { text: string; buffer: AudioBuffer }>();
  private source: AudioBufferSourceNode | null = null;
  private queue: LineId[] = [];

  /** `onCaption`: the text of the line that began, or null when the voice falls silent. */
  constructor(private onCaption: (text: string | null) => void) {}

  get loaded(): number {
    return this.lines.size;
  }

  /** Called when the visitor enters VR: starts the sound, loads the six lines once, then speaks the stage's line. */
  enter(stage: () => Stage): void {
    const Ctx = window.AudioContext;
    if (!Ctx) {
      return;
    }
    this.ctx ??= new Ctx();
    this.active = true;
    void this.ctx.resume();
    this.ready ??= this.load(this.ctx);
    void this.ready.then(() => this.say(this.rules.enter(stage())));
  }

  private async load(ctx: AudioContext): Promise<void> {
    const base = `${import.meta.env.BASE_URL}voice/`;
    try {
      const res = await fetch(`${base}lines.json`);
      const list = ((await res.json()) as { lines: VoiceLine[] }).lines;
      await Promise.all(
        list.map(async (l) => {
          try {
            const bytes = await (await fetch(base + l.file)).arrayBuffer();
            this.lines.set(l.id, { text: l.text, buffer: await ctx.decodeAudioData(bytes) });
          } catch {
            // a line that cannot be fetched or decoded stays silent; the journey's own captions remain
          }
        }),
      );
    } catch {
      // no voice: the effects still work
    }
  }

  leave(): void {
    this.active = false;
    this.stop();
  }

  /** A moment of the journey: its effect, and its line if it has one. */
  moment(id: MomentId): void {
    if (!this.active || !this.on) {
      return;
    }
    const fx = EFFECT_OF[id];
    if (fx) {
      this.effect(fx);
    }
    const lines = this.rules.moment(id);
    if (lines.length) {
      this.say(lines);
    }
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!on) {
      this.stop();
    }
  }

  private say(ids: LineId[]): void {
    if (!this.active || !this.on || !ids.length) {
      return;
    }
    this.stop();
    this.queue = ids;
    this.next();
  }

  private next(): void {
    const ctx = this.ctx!;
    let id = this.queue.shift();
    while (id && !this.lines.has(id)) {
      id = this.queue.shift();
    }
    if (!id) {
      return;
    }
    const line = this.lines.get(id)!;
    const src = ctx.createBufferSource();
    src.buffer = line.buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.speaking = null;
        this.onCaption(null);
        this.next();
      }
    };
    this.source = src;
    this.speaking = id;
    this.spoken.push(id);
    this.rules.began(id);
    this.onCaption(line.text);
    src.start();
  }

  private stop(): void {
    this.queue = [];
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
      tone('sine', 880, 880, peak * 0.67, 0.03);
      tone('sine', 1318.5, 1318.5, peak * 0.33, 0.03);
    }
  }
}
