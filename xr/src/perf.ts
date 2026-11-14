// Automatic quality in the headset: when frames take longer than the 72 Hz budget, terrain and shadow detail drop
// one level. Detail never rises again by itself, so the picture does not flicker between levels.

/** One frame at 72 Hz, milliseconds. */
export const FRAME_BUDGET_MS = 13.9;
/** A steady 72 Hz headset reports 13.89 ms with timer jitter; the mean must exceed the budget by this share. */
export const TOLERANCE = 0.05;
/** Frames averaged for one decision (one second at 72 Hz). */
export const WINDOW = 72;

export interface QualityLevel {
  name: string;
  /** One terrain vertex every `meshStep` pixels of the 120 m tile (twice that on the far field and the pole). */
  meshStep: number;
  /** Shadow map side for the site tile (the pole uses twice this). */
  shadowRes: number;
  /** Shadows are recomputed at most every this many frames while time runs. */
  shadowEvery: number;
  /** Fixed foveation asked from the headset, 0..1. */
  foveation: number;
}

export const LEVELS: QualityLevel[] = [
  { name: 'high', meshStep: 2, shadowRes: 256, shadowEvery: 3, foveation: 0 },
  { name: 'medium', meshStep: 4, shadowRes: 256, shadowEvery: 4, foveation: 0.5 },
  { name: 'low', meshStep: 8, shadowRes: 128, shadowEvery: 6, foveation: 1 },
];

export class QualityGovernor {
  level = 0;
  /** Mean frame time of the last full window, milliseconds (0 until one is complete). */
  meanMs = 0;
  /** The longest single frame of that window, milliseconds. */
  worstMs = 0;
  private worst = 0;
  private sum = 0;
  private n = 0;
  private skip = 0;

  reset(): void {
    this.level = 0;
    this.meanMs = this.worstMs = 0;
    this.sum = this.n = this.skip = this.worst = 0;
  }

  /** Feed one frame time. With `auto`, returns true when the level was lowered. */
  sample(ms: number, auto: boolean): boolean {
    if (this.skip > 0) {
      this.skip--; // frames spent rebuilding after a change do not count
      return false;
    }
    this.sum += ms;
    this.worst = Math.max(this.worst, ms);
    if (++this.n < WINDOW) {
      return false;
    }
    this.meanMs = this.sum / this.n;
    this.worstMs = this.worst;
    this.sum = this.n = this.worst = 0;
    if (auto && this.meanMs > FRAME_BUDGET_MS * (1 + TOLERANCE) && this.level < LEVELS.length - 1) {
      this.level++;
      this.skip = WINDOW;
      return true;
    }
    return false;
  }

  get fps(): number {
    return this.meanMs > 0 ? 1000 / this.meanMs : 0;
  }
}
