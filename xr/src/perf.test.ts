// The automatic quality rule: lower detail only when frames really take longer than the 72 Hz budget.
import { describe, expect, it } from 'vitest';
import { FRAME_BUDGET_MS, LEVELS, QualityGovernor, WINDOW } from './perf';

const feed = (q: QualityGovernor, ms: number, frames: number, auto = true) => {
  let changes = 0;
  for (let i = 0; i < frames; i++) {
    changes += q.sample(ms, auto) ? 1 : 0;
  }
  return changes;
};

describe('QualityGovernor', () => {
  it('keeps full detail at a steady 72 Hz, timer jitter included', () => {
    const q = new QualityGovernor();
    for (let i = 0; i < 20 * WINDOW; i++) {
      q.sample(1000 / 72 + (i % 2 ? 0.4 : -0.4), true);
    }
    expect(q.level).toBe(0);
    expect(q.fps).toBeCloseTo(72, 0);
  });

  it('lowers one level per slow second, waits a second after each change, and stops at the lowest', () => {
    const q = new QualityGovernor();
    expect(feed(q, 2 * FRAME_BUDGET_MS, WINDOW - 1)).toBe(0);
    expect(feed(q, 2 * FRAME_BUDGET_MS, 1)).toBe(1);
    expect(q.level).toBe(1);
    expect(feed(q, 2 * FRAME_BUDGET_MS, 2 * WINDOW - 1)).toBe(0); // one window skipped, one being measured
    expect(feed(q, 2 * FRAME_BUDGET_MS, 1)).toBe(1);
    expect(feed(q, 2 * FRAME_BUDGET_MS, 10 * WINDOW)).toBe(0);
    expect(q.level).toBe(LEVELS.length - 1);
  });

  it('only measures on the laptop', () => {
    const q = new QualityGovernor();
    expect(feed(q, 40, 5 * WINDOW, false)).toBe(0);
    expect(q.level).toBe(0);
    expect(q.meanMs).toBeCloseTo(40, 6);
  });

  it('detail falls from level to level', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].meshStep).toBeGreaterThanOrEqual(LEVELS[i - 1].meshStep);
      expect(LEVELS[i].shadowRes).toBeLessThanOrEqual(LEVELS[i - 1].shadowRes);
    }
  });
});
