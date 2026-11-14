// The homepage clock: when the Sun next sets (or rises) over the real skyline at a site, counted down to the second.
// The series is hourly; the crossing is placed between the two hours by straight-line interpolation of the Sun's
// margin over the skyline (the disc centre, as everywhere else: sunlit = margin > 0).
import type { Series } from ".";

export interface SunChange {
  /** Is the Sun's centre above the skyline at the first sample? */
  lit: boolean;
  /** Time of the next sunset (if lit) or sunrise (if not), ms since 1970; null if none within the series. */
  atMs: number | null;
}

/** Next sunset or sunrise in `series`, whose sample 0 is at `startMs`, one sample every `stepS` seconds. */
export function nextSunChange(series: Series, startMs: number, stepS: number): SunChange {
  const m = series.sunMargin, n = m.length;
  if (!n) return { lit: false, atMs: null };
  const lit = m[0] > 0;
  for (let i = 1; i < n; i++) {
    if ((m[i] > 0) !== lit) {
      const a = m[i - 1], b = m[i];
      const f = a === b ? 1 : a / (a - b); // where the margin crosses 0 between the two samples
      return { lit, atMs: startMs + (i - 1 + f) * stepS * 1000 };
    }
  }
  return { lit, atMs: null };
}

/** "2d 04:12:09"; under a day "04:12:09"; never negative. */
export function formatCountdown(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), mi = Math.floor((t % 3600) / 60), s = t % 60;
  const two = (v: number) => String(v).padStart(2, "0");
  return `${d ? `${d}d ` : ""}${two(h)}:${two(mi)}:${two(s)}`;
}
