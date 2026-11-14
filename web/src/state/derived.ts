// Hooks that turn state into analysis results. Recomputed only when their inputs change.
import { useMemo } from "react";
import { computeMetrics, computeSeries, type Metrics, type Series } from "../lib/analysis";
import { useStore } from "./store";

export interface SiteView { series: Series; metrics: Metrics; mock: boolean }

/** Series and metrics for one site over the current window (optionally shifted by slipDays). */
export function useSiteView(siteId: string, slipDays = 0): SiteView | null {
  const eph = useStore((s) => s.eph);
  const hz = useStore((s) => s.horizons[siteId]);
  const startIdx = useStore((s) => s.startIdx);
  const windowDays = useStore((s) => s.windowDays);
  const ephMock = useStore((s) => s.ephMock);
  return useMemo(() => {
    if (!eph || !hz) return null;
    const stepH = eph.stepS / 3600;
    const a = Math.max(0, Math.min(eph.n - 1, startIdx + Math.round((slipDays * 24) / stepH)));
    const b = Math.min(eph.n, a + Math.round((windowDays * 24) / stepH));
    const series = computeSeries(eph, hz.value, a, b);
    return { series, metrics: computeMetrics(series, stepH), mock: ephMock || hz.mock };
  }, [eph, hz, startIdx, windowDays, slipDays, ephMock]);
}

export function idxToMs(i: number): number {
  const eph = useStore.getState().eph;
  return eph ? eph.startMs + i * eph.stepS * 1000 : 0;
}

export function fmtDate(ms: number, withTime = true): string {
  const d = new Date(ms).toISOString();
  return withTime ? `${d.slice(0, 10)} ${d.slice(11, 16)} UTC` : d.slice(0, 10);
}

export function fmtHours(h: number | null): string {
  if (h === null) return "not in window";
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} days`;
}
