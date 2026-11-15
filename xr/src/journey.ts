// The journey: three stages (the whole Moon, the south pole, on the surface), each with one short panel, and the
// named moments that happen on the way. Pure: no three.js and no DOM, so it can be tested (journey.test.ts).
// A moment has a caption slot (one short line, built only from numbers the app computed) and is announced to
// listeners; a voice can be attached to the same hook later (docs/NARRATION.md).
import type { LegendLine } from './guide.js';

export type Stage = 'loading' | 'moon' | 'pole' | 'flight' | 'surface';

/** The six places offered at the south pole, in panel order. Ids are those of /data/sites.json. */
export const JOURNEY_SITES: { id: string; label: string; note?: string }[] = [
  { id: 'mma01', label: 'Malapert Massif', note: 'Recommended: Earth always in the sky, the Sun skims a giant ridge' },
  { id: 'mmo01', label: 'Mons Mouton' },
  { id: 'hw02', label: 'Haworth' },
  { id: 'nr107', label: 'Nobile Rim 1' },
  { id: 'dgr203', label: 'de Gerlache Rim 2' },
  { id: 'im2', label: "IM-2 Athena's landing spot" },
];
export const RECOMMENDED_SITE = JOURNEY_SITES[0].id;

/** Hours of real time per second while time runs: a month in 30 s over the whole Moon, a day in 10 s on the surface. */
export const MOON_HOURS_PER_S = 24;
export const SURFACE_HOURS_PER_S = 2.4;
/** "Faster" on the surface. */
export const FASTER = 4;
/** The window of time the journey plays in, hours (30 days). */
export const WINDOW_H = 720;

/** Day 1..30 of the window for an hour 0..720 of it. */
export const dayOf = (tH: number) => Math.min(WINDOW_H / 24, Math.floor(Math.max(0, tH) / 24) + 1);

/** "85.9 S" */
export const latLabel = (latDeg: number) => `${Math.abs(latDeg).toFixed(1)} ${latDeg < 0 ? 'S' : 'N'}`;

/**
 * Earth rotation angle (IERS Conventions 2010, eq. 5.15) for a UTC time, radians, 0..2 pi: how far the Greenwich
 * meridian has turned from the x axis of the celestial frame. UT1 is taken as UTC (they differ by under 0.9 s,
 * 0.004 deg). Used only to turn the picture of the Earth the right way round.
 */
export function earthRotationAngle(utcMs: number): number {
  const d = utcMs / 86400000 + 2440587.5 - 2451545.0; // days from J2000.0
  const turns = 0.779057273264 + 1.00273781191135448 * d;
  return 2 * Math.PI * (turns - Math.floor(turns));
}

// ------------------------------------------------------------------------------------------------ moments

export const MOMENTS = [
  'moon-intro',
  'start-motion',
  'pause-motion',
  'fly-to-pole',
  'pole-arrived',
  'site-recommended',
  'colours-on',
  'colours-off',
  'flight',
  'landed',
  'play',
  'pause',
  'play-first-sunrise',
  'sunrise',
  'sunset',
  'earth-in-view',
  'earth-hidden',
  'teleport',
  'back-to-pole',
  'back-to-moon',
] as const;
export type MomentId = (typeof MOMENTS)[number];

/** What a caption may quote. Every number is computed by the app from /data/ at the moment it fires. */
export interface MomentFacts {
  siteName?: string;
  latDeg?: number;
  /** Share of the 30-day window with the Sun's centre above the skyline at the standing point, per cent. */
  sunPct?: number;
  earthPct?: number;
  /** Longest unbroken darkness in the window at the standing point, hours. */
  longestDarkH?: number;
  movedM?: number;
  sunUp?: boolean;
}

const round = (v: number | undefined) => (v == null ? '?' : String(Math.round(v)));

/** The caption of a moment: one line, read in five seconds. */
export function caption(id: MomentId, f: MomentFacts = {}): string {
  const site = f.siteName ?? 'the landing site';
  switch (id) {
    case 'moon-intro':
      return 'The Moon, seen from below its south pole. Press Start.';
    case 'start-motion':
      return `One month every ${Math.round(WINDOW_H / MOON_HOURS_PER_S)} seconds: day and night cross the Moon.`;
    case 'pause-motion':
      return 'Time is paused.';
    case 'fly-to-pole':
      return 'Going down to the south pole.';
    case 'pole-arrived':
      return 'The south pole. Pick a place to land.';
    case 'site-recommended':
      return `${JOURNEY_SITES[0].label}: ${(JOURNEY_SITES[0].note ?? '').replace(/^Recommended: /u, '')}.`;
    case 'colours-on':
      return 'Green is good to land on, amber acceptable, red poor.';
    case 'colours-off':
      return 'Colours off: the bare ground.';
    case 'flight':
      return `Flying to ${site}${f.latDeg == null ? '' : `, ${latLabel(f.latDeg)}`}`;
    case 'landed':
      return `You are standing on ${site}. Press Play.`;
    case 'play':
      return `Time is running: one day every ${Math.round(24 / SURFACE_HOURS_PER_S)} seconds.`;
    case 'pause':
      return 'Time is paused.';
    case 'play-first-sunrise':
    case 'sunrise':
      return `Sunrise. Here the Sun is up ${round(f.sunPct)} % of these 30 days.`;
    case 'sunset':
      return f.longestDarkH == null ? 'Sunset.' : `Sunset. The longest night of these 30 days lasts ${round(f.longestDarkH)} hours.`;
    case 'earth-in-view':
      return `Earth is in view: a radio link home, ${round(f.earthPct)} % of these 30 days.`;
    case 'earth-hidden':
      return 'Earth is behind the hills: no direct radio link.';
    case 'teleport':
      return `Moved ${round(f.movedM)} m.`;
    case 'back-to-pole':
      return 'Back above the south pole.';
    case 'back-to-moon':
      return 'Back to the whole Moon.';
  }
}

export interface MomentEvent {
  id: MomentId;
  caption: string;
  facts: MomentFacts;
  /** How many times this moment has fired, this one included. */
  count: number;
}

/** The moments as they happen: the latest caption, and a hook for whoever wants to speak or log them. */
export class Journey {
  /** The caption slot: the line of the latest moment. */
  caption = '';
  last: MomentId | null = null;
  private counts = new Map<MomentId, number>();
  private listeners: ((e: MomentEvent) => void)[] = [];

  on(fn: (e: MomentEvent) => void): void {
    this.listeners.push(fn);
  }

  fired(id: MomentId): boolean {
    return this.counts.has(id);
  }

  emit(id: MomentId, facts: MomentFacts = {}): MomentEvent {
    const count = (this.counts.get(id) ?? 0) + 1;
    this.counts.set(id, count);
    const e = { id, caption: caption(id, facts), facts, count };
    this.caption = e.caption;
    this.last = id;
    for (const fn of this.listeners) {
      fn(e);
    }
    return e;
  }
}

/** Which moment a change of the Sun or the Earth at the standing point is, while time runs. Null: no change. */
export function skyMoment(
  before: { sunUp: boolean; earthUp: boolean },
  now: { sunUp: boolean; earthUp: boolean },
  hadSunrise: boolean,
): MomentId | null {
  if (now.sunUp !== before.sunUp) {
    return now.sunUp ? (hadSunrise ? 'sunrise' : 'play-first-sunrise') : 'sunset';
  }
  if (now.earthUp !== before.earthUp) {
    return now.earthUp ? 'earth-in-view' : 'earth-hidden';
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ the panel

export interface StageButton {
  id: string;
  label: string;
  /** A second, smaller line inside the button. */
  note?: string;
  /** The one green button of the stage. */
  go?: boolean;
  /** Selected (where you are) or switched on. */
  on?: boolean;
  /** A switch: drawn with its state. */
  toggle?: boolean;
  /** The next button to press, the first time through: an arrow points at it. */
  hint?: boolean;
}

export interface StatusLine {
  icon: 'sun' | 'earth' | 'day';
  text: string;
  /** False: drawn in the alert colour (Sun below the hills, Earth hidden). */
  ok: boolean;
}

/** One panel, drawn the same on the laptop (hud.ts) and in the headset (vrpanel.ts). */
export interface StageView {
  stage: Stage;
  title: string;
  caption: string;
  rows: StageButton[][];
  status: StatusLine[];
  /** The traffic-light legend, when the colours are on: the website's words, each with its colour. */
  legend: { text: string; color: string | null; hatch: boolean }[];
  /** Small permanent labels. */
  notes: string[];
  /** The one-screen help, when open (it replaces the rows). */
  help: string[] | null;
  /** The Voice switch (voice and sound effects), in the headset once sound has started; null: not offered. */
  voice: boolean | null;
  /** The headset is sending to a live viewer and the sends succeed: a green LIVE dot (spectator.ts). */
  live: boolean;
}

export interface ViewState {
  stage: Stage;
  message: string | null;
  caption: string;
  playing: boolean;
  faster: boolean;
  colours: boolean;
  /** False where the colours cannot be shown (the map did not load). */
  coloursReady: boolean;
  siteId: string | null;
  siteName: string | null;
  sunUp: boolean | null;
  earthUp: boolean | null;
  /** "2026-11-18" */
  date: string;
  /** Hour 0..720 of the window. */
  tH: number;
  legend: { lines: LegendLine[]; colors: Record<string, string> } | null;
  /** Buttons pressed so far (ids up to the first colon), for the first-time hints. */
  pressed: ReadonlySet<string>;
  help: boolean;
  /** The frame-rate line, when "Frame rate" is on. */
  stats: string | null;
  inXR: boolean;
  /** Extra small label (terrain interpolated from the 430 m map). */
  extraNote: string | null;
  /** Voice and sounds on or off; null where there is no sound (the laptop view). */
  voice: boolean | null;
  live: boolean;
}

export const NOTE_SCALE = 'Sun and Earth: sizes and distances not to scale';
export const NOTE_SURFACE = 'Surface detail illustrative; terrain shape from NASA LOLA';

const HELP: Record<Stage, string[]> = {
  loading: [],
  moon: [
    'Start: a month passes in 30 seconds. Watch the line between day and night move.',
    'South Pole: go down to where the landings are planned.',
    'Laptop: drag to turn the Moon, scroll to come closer.',
  ],
  pole: [
    'Pick one of the six places: on this panel, or its marker on the ground.',
    'Show safe landing colours: green good, amber acceptable, red poor, hatched unsafe.',
    'Laptop: drag to turn, scroll to zoom.',
  ],
  flight: ['The rocket is on its way. You land in a moment.'],
  surface: [
    'Play: the days run. The Sun circles low, the Earth barely moves.',
    'Move: point at the ground and pull the trigger, or pinch. Laptop: click the ground, drag to look.',
    'Back to the south pole: pick another place.',
  ],
};

/** The panel of the stage the visitor is in. */
export function stageView(s: ViewState): StageView {
  const hint = (id: string, when: boolean) => when && !s.pressed.has(id);
  const base = { stage: s.stage, caption: s.message ?? s.caption, status: [] as StatusLine[], legend: [] as StageView['legend'], notes: [] as string[], voice: s.voice, live: s.live };
  if (s.help) {
    return {
      ...base,
      title: 'Help',
      rows: [
        [
          { id: 'close', label: 'Close', go: true },
          { id: 'stats', label: 'Frame rate', toggle: true, on: s.stats != null },
          ...(s.inXR ? [{ id: 'exit', label: 'Leave VR' }] : []),
        ],
      ],
      help: [...HELP[s.stage], ...(s.stats ? [s.stats] : [])],
    };
  }
  const notes = [...(s.stats ? [s.stats] : []), ...(s.extraNote ? [s.extraNote] : [])];
  if (s.stage === 'loading') {
    return { ...base, title: 'Lunar Landing Site Navigator', rows: [], notes, help: null };
  }
  if (s.stage === 'moon') {
    return {
      ...base,
      title: 'The whole Moon',
      rows: [
        [{ id: 'moon', label: 'Whole Moon', on: true }],
        [{ id: 'pole', label: 'South Pole', hint: hint('pole', s.pressed.has('start')) }],
        [{ id: 'start', label: s.playing ? 'Pause' : 'Start', go: true, hint: hint('start', true) }],
      ],
      status: [{ icon: 'day', text: `${s.date}, day ${dayOf(s.tH)} of 30`, ok: true }],
      notes: [NOTE_SCALE, ...notes],
      help: null,
    };
  }
  if (s.stage === 'pole' || s.stage === 'flight') {
    const flying = s.stage === 'flight';
    const site = (i: number): StageButton => {
      const k = JOURNEY_SITES[i];
      return { id: `site:${k.id}`, label: k.label, note: k.note, on: flying && s.siteId === k.id, hint: i === 0 && hint('site', !flying) };
    };
    return {
      ...base,
      title: flying ? `Flying to ${s.siteName ?? ''}` : 'The south pole',
      rows: [
        [{ id: 'moon', label: 'Back to whole Moon' }],
        ...(s.coloursReady ? [[{ id: 'colours', label: 'Show safe landing colours', toggle: true, on: s.colours }]] : []),
        [site(0)],
        [site(1), site(2)],
        [site(3), site(4)],
        [site(5)],
      ],
      legend:
        s.colours && s.legend
          ? s.legend.lines.map((l) => ({ text: l.text, color: l.mark == null ? null : s.legend!.colors[l.mark === 'unsafe' ? 'red' : l.mark], hatch: l.mark === 'unsafe' }))
          : [],
      notes: [NOTE_SCALE, ...notes],
      help: null,
    };
  }
  const status: StatusLine[] = [];
  if (s.sunUp != null && s.earthUp != null) {
    status.push({ icon: 'sun', text: `Sun: ${s.sunUp ? 'up' : 'below the hills'}`, ok: s.sunUp });
    status.push({ icon: 'earth', text: `Earth: ${s.earthUp ? 'in view' : 'hidden'}`, ok: s.earthUp });
  }
  status.push({ icon: 'day', text: `${s.date}, day ${dayOf(s.tH)} of 30`, ok: true });
  return {
    ...base,
    title: s.siteName ?? 'On the surface',
    rows: [
      [{ id: 'play', label: s.playing ? 'Pause' : 'Play', go: true, hint: hint('play', true) }],
      [{ id: 'faster', label: 'Faster', toggle: true, on: s.faster }],
      [{ id: 'pole', label: 'Back to the south pole' }],
    ],
    status,
    notes: [NOTE_SURFACE, ...notes],
    help: null,
  };
}
