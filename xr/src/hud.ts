// The laptop interface: plain DOM over the canvas, Earthrise palette. In VR the same actions are on the
// floating panel (vrpanel.ts).
import type { Why } from './guide.js';
import { OVERLAYS, type OverlayId } from './terrain.js';

export const CREDITS =
  "Terrain: NASA LOLA. Illumination: NASA Goddard PGDA. Ephemeris: JPL DE421. Built by Claude's Plan with AI coding assistants; not an official NASA product.";

export interface SpotView {
  title: string;
  elevationM: number;
  slopeDeg: number | null;
  nasaSunPct: number | null;
  nasaEarthPct: number | null;
  scorePct: number | null;
  failed: string[];
  ourSunPct: number;
  ourEarthPct: number;
  longestDarkH: number;
  latLon: string;
}

export interface StatusView {
  sunUp: boolean;
  sunMargin: number;
  earthUp: boolean;
  earthMargin: number;
}

export interface HudModel {
  mode: 'loading' | 'orbit' | 'flight' | 'land' | 'stand';
  message: string | null;
  siteName: string | null;
  sites: { id: string; name: string; group: string }[];
  /** The best zones under the priorities in use; `id` is the published rank, `detail` false = ~430 m terrain only. */
  zones: { id: number; rank: number; name: string; score: number; areaKm2: number; detail: boolean }[];
  presets: { key: string; label: string }[];
  preset: string;
  why: Why | null;
  tour: { stop: number; of: number; caption: string; why: Why | null } | null;
  /** Frame rate line, or null when "Stats" is off. */
  stats: string | null;
  overlay: OverlayId;
  overlays: OverlayId[];
  spot: SpotView | null;
  status: StatusView | null;
  enlarge: boolean;
  enlargeFactor: number;
  info: string | null;
  windowLabel: string;
  missionsLoaded: boolean;
  zonesLoaded: boolean;
  xrOffered: boolean;
  raised: boolean;
  inXR: boolean;
}

export interface Actions {
  pickSite(id: string): void;
  pickZone(id: number): void;
  setPreset(key: string): void;
  tourStart(): void;
  tourNext(): void;
  tourEnd(): void;
  toggleStats(): void;
  setOverlay(o: OverlayId): void;
  goOrbit(): void;
  goLand(): void;
  goStand(): void;
  toggleRaised(): void;
  toggleEnlarge(): void;
  setTime(h: number): void;
  togglePlay(): void;
  setSpeed(s: number): void;
  enterVR(): void;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Barlow+Semi+Condensed:wght@600&display=swap');
:root { --void:#000; --dust:#24201B; --rim:#3B352D; --bone:#EFE8DC; --ash:#A89F92; --sunlight:#F6B93B; --earth:#2F6FD6;
  --cloud:#DCE8FF; --eclipse:#E0457B; --lichen:#8FC28A; --font:"Barlow",system-ui,sans-serif; --head:"Barlow Semi Condensed","Barlow",system-ui,sans-serif; }
html, body { margin:0; height:100%; background:#000; overflow:hidden; }
#scene-container { position:fixed; inset:0; }
#hud { position:fixed; inset:0; pointer-events:none; font-family:var(--font); color:var(--bone); font-size:15px; line-height:1.35; }
#hud * { box-sizing:border-box; }
#hud .box { pointer-events:auto; background:var(--dust); border:1px solid var(--rim); border-radius:4px; }
#hud button { font:inherit; color:var(--bone); background:transparent; border:1px solid var(--rim); border-radius:4px; padding:6px 10px; cursor:pointer; }
#hud button:hover { border-color:var(--ash); }
#hud button:focus-visible, #hud input:focus-visible { outline:2px solid var(--sunlight); outline-offset:2px; }
#hud button.on { background:var(--bone); color:var(--dust); border-color:var(--bone); }
#hud button.primary { background:var(--sunlight); color:#191612; border-color:var(--sunlight); font-weight:600; }
#hud h1 { font:600 18px var(--head); margin:0; letter-spacing:.02em; }
#hud h2 { font:600 13px var(--head); margin:14px 0 6px; color:var(--ash); text-transform:uppercase; letter-spacing:.08em; }
#hud h2:first-child { margin-top:0; }
#top { position:absolute; top:12px; left:12px; right:12px; display:flex; gap:10px; align-items:center; }
#top .title { padding:8px 12px; display:flex; gap:12px; align-items:baseline; }
#top .crumbs { color:var(--ash); }
#top .crumbs b { color:var(--bone); font-weight:600; }
#top .spacer { flex:1; }
#top .nav { display:flex; gap:6px; pointer-events:auto; }
#side { position:absolute; top:64px; left:12px; width:316px; max-height:calc(100% - 190px); overflow:auto; padding:14px; }
#side .list { display:flex; flex-direction:column; gap:4px; }
#side .list button { text-align:left; display:flex; justify-content:space-between; gap:8px; }
#side .list small { color:var(--ash); }
#side .row { display:flex; flex-wrap:wrap; gap:6px; }
#side table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
#side td, #side th { padding:4px 0; text-align:right; border-top:1px solid var(--rim); }
#side td:first-child, #side th:first-child { text-align:left; color:var(--ash); font-weight:400; }
#side th { font:600 12px var(--head); color:var(--ash); text-transform:uppercase; letter-spacing:.06em; border-top:0; }
#side .big { font:600 17px var(--head); }
#side .steep { color:var(--eclipse); font-weight:600; }
#side .okc { color:var(--lichen); }
#side .note { color:var(--ash); font-size:13px; margin-top:8px; }
#side .why { margin:0; padding:0; list-style:none; font-size:13px; color:var(--ash); }
#side .why li { padding:5px 0; border-top:1px solid var(--rim); }
#side .why b { display:block; font-size:14px; font-weight:600; }
#hud .good { color:var(--lichen); } #hud .acceptable { color:var(--sunlight); } #hud .rejected { color:var(--eclipse); }
#tour { position:absolute; left:50%; bottom:150px; transform:translateX(-50%); width:min(760px, calc(100% - 24px)); padding:14px 16px; }
#tour .cap { font-size:19px; line-height:1.35; margin:6px 0 10px; }
#tour .step { font:600 13px var(--head); color:var(--ash); text-transform:uppercase; letter-spacing:.08em; }
#tour ul { margin:0 0 10px; padding:0; list-style:none; columns:2; font-size:14px; font-weight:600; }
#tour .row { display:flex; gap:8px; }
#tour:empty { display:none; }
#stats { padding:8px 12px; font-variant-numeric:tabular-nums; color:var(--ash); }
#stats:empty { display:none; }
#side .legend { display:flex; align-items:center; gap:8px; margin-top:8px; color:var(--ash); font-size:13px; }
#side .ramp { flex:1; height:8px; border-radius:2px; }
#status { position:absolute; top:64px; left:50%; transform:translateX(-50%); display:flex; gap:8px; }
#status .chip { padding:7px 12px; font:600 15px var(--head); font-variant-numeric:tabular-nums; }
#status .sun { color:var(--sunlight); } #status .earth { color:var(--cloud); border-color:var(--earth); } #status .bad { color:var(--eclipse); }
#time { position:absolute; left:50%; bottom:44px; transform:translateX(-50%); width:min(760px, calc(100% - 24px)); padding:10px 14px; }
#time .line { display:flex; gap:8px; align-items:center; }
#time .date { font:600 16px var(--head); font-variant-numeric:tabular-nums; min-width:200px; }
#time .win { color:var(--ash); font-size:13px; margin-left:auto; }
#time input[type=range] { width:100%; accent-color:var(--sunlight); margin:8px 0 2px; }
#credits { position:absolute; left:12px; right:12px; bottom:8px; text-align:center; color:var(--ash); font-size:12px; }
#credits span { background:var(--dust); border-radius:4px; padding:3px 8px; }
#info { position:absolute; right:12px; top:64px; width:290px; padding:12px 14px; }
#info:empty, #status:empty { display:none; }
#msg { position:absolute; left:50%; top:45%; transform:translate(-50%,-50%); padding:14px 18px; font:600 16px var(--head); }
#hud.embed #top .title { display:none; }
@media (max-width: 720px) { #tour { bottom:138px; } #tour ul { columns:1; } }
@media (max-width: 720px) { #side { width:calc(100% - 24px); max-height:38%; } #info { display:none; } #status { top:auto; bottom:150px; } }
`;

const esc = (s: string) => s.replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (v: number | null) => (v == null ? 'no data' : `${Math.round(v)} %`);
const signed = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}&deg;`;

export function statusText(s: StatusView): { sun: string; earth: string } {
  const m = (v: number) => `${Math.abs(v).toFixed(1)} deg ${v >= 0 ? 'above' : 'below'} the skyline`;
  return {
    sun: `${s.sunUp ? 'Sun up' : 'Dark'}: ${m(s.sunMargin)}`,
    earth: `${s.earthUp ? 'Earth in view' : 'No link'}: ${m(s.earthMargin)}`,
  };
}

export class Hud {
  private root = document.createElement('div');
  private side!: HTMLElement;
  private crumbs!: HTMLElement;
  private nav!: HTMLElement;
  private status!: HTMLElement;
  private info!: HTMLElement;
  private msg!: HTMLElement;
  private date!: HTMLElement;
  private win!: HTMLElement;
  private range!: HTMLInputElement;
  private play!: HTMLButtonElement;
  private speeds: HTMLButtonElement[] = [];
  private timeBox!: HTMLElement;
  private lastSide = '';
  private lastNav = '';
  private lastStatus = '';
  private tour!: HTMLElement;
  private stats!: HTMLElement;
  private lastTour = '';

  constructor(private actions: Actions, embed: boolean) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.root.id = 'hud';
    if (embed) {
      this.root.classList.add('embed');
    }
    this.root.innerHTML = `
      <div id="top">
        <div class="box title"><h1>Lunar Landing Site Navigator</h1><span class="crumbs"></span></div>
        <div class="spacer"></div>
        <div id="stats" class="box"></div>
        <div class="nav"></div>
      </div>
      <div id="side" class="box"></div>
      <div id="status"></div>
      <div id="info" class="box"></div>
      <div id="msg" class="box"></div>
      <div id="tour" class="box"></div>
      <div id="time" class="box">
        <div class="line"><span class="date"></span>
          <button data-a="play" aria-label="Play or pause time">Play</button>
          <button data-s="1">1x</button><button data-s="10">10x</button><button data-s="100">100x</button>
          <span class="win"></span></div>
        <input type="range" min="0" max="720" step="0.25" value="0" aria-label="Time within the 30-day window">
      </div>
      <div id="credits"><span>${esc(CREDITS)}</span></div>`;
    document.body.append(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    this.side = q('#side');
    this.crumbs = q('.crumbs');
    this.nav = q('.nav');
    this.status = q('#status');
    this.info = q('#info');
    this.msg = q('#msg');
    this.date = q('.date');
    this.win = q('.win');
    this.range = q('input[type=range]');
    this.play = q('[data-a=play]');
    this.timeBox = q('#time');
    this.tour = q('#tour');
    this.stats = q('#stats');
    this.speeds = [...this.root.querySelectorAll<HTMLButtonElement>('[data-s]')];
    this.range.addEventListener('input', () => actions.setTime(Number(this.range.value)));
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) {
        return;
      }
      const d = b.dataset;
      if (d.site) actions.pickSite(d.site);
      else if (d.zone) actions.pickZone(Number(d.zone));
      else if (d.preset) actions.setPreset(d.preset);
      else if (d.a === 'tour') actions.tourStart();
      else if (d.a === 'next') actions.tourNext();
      else if (d.a === 'endtour') actions.tourEnd();
      else if (d.a === 'stats') actions.toggleStats();
      else if (d.ov) actions.setOverlay(d.ov as OverlayId);
      else if (d.s) actions.setSpeed(Number(d.s));
      else if (d.a === 'play') actions.togglePlay();
      else if (d.a === 'orbit') actions.goOrbit();
      else if (d.a === 'land') actions.goLand();
      else if (d.a === 'stand') actions.goStand();
      else if (d.a === 'raised') actions.toggleRaised();
      else if (d.a === 'enlarge') actions.toggleEnlarge();
      else if (d.a === 'vr') actions.enterVR();
      b.blur();
    });
  }

  /** Structure that changes rarely (mode, site, spot, overlay). */
  render(m: HudModel): void {
    this.root.style.display = m.inXR ? 'none' : '';
    const crumb = m.mode === 'orbit' || m.mode === 'loading' ? '<b>Orbit</b>' : `Orbit &rsaquo; ${m.mode === 'flight' ? 'Flying to ' : ''}<b>${esc(m.siteName ?? '')}</b>${m.mode === 'stand' ? ' &rsaquo; <b>Standing on the surface</b>' : ''}`;
    this.crumbs.innerHTML = crumb;
    const nav =
      (m.mode === 'land' || m.mode === 'stand' ? '<button class="box" data-a="orbit">Back to orbit</button>' : '') +
      (m.mode === 'stand' ? '<button class="box" data-a="land">Back to the map</button>' : '') +
      `<button class="box${m.stats == null ? '' : ' on'}" data-a="stats">Stats</button>` +
      (m.xrOffered ? '<button class="box primary" data-a="vr">Enter VR</button>' : '');
    if (nav !== this.lastNav) {
      this.nav.innerHTML = this.lastNav = nav;
    }
    this.msg.style.display = m.message ? '' : 'none';
    this.msg.textContent = m.message ?? '';
    this.timeBox.style.display = m.mode === 'loading' ? 'none' : '';
    this.win.textContent = m.windowLabel;
    this.info.innerHTML = m.info ?? '';

    const whyList = (w: Why) =>
      `<ul class="why">${w.lines.map((l) => `<li><b class="${l.verdict}">${esc(l.head)}</b>${esc(l.detail)}</li>`).join('')}</ul>`;
    let tour = '';
    if (m.tour) {
      const t = m.tour;
      tour = `<div class="step">Tour, stop ${t.stop} of ${t.of}</div><div class="cap">${esc(t.caption)}</div>${
        t.why ? `<ul>${t.why.lines.map((l) => `<li class="${l.verdict}">${esc(l.head)}</li>`).join('')}</ul>` : ''
      }<div class="row"><button class="primary" data-a="next">${t.stop === t.of ? 'Finish' : 'Next'}</button><button data-a="endtour">End tour</button></div>`;
    }
    if (tour !== this.lastTour) {
      this.tour.innerHTML = this.lastTour = tour;
    }
    this.stats.textContent = m.stats ?? '';
    const presetButtons = () =>
      m.presets.length > 1
        ? `<h2>Your priorities</h2><div class="row">${m.presets
            .map((p) => `<button data-preset="${p.key}" class="${p.key === m.preset ? 'on' : ''}">${esc(p.label)}</button>`)
            .join('')}</div>`
        : '';
    let html = '';
    const overlayButtons = () =>
      `<h2>Heat map</h2><div class="row">${m.overlays
        .map((o) => `<button data-ov="${o}" class="${o === m.overlay ? 'on' : ''}">${o === 'off' ? 'Off' : OVERLAYS[o].label}</button>`)
        .join('')}</div>${this.legend(m.overlay)}`;
    if (m.mode === 'orbit' || m.mode === 'flight') {
      html += `<div class="row"><button class="primary" data-a="tour">Tour: 4 stops</button></div><h2>Choose a landing site</h2><div class="list">${m.sites
        .map((s) => `<button data-site="${s.id}"><span>${esc(s.name)}</span><small>${s.group === 'artemis' ? 'Artemis' : 'IM-2, 2025'}</small></button>`)
        .join('')}</div>`;
      html += overlayButtons() + presetButtons();
      if (m.zones.length) {
        html += `<h2>Top ${m.zones.length} zones for these priorities</h2><div class="list">${m.zones
          .map((z) => `<button data-zone="${z.id}"><span>#${z.rank} ${esc(z.name)}</span><small>score ${z.score}, ${z.areaKm2.toFixed(1)} km2${z.detail ? '' : ', 430 m terrain'}</small></button>`)
          .join('')}</div>`;
      }
      html += `<p class="note">Relief: NASA LOLA, 440 km across, lit by the Sun's real direction at the chosen time. Drag to turn, scroll to zoom, click a marker.</p>`;
    } else if (m.mode === 'land' || m.mode === 'stand') {
      html += overlayButtons() + presetButtons();
      if (m.spot) {
        const s = m.spot;
        const steep = s.slopeDeg != null && s.slopeDeg > 10;
        html += `<h2>${esc(s.title)}</h2>
          <table>
            <tr><td>Position</td><td>${esc(s.latLon)}</td></tr>
            <tr><td>Elevation</td><td>${Math.round(s.elevationM).toLocaleString('en-US')} m</td></tr>
            <tr><td>Slope</td><td class="${steep ? 'steep' : 'okc'}">${s.slopeDeg == null ? 'no data' : `${s.slopeDeg}&deg;`}${steep ? ' too steep to land' : ''}</td></tr>
            ${s.scorePct == null ? '' : `<tr><td>Goldilocks map score</td><td class="${s.failed.length ? 'steep' : 'okc'}">${Math.round(s.scorePct)}${s.failed.length ? `, fails: ${esc(s.failed.join(', '))}` : ', passes every limit'}</td></tr>`}
          </table>
          <table style="margin-top:10px">
            <tr><th></th><th>NASA map</th><th>Our model</th></tr>
            <tr><td>Sunlit</td><td class="big">${pct(s.nasaSunPct)}</td><td class="big">${pct(s.ourSunPct)}</td></tr>
            <tr><td>Earth in view</td><td class="big">${pct(s.nasaEarthPct)}</td><td class="big">${pct(s.ourEarthPct)}</td></tr>
            <tr><td>Longest darkness</td><td>-</td><td class="big">${Math.round(s.longestDarkH)} h</td></tr>
          </table>
          <p class="note">NASA map: average over 18.6 years (PGDA). Our model: this 30-day window, seen from 2 m above this exact point.</p>`;
      }
      html += '<h2>View</h2><div class="row">';
      html += m.mode === 'land' ? '<button class="primary" data-a="stand">Stand here</button>' : '';
      html += `<button data-a="enlarge" class="${m.enlarge ? 'on' : ''}">Enlarge Sun and Earth ${m.enlargeFactor}x for visibility</button></div>`;
      html += `<p class="note">${m.mode === 'land' ? 'Click the ground to choose the exact landing point. Drag to turn, scroll to zoom.' : 'You are 2 m above the surface at true scale. Drag to look around, scroll to zoom. Sun and Earth are at their real size (0.53 and about 1.9 deg) unless enlarged.'}</p>`;
    }
    if ((m.mode === 'land' || m.mode === 'stand') && m.why) {
      html += `<h2>Why here? ${esc(m.why.title)}</h2><p class="note" style="margin:0 0 6px">${esc(m.why.summary)}</p>${whyList(m.why)}`;
    }
    if (html !== this.lastSide) {
      this.side.innerHTML = this.lastSide = html;
    }
    this.side.style.display = html ? '' : 'none';
  }

  private legend(o: OverlayId): string {
    if (o === 'off') {
      return '';
    }
    const d = OVERLAYS[o];
    const c = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    return `<div class="legend"><span>0</span><span class="ramp" style="background:linear-gradient(90deg, ${c(d.a)}, ${c(d.b)})"></span><span>${d.max}${d.unit === '%' ? ' %' : d.unit ? ` ${d.unit}` : ''}${o === 'slope' ? '+' : ''}</span></div>`;
  }

  /** Values that change every frame while time runs. */
  tick(dateLabel: string, tH: number, playing: boolean, speed: number, status: StatusView | null): void {
    if (this.date.textContent !== dateLabel) {
      this.date.textContent = dateLabel;
    }
    if (document.activeElement !== this.range || playing) {
      this.range.value = String(tH);
    }
    const label = playing ? 'Pause' : 'Play';
    if (this.play.textContent !== label) {
      this.play.textContent = label;
      this.play.classList.toggle('on', playing);
    }
    for (const b of this.speeds) {
      b.classList.toggle('on', Number(b.dataset.s) === speed);
    }
    let html = '';
    if (status) {
      html =
        `<div class="box chip ${status.sunUp ? 'sun' : 'bad'}">${status.sunUp ? 'Sun up' : 'Dark'} ${signed(status.sunMargin)}</div>` +
        `<div class="box chip ${status.earthUp ? 'earth' : 'bad'}">${status.earthUp ? 'Earth in view' : 'No link'} ${signed(status.earthMargin)}</div>`;
    }
    if (this.lastStatus !== html) {
      this.status.innerHTML = this.lastStatus = html;
    }
  }
}
