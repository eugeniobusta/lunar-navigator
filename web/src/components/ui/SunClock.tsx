// The homepage clock (in the menu bar, like a launch clock): the next sunset or sunrise over the real skyline at the
// chosen site. If the chosen date is now, it counts down live to the second; if a later (or earlier) date is chosen,
// it counts from that date instead and says so, e.g. "From 28 Feb 2027 · Sunset at Malapert Massif in 3d 04:12:00".
import { useEffect, useMemo, useState } from "react";
import { computeSeries, type Ephemeris, type Horizon } from "../../lib/analysis";
import { formatCountdown, nextSunChange } from "../../lib/analysis/countdown";

const LOOK_AHEAD_DAYS = 60;

interface Props {
  eph: Ephemeris; horizon: Horizon; siteName: string;
  /** Sample index of the chosen date and time (window start plus the time slider). */
  fromIdx: number;
  onOpen: () => void;
}

export function SunClock({ eph, horizon, siteName, fromIdx, onOpen }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const stepMs = eph.stepS * 1000;
  const nowIdx = Math.floor((now - eph.startMs) / stepMs);
  // The chosen date counts as "now" when it is the current hour (the default when the site opens).
  const live = Math.abs(fromIdx - nowIdx) <= 1;
  const startIdx = live ? nowIdx : fromIdx;
  const change = useMemo(() => {
    if (startIdx < 0 || startIdx >= eph.n - 1) return null;
    const s = computeSeries(eph, horizon, startIdx, startIdx + Math.round((LOOK_AHEAD_DAYS * 86400) / eph.stepS));
    return nextSunChange(s, eph.startMs + startIdx * stepMs, eph.stepS);
  }, [eph, horizon, startIdx, stepMs]);
  if (!change) return null;

  const fromMs = live ? now : eph.startMs + startIdx * stepMs;
  const fromText = new Date(fromMs).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const event = change.lit ? "Sunset" : "Sunrise";
  const value = change.atMs === null ? `${LOOK_AHEAD_DAYS}+ days` : formatCountdown(change.atMs - fromMs);
  const atText = change.atMs === null ? "" : `${new Date(change.atMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return (
    <button type="button" className={live ? "live" : "live dated"} onClick={onOpen}
      title={change.atMs === null
        ? `The Sun stays ${change.lit ? "up" : "down"} at ${siteName} for at least ${LOOK_AHEAD_DAYS} days ${live ? "from now" : `from ${fromText} UTC`}`
        : `${event} over the real skyline at ${siteName}: ${atText}${live ? "" : ` (counted from ${fromText} UTC, the date you chose)`}`}>
      <span>
        {!live && <small>From {fromText} UTC</small>}
        {event} at {siteName} in
      </span>
      <b className={change.lit ? "up" : "down"}>{value}</b>
    </button>
  );
}
