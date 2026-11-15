// The laptop interface: plain DOM over the canvas, Earthrise palette. It draws the same stage panel as the
// headset's (journey.ts stageView; vrpanel.ts): a few large buttons, one caption line, a "?".
import type { StageButton, StageView } from './journey.js';

export const CREDITS =
  "Terrain: NASA LOLA. Moon globe: NASA SVS CGI Moon Kit (LROC colour, LOLA relief). Earth: NASA Blue Marble. Sun: NASA SDO. Illumination: NASA Goddard PGDA. Ephemeris: JPL DE421. Voice: AI-generated with ElevenLabs. Built by Claude's Plan with AI coding assistants; not an official NASA product.";

export interface Actions {
  /** A button of the stage panel, by its id (journey.ts). */
  press(id: string): void;
}

export interface HudModel {
  view: StageView;
  xrOffered: boolean;
  inXR: boolean;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Barlow+Semi+Condensed:wght@600&display=swap');
:root { --void:#000; --dust:#24201B; --rim:#3B352D; --bone:#EFE8DC; --ash:#A89F92; --sunlight:#F6B93B; --earth:#2F6FD6;
  --cloud:#DCE8FF; --eclipse:#E0457B; --go:#6FBF73; --ink:#191612; --font:"Barlow",system-ui,sans-serif; --head:"Barlow Semi Condensed","Barlow",system-ui,sans-serif; }
html, body { margin:0; height:100%; background:#000; overflow:hidden; }
#scene-container { position:fixed; inset:0; }
#hud { position:fixed; inset:0; pointer-events:none; font-family:var(--font); color:var(--bone); font-size:16px; line-height:1.35; font-variant-numeric:tabular-nums; }
#hud * { box-sizing:border-box; }
#hud .box { pointer-events:auto; background:var(--dust); border:1px solid var(--rim); border-radius:4px; }
#hud button { font:600 18px var(--font); color:var(--bone); background:transparent; border:1px solid var(--rim); border-radius:6px; padding:8px 14px; min-height:56px; cursor:pointer; text-align:center; }
#hud button:hover { border-color:var(--bone); }
#hud button:focus-visible { outline:2px solid var(--sunlight); outline-offset:2px; }
#hud button.on { border-color:var(--bone); }
#hud button.on:not(.toggle) .name { border-bottom:2px solid var(--bone); }
#hud button.go { background:var(--go); color:var(--ink); border-color:var(--go); font-size:20px; }
#hud button.go:hover { border-color:var(--bone); }
#hud h1 { font:600 18px var(--head); margin:0; letter-spacing:.02em; }
#top { position:absolute; top:12px; left:12px; right:12px; display:flex; gap:10px; align-items:center; }
#top .title { padding:8px 12px; }
#top .spacer { flex:1; }
#top .nav { display:flex; gap:6px; pointer-events:auto; }
#top .nav button { min-height:44px; background:var(--dust); }
#top .nav button.primary { background:var(--bone); color:var(--ink); border-color:var(--bone); }
#side { position:absolute; top:70px; left:12px; width:340px; max-height:calc(100% - 170px); overflow:auto; padding:16px 16px 16px 26px; }
#side h2 { font:600 24px var(--head); margin:0 0 12px; }
#side .rows { display:flex; flex-direction:column; gap:8px; }
#side .row { display:flex; gap:8px; }
#side .row button { flex:1 1 0; position:relative; }
#side button.two, #side button.toggle { text-align:left; }
#side button small { display:block; font:400 14px var(--font); color:var(--sunlight); margin-top:2px; }
#side button.toggle { display:flex; align-items:center; justify-content:space-between; gap:10px; }
#side .sw { flex:none; display:flex; align-items:center; gap:8px; font:600 14px var(--font); color:var(--ash); }
#side .sw i { width:44px; height:24px; border-radius:12px; background:var(--rim); position:relative; }
#side .sw i::after { content:''; position:absolute; top:4px; left:4px; width:16px; height:16px; border-radius:8px; background:var(--bone); }
#side .on .sw { color:var(--bone); }
#side .on .sw i { background:var(--go); }
#side .on .sw i::after { left:24px; }
/* The first-time hint: an arrow that nudges towards the next button to press. */
#side button.hint::before { content:''; position:absolute; left:-17px; top:50%; margin-top:-8px; border:8px solid transparent; border-left:12px solid var(--sunlight); border-right:0; animation:nudge 1s ease-in-out infinite; }
@keyframes nudge { 50% { transform:translateX(-6px); } }
@media (prefers-reduced-motion: reduce) { #side button.hint::before { animation:none; } }
#side .status { list-style:none; margin:14px 0 0; padding:0; font:600 18px var(--head); }
#side .status li { display:flex; align-items:center; gap:10px; padding:3px 0; }
#side .status .bad { color:var(--eclipse); }
#side .ic { flex:none; width:18px; height:18px; border-radius:9px; border:2px solid currentColor; }
#side .ic.sun { color:var(--sunlight); background:var(--sunlight); box-shadow:0 0 0 3px var(--dust), 0 0 0 5px var(--sunlight); width:12px; height:12px; margin:3px; }
#side .ic.earth { color:var(--cloud); background:var(--cloud); }
#side .ic.day { border-radius:3px; color:var(--ash); border-top-width:6px; }
#side .bad .ic { background:transparent; color:var(--eclipse); box-shadow:none; }
#side .legend { list-style:none; margin:12px 0 0; padding:0; font-size:14px; }
#side .legend li { display:flex; gap:8px; align-items:baseline; padding:2px 0; }
#side .swatch { flex:none; display:inline-block; width:12px; height:12px; border-radius:2px; }
#side .swatch.hatch { background-image:repeating-linear-gradient(135deg, transparent 0 2px, rgba(20,12,10,.75) 2px 4px); }
#side .note { color:var(--ash); font-size:13px; margin:10px 0 0; }
#side .help { margin:0 0 14px; padding:0; list-style:none; }
#side .help li { padding:5px 0; border-top:1px solid var(--rim); }
#side .help li:first-child { border-top:0; }
#caption { position:absolute; left:50%; bottom:46px; transform:translateX(-50%); max-width:min(820px, calc(100% - 24px)); padding:10px 18px; font:600 21px var(--head); text-align:center; }
#caption:empty { display:none; }
#credits { position:absolute; left:12px; right:12px; bottom:8px; text-align:center; color:var(--ash); font-size:12px; }
#credits span { background:var(--dust); border-radius:4px; padding:3px 8px; }
#hud.embed #top .title { display:none; }
@media (max-width: 720px) { #side { width:calc(100% - 24px); max-height:46%; } #caption { font-size:17px; bottom:60px; } }
`;

const esc = (s: string) => s.replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Hud {
  private root = document.createElement('div');
  private side!: HTMLElement;
  private nav!: HTMLElement;
  private caption!: HTMLElement;
  private lastSide = '';
  private lastNav = '';

  constructor(actions: Actions, embed: boolean) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.root.id = 'hud';
    if (embed) {
      this.root.classList.add('embed');
    }
    this.root.innerHTML = `
      <div id="top">
        <div class="box title"><h1>Lunar Landing Site Navigator</h1></div>
        <div class="spacer"></div>
        <div class="nav"></div>
      </div>
      <div id="side" class="box"></div>
      <div id="caption" class="box" role="status" aria-live="polite"></div>
      <div id="credits"><span>${esc(CREDITS)}</span></div>`;
    document.body.append(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    this.side = q('#side');
    this.nav = q('.nav');
    this.caption = q('#caption');
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.id) {
        actions.press(b.dataset.id);
        b.blur();
      }
    });
  }

  render(m: HudModel): void {
    this.root.style.display = m.inXR ? 'none' : '';
    const v = m.view;
    const nav =
      (v.stage === 'loading' ? '' : `<button data-id="help" aria-label="Help" class="${v.help ? 'on' : ''}">?</button>`) +
      (m.xrOffered ? '<button class="primary" data-id="vr">Enter VR</button>' : '');
    if (nav !== this.lastNav) {
      this.nav.innerHTML = this.lastNav = nav;
    }
    if (this.caption.textContent !== v.caption) {
      this.caption.textContent = v.caption;
    }
    const button = (b: StageButton) => {
      const cls = [b.go ? 'go' : '', b.on ? 'on' : '', b.toggle ? 'toggle' : '', b.note ? 'two' : '', b.hint ? 'hint' : ''].filter(Boolean).join(' ');
      const pressed = b.toggle ? ` role="switch" aria-checked="${b.on === true}"` : b.on ? ' aria-current="true"' : '';
      return `<button data-id="${esc(b.id)}" class="${cls}"${pressed}><span><span class="name">${esc(b.label)}</span>${b.note ? `<small>${esc(b.note)}</small>` : ''}</span>${
        b.toggle ? `<span class="sw">${b.on ? 'On' : 'Off'}<i></i></span>` : ''
      }</button>`;
    };
    let html = `<h2>${esc(v.title)}</h2>`;
    if (v.help) {
      html += `<ul class="help">${v.help.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    }
    html += `<div class="rows">${v.rows.map((row) => `<div class="row">${row.map(button).join('')}</div>`).join('')}</div>`;
    if (v.status.length) {
      html += `<ul class="status">${v.status.map((s) => `<li class="${s.ok ? '' : 'bad'}"><i class="ic ${s.icon}"></i>${esc(s.text)}</li>`).join('')}</ul>`;
    }
    if (v.legend.length) {
      // Never colour alone: the unsafe ground is hatched, here and on the map.
      html += `<ul class="legend">${v.legend
        .map((l) => `<li>${l.color ? `<i class="swatch${l.hatch ? ' hatch' : ''}" style="background-color:${l.color}"></i>` : ''}${esc(l.text)}</li>`)
        .join('')}</ul>`;
    }
    html += v.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('');
    if (html !== this.lastSide) {
      this.side.innerHTML = this.lastSide = html;
    }
  }
}
