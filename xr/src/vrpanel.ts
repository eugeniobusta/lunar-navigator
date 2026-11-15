// The floating panel used inside VR: one stage of the journey (journey.ts stageView) drawn on a canvas, on a plane
// that the controller ray or a hand pinch can press. Few, large buttons: every one is at least 7 cm high. The app
// tests its own ray against the plane (hit) and calls the same actions as the laptop panel (hud.ts).
// A bar on top of the panel is its handle: it is the only part IWSDK's grab system can take hold of (the app
// gives the panel a DistanceGrabbable; the panel itself ignores pointer events, the handle accepts them).
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import type { StageButton, StageView } from './journey.js';
import { FONT } from './objects.js';

const W = 1024;
const H = 1200;
export const PANEL_W_M = 0.82;
export const PANEL_H_M = (PANEL_W_M * H) / W;
/** Button height on the canvas, and in the room: 92 px of 1024 across 0.82 m. */
export const BUTTON_PX = 92;
export const BUTTON_M = (BUTTON_PX * PANEL_W_M) / W;
/** The handle: a bar above the panel's top edge, metres. */
export const HANDLE_W_M = 0.4;
export const HANDLE_H_M = 0.075;
/** Height of the handle's centre above the panel's. */
export const HANDLE_Y_M = PANEL_H_M / 2 + 0.012 + HANDLE_H_M / 2;
/** Where the panel stands when it is put back in front of the visitor: this far from the head, this far to the
 *  left of where they look, at this height above the floor. */
export const FRONT = { distM: 1.134, leftRad: 0.578, heightM: 1.25 };

type V3 = [number, number, number];

/** The turn about the vertical that makes a panel at `panel` face a head at `head` (the panel's front is +z). */
export const facingYaw = (panel: V3, head: V3) => Math.atan2(head[0] - panel[0], head[2] - panel[2]);

/** True if the panel is behind a head looking along `forward` (only the horizontal parts count). */
export const isBehind = (head: V3, forward: V3, panel: V3) => (panel[0] - head[0]) * forward[0] + (panel[2] - head[2]) * forward[2] < 0;

/** The place in front of the visitor, a little to the left, where the panel is put back. */
export function frontSpot(head: V3, forward: V3): V3 {
  const yaw = Math.atan2(forward[0], forward[2]) + FRONT.leftRad;
  return [head[0] + FRONT.distM * Math.sin(yaw), FRONT.heightM, head[2] + FRONT.distM * Math.cos(yaw)];
}

const C = {
  panel: '#24201B',
  rim: '#3B352D',
  text: '#EFE8DC',
  text2: '#A89F92',
  sun: '#F6B93B',
  cloud: '#DCE8FF',
  alert: '#E0457B',
  go: '#6FBF73',
  ink: '#191612',
};

export interface PanelHit {
  point: Vector3;
  button: string | null;
  /** The ray is on the handle above the panel. */
  handle: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class VrPanel {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private texture: CanvasTexture;
  private buttons: { id: string; r: Rect }[] = [];
  private lastKey = '';
  private hover: string | null = null;
  private inv = new Matrix4();
  private o = new Vector3();
  private d = new Vector3();
  /** The first-time hint: an arrow beside the next button to press. A mesh of its own, so it can move without
   *  the canvas being drawn and uploaded again. */
  private arrow: Mesh;
  private arrowAt: Rect | null = null;
  private handle: Mesh;
  private handleLit: boolean | null = null;
  private head = new Vector3();

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter;
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(
      new PlaneGeometry(PANEL_W_M, PANEL_H_M),
      // Drawn after the floating labels (transparent pass, late order, no depth test), so they never cover it.
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.mesh.renderOrder = 20;
    const tri = new BufferGeometry();
    tri.setAttribute('position', new Float32BufferAttribute([-0.05, 0.028, 0, -0.05, -0.028, 0, 0, 0, 0], 3));
    this.arrow = new Mesh(tri, new MeshBasicMaterial({ color: C.sun, depthTest: false, depthWrite: false, transparent: true }));
    this.arrow.renderOrder = 21;
    this.arrow.visible = false;
    this.mesh.add(this.arrow);
    this.handle = new Mesh(new PlaneGeometry(HANDLE_W_M, HANDLE_H_M), new MeshBasicMaterial({ map: this.handleTexture(), transparent: true, depthTest: false, depthWrite: false }));
    this.handle.position.y = HANDLE_Y_M;
    this.handle.renderOrder = 20;
    this.mesh.add(this.handle);
    this.setHandleLit(false);
  }

  /** The handle's picture: a thin rounded bar with a grip of six dots, drawn once. */
  private handleTexture(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = C.panel;
    g.strokeStyle = C.text;
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(4, 14, 504, 68, 34);
    g.fill();
    g.stroke();
    g.fillStyle = C.text;
    for (let i = -1; i <= 1; i++) {
      for (const y of [38, 58]) {
        g.beginPath();
        g.arc(256 + i * 26, y, 6, 0, 2 * Math.PI);
        g.fill();
      }
    }
    const t = new CanvasTexture(c);
    t.minFilter = LinearFilter;
    t.colorSpace = SRGBColorSpace;
    return t;
  }

  get handleMap(): CanvasTexture {
    return (this.handle.material as MeshBasicMaterial).map as CanvasTexture;
  }

  /** The handle is quiet until the ray is on it or it is held. */
  setHandleLit(lit: boolean): void {
    if (lit !== this.handleLit) {
      this.handleLit = lit;
      (this.handle.material as MeshBasicMaterial).color.set(lit ? 0xffffff : 0x8f8a82);
    }
  }

  /** Whether a pointer (IWSDK's ray in VR) can take hold of the handle. The panel itself never takes pointers. */
  setGrabbable(on: boolean): void {
    (this.mesh as Mesh & { pointerEvents?: string }).pointerEvents = 'none';
    (this.handle as Mesh & { pointerEvents?: string }).pointerEvents = on ? 'auto' : 'none';
  }

  /** Turns the panel about the vertical to face the head (room coordinates). */
  face(head: Vector3): void {
    const e = this.mesh.parent!.worldToLocal(this.head.copy(head));
    const p = this.mesh.position;
    this.mesh.rotation.set(0, facingYaw([p.x, 0, p.z], [e.x, 0, e.z]), 0);
  }

  /** After a change of stage: a panel left behind the visitor comes back in front of them; true if it moved. */
  keepInFront(head: Vector3, forward: Vector3): boolean {
    const parent = this.mesh.parent!;
    const e = parent.worldToLocal(this.head.copy(head));
    const f = parent.worldToLocal(this.o.copy(head).add(forward)).sub(e);
    const p = this.mesh.position;
    if (!isBehind([e.x, e.y, e.z], [f.x, f.y, f.z], [p.x, p.y, p.z])) {
      return false;
    }
    const [x, y, z] = frontSpot([e.x, e.y, e.z], [f.x, f.y, f.z]);
    p.set(x, y, z);
    this.mesh.rotation.set(0, facingYaw([x, 0, z], [e.x, 0, e.z]), 0);
    return true;
  }

  get map(): CanvasTexture {
    return this.texture;
  }

  setHover(id: string | null): void {
    if (id !== this.hover) {
      this.hover = id;
      this.lastKey = '';
    }
  }

  /** Moves the hint arrow: it nudges towards its button once a second. */
  tick(timeS: number): void {
    const r = this.arrowAt;
    this.arrow.visible = r != null;
    if (r) {
      const nudge = 0.012 * (0.5 + 0.5 * Math.sin(timeS * 2 * Math.PI));
      this.arrow.position.set(((r.x + 4) / W - 0.5) * PANEL_W_M - nudge, (0.5 - (r.y + r.h / 2) / H) * PANEL_H_M, 0.004);
    }
  }

  /** Room positions of the centres of the buttons now on the panel (for the emulator checks of docs/XR.md). */
  targets(): { id: string; at: number[] }[] {
    this.mesh.updateWorldMatrix(true, false);
    const at = (x: number, y: number) =>
      new Vector3(x, y, 0)
        .applyMatrix4(this.mesh.matrixWorld)
        .toArray()
        .map((v) => Math.round(v * 1000) / 1000);
    return [
      ...this.buttons.map(({ id, r }) => ({ id, at: at(((r.x + r.w / 2) / W - 0.5) * PANEL_W_M, (0.5 - (r.y + r.h / 2) / H) * PANEL_H_M) })),
      { id: 'handle', at: at(0, HANDLE_Y_M) },
    ];
  }

  /** Draws the panel if anything on it changed; true if it did. */
  draw(m: StageView, credits: string): boolean {
    const key = JSON.stringify(m) + (this.hover ?? '');
    if (key === this.lastKey) {
      return false;
    }
    this.lastKey = key;
    const g = this.ctx;
    this.buttons = [];
    this.arrowAt = null;
    g.fillStyle = C.panel;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = C.rim;
    g.lineWidth = 4;
    g.strokeRect(2, 2, W - 4, H - 4);
    const pad = 44;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = C.text;
    g.font = `600 46px ${FONT}`;
    const top = !m.help && m.stage !== 'loading';
    g.fillText(m.title, pad, 86, W - 2 * pad - 110 - (top && m.voice != null ? BUTTON_PX + 14 : 0));
    // "?" is always there, top right; beside it the speaker: voice and sounds on or off.
    if (top) {
      this.button({ id: 'help', label: '?' }, { x: W - pad - BUTTON_PX, y: 26, w: BUTTON_PX, h: BUTTON_PX }, 44);
      if (m.voice != null) {
        const r = { x: W - pad - 2 * BUTTON_PX - 14, y: 26, w: BUTTON_PX, h: BUTTON_PX };
        this.button({ id: 'voice', label: '' }, r, 44);
        this.speaker(r.x + r.w / 2, r.y + r.h / 2, m.voice);
      }
    }
    let y = 118;
    const para = (text: string, size: number, color: string, weight = 400, x = pad, gap = 10) => {
      g.font = `${weight} ${size}px ${FONT}`;
      g.fillStyle = color;
      for (const part of this.wrap(text, W - pad - x)) {
        y += size + gap;
        g.fillText(part, x, y);
      }
    };
    if (m.caption) {
      para(m.caption, 31, C.sun, 600);
    }
    y += 26;
    for (const line of m.help ?? []) {
      para(line, 29, C.text, 400, pad, 12);
      y += 12;
    }
    y += m.help ? 16 : 0;
    for (const row of m.rows) {
      const gap = 14;
      const w = (W - 2 * pad - gap * (row.length - 1)) / row.length;
      const h = row.some((b) => b.note) ? BUTTON_PX + 44 : BUTTON_PX;
      row.forEach((b, i) => this.button(b, { x: pad + i * (w + gap), y, w, h }, 34));
      y += h + 14;
    }
    y += 4;
    for (const s of m.status) {
      const size = 34;
      y += size + 14;
      const cx = pad + 18;
      const cy = y - 12;
      const color = s.ok ? (s.icon === 'earth' ? C.cloud : s.icon === 'sun' ? C.sun : C.text2) : C.alert;
      g.strokeStyle = g.fillStyle = color;
      g.lineWidth = 4;
      if (s.icon === 'sun') {
        g.beginPath();
        g.arc(cx, cy, 9, 0, 2 * Math.PI);
        s.ok ? g.fill() : g.stroke();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          g.beginPath();
          g.moveTo(cx + 13 * Math.cos(a), cy + 13 * Math.sin(a));
          g.lineTo(cx + 18 * Math.cos(a), cy + 18 * Math.sin(a));
          g.stroke();
        }
      } else if (s.icon === 'earth') {
        g.beginPath();
        g.arc(cx, cy, 14, 0, 2 * Math.PI);
        s.ok ? g.fill() : g.stroke();
      } else {
        g.strokeRect(cx - 14, cy - 12, 28, 26);
        g.fillRect(cx - 14, cy - 12, 28, 8);
      }
      g.font = `600 ${size}px ${FONT}`;
      g.fillStyle = s.ok ? C.text : C.alert;
      g.fillText(s.text, pad + 52, y, W - 2 * pad - 52);
    }
    y += m.legend.length ? 8 : 0;
    for (const l of m.legend) {
      const size = 25;
      const x = pad + 38;
      g.font = `400 ${size}px ${FONT}`;
      this.wrap(l.text, W - pad - x).forEach((part, i) => {
        y += size + 9;
        if (i === 0 && l.color) {
          // The swatch; the hatch says "unsafe" without relying on colour.
          const s0 = 24;
          g.fillStyle = l.color;
          g.fillRect(pad, y - s0 + 3, s0, s0);
          if (l.hatch) {
            g.save();
            g.beginPath();
            g.rect(pad, y - s0 + 3, s0, s0);
            g.clip();
            g.strokeStyle = C.ink;
            g.lineWidth = 3;
            for (let k = -s0; k < s0; k += 8) {
              g.beginPath();
              g.moveTo(pad + k, y + 3);
              g.lineTo(pad + k + s0, y - s0 + 3);
              g.stroke();
            }
            g.restore();
          }
        }
        g.fillStyle = C.text;
        g.fillText(part, x, y);
      });
    }
    y += 10;
    for (const n of m.notes) {
      para(n, 22, C.text2, 400, pad, 8);
    }
    // Credits, wrapped, at the bottom.
    g.fillStyle = C.text2;
    g.font = `400 17px ${FONT}`;
    const linesOut = this.wrap(credits, W - 2 * pad);
    linesOut.forEach((l, i) => g.fillText(l, pad, H - 30 - (linesOut.length - 1 - i) * 21));
    this.texture.needsUpdate = true;
    return true;
  }

  private button(b: StageButton, r: Rect, size: number): void {
    const g = this.ctx;
    this.buttons.push({ id: b.id, r });
    if (b.hint) {
      this.arrowAt = r;
    }
    const hovered = this.hover === b.id;
    const selected = b.on && !b.toggle;
    // The one green button is filled; where you are has a bright edge and a line under its name; the rest are
    // quiet outlines that light up under the ray.
    g.fillStyle = b.go ? C.go : hovered ? C.rim : C.panel;
    g.strokeStyle = b.go ? (hovered ? C.text : C.go) : hovered || selected ? C.text : C.rim;
    g.lineWidth = hovered || selected ? 5 : 3;
    g.beginPath();
    g.roundRect(r.x, r.y, r.w, r.h, 10);
    g.fill();
    g.stroke();
    g.font = `600 ${size}px ${FONT}`;
    g.fillStyle = b.go ? C.ink : C.text;
    const sw = b.toggle ? 96 : 0; // room for the switch
    const midY = b.note ? r.y + 52 : r.y + r.h / 2 + size * 0.34;
    if (b.toggle || b.note) {
      g.textAlign = 'left';
      g.fillText(b.label, r.x + 24, midY, r.w - 48 - sw);
    } else {
      g.textAlign = 'center';
      g.fillText(b.label, r.x + r.w / 2, midY, r.w - 24);
      if (selected) {
        const tw = Math.min(r.w - 24, g.measureText(b.label).width);
        g.fillRect(r.x + (r.w - tw) / 2, midY + 9, tw, 4);
      }
    }
    g.textAlign = 'left';
    if (b.note) {
      g.font = `400 23px ${FONT}`;
      g.fillStyle = C.sun;
      this.wrap(b.note, r.w - 48)
        .slice(0, 2)
        .forEach((part, i) => g.fillText(part, r.x + 24, r.y + 86 + i * 28, r.w - 48));
    }
    if (b.toggle) {
      // A switch: the knob is on the right and the track green when it is on; the word says it too.
      const tx = r.x + r.w - 24 - 76;
      const ty = r.y + r.h / 2 - 19;
      g.fillStyle = b.on ? C.go : C.rim;
      g.beginPath();
      g.roundRect(tx, ty, 76, 38, 19);
      g.fill();
      g.fillStyle = C.text;
      g.beginPath();
      g.arc(b.on ? tx + 57 : tx + 19, ty + 19, 14, 0, 2 * Math.PI);
      g.fill();
      g.font = `600 22px ${FONT}`;
      g.fillStyle = b.on ? C.text : C.text2;
      g.textAlign = 'right';
      g.fillText(b.on ? 'On' : 'Off', tx - 12, r.y + r.h / 2 + 8);
      g.textAlign = 'left';
    }
  }

  /** The speaker on the Voice button: with sound waves when on, crossed out when off (never colour alone). */
  private speaker(cx: number, cy: number, on: boolean): void {
    const g = this.ctx;
    g.fillStyle = g.strokeStyle = on ? C.text : C.text2;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - 26, cy - 9);
    g.lineTo(cx - 14, cy - 9);
    g.lineTo(cx, cy - 22);
    g.lineTo(cx, cy + 22);
    g.lineTo(cx - 14, cy + 9);
    g.lineTo(cx - 26, cy + 9);
    g.closePath();
    g.fill();
    if (on) {
      for (const r of [12, 24]) {
        g.beginPath();
        g.arc(cx + 2, cy, r, -0.85, 0.85);
        g.stroke();
      }
    } else {
      g.strokeStyle = C.alert;
      g.beginPath();
      g.moveTo(cx + 10, cy - 12);
      g.lineTo(cx + 30, cy + 12);
      g.moveTo(cx + 30, cy - 12);
      g.lineTo(cx + 10, cy + 12);
      g.stroke();
    }
    g.lineCap = 'butt';
  }

  /** Splits text into rows no wider than `width` in the current font. */
  private wrap(text: string, width: number): string[] {
    const out: string[] = [];
    let cur = '';
    for (const w of text.split(' ')) {
      if (cur && this.ctx.measureText(`${cur} ${w}`).width > width) {
        out.push(cur);
        cur = w;
      } else {
        cur = cur ? `${cur} ${w}` : w;
      }
    }
    out.push(cur);
    return out;
  }

  /** Where a world-space ray meets the panel, and what is under it. A button's hit area reaches 6 px past its edge. */
  hit(origin: Vector3, dir: Vector3): PanelHit | null {
    if (!this.mesh.visible) {
      return null;
    }
    this.mesh.updateWorldMatrix(true, false);
    this.inv.copy(this.mesh.matrixWorld).invert();
    const o = this.o.copy(origin).applyMatrix4(this.inv);
    const d = this.d.copy(dir).transformDirection(this.inv);
    if (d.z > -1e-6) {
      return null; // behind the panel or parallel to it
    }
    const t = -o.z / d.z;
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    if (t < 0) {
      return null;
    }
    // The handle, with a centimetre of slack around it and no gap between it and the panel.
    if (Math.abs(x) <= HANDLE_W_M / 2 + 0.01 && y > PANEL_H_M / 2 && y <= HANDLE_Y_M + HANDLE_H_M / 2 + 0.01) {
      return { point: new Vector3(x, y, 0.002).applyMatrix4(this.mesh.matrixWorld), button: null, handle: true };
    }
    if (Math.abs(x) > PANEL_W_M / 2 || Math.abs(y) > PANEL_H_M / 2) {
      return null;
    }
    const px = (x / PANEL_W_M + 0.5) * W;
    const py = (0.5 - y / PANEL_H_M) * H;
    const b = this.buttons.find(({ r }) => px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 6 && py <= r.y + r.h + 6);
    return { point: new Vector3(x, y, 0.002).applyMatrix4(this.mesh.matrixWorld), button: b?.id ?? null, handle: false };
  }
}
