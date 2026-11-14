// Message protocol and job logic for the Window Finder worker. Kept free of Worker globals so it is testable.
import { findWindows, type DayResult, type Ephemeris, type Horizon, type MissionSpec } from "../lib/analysis";

export interface SiteInput { siteId: string; horizon: Horizon }

export type ToWorker =
  | { type: "init"; eph: Ephemeris }
  | { type: "run"; jobId: number; sites: SiteInput[]; spec: MissionSpec; fromIdx: number; toIdx: number };

export type FromWorker =
  | { type: "progress"; jobId: number; done: number; total: number; siteId: string; days: DayResult[] }
  | { type: "done"; jobId: number; ms: number }
  | { type: "error"; jobId: number; message: string };

/** Runs one job site by site, reporting each site's days as soon as they are ready. */
export function runJob(eph: Ephemeris, msg: Extract<ToWorker, { type: "run" }>, post: (m: FromWorker) => void): void {
  const t0 = performance.now();
  msg.sites.forEach((site, i) => {
    const days = findWindows(eph, site.horizon, msg.spec, msg.fromIdx, msg.toIdx);
    post({ type: "progress", jobId: msg.jobId, done: i + 1, total: msg.sites.length, siteId: site.siteId, days });
  });
  post({ type: "done", jobId: msg.jobId, ms: performance.now() - t0 });
}
