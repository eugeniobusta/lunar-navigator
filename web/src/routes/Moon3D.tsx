// The 3D / VR view lives at /xr/ (built by the VR team). This tab embeds it for the selected site and time.
// Until /xr/ is deployed it shows a short placeholder instead.
import { useEffect, useState } from "react";
import { idxToMs } from "../state/derived";
import { useStore } from "../state/store";
import { xrUrl } from "./xr";

/** True if /xr/ serves its own page (a missing page gives 404, or this app's own shell on a dev server). */
async function xrAvailable(): Promise<boolean> {
  try {
    const r = await fetch("/xr/", { cache: "no-store" });
    if (!r.ok) return false;
    return !(await r.text()).includes('id="root"');
  } catch {
    return false;
  }
}

export function Moon3D() {
  const siteId = useStore((s) => s.siteId);
  const site = useStore((s) => s.sites.find((x) => x.id === s.siteId));
  const spot = useStore((s) => s.spot);
  const liveMs = useStore((s) => idxToMs(s.startIdx + s.cursor));
  // The frame reloads when its address changes, so follow the time slider only once it has stopped moving.
  const [ms, setMs] = useState(liveMs);
  useEffect(() => { const id = setTimeout(() => setMs(liveMs), 500); return () => clearTimeout(id); }, [liveMs]);
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { void xrAvailable().then(setOk); }, []);

  if (ok === null) return <section className="panel"><p className="note">Loading the 3D view…</p></section>;
  if (!ok) {
    return (
      <section className="panel prose">
        <h2>3D Moon</h2>
        <p>3D view in progress.</p>
        <p className="note">
          It will show the south-pole terrain from NASA's LOLA elevation map with the landing sites on it. The terrain
          files are already published: see the Data tab.
        </p>
      </section>
    );
  }
  return (
    <section className="panel">
      <div className="xr-bar">
        <h2>{spot ? `Standing at ${Math.abs(spot[0]).toFixed(3)}° S, ${spot[1].toFixed(3)}° E, near ${site?.name}` : `Standing at ${site?.name}`}</h2>
        <a href={xrUrl(siteId, ms, false, spot)}>Open full screen / VR</a>
      </div>
      <iframe className="xr-frame" title={`3D view of ${site?.name ?? "the site"}`} src={xrUrl(siteId, ms, true, spot)}
        allow="xr-spatial-tracking; fullscreen" />
    </section>
  );
}
