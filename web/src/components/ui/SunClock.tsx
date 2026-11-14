// The homepage clock (in the menu bar, like a launch clock): the next sunset or sunrise over the real skyline at the
// chosen site, counted down live from the actual time, whatever date the other pages are set to.
import { useEffect, useMemo, useState } from "react";
import { computeSeries, type Ephemeris, type Horizon } from "../../lib/analysis";
import { formatCountdown, nextSunChange } from "../../lib/analysis/countdown";

const LOOK_AHEAD_DAYS = 60;

export function SunClock({ eph, horizon, siteName, onOpen }: { eph: Ephemeris; horizon: Horizon; siteName: string; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  // Recomputed for a new site, or once the hour it started from has passed.
  const hour = Math.floor((now - eph.startMs) / (eph.stepS * 1000));
  const change = useMemo(() => {
    if (hour < 0 || hour >= eph.n - 1) return null;
    const s = computeSeries(eph, horizon, hour, hour + Math.round((LOOK_AHEAD_DAYS * 86400) / eph.stepS));
    return nextSunChange(s, eph.startMs + hour * eph.stepS * 1000, eph.stepS);
  }, [eph, horizon, hour]);
  if (!change) return null;
  const event = change.lit ? "Sunset" : "Sunrise";
  const label = `${event} at ${siteName} in`;
  const value = change.atMs === null ? `${LOOK_AHEAD_DAYS}+ days` : formatCountdown(change.atMs - now);
  return (
    <button type="button" className="live" onClick={onOpen}
      title={change.atMs === null
        ? `The Sun stays ${change.lit ? "up" : "down"} at ${siteName} for at least ${LOOK_AHEAD_DAYS} days`
        : `${event} over the real skyline at ${siteName}: ${new Date(change.atMs).toISOString().slice(0, 16).replace("T", " ")} UTC`}>
      <span>{label}</span>
      <b className={change.lit ? "up" : "down"} aria-live="off">{value}</b>
    </button>
  );
}
