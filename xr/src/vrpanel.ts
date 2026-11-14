// The floating panel used inside VR: a canvas drawn with the same palette and font as the laptop HUD, on a plane
// that the controller ray or a hand pinch can press. Buttons are rectangles on the canvas; the app tests its own
// ray against the plane (hit) and calls the same actions as the HUD.
import {
  CanvasTexture,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { FONT } from './objects.js';

const W = 1024;
const H = 1024;
export const PANEL_W_M = 0.82;
export const PANEL_H_M = (PANEL_W_M * H) / W;

const C = {
  panel: '#24201B',
  rim: '#3B352D',
  text: '#EFE8DC',
  text2: '#A89F92',
  sun: '#F6B93B',
  earth: '#2F6FD6',
  cloud: '#DCE8FF',
  alert: '#E0457B',
  ok: '#8FC28A',
};
export type PanelColor = keyof typeof C;

export interface PanelButton {
  id: string;
  label: string;
  on?: boolean;
  primary?: boolean;
  /** A tick box: drawn with its box (ticked or not), then `chip`, then the label, left-aligned. */
  check?: boolean;
  /** Colour of the chip of a tick box, "#rrggbb". */
  chip?: string;
  /** Shown but not pressable. */
  locked?: boolean;
}

export interface PanelLine {
  text: string;
  color?: PanelColor;
  big?: boolean;
  small?: boolean;
}

export interface PanelModel {
  title: string;
  subtitle: string;
  /** Every line is wrapped over as many rows as it needs. */
  lines: PanelLine[];
  rows: PanelButton[][];
  /** Lines under the buttons: text that changes with a press goes here, so the buttons stay where they are. */
  after?: PanelLine[];
  /** Button height on the 1024 px canvas (default 50). */
  buttonH?: number;
  /** 0..1 position in the 30-day window, or null to hide the time bar. */
  timeFrac: number | null;
  credits: string;
}

export interface PanelHit {
  point: Vector3;
  button: string | null;
  /** 0..1 along the time bar when the ray is on it. */
  scrub: number | null;
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
  private bar: Rect | null = null;
  private lastKey = '';
  private hover: string | null = null;
  private inv = new Matrix4();
  private o = new Vector3();
  private d = new Vector3();

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
  }

  setHover(id: string | null): void {
    if (id !== this.hover) {
      this.hover = id;
      this.lastKey = '';
    }
  }

  draw(m: PanelModel): void {
    const key = JSON.stringify(m) + (this.hover ?? '');
    if (key === this.lastKey) {
      return;
    }
    this.lastKey = key;
    const g = this.ctx;
    this.buttons = [];
    g.fillStyle = C.panel;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = C.rim;
    g.lineWidth = 4;
    g.strokeRect(2, 2, W - 4, H - 4);
    const pad = 36;
    let y = pad + 34;
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.text;
    g.font = `600 40px ${FONT}`;
    g.fillText(m.title, pad, y);
    g.fillStyle = C.text2;
    g.font = `400 26px ${FONT}`;
    g.textAlign = 'right';
    g.fillText(m.subtitle, W - pad, y);
    g.textAlign = 'left';
    y += 22;
    const text = (lines: PanelLine[]) => {
      for (const line of lines) {
        const size = line.big ? 32 : line.small ? 19 : 25;
        g.font = `${line.big ? 600 : 400} ${size}px ${FONT}`;
        g.fillStyle = C[line.color ?? 'text'];
        for (const part of this.wrap(line.text, W - 2 * pad)) {
          y += size + (line.small ? 5 : 9);
          g.fillText(part, pad, y, W - 2 * pad);
        }
      }
    };
    text(m.lines);
    y += 20;
    const bh = m.buttonH ?? 50;
    for (const row of m.rows) {
      const gap = 10;
      const bw = (W - 2 * pad - gap * (row.length - 1)) / row.length;
      row.forEach((b, i) => {
        const r = { x: pad + i * (bw + gap), y, w: bw, h: bh };
        if (!b.locked) {
          this.buttons.push({ id: b.id, r });
        }
        const hovered = !b.locked && this.hover === b.id;
        g.fillStyle = b.primary ? C.sun : b.on ? C.text : hovered ? C.rim : C.panel;
        g.strokeStyle = hovered ? C.text : C.rim;
        g.lineWidth = 3;
        g.beginPath();
        g.roundRect(r.x, r.y, r.w, r.h, 8);
        g.fill();
        g.stroke();
        g.font = `600 ${bh > 56 ? 26 : 23}px ${FONT}`;
        if (b.check != null) {
          // Tick box, colour chip, name: the website's list, at controller size.
          const box = 30;
          const by = r.y + (bh - box) / 2;
          g.strokeStyle = b.locked ? C.text2 : C.text;
          g.fillStyle = b.check ? (b.locked ? C.text2 : C.text) : C.panel;
          g.beginPath();
          g.roundRect(r.x + 16, by, box, box, 5);
          g.fill();
          g.stroke();
          if (b.check) {
            g.strokeStyle = '#191612';
            g.lineWidth = 5;
            g.beginPath();
            g.moveTo(r.x + 23, by + 16);
            g.lineTo(r.x + 29, by + 23);
            g.lineTo(r.x + 40, by + 8);
            g.stroke();
          }
          g.globalAlpha = b.check ? 1 : 0.45;
          g.fillStyle = b.chip ?? C.ok;
          g.beginPath();
          g.roundRect(r.x + 60, by + 2, box - 4, box - 4, 5);
          g.fill();
          g.globalAlpha = 1;
          g.fillStyle = b.check && !b.locked ? C.text : C.text2;
          g.fillText(b.label, r.x + 100, r.y + bh / 2 + 9, r.w - 112);
        } else {
          g.fillStyle = b.primary || b.on ? '#191612' : C.text;
          g.textAlign = 'center';
          g.fillText(b.label, r.x + r.w / 2, r.y + bh / 2 + 8, r.w - 12);
          g.textAlign = 'left';
        }
      });
      y += bh + 10;
    }
    text(m.after ?? []);
    this.bar = null;
    if (m.timeFrac != null) {
      const r = { x: pad, y: y + 6, w: W - 2 * pad, h: 44 };
      this.bar = r;
      g.fillStyle = C.rim;
      g.beginPath();
      g.roundRect(r.x, r.y + 16, r.w, 12, 6);
      g.fill();
      g.fillStyle = C.sun;
      g.beginPath();
      g.roundRect(r.x, r.y + 16, r.w * m.timeFrac, 12, 6);
      g.fill();
      g.beginPath();
      g.arc(r.x + r.w * m.timeFrac, r.y + 22, 16, 0, 2 * Math.PI);
      g.fill();
    }
    // Credits, wrapped, at the bottom.
    g.fillStyle = C.text2;
    g.font = `400 18px ${FONT}`;
    const linesOut = this.wrap(m.credits, W - 2 * pad);
    linesOut.forEach((l, i) => g.fillText(l, pad, H - pad - (linesOut.length - 1 - i) * 22 + 8));
    this.texture.needsUpdate = true;
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

  /** Where a world-space ray meets the panel, and what is under it. */
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
    if (t < 0 || Math.abs(x) > PANEL_W_M / 2 || Math.abs(y) > PANEL_H_M / 2) {
      return null;
    }
    const px = (x / PANEL_W_M + 0.5) * W;
    const py = (0.5 - y / PANEL_H_M) * H;
    const inside = (r: Rect, m = 0) => px >= r.x - m && px <= r.x + r.w + m && py >= r.y - m && py <= r.y + r.h + m;
    const b = this.buttons.find((k) => inside(k.r));
    const scrub = this.bar && inside(this.bar, 14) ? Math.max(0, Math.min(1, (px - this.bar.x) / this.bar.w)) : null;
    return {
      point: new Vector3(x, y, 0.002).applyMatrix4(this.mesh.matrixWorld),
      button: b?.id ?? null,
      scrub,
    };
  }
}
