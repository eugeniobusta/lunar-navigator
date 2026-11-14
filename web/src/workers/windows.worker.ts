// Web Worker: runs the Window Finder off the main thread so the UI never freezes on a long search.
import type { Ephemeris } from "../lib/analysis";
import { runJob, type FromWorker, type ToWorker } from "./windowsJob";

let eph: Ephemeris | null = null;
const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "init") { eph = msg.eph; return; }
  if (!eph) { post({ type: "error", jobId: msg.jobId, message: "Ephemeris not sent to the worker yet" }); return; }
  try {
    runJob(eph, msg, post);
  } catch (err) {
    post({ type: "error", jobId: msg.jobId, message: String(err) });
  }
};
