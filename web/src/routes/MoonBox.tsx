// MoonBox: the tabletop model. A ring of 24 LEDs is the horizon around the lander; the app lights the Sun's
// and Earth's directions as time plays. Works on screen with no hardware; plug in the board to drive it live.
import { useEffect, useRef, useState } from "react";
import { MoonBox as Link, serialSupported } from "../lib/serial";
import { fmtDate, idxToMs, useSiteView } from "../state/derived";
import { useStore } from "../state/store";

const LEDS = 24;

export function MoonBox() {
  const siteId = useStore((s) => s.siteId);
  const cursor = useStore((s) => s.cursor);
  const setCursor = useStore((s) => s.setCursor);
  const view = useSiteView(siteId);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("Not connected. The ring below mirrors what the board shows.");
  const link = useRef(new Link());

  const n = view?.series.sunlit.length ?? 0;
  useEffect(() => {
    if (!playing || n === 0) return;
    const t = setInterval(() => {
      const c = useStore.getState().cursor;
      setCursor(c + 1 >= n ? 0 : c + 1);
    }, 60);
    return () => clearInterval(t);
  }, [playing, n, setCursor]);

  const k = Math.min(cursor, Math.max(0, n - 1));
  const s = view?.series;
  useEffect(() => {
    if (!s || !link.current.connected) return;
    void link.current.send(s.sunAz[k], s.sunEl[k], s.sunFrac[k], s.earthAz[k], s.earthEl[k], s.earthVis[k] === 1);
  }, [s, k]);

  if (!s) return <p className="note">Loading the site…</p>;

  const sunLed = Math.round(s.sunAz[k] / (360 / LEDS)) % LEDS;
  const earthLed = Math.round(s.earthAz[k] / (360 / LEDS)) % LEDS;
  const connect = async () => {
    try {
      const reply = await link.current.connect();
      setStatus(reply.startsWith("MOONBOX") ? `Connected: ${reply}` : "Connected, but the board did not answer HELLO. Check the sketch and baud rate (115200).");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  return (
    <section className="panel moonbox">
      <svg viewBox="-120 -120 240 240" className="ring" role="img" aria-label="MoonBox LED ring">
        <circle r="96" className="ring-base" />
        {Array.from({ length: LEDS }, (_, i) => {
          const a = (i * 2 * Math.PI) / LEDS;
          const isSun = i === sunLed && s.sunFrac[k] > 0;
          const isEarth = i === earthLed && s.earthVis[k] === 1;
          return (
            <circle key={i} cx={96 * Math.sin(a)} cy={-96 * Math.cos(a)} r="8"
              className={isSun ? "led sun" : isEarth ? "led earth" : "led"}
              style={isSun ? { opacity: 0.35 + 0.65 * s.sunFrac[k] } : undefined} />
          );
        })}
        <text y="-104" textAnchor="middle" className="tick">N</text>
        <text y="4" textAnchor="middle" className="ring-time">{fmtDate(idxToMs(s.startIdx + k)).slice(0, 16)}</text>
      </svg>
      <div className="moonbox-side">
        <div className="controls">
          <button className="primary" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play the window"}</button>
          <button onClick={connect} disabled={!serialSupported()}>Connect MoonBox</button>
        </div>
        <p className="note">{serialSupported() ? status : "USB connection needs Chrome or Edge on a laptop. The on-screen ring still works."}</p>
        <p className="note">Amber LED: the Sun, brighter as more of its disc clears the terrain. Blue LED: Earth, lit only when it is above the horizon.</p>
      </div>
    </section>
  );
}
