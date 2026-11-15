// Records the demo videos from the production build, 1920 x 1080, no visible cursor:
//   media/clips/01-home.webm ... 07-compare-sites.webm  the website, one clip per page (01 to 03 the Simple view,
//                                                       04 to 07 the Detailed view)
//   media/clips/11-im2-athena.webm, 12-battery.webm, 13-how-we-checked.webm  three more website clips for the pitch
//                                                       videos (scripts/make_videos.py); mode "extra" records only these
//   media/clips/08-vr-moon.webm, 09-vr-pole.webm, 10-vr-surface.webm  the three stages of /xr/ on the laptop view
//   media/web-30s.webm  30 s: Malapert Overview, Window Finder, Site Finder (the Detailed view), the VR
//
// Usage (from the repository root):
//   make build && make xr && (cd web && npx vite preview --port 4179 --strictPort) &
//   node scripts/record_footage.mjs [http://localhost:4179] [vr|web|extra]   (no second argument: all of them)
// Needs ffmpeg on the PATH and the Playwright Chromium that web/ already uses (cd web && npx playwright install chromium).
// Every clip is recorded with its loading time and then cut to the part that matters.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(ROOT, 'web', 'package.json'))('playwright');
const BASE = process.argv[2] ?? 'http://localhost:4179';
const ONLY = process.argv[3] ?? null;
const SIZE = { width: 1920, height: 1080 };
const SITE = 'mma01';
const DATE = '2026-11-18'; // the Sun is up at Malapert (the website's own timeline shows it)
const tmp = mkdtempSync(join(tmpdir(), 'footage-'));

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });

/** Records one clip. `run(page, cut)` calls cut() when the part worth keeping starts; it ends when run returns. */
async function clip(run) {
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmp, size: SIZE } });
  const page = await context.newPage();
  const t0 = Date.now();
  let start = 0;
  await run(page, () => {
    start = (Date.now() - t0) / 1000;
  });
  const end = (Date.now() - t0) / 1000;
  await context.close();
  return { file: await page.video().path(), start, duration: end - start };
}

const wait = (page, s) => page.waitForTimeout(s * 1000);

/** A slow, even drag of the 3D view, `seconds` long. */
async function drag(page, x0, y0, dx, dy, seconds) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  const t0 = Date.now();
  for (let f = 0; f < 1; ) {
    await page.waitForTimeout(16);
    f = Math.min(1, (Date.now() - t0) / (seconds * 1000)); // by the clock, so the clip keeps its length
    await page.mouse.move(x0 + dx * f, y0 + dy * f);
  }
  await page.mouse.up();
}

/** Scrolls so that `selector` sits `offset` px under the top of the window. */
const scrollTo = (page, selector, offset = 16) =>
  page.evaluate(
    ([s, o]) => window.scrollTo({ top: document.querySelector(s).getBoundingClientRect().top + scrollY - o, behavior: 'smooth' }),
    [selector, offset],
  );

// ------------------------------------------------------------------------------------------------ the VR, stage by stage

const press = (page, id) => page.click(`button[data-id="${id}"]`);
const VR = ONLY === 'web' || ONLY === 'extra' ? [] : [
  // Stage 1, the whole Moon: Start sets the Sun, the Earth and the day-night line in motion.
  ['08-vr-moon.webm', await clip(async (page, cut) => {
    await page.goto(`${BASE}/xr/?t=${DATE}T12:00Z`);
    await page.waitForSelector('button[data-id=start]', { timeout: 60000 });
    await wait(page, 2.5);
    cut();
    await wait(page, 2.5);
    await press(page, 'start');
    await wait(page, 6);
    await drag(page, 1150, 420, -160, 30, 9);
    await wait(page, 3);
    await press(page, 'start');
    await wait(page, 1.5);
  })],
  // Stage 2, the south pole: the safe landing colours, then Malapert Massif, the flight and the landing.
  ['09-vr-pole.webm', await clip(async (page, cut) => {
    await page.goto(`${BASE}/xr/?t=${DATE}T12:00Z`);
    await page.waitForSelector('button[data-id=start]', { timeout: 60000 });
    await wait(page, 2.5);
    cut();
    await wait(page, 1);
    await press(page, 'pole');
    await wait(page, 4.5);
    await press(page, 'colours');
    await drag(page, 1150, 330, -180, -30, 5);
    await press(page, 'colours');
    await wait(page, 1.5);
    await press(page, `site:${SITE}`);
    await page.waitForSelector('button[data-id=play]', { timeout: 60000 });
    await wait(page, 1.5);
    await drag(page, 1150, 300, 200, 20, 5);
  })],
  // Stage 3, on the surface: Play, the Sun rises at Malapert (17 December 2026), then a move by clicking the ground.
  ['10-vr-surface.webm', await clip(async (page, cut) => {
    await page.goto(`${BASE}/xr/?site=${SITE}&t=2026-12-16T12:00Z`);
    await page.waitForSelector('button[data-id=play]', { timeout: 60000 });
    await wait(page, 2.5);
    cut();
    await wait(page, 1.5);
    await press(page, 'play');
    await wait(page, 10);
    await drag(page, 1150, 300, -240, 10, 6);
    await press(page, 'play');
    await wait(page, 1);
    await page.mouse.move(1000, 830, { steps: 20 });
    await wait(page, 1);
    await page.mouse.click(1000, 830);
    await wait(page, 2.5);
    await drag(page, 1150, 300, 260, 0, 5);
  })],
];

// ------------------------------------------------------------------------------------------------ the website

/** Opens a page of the website and waits for `ready` before the clip starts. */
const site = (path, ready, run) => clip(async (page, cut) => {
  await page.goto(BASE + path);
  await page.waitForSelector(ready, { timeout: 60000 });
  await wait(page, 1.5);
  cut();
  await run(page);
});
const mapReady = (page) => page.waitForFunction(() => !document.querySelector('.map-loading') && document.querySelector('.map-legend li'), null, { timeout: 60000 });
const smooth = (page, top) => page.evaluate((t) => window.scrollBy({ top: t, behavior: 'smooth' }), top);
const mapPoint = async (page, fx, fy) => { const b = await page.locator('.map-view').boundingBox(); return [b.x + b.width * fx, b.y + b.height * fy]; };

const WEB = ONLY === 'vr' || ONLY === 'extra' ? [] : [
  // The Simple view: the homepage, top to bottom of its first sections.
  ['01-home.webm', await site('/?view=simple', '.home-stats', async (page) => {
    await wait(page, 2.5);
    await smooth(page, 1000);
    await wait(page, 3);
    await smooth(page, 950);
    await wait(page, 3);
  })],
  // Explore a site: the time slider moves the Sun along the skyline, then what it means for a lander.
  ['02-explore-a-site.webm', await site(`/?view=simple&site=${SITE}&date=${DATE}&days=14&tab=explore`, 'svg.sky', async (page) => {
    await scrollTo(page, 'svg.sky', 110);
    await wait(page, 1.2);
    const bar = await page.locator('.scrub input[type=range]').boundingBox();
    await drag(page, bar.x + 8, bar.y + bar.height / 2, bar.width * 0.5, 0, 4.5);
    await scrollTo(page, '.vitals', 220);
    await wait(page, 3.5);
  })],
  // Plan a landing: another mission, a click on a spot near the pole, back to the best zone, then the landing days.
  ['03-plan-a-landing.webm', await site('/?view=simple&tab=plan', '.map-view canvas', async (page) => {
    await mapReady(page);
    await scrollTo(page, '.presets.big', 110);
    await wait(page, 2);
    await page.click('.presets.big button:has-text("Radio link")');
    await wait(page, 2);
    await page.mouse.click(...(await mapPoint(page, 0.5, 0.42)));
    await wait(page, 2.5);
    await page.click('.answer button.link');
    await wait(page, 2);
    await scrollTo(page, '.window-head', 110);
    await wait(page, 3.5);
  })],
  // Overview: the sky, the slider, the verdict and the numbers.
  ['04-overview.webm', await site(`/?view=detailed&site=${SITE}&date=${DATE}&tab=overview`, '.hero svg', async (page) => {
    const bar = await page.locator('.scrub input[type=range]').boundingBox();
    await wait(page, 0.8);
    await drag(page, bar.x + 8, bar.y + bar.height / 2, bar.width * 0.45, 0, 4);
    await scrollTo(page, '.verdict', 96);
    await wait(page, 4);
  })],
  // Site Finder: a preset, a group opened and one parameter alone, a zone chosen, a closer look, the ranking.
  ['05-site-finder.webm', await site('/?view=detailed&tab=map', '.map-view canvas', async (page) => {
    await mapReady(page);
    await scrollTo(page, '.finder', 96);
    await wait(page, 2);
    await page.click('#finder-side button:has-text("Power first")');
    await wait(page, 2);
    await page.click('#finder-side button:has-text("Everything")');
    await wait(page, 1.2);
    await page.click('.answer button.link'); // the best zone: the map flies to it and the choices fold away
    await wait(page, 3);
    await page.mouse.move(...(await mapPoint(page, 0.5, 0.5)));
    await page.mouse.wheel(0, -350);
    await wait(page, 2);
    await page.click('button[aria-label="Show the whole region"]');
    await wait(page, 1.5);
    await scrollTo(page, '.glance', 96);
    await wait(page, 3.5);
  })],
  // Window Finder: the answer, then the calendar.
  ['06-window-finder.webm', await site(`/?view=detailed&site=${SITE}&date=2026-11-14&days=14&tab=windows`, '.window-head', async (page) => {
    await scrollTo(page, '.mission-cards', 96);
    await wait(page, 2.5);
    await scrollTo(page, '.window-head', 96);
    await wait(page, 4);
    await page.click('.mission-card:has-text("Crewed surface stay")');
    await wait(page, 3.5);
  })],
  // Compare sites: the launch slip, then both judged as landing sites.
  ['07-compare-sites.webm', await site('/?view=detailed&site=nr107&compare=mma01&date=2027-01-09T22:00Z&days=10&tab=compare', '.duel', async (page) => {
    await scrollTo(page, '.panel .controls', 96);
    await wait(page, 1.5);
    const slip = await page.locator('.panel .controls input[type=range]').boundingBox();
    // The slider runs from -30 to +60 days; drag from "on time" to +14 days.
    await drag(page, slip.x + slip.width * (30 / 90), slip.y + slip.height / 2, slip.width * (14 / 90), 0, 4);
    await wait(page, 2);
    await scrollTo(page, '.compare.criteria', 140);
    await wait(page, 4);
  })],
];

// Three more pages for the pitch videos: the IM-2 landing spot, the battery, and how the numbers were checked.
const EXTRA = ONLY === 'vr' || ONLY === 'web' ? [] : [
  // IM-2 Athena's landing spot in Site Finder: it passes every limit on the 120 m map (the lander fell in a small crater).
  ['11-im2-athena.webm', await site('/?view=detailed&tab=map&spot=-84.7906,29.1957', '.map-view canvas', async (page) => {
    await mapReady(page);
    await scrollTo(page, '.finder', 96);
    await wait(page, 1.5);
    const [x, y] = await page.locator('.mark.pick circle').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(x, y);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -160); await wait(page, 0.45); }
    await page.mouse.move(40, 600);
    await wait(page, 5);
  })],
  // Battery: the default lander runs out in the night at Malapert; a bigger battery survives.
  ['12-battery.webm', await site(`/?view=detailed&site=${SITE}&date=2027-01-09&days=14&tab=power`, '.soc', async (page) => {
    await scrollTo(page, '.mission-bar', 96);
    await wait(page, 4);
    const battery = page.getByLabel('Battery (Wh)');
    await battery.fill('33000');
    await wait(page, 5);
  })],
  // How it works: the method, then our numbers against JPL's and NASA's.
  ['13-how-we-checked.webm', await site('/?view=detailed&tab=method', 'main table', async (page) => {
    await wait(page, 1.5);
    await scrollTo(page, 'main table', 120);
    await wait(page, 4);
    await smooth(page, 520);
    await wait(page, 4.5);
  })],
];

const web = ONLY === 'vr' || ONLY === 'extra' ? null : await clip(async (page, cut) => {
  // The Detailed view (one page per tool); the menu bar is Chinh's, with the pages in #pages.
  await page.goto(`${BASE}/?view=detailed&site=${SITE}&date=${DATE}&tab=overview`);
  await page.waitForSelector('#pages');
  await page.waitForSelector('.hero svg');
  await wait(page, 1.5);
  cut();
  // Overview: move the time slider, so the Sun travels along the skyline, then show the numbers.
  const bar = await page.locator('.scrub input[type=range]').boundingBox();
  const y = bar.y + bar.height / 2;
  await wait(page, 0.8);
  await drag(page, bar.x + 8, y, bar.width * 0.45, 0, 3.2);
  await scrollTo(page, '.verdict', 96);
  await wait(page, 3.5);
  // Window Finder: the search runs by itself; show the answer and the calendar
  await page.click('#pages button:has-text("Window Finder")');
  await page.waitForSelector('.window-head');
  await wait(page, 1.2);
  await scrollTo(page, '.window-head', 96);
  await wait(page, 5.5);
  // Site Finder: the traffic-light map, a preset, then the region at a glance and the ranking
  await page.click('#pages button:has-text("Site Finder")');
  await page.waitForSelector('.map-view canvas');
  await wait(page, 2.5);
  await page.click('#finder-side button:has-text("Power first")');
  await wait(page, 1.5);
  await page.evaluate(() => window.scrollBy({ top: 620, behavior: 'smooth' }));
  await wait(page, 3.5);
});

const vr = ONLY === 'vr' || ONLY === 'extra' ? null : await clip(async (page, cut) => {
  await page.goto(`${BASE}/xr/?site=${SITE}&t=${DATE}T00:00Z`);
  await page.waitForSelector('button[data-id=play]', { timeout: 60000 });
  await wait(page, 1.5);
  cut();
  await drag(page, 1150, 300, 160, 20, 2.5);
  await press(page, 'play');
  await press(page, 'faster');
  await drag(page, 1150, 300, 260, 0, 5);
});

await browser.close();

// ------------------------------------------------------------------------------------------------ cut and join

function write(out, clips) {
  const args = ['-y', '-loglevel', 'error'];
  for (const c of clips) {
    args.push('-ss', c.start.toFixed(2), '-t', c.duration.toFixed(2), '-i', c.file);
  }
  const join_ = clips.map((_, i) => `[${i}:v]`).join('') + `concat=n=${clips.length}:v=1:a=0,fps=30[v]`;
  args.push('-filter_complex', join_, '-map', '[v]', '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '1500k', '-an', out);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  console.log(out, clips.map((c) => `${c.duration.toFixed(1)} s`).join(' + '));
}

mkdirSync(join(ROOT, 'media', 'clips'), { recursive: true });
for (const [name, c] of [...WEB, ...VR, ...EXTRA]) {
  write(join(ROOT, 'media', 'clips', name), [c]);
}
if (web && vr) {
  write(join(ROOT, 'media', 'web-30s.webm'), [web, vr]);
}
rmSync(tmp, { recursive: true, force: true });
