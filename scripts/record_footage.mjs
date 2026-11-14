// Records the two demo videos from the production build, 1920 x 1080, no visible cursor:
//   media/vr-tour.webm  the guided tour of /xr/ on the laptop view, about 60 s
//   media/web-30s.webm  30 s: Malapert Overview, Window Finder, Where to land, the VR
//
// Usage (from the repository root):
//   make build && make xr && (cd web && npx vite preview --port 4179 --strictPort) &
//   node scripts/record_footage.mjs [http://localhost:4179] [tour|web]   (no second argument: both videos)
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

// ------------------------------------------------------------------------------------------------ the tour

const tour = ONLY === 'web' ? null : await clip(async (page, cut) => {
  await page.goto(`${BASE}/xr/`);
  await page.waitForSelector('button[data-a=tour]', { timeout: 60000 });
  await wait(page, 2);
  cut();
  await wait(page, 1.5);
  await page.click('button[data-a=tour]'); // stop 1: the south pole from orbit
  await drag(page, 1150, 330, -260, 40, 10);
  await page.click('button[data-a=next]'); // stop 2: the Goldilocks heat map
  await drag(page, 1150, 330, -220, -50, 10);
  await page.click('button[data-a=next]'); // stop 3: fly to the best zone
  await page.waitForSelector('button[data-a=stand]', { timeout: 60000 });
  await wait(page, 1);
  await drag(page, 1150, 300, 240, 30, 12);
  await page.click('button[data-a=next]'); // stop 4: stand there, two days pass
  await wait(page, 4);
  await drag(page, 1150, 300, 420, 0, 9);
  await wait(page, 3);
  await page.click('button[data-a=next]'); // back to orbit
  await wait(page, 2.5);
});

// ------------------------------------------------------------------------------------------------ the website

const web = ONLY === 'tour' ? null : await clip(async (page, cut) => {
  await page.goto(`${BASE}/?site=${SITE}&date=${DATE}&tab=overview`);
  await page.waitForSelector('nav.tabs');
  await page.waitForSelector('.hero svg');
  await wait(page, 1.5);
  cut();
  // Overview: move the time slider, so the Sun travels along the skyline, then show the numbers.
  const bar = await page.locator('.scrub input[type=range]').boundingBox();
  const y = bar.y + bar.height / 2;
  await wait(page, 0.8);
  await drag(page, bar.x + 8, y, bar.width * 0.45, 0, 3.2);
  await scrollTo(page, 'nav.tabs');
  await wait(page, 3.5);
  // Window Finder
  await page.click('nav.tabs button:has-text("Window Finder")');
  await wait(page, 1.2);
  await page.click('button:has-text("Find landing days")');
  await wait(page, 0.8);
  await scrollTo(page, 'nav.tabs');
  await wait(page, 5.5);
  // Where to land: the priorities, then the map and the ranking
  await page.click('nav.tabs button:has-text("Where to land")');
  await wait(page, 2.5);
  await page.click('button:has-text("Power first")');
  await wait(page, 1.5);
  await page.evaluate(() => window.scrollBy({ top: 620, behavior: 'smooth' }));
  await wait(page, 3.5);
});

const vr = ONLY === 'tour' ? null : await clip(async (page, cut) => {
  await page.goto(`${BASE}/xr/?site=${SITE}&t=${DATE}T00:00Z`);
  await page.waitForSelector('button[data-a=stand]', { timeout: 60000 });
  await wait(page, 1.5);
  cut();
  await drag(page, 1150, 300, 160, 20, 2.5);
  await page.click('button[data-a=stand]');
  await wait(page, 0.6);
  await page.click('button[data-s="10"]');
  await drag(page, 1150, 300, 260, 0, 4.4);
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

mkdirSync(join(ROOT, 'media'), { recursive: true });
if (tour) {
  write(join(ROOT, 'media', 'vr-tour.webm'), [tour]);
}
if (web && vr) {
  write(join(ROOT, 'media', 'web-30s.webm'), [web, vr]);
}
rmSync(tmp, { recursive: true, force: true });
