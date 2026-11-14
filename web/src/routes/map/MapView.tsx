// The landing map: shaded relief, the traffic-light overlay, a hatch over ground that fails a NASA limit, and a
// vector layer (latitude rings, compass, names, markers). Smooth zoom and pan with mouse, trackpad, touch and keys.
// Everything is in polar stereographic kilometres: x to the right (90° E), y up (0° E, towards Earth).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { paintClasses, unsafeMask, type PaintStyle } from "../../lib/analysis/paint";
import type { Rag } from "../../lib/analysis/rag";
import { Home } from "./icons";

const GRID = 1024, GRID_HALF_KM = 220, FIT_HALF_KM = 214, R_KM = 1737.4;
const K_MAX = 16;
/** Radius in km of the circle of latitude `deg` degrees from the pole. */
const ringKm = (deg: number) => 2 * R_KM * Math.tan((deg * Math.PI) / 360);

export interface ZoneMark { id: number; rank: number; x: number; y: number; rag: Rag; score: number }
export interface PlaceMark { id: string; name: string; x: number; y: number; ok?: boolean }
export interface FeatureMark { name: string; x: number; y: number; major: boolean }
export interface View { cx: number; cy: number; k: number }

interface Props {
  relief: HTMLImageElement | null;
  reliefWide: HTMLImageElement | null;
  wideHalfKm: number;
  /** Class codes of the 1024 grid (rag.classGrid), or null while the layers load. */
  codes: Uint8Array | null;
  style: PaintStyle;
  zones: ZoneMark[];
  selectedZone: number | null;
  onZone: (id: number) => void;
  artemis: PlaceMark[];
  missions: PlaceMark[];
  features: FeatureMark[];
  pick: [number, number] | null;
  onPick: (xKm: number, yKm: number) => void;
  /** Text for the pointer's position (class, value), or null outside the data. */
  describe: (xKm: number, yKm: number) => string | null;
  /** A request to move the view: change `nonce` to fly there. */
  focus: { x: number; y: number; k: number; nonce: number } | null;
  label: string;
}

function hatchTile(dpr: number): HTMLCanvasElement {
  const n = Math.round(7 * dpr), c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(20, 12, 10, 0.5)";
  g.lineWidth = Math.max(1, 1.4 * dpr);
  for (const o of [-n, 0, n]) { g.beginPath(); g.moveTo(o, n); g.lineTo(o + n, 0); g.stroke(); }
  return c;
}

export function MapView(p: Props) {
  const wrap = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 0, cy: 0, k: 1 });
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const overlay = useRef<HTMLCanvasElement | null>(null), mask = useRef<HTMLCanvasElement | null>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const [painted, setPainted] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.max(240, Math.round(el.clientWidth)), h: Math.max(240, Math.round(el.clientHeight)) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pixels per km at zoom 1: the 6° circle fits the smaller side.
  const fit = Math.min(size.w, size.h) / (2 * FIT_HALF_KM);
  const ppk = fit * view.k;
  const sx = (x: number) => size.w / 2 + (x - view.cx) * ppk, sy = (y: number) => size.h / 2 - (y - view.cy) * ppk;
  const clampView = useCallback((v: View): View => {
    const k = Math.min(K_MAX, Math.max(1, v.k)), lim = GRID_HALF_KM;
    return { k, cx: Math.min(lim, Math.max(-lim, v.cx)), cy: Math.min(lim, Math.max(-lim, v.cy)) };
  }, []);
  /** Zoom by `factor`, keeping the point under screen position (px, py) where it is. */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setView((v) => {
      const k = Math.min(K_MAX, Math.max(1, v.k * factor)), f = fit * v.k, g = fit * k;
      const ax = px ?? size.w / 2, ay = py ?? size.h / 2;
      const wx = v.cx + (ax - size.w / 2) / f, wy = v.cy - (ay - size.h / 2) / f;
      return clampView({ k, cx: k === 1 ? 0 : wx - (ax - size.w / 2) / g, cy: k === 1 ? 0 : wy + (ay - size.h / 2) / g });
    });
  }, [fit, size, clampView]);

  // Animated moves (buttons, "fly to"): ease out over a fifth of a second.
  const anim = useRef(0);
  const flyTo = useCallback((to: View) => {
    cancelAnimationFrame(anim.current);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let from: View | null = null;
    const t0 = performance.now(), target = clampView(to);
    const step = (now: number) => {
      const t = still ? 1 : Math.min(1, (now - t0) / 220), e = 1 - (1 - t) ** 4;
      setView((v) => { from ??= v; return { cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e, k: from.k * (target.k / from.k) ** e }; });
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [clampView]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  const focusNonce = p.focus?.nonce;
  useEffect(() => { if (p.focus) flyTo({ cx: p.focus.x, cy: p.focus.y, k: p.focus.k }); }, [focusNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // The overlay and the unsafe mask at grid resolution, repainted when the classes or the display settings change.
  useEffect(() => {
    if (!p.codes) { overlay.current = mask.current = null; setPainted((n) => n + 1); return; }
    const make = (px: Uint8ClampedArray) => {
      const c = document.createElement("canvas");
      c.width = c.height = GRID;
      const img = new ImageData(GRID, GRID);
      img.data.set(px);
      c.getContext("2d")!.putImageData(img, 0, 0);
      return c;
    };
    overlay.current = make(paintClasses(p.codes, p.style));
    mask.current = make(unsafeMask(p.codes));
    setPainted((n) => n + 1);
  }, [p.codes, p.style]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== size.w * dpr || c.height !== size.h * dpr) { c.width = size.w * dpr; c.height = size.h * dpr; }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    const box = (half: number): [number, number, number, number] => [sx(-half), sy(half), 2 * half * ppk, 2 * half * ppk];
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.globalAlpha = 0.9;
    if (p.reliefWide) g.drawImage(p.reliefWide, ...box(p.wideHalfKm));
    if (p.relief) g.drawImage(p.relief, ...box(GRID_HALF_KM));
    // Ground beyond 6° from the pole is outside the assessed region: dimmed.
    g.globalAlpha = 0.5;
    g.fillStyle = "#000";
    g.beginPath();
    g.rect(0, 0, size.w, size.h);
    g.arc(sx(0), sy(0), ringKm(6) * ppk, 0, 2 * Math.PI, true);
    g.fill("evenodd");
    g.globalAlpha = 1;
    if (overlay.current) {
      // The assessed region is the circle 6° from the pole. Beyond it the relief is left bare (it all fails
      // NASA's distance limit, which the legend says), so the map reads as a disc, not as the square of the grid.
      g.save();
      g.beginPath();
      g.arc(sx(0), sy(0), ringKm(6) * ppk, 0, 2 * Math.PI);
      g.clip();
      // One grid cell is about 430 m: once it is several pixels wide, show the cells as they are.
      g.imageSmoothingEnabled = (2 * GRID_HALF_KM * ppk) / GRID < 3;
      g.drawImage(overlay.current, ...box(GRID_HALF_KM));
      if (mask.current && p.style.unsafeOpacity > 0) {
        const s = (scratch.current ??= document.createElement("canvas"));
        if (s.width !== c.width || s.height !== c.height) { s.width = c.width; s.height = c.height; }
        const h = s.getContext("2d")!;
        h.setTransform(dpr, 0, 0, dpr, 0, 0);
        h.globalCompositeOperation = "source-over";
        h.clearRect(0, 0, size.w, size.h);
        h.imageSmoothingEnabled = g.imageSmoothingEnabled;
        h.drawImage(mask.current, ...box(GRID_HALF_KM));
        h.globalCompositeOperation = "source-in";
        const tile = hatchTile(dpr), pattern = h.createPattern(tile, "repeat")!;
        // The hatch is anchored to the ground, so it moves with the map instead of sliding over it.
        const period = tile.width / dpr;
        pattern.setTransform(new DOMMatrix().scale(1 / dpr).translate((((sx(0) % period) + period) % period) * dpr, (((sy(0) % period) + period) % period) * dpr));
        h.fillStyle = pattern;
        h.fillRect(0, 0, size.w, size.h);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = p.style.unsafeOpacity;
        g.drawImage(s, 0, 0);
        g.globalAlpha = 1;
      }
      g.restore();
    }
  }, [size, view, painted, p.relief, p.reliefWide, p.wideHalfKm, p.style.unsafeOpacity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pointers: one drags the map, two pinch it. A press that does not move is a click on the spot under it.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; dist: number } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const toWorld = (x: number, y: number): [number, number] => [view.cx + (x - size.w / 2) / ppk, view.cy - (y - size.h / 2) / ppk];
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-mark], button")) return;
    wrap.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    gesture.current = { moved: gesture.current?.moved ?? 0, dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0 };
    cancelAnimationFrame(anim.current);
    setTip(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const at = local(e), was = pointers.current.get(e.pointerId);
    if (!was || !gesture.current) {
      if (e.pointerType === "mouse") { const text = p.describe(...toWorld(at.x, at.y)); setTip(text ? { ...at, text } : null); }
      return;
    }
    pointers.current.set(e.pointerId, at);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      const dx = at.x - was.x, dy = at.y - was.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      setView((v) => clampView({ ...v, cx: v.cx - dx / (fit * v.k), cy: v.cy + dy / (fit * v.k) }));
    } else if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (gesture.current.dist > 0) zoomAt(dist / gesture.current.dist, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      gesture.current = { moved: gesture.current.moved + 10, dist };
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had || !gesture.current) return;
    if (pointers.current.size === 0) {
      if (gesture.current.moved < 6) { const at = local(e); p.onPick(...toWorld(at.x, at.y)); }
      gesture.current = null;
    } else gesture.current.dist = 0;
  };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // Wheel and trackpad: zoom about the pointer. Registered by hand because React's wheel listener is passive.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : 1;
      zoomAt(Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.012 : 0.0022)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== wrap.current) return;
    const stepKm = 40 / view.k;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-stepKm, 0], ArrowRight: [stepKm, 0], ArrowUp: [0, stepKm], ArrowDown: [0, -stepKm] };
    if (moves[e.key]) { e.preventDefault(); setView((v) => clampView({ ...v, cx: v.cx + moves[e.key][0], cy: v.cy + moves[e.key][1] })); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); flyTo({ ...view, k: view.k * 1.6 }); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); flyTo(view.k / 1.6 <= 1 ? { cx: 0, cy: 0, k: 1 } : { ...view, k: view.k / 1.6 }); }
    else if (e.key === "0") { e.preventDefault(); flyTo({ cx: 0, cy: 0, k: 1 }); }
  };

  const rings = useMemo(() => [[2, "88° S"], [4, "86° S"], [6, "84° S"]] as const, []);
  const r84 = ringKm(6) * ppk;
  const small = size.w < 520;
  const shownZones = p.zones.filter((z) => z.rank <= (small ? 10 : 25) || z.id === p.selectedZone);
  const key = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

  return (
    <div className="map-view" ref={wrap} tabIndex={0} role="application" aria-label={p.label}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onPointerLeave={() => setTip(null)} onKeyDown={onKeyDown} onDoubleClick={(e) => { const at = local(e); zoomAt(2, at.x, at.y); }}>
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} aria-hidden="true" />
      <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden={false}>
        {rings.map(([deg, name]) => { const r = ringKm(deg) * ppk; return (
          <g key={deg} className={deg === 6 ? "ring edge" : "ring"}>
            <circle cx={sx(0)} cy={sy(0)} r={r} />
            <text x={sx(0) + r * Math.SQRT1_2 + 5} y={sy(0) + r * Math.SQRT1_2 + 12} className="map-label">{name}</text>
          </g>
        ); })}
        {/* Compass: the pole at the centre, the four meridians on the 84° circle, the arrow towards Earth. */}
        <g className="compass">
          <path d={`M${sx(0) - 7} ${sy(0)}H${sx(0) + 7}M${sx(0)} ${sy(0) - 7}V${sy(0) + 7}`} />
          <text x={sx(0)} y={sy(0) - 12} textAnchor="middle" className="map-label strong">South Pole</text>
          <path d={`M${sx(0)} ${sy(0) - r84 + 2}V${sy(0) - r84 - 26}M${sx(0) - 5} ${sy(0) - r84 - 18}L${sx(0)} ${sy(0) - r84 - 27}L${sx(0) + 5} ${sy(0) - r84 - 18}`} />
          <text x={sx(0) + 10} y={sy(0) - r84 - 14} className="map-label strong">Towards Earth (0° E)</text>
          <path d={`M${sx(0) + r84 - 6} ${sy(0)}h12M${sx(0) - r84 - 6} ${sy(0)}h12M${sx(0)} ${sy(0) + r84 - 6}v12`} />
          <text x={sx(0) + r84 + 10} y={sy(0) + 4} className="map-label">90° E</text>
          <text x={sx(0) - r84 - 10} y={sy(0) + 4} textAnchor="end" className="map-label">90° W</text>
          <text x={sx(0)} y={sy(0) + r84 + 20} textAnchor="middle" className="map-label">180°</text>
        </g>
        {p.features.filter((f) => f.major || view.k >= 1.7).map((f) => (
          <text key={f.name} x={sx(f.x)} y={sy(f.y) + (Math.hypot(f.x, f.y) * ppk < 24 ? 22 : 4)} textAnchor="middle" className={f.major ? "map-label place" : "map-label place minor"}>{f.name}</text>
        ))}
        {p.missions.map((m) => { const x = sx(m.x), y = sy(m.y); return (
          <g key={m.id} className={m.ok ? "mark mission ok" : "mark mission"}>
            <path d={`M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x - 5} ${y + 5}L${x + 5} ${y - 5}`} />
            <text x={x + 9} y={y + 4} className="map-label">{m.name}</text>
            <title>{`Past landing: ${m.name}`}</title>
          </g>
        ); })}
        {p.artemis.map((a) => { const x = sx(a.x), y = sy(a.y); return (
          <g key={a.id} className="mark artemis" data-mark role="button" tabIndex={0} aria-label={`Artemis candidate: ${a.name}`}
            onClick={() => p.onPick(a.x, a.y)} onKeyDown={key(() => p.onPick(a.x, a.y))}>
            <rect x={x - 4.5} y={y - 4.5} width={9} height={9} transform={`rotate(45 ${x} ${y})`} />
            {view.k >= 1.7 && <text x={x + 10} y={y + 4} className="map-label">{a.name}</text>}
            <title>{`Artemis candidate: ${a.name}`}</title>
          </g>
        ); })}
        {shownZones.map((z) => { const x = sx(z.x), y = sy(z.y), on = z.id === p.selectedZone; return (
          <g key={z.id} className={`mark zone ${z.rag}${on ? " on" : ""}`} data-mark role="button" tabIndex={0}
            aria-label={`Rank ${z.rank}: zone ${z.id}, score ${z.score}, ${z.rag}`} onClick={() => p.onZone(z.id)} onKeyDown={key(() => p.onZone(z.id))}>
            <circle cx={x} cy={y} r={on ? 11 : z.rank <= 10 ? 9 : 3.5} />
            {(z.rank <= 10 || on) && <text x={x} y={y + 3.5} textAnchor="middle">{z.rank}</text>}
            <title>{`Rank ${z.rank}: zone ${z.id}, score ${z.score}`}</title>
          </g>
        ); })}
        {p.pick && <g className="mark pick"><circle cx={sx(p.pick[0])} cy={sy(p.pick[1])} r={13} /><path d={`M${sx(p.pick[0]) - 20} ${sy(p.pick[1])}h-8M${sx(p.pick[0]) + 20} ${sy(p.pick[1])}h8M${sx(p.pick[0])} ${sy(p.pick[1]) - 20}v-8M${sx(p.pick[0])} ${sy(p.pick[1]) + 20}v8`} /></g>}
      </svg>
      {tip && <div className="map-tip" style={{ left: Math.min(size.w - 190, tip.x + 14), top: Math.max(4, tip.y - 34) }} role="presentation">{tip.text}</div>}
      <div className="map-zoom" role="group" aria-label="Zoom">
        <button onClick={() => flyTo({ ...view, k: view.k * 1.8 })} aria-label="Zoom in" disabled={view.k >= K_MAX}>+</button>
        <button onClick={() => flyTo(view.k / 1.8 <= 1.05 ? { cx: 0, cy: 0, k: 1 } : { ...view, k: view.k / 1.8 })} aria-label="Zoom out" disabled={view.k <= 1}>−</button>
        <button onClick={() => flyTo({ cx: 0, cy: 0, k: 1 })} aria-label="Show the whole region" disabled={view.k === 1 && view.cx === 0 && view.cy === 0} title="Show the whole region"><Home /></button>
      </div>
      <div className="map-scale" aria-hidden="true">
        {(() => { const km = [100, 50, 20, 10, 5, 2, 1].find((d) => d * ppk <= 120) ?? 1; return <><span style={{ width: km * ppk }} />{km} km</>; })()}
      </div>
    </div>
  );
}
