// Main-thread side of the Window Finder worker.
//
// Usage (e.g. in routes/Windows.tsx):
//   const finder = createWindowFinder(eph);                 // once, when the ephemeris is loaded
//   const bySite = await finder.run(sites, spec, from, to, (p) => setProgress(p.done / p.total));
//   finder.terminate();                                     // on unmount
// Starting a new run cancels the previous one: its promise rejects with WindowFinderCancelled.
import type { DayResult, Ephemeris, MissionSpec } from "../lib/analysis";
import type { FromWorker, SiteInput, ToWorker } from "./windowsJob";

export type { SiteInput } from "./windowsJob";
export interface WindowProgress { done: number; total: number; siteId: string; days: DayResult[] }

export class WindowFinderCancelled extends Error {
  constructor() { super("Window Finder run replaced by a newer one"); this.name = "WindowFinderCancelled"; }
}

export interface WindowFinder {
  run(sites: SiteInput[], spec: MissionSpec, fromIdx: number, toIdx: number,
    onProgress?: (p: WindowProgress) => void): Promise<Record<string, DayResult[]>>;
  terminate(): void;
}

export function createWindowFinder(eph: Ephemeris): WindowFinder {
  const worker = new Worker(new URL("./windows.worker.ts", import.meta.url), { type: "module" });
  const send = (m: ToWorker) => worker.postMessage(m);
  send({ type: "init", eph }); // copied once; the main thread keeps its own arrays

  let jobId = 0;
  let pending: { id: number; reject: (e: Error) => void } | null = null;

  return {
    run(sites, spec, fromIdx, toIdx, onProgress) {
      pending?.reject(new WindowFinderCancelled());
      const id = ++jobId;
      const out: Record<string, DayResult[]> = {};
      return new Promise((resolve, reject) => {
        pending = { id, reject };
        worker.onmessage = (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.jobId !== id) return; // a message from a cancelled run
          if (m.type === "progress") {
            out[m.siteId] = m.days;
            onProgress?.({ done: m.done, total: m.total, siteId: m.siteId, days: m.days });
          } else if (m.type === "done") {
            pending = null; resolve(out);
          } else {
            pending = null; reject(new Error(m.message));
          }
        };
        send({ type: "run", jobId: id, sites, spec, fromIdx, toIdx });
      });
    },
    terminate() {
      pending?.reject(new WindowFinderCancelled());
      pending = null;
      worker.terminate();
    },
  };
}
