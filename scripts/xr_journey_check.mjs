// Presses every button of the VR's three stages on the laptop view and checks what each one does, the moments it
// fires, the link parameters (?site=, ?t=, ?lat=&lon=) and that the console stays free of errors (docs/XR.md).
// Then the voice, the sound effects and the movable menu, through the hooks the page offers for a run without a
// headset (window.lunarTest, window.lunarVoice): the narrator's files, the Voice switch, dragging the handle.
// The voice files are AAC, which Playwright's own Chromium cannot decode: this uses Google Chrome if installed.
//
// Usage (from the repository root):
//   make build && make xr && (cd web && npx vite preview --port 4179 --strictPort) &
//   node scripts/xr_journey_check.mjs [http://localhost:4179]
// Needs the Playwright Chromium that web/ already uses (cd web && npx playwright install chromium).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(ROOT, 'web', 'package.json'))('playwright');
const BASE = process.argv[2] ?? 'http://localhost:4179';
const SITES = [
  ['mma01', 'Malapert Massif'],
  ['mmo01', 'Mons Mouton'],
  ['hw02', 'Haworth'],
  ['nr107', 'Nobile Rim 1'],
  ['dgr203', 'de Gerlache Rim 2'],
  ['im2', "IM-2 Athena's landing spot"],
];

const launch = { headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] };
const browser = await chromium.launch({ ...launch, channel: 'chrome' }).catch(() => chromium.launch(launch));
const errors = [];
let passed = 0;
const failed = [];
const check = (what, ok, got = '') => {
  if (ok) {
    passed++;
  } else {
    failed.push(`${what}${got === '' ? '' : `: got ${JSON.stringify(got)}`}`);
  }
};

async function open(query) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  page.on('pageerror', (e) => errors.push(`${query}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${query}: ${m.text()}`));
  await page.goto(`${BASE}/xr/${query}`);
  await page.waitForSelector('#side .rows button', { timeout: 60000 });
  return page;
}
const stats = (page) => page.evaluate(() => window.lunarStats());
const moments = (page) => page.evaluate(() => window.lunarMoments().map((m) => m.id));
// The panel is drawn again on the next frame after a press.
const press = async (page, id) => {
  await page.click(`button[data-id="${id}"]`);
  await page.waitForTimeout(120);
};
const ids = (page) => page.$$eval('#side .rows button', (bs) => bs.map((b) => b.dataset.id));
const side = (page) => page.locator('#side').innerText();
const caption = (page) => page.locator('#caption').innerText();
const stage = async (page, name, timeout = 30000) => {
  await page.waitForFunction((n) => window.lunarStats().stage === n, name, { timeout });
  await page.waitForTimeout(700); // the fade back in
};

// ---------------------------------------------------------------- stage 1: the whole Moon
let page = await open('?t=2026-11-18T12:00:00Z');
check('stage 1 opens', (await stats(page)).stage === 'moon');
check('stage 1 buttons', (await ids(page)).join() === 'moon,pole,start', await ids(page));
check('hint on Start', (await page.$$eval('#side button.hint', (b) => b.map((x) => x.dataset.id))).join() === 'start');
check('label: not to scale', (await side(page)).includes('sizes and distances not to scale'));
await press(page, 'moon');
check('"Whole Moon" does nothing there', (await stats(page)).stage === 'moon' && (await moments(page)).join() === 'moon-intro');
await press(page, 'start');
await page.waitForTimeout(2000);
let s = await stats(page);
check('Start runs time, about 24 h per second', s.playing && s.tH > 30 && s.tH < 70, s.tH);
check('Start becomes Pause', (await side(page)).includes('Pause'));
check('hint moves to South Pole', (await page.$$eval('#side button.hint', (b) => b.map((x) => x.dataset.id))).join() === 'pole');
await press(page, 'start');
check('Pause fires its moment', (await moments(page)).includes('pause-motion'));
const t0 = (await stats(page)).tH;
await page.waitForTimeout(600);
check('Pause stops time', (await stats(page)).tH === t0);
await press(page, 'help');
check('help: one screen with Close', (await ids(page)).join() === 'close,stats' && (await side(page)).includes('Start: a month passes in 30 seconds'));
await press(page, 'stats');
await page.waitForTimeout(2500);
check('frame rate line', /\d+ fps, [\d.]+ ms per frame, longest [\d.]+ ms/.test(await side(page)), await side(page));
await press(page, 'stats');
await press(page, 'close');
check('help closes', (await ids(page)).join() === 'moon,pole,start');

// ---------------------------------------------------------------- stage 2: the south pole
await press(page, 'pole');
await page.waitForFunction(() => window.lunarStats().zoom === 1, null, { timeout: 15000 });
check('stage 2 buttons', (await ids(page)).join() === ['moon', 'colours', ...SITES.map(([id]) => `site:${id}`)].join(), await ids(page));
check('recommended note', (await side(page)).includes('Recommended: Earth always in the sky, the Sun skims a giant ridge'));
check('six markers on the ground', (await stats(page)).markers.length === 6, (await stats(page)).markers.length);
await press(page, 'colours');
const legend = await side(page);
check('colours: the legend in the website\'s words', ['Green, good: score 70 to 100', 'Amber, acceptable: score 40 to 69', 'Red, poor: score under 40', 'Hatched: unsafe, fails a NASA limit', 'Grey: no data'].every((l) => legend.includes(l)), legend);
await press(page, 'colours');
check('colours off: no legend', !(await side(page)).includes('Hatched'));
await press(page, 'moon');
await page.waitForFunction(() => window.lunarStats().zoom === 0, null, { timeout: 15000 });
check('Back to whole Moon', (await stats(page)).stage === 'moon');
await press(page, 'pole');
await page.waitForFunction(() => window.lunarStats().zoom === 1, null, { timeout: 15000 });
// A marker on the ground does what its button does.
const marker = (await stats(page)).markers.find((m) => m.id === 'hw02');
await page.mouse.click(marker.x, marker.y);
await page.waitForTimeout(400);
check('marker click: caption on the way', (await caption(page)) === 'Flying to Haworth, 86.8 S', await caption(page));
await stage(page, 'surface');
check('marker click lands at Haworth', (await side(page)).startsWith('Haworth') && page.url().includes('site=hw02'));
await press(page, 'pole');
await stage(page, 'pole');
for (const [id, label] of SITES) {
  await press(page, `site:${id}`);
  await stage(page, 'surface');
  const text = await side(page);
  check(`${label}: lands`, text.startsWith(label) && page.url().includes(`site=${id}`), text.slice(0, 40));
  check(`${label}: status lines`, /Sun: (up|below the hills)/.test(text) && /Earth: (in view|hidden)/.test(text) && /day \d+ of 30/.test(text));
  check(`${label}: detail label`, text.includes('Surface detail illustrative; terrain shape from NASA LOLA'));
  if (id !== 'im2') {
    await press(page, 'pole');
    await stage(page, 'pole');
  }
}

// ---------------------------------------------------------------- stage 3: on the surface
check('stage 3 buttons', (await ids(page)).join() === 'play,faster,pole', await ids(page));
await press(page, 'play');
const a = (await stats(page)).tH;
await page.waitForTimeout(3000);
const b = (await stats(page)).tH;
check('Play: about a day in 10 s', (b - a) / 3 > 2 && (b - a) / 3 < 2.8, (b - a) / 3);
await press(page, 'faster');
await page.waitForTimeout(3000);
const c = (await stats(page)).tH;
check('Faster: four times that', (c - b) / 3 > 8 && (c - b) / 3 < 11, (c - b) / 3);
await press(page, 'faster');
await press(page, 'play');
check('Play becomes Pause and back', (await side(page)).includes('Play'));
const before = (await stats(page)).spot;
await page.mouse.move(900, 820);
await page.waitForTimeout(300);
await page.mouse.click(900, 820);
await page.waitForTimeout(1500);
const after = (await stats(page)).spot;
check('click the ground: moved', Math.abs(after.lat - before.lat) + Math.abs(after.lon - before.lon) > 1e-6 && (await moments(page)).includes('teleport'));
check('caption says how far', /^Moved \d+ m\.$/.test(await caption(page)), await caption(page));
check('link carries the point', page.url().includes(`lat=${after.lat.toFixed(5)}`));
await page.mouse.move(800, 400);
await page.mouse.down();
await page.mouse.move(600, 420, { steps: 5 });
await page.mouse.up();
check('drag looks, does not move', (await stats(page)).spot.lat === after.lat);
await page.keyboard.press('Escape');
await stage(page, 'pole');
check('Escape goes back to the pole', (await stats(page)).stage === 'pole');
const seen = await moments(page);
for (const m of ['moon-intro', 'start-motion', 'pause-motion', 'fly-to-pole', 'pole-arrived', 'colours-on', 'colours-off', 'back-to-moon', 'flight', 'landed', 'play', 'pause', 'teleport', 'back-to-pole']) {
  check(`moment ${m}`, seen.includes(m));
}
await page.close();

// ---------------------------------------------------------------- links
page = await open('?site=dgr203&t=2027-01-05T00:00:00Z');
await stage(page, 'surface');
check('?site= and ?t=', (await side(page)).startsWith('de Gerlache Rim 2') && (await side(page)).includes('2027-01-05, day 1 of 30'), (await side(page)).slice(0, 120));
await page.close();
page = await open('?site=mmo01&t=2026-11-20T00:00:00Z&lat=-85.40000&lon=31.90000');
await stage(page, 'surface');
s = await stats(page);
check('?site= with ?lat=&lon= (the website\'s link)', Math.abs(s.spot.lat + 85.4) < 0.002 && Math.abs(s.spot.lon - 31.9) < 0.02, s.spot);
await page.close();
page = await open('?lat=-88.50000&lon=140.00000');
await stage(page, 'surface');
s = await stats(page);
check('?lat=&lon= away from every site', Math.abs(s.spot.lat + 88.5) < 0.01 && (await side(page)).includes('interpolated from the 430 m south-pole map'), s.spot);
await page.close();
page = await open('?embed=1');
check('?embed=1 hides the title', !(await page.locator('#top .title').isVisible()));
await page.close();

// ---------------------------------------------------------------- voice, sound effects, movable menu
page = await open('?t=2026-11-18T12:00:00Z');
const voice = () => page.evaluate(() => window.lunarVoice());
const ray = (kind, o, d) => page.evaluate(([k, a, b]) => window.lunarTest.ray(k, a, b), [kind, o, d]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const len = (a) => Math.hypot(...a);
const at = (panel, id) => panel.targets.find((t) => t.id === id).at;
// A ray from the head to a point; `turn` swings it about the vertical, radians.
const aim = (panel, target, turn = 0) => {
  const [x, y, z] = sub(target, panel.head);
  return [panel.head, [x * Math.cos(turn) + z * Math.sin(turn), y, z * Math.cos(turn) - x * Math.sin(turn)]];
};
const files = await page.evaluate(async () => {
  const base = new URL('voice/', location.href);
  const list = (await (await fetch(new URL('lines.json', base))).json()).lines;
  return Promise.all(list.map(async (l) => {
    const r = await fetch(new URL(l.file, base));
    return { id: l.id, text: l.text, ok: r.ok, bytes: (await r.arrayBuffer()).byteLength };
  }));
});
check('six voice files exist', files.length === 6 && files.every((f) => f.ok && f.bytes > 5000 && f.bytes < 40000), files.map((f) => [f.id, f.ok, f.bytes]));
await press(page, 'moon');
check('no sound before entering VR', !(await voice()).active && (await voice()).effects === 0 && (await voice()).spoken.length === 0, await voice());
await page.evaluate(() => window.lunarTest.audio());
await page.waitForFunction(() => window.lunarVoice().loaded === 6, null, { timeout: 15000 }).catch(() => undefined);
check('six voice files load (decode)', (await voice()).loaded === 6, (await voice()).loaded);
await page.waitForFunction(() => window.lunarVoice().speaking === 'moon', null, { timeout: 5000 }).catch(() => undefined);
check('the stage line plays on entering', (await voice()).spoken[0] === 'moon', (await voice()).spoken);
check('its text is the caption while it plays', (await caption(page)) === files[0].text, await caption(page));
await page.waitForFunction(() => window.lunarVoice().spoken.includes('handle') && window.lunarVoice().speaking == null, null, { timeout: 12000 }).catch(() => undefined);
check('then the handle line, once; then the caption returns', (await voice()).spoken.join() === 'moon,handle' && (await caption(page)) === 'The Moon, seen from below its south pole. Press Start.', [(await voice()).spoken, await caption(page)]);
let fx = (await voice()).effects;
await press(page, 'start');
await press(page, 'start');
check('a click on every button press', (await voice()).effects === fx + 2, (await voice()).effects - fx);

// The Voice switch, pressed on the VR panel with a ray: off silences the voice and the effects.
let panel = await ray('look');
const home = panel.at;
check('the VR panel has the speaker button and the handle', panel.targets.some((t) => t.id === 'voice') && panel.targets.some((t) => t.id === 'handle'), panel.targets.map((t) => t.id));
await ray('down', ...aim(panel, at(panel, 'voice')));
panel = await ray('up', ...aim(panel, at(panel, 'voice'), 0.3));
check('Voice off', (await voice()).on === false);
check('clicking a button does not move the panel', len(sub(panel.at, home)) === 0 && !panel.dragging, panel.at);
fx = (await voice()).effects;
await press(page, 'pole');
await page.waitForFunction(() => window.lunarStats().zoom === 1, null, { timeout: 15000 });
await page.waitForTimeout(500);
check('off: no effects, no voice', (await voice()).effects === fx && (await voice()).spoken.join() === 'moon,handle' && (await voice()).speaking == null, await voice());
panel = await ray('look');
await ray('down', ...aim(panel, at(panel, 'voice')));
await ray('up', ...aim(panel, at(panel, 'voice')));
check('Voice on again', (await voice()).on === true);
fx = (await voice()).effects;
await press(page, 'moon');
await page.waitForFunction(() => window.lunarVoice().speaking === 'moon', null, { timeout: 5000 }).catch(() => undefined);
check('on: the click and the whoosh sound, the stage line plays again', (await voice()).effects === fx + 2 && (await voice()).spoken.join() === 'moon,handle,moon', await voice());
await page.waitForFunction(() => window.lunarStats().zoom === 0, null, { timeout: 15000 });

// The handle: held with the trigger, the panel follows the ray at the same distance; released, it stays.
panel = await ray('look');
let grip = at(panel, 'handle');
const held = len(sub(grip, panel.head));
panel = await ray('down', ...aim(panel, grip));
check('trigger on the handle takes hold, nothing moves yet', panel.dragging && len(sub(panel.at, home)) === 0);
panel = await ray('move', ...aim(panel, grip, -0.5));
check('dragging the handle moves the panel', len(sub(panel.at, home)) > 0.3, len(sub(panel.at, home)));
check('at the same distance from the hand', Math.abs(len(sub(at(panel, 'handle'), panel.head)) - held) < 0.01, [len(sub(at(panel, 'handle'), panel.head)), held]);
const dropped = panel.at;
panel = await ray('up', ...aim(panel, grip, -0.5));
panel = await ray('move', ...aim(panel, grip, 0.4));
check('released: it stays where it was put', !panel.dragging && len(sub(panel.at, dropped)) === 0, panel.at);
// A button still clicks after the move, and a press that slides off the button does not drag.
const helpAt = at(panel, 'help');
await ray('down', ...aim(panel, helpAt));
panel = await ray('move', ...aim(panel, helpAt, 0.4));
panel = await ray('up', ...aim(panel, helpAt, 0.4));
await page.waitForTimeout(120); // the laptop panel is drawn again on the next frame
check('buttons still click, and do not drag', (await ids(page)).join() === 'close,stats' && len(sub(panel.at, dropped)) === 0, await ids(page));
await press(page, 'close');
// The grip button holds it too; taken from far away, it is held at 3 m at most.
panel = await ray('look');
grip = at(panel, 'handle');
const far = grip.map((v, i) => v + (panel.head[i] - v) * (6 / len(sub(panel.head, grip))));
const dir = sub(grip, far);
await ray('grip', far, dir);
panel = await ray('move', far, [dir[0] * Math.cos(0.1) + dir[2] * Math.sin(0.1), dir[1], dir[2] * Math.cos(0.1) - dir[0] * Math.sin(0.1)]);
check('grip drags; distance clamped to 3 m', panel.dragging && Math.abs(len(sub(at(panel, 'handle'), far)) - 3) < 0.01, len(sub(at(panel, 'handle'), far)));
panel = await ray('up', far, dir);
check('grip released', !panel.dragging);
await page.close();

check('no console errors', errors.length === 0, errors.slice(0, 3));
console.log(`${passed} checks passed, ${failed.length} failed`);
for (const f of failed) {
  console.log(`FAILED ${f}`);
}
await browser.close();
process.exit(failed.length ? 1 : 0);
