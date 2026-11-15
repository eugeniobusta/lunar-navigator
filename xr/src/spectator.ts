// Live view of a real VR session (docs/XR.md, "Live view and recording"). With ?live=<words> the headset posts
// its state about 20 times a second to https://<words>.trycloudflare.com/pose (a Cloudflare quick tunnel to
// scripts/spectator_relay.mjs on the Mac). With ?watch the same app, opened from that relay, follows the state:
// the wearer's view at 1920 x 1080, their panel, their voice, and a RECORD button. Nothing is sent without ?live.
import type { StageView } from './journey.js';
import type { Effect } from './voice.js';

type V3 = [number, number, number];
type Q4 = [number, number, number, number];

/** What the headset sends: enough to draw what the wearer sees and hear what they hear. */
export interface LiveState {
  /** The wearer's clock when it was sent, ms. */
  t: number;
  head: { p: V3; q: Q4 };
  /** Each hand's ray: origin, direction, drawn length (room coordinates). */
  rays: { o: V3; d: V3; len: number }[];
  mode: 'orbit' | 'flight' | 'stand';
  zoom: number;
  zoomTarget: number;
  siteId: string | null;
  siteName: string | null;
  /** Where the wearer stands on the surface: cell of the site's grid, and its latitude and longitude. */
  spot: { row: number; col: number; lat: number; lon: number } | null;
  /** How far the ground is lowered under the wearer's real floor, metres. */
  lift: number;
  startIdx: number;
  tH: number;
  playing: boolean;
  faster: boolean;
  colours: boolean;
  panel: { p: V3; yaw: number; hover: string | null; lit: boolean };
  /** The ground marker under the ray, in the site's coordinates. */
  ring: V3 | null;
  /** The panel as the wearer sees it. */
  view: StageView | null;
  voice: { on: boolean; clip: string | null; at: number; fx: number; kind: Effect | null };
}

export const SEND_EVERY_MS = 50;
/** The viewer says "Waiting for headset" after this long without a state. */
export const WAIT_MS = 2000;
export const WATCH_W = 1920;
export const WATCH_H = 1080;
/** Vertical field of view of the viewer for a horizontal one of 90 degrees at 16:9, degrees. */
export const WATCH_FOV = (2 * Math.atan(Math.tan(Math.PI / 4) / (WATCH_W / WATCH_H)) * 180) / Math.PI;

/** Where ?live=<words> sends: only a trycloudflare name made of plain words is accepted. */
export function liveUrl(words: string | null): string | null {
  return words && /^[a-z0-9]+(-[a-z0-9]+){1,7}$/u.test(words) ? `https://${words}.trycloudflare.com/pose` : null;
}

/** How much of the way to the newest pose the viewer's camera moves in a frame: light smoothing, about 80 ms. */
export const smoothing = (deltaS: number) => 1 - Math.exp(-Math.max(0, deltaS) / 0.08);

/** What a recording is called: claudes-plan-vr-20261115-143005.mp4 */
export function recordingName(date: Date, mime: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `claudes-plan-vr-${stamp}.${mime.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
}

/** The recording format: H.264 in MP4 where the browser can, else WebM. */
export function pickMime(supported: (mime: string) => boolean): string {
  return (
    ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(supported) ?? ''
  );
}

/** The headset's side: one request in flight at most, a tick is skipped otherwise; it never throws. */
export class LiveSender {
  /** True while sends succeed (the green LIVE dot). */
  ok = false;
  sent = 0;
  private busy = false;
  private last = -Infinity;
  private lastOk = -Infinity;

  constructor(
    readonly url: string,
    private onChange: () => void,
    private post: (url: string, body: string) => Promise<boolean> = (u, body) =>
      fetch(u, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, cache: 'no-store', credentials: 'omit' }).then((r) => r.ok),
  ) {}

  /** Called every frame in VR; `state` is only built when something is sent. */
  tick(nowMs: number, state: () => LiveState): void {
    this.setOk(nowMs - this.lastOk < 1500);
    if (this.busy || nowMs - this.last < SEND_EVERY_MS) {
      return;
    }
    this.last = nowMs;
    this.busy = true;
    let done: Promise<boolean>;
    try {
      done = this.post(this.url, JSON.stringify(state()));
    } catch {
      done = Promise.resolve(false);
    }
    done
      .catch(() => false)
      .then((ok) => {
        this.busy = false;
        if (ok) {
          this.sent++;
          this.lastOk = performance.now();
        }
      });
  }

  private setOk(ok: boolean): void {
    if (ok !== this.ok) {
      this.ok = ok;
      this.onChange();
    }
  }
}

const CSS = `
html, body { background:#000; }
#scene-container canvas { position:fixed !important; inset:0 !important; margin:auto !important;
  width:min(100vw, calc(100vh * 16 / 9)) !important; height:min(100vh, calc(100vw * 9 / 16)) !important; }
#watch { position:fixed; inset:0; pointer-events:none; font:600 16px "Barlow",system-ui,sans-serif; color:#EFE8DC; }
#watch .wait { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); background:#24201B; border:1px solid #3B352D;
  border-radius:6px; padding:14px 22px; font-size:22px; }
#watch .bar { position:absolute; right:14px; bottom:14px; display:flex; gap:8px; pointer-events:auto; }
#watch button { font:inherit; color:#EFE8DC; background:#24201B; border:1px solid #3B352D; border-radius:6px; padding:8px 14px; cursor:pointer; }
#watch button:hover { border-color:#EFE8DC; }
#watch button.rec { background:#E0457B; border-color:#E0457B; color:#191612; }
#watch .dot { position:absolute; right:16px; top:16px; width:14px; height:14px; border-radius:7px; background:#E5484D; }
#watch [hidden] { display:none; }
`;

/** The viewer's own controls, drawn over the page and so never in the recording. */
export class WatchUi {
  private root = document.createElement('div');
  private wait: HTMLElement;
  private dot: HTMLElement;
  private bar: HTMLElement;
  private sound: HTMLButtonElement;
  private recorder: MediaRecorder | null = null;
  /** For the checks: the last recording's name, size and format. */
  lastFile: { name: string; bytes: number; mime: string } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private audio: { listen(): void; on: boolean; setOn(on: boolean): void; recordStream(): MediaStream | null },
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.root.id = 'watch';
    this.root.innerHTML = `<div class="wait">Waiting for headset</div><div class="dot" hidden></div>
      <div class="bar"><button data-a="sound">Sound: click to start</button><button data-a="rec" class="rec">RECORD (R)</button></div>`;
    document.body.append(this.root);
    this.wait = this.root.querySelector('.wait')!;
    this.dot = this.root.querySelector('.dot')!;
    this.bar = this.root.querySelector('.bar')!;
    this.sound = this.root.querySelector('[data-a="sound"]')!;
    // Sound needs a click or a key first (the browser's rule); any of them starts it.
    const start = () => {
      this.audio.listen();
      this.sound.textContent = `Sound: ${this.audio.on ? 'on' : 'off'}`;
    };
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      const first = this.sound.textContent!.includes('click');
      start();
      if (a === 'sound' && !first) {
        this.audio.setOn(!this.audio.on);
        this.sound.textContent = `Sound: ${this.audio.on ? 'on' : 'off'}`;
      } else if (a === 'rec') {
        this.toggleRecord();
      }
    });
    window.addEventListener('keydown', (e) => {
      start();
      if (e.key === 'r' || e.key === 'R') {
        this.toggleRecord();
      }
    });
    window.addEventListener('pointerdown', start, { once: true });
  }

  setWaiting(waiting: boolean): void {
    this.wait.hidden = !waiting;
  }

  get recording(): boolean {
    return this.recorder != null;
  }

  /** Starts or stops a recording of the canvas at 60 frames a second with the voice and the effects. */
  toggleRecord(): void {
    if (this.recorder) {
      this.recorder.stop();
      return;
    }
    const mime = pickMime((m) => MediaRecorder.isTypeSupported(m));
    const stream = this.canvas.captureStream(60);
    for (const track of this.audio.recordStream()?.getAudioTracks() ?? []) {
      stream.addTrack(track);
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 128_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      this.recorder = null;
      this.dot.hidden = true;
      this.bar.hidden = false;
      const blob = new Blob(chunks, { type: rec.mimeType });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = recordingName(new Date(), rec.mimeType);
      this.lastFile = { name: a.download, bytes: blob.size, mime: rec.mimeType };
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    };
    rec.start(1000);
    this.recorder = rec;
    this.dot.hidden = false; // the red dot is on the page, not in the canvas, so it is not in the video
    this.bar.hidden = true;
  }
}
