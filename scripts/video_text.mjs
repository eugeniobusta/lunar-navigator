// Renders the text overlays of the videos as transparent 1920 x 1080 PNGs (subtitles, section labels, the QR card),
// with the site's own typeface. ffmpeg then lays them over the footage (scripts/make_videos.py).
// Usage: node scripts/video_text.mjs <spec.json> <outDir>
//   spec: [{ id, kind: "caption" | "label" | "corner" | "qr", text, sub?, image? }]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(ROOT, 'web', 'package.json'))('playwright');
const [specPath, out] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const html = (item) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Barlow+Semi+Condensed:wght@600&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; color: #EFE8DC; font-family: "Barlow", "Helvetica Neue", Arial, sans-serif; }
  .caption { position: absolute; left: 0; right: 0; bottom: 64px; display: flex; justify-content: center; }
  .caption span { max-width: 1500px; padding: 16px 30px; background: rgba(0, 0, 0, 0.78); border-radius: 6px; font-size: 44px; font-weight: 600; line-height: 1.25; text-align: center; }
  .label { position: absolute; left: 48px; bottom: 44px; padding: 10px 20px; background: rgba(0, 0, 0, 0.72); border-radius: 4px;
    font-family: "Barlow Semi Condensed", "Barlow", sans-serif; font-size: 30px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .corner { position: absolute; right: 28px; bottom: 12px; padding: 5px 14px; background: rgba(0, 0, 0, 0.82); border: 1px solid rgba(239, 232, 220, 0.5); border-radius: 4px; font-size: 25px; font-weight: 600; letter-spacing: 0.02em; }
  .qr { position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end; padding-right: 150px; background: rgba(0, 0, 0, 0.55); }
  .qr .card { display: flex; flex-direction: column; align-items: center; gap: 26px; padding: 44px 48px; background: rgba(0, 0, 0, 0.86); border: 1px solid #34302A; border-radius: 8px; }
  .qr img { width: 430px; height: 430px; display: block; border-radius: 4px; }
  .qr b { font-family: "Barlow Semi Condensed", sans-serif; font-size: 46px; letter-spacing: 0.04em; text-transform: uppercase; }
  .qr small { font-size: 30px; color: #A89F92; }
</style></head><body>
${item.kind === 'caption' ? `<div class="caption"><span>${esc(item.text)}</span></div>` : ''}
${item.kind === 'corner' ? `<div class="corner">${esc(item.text)}</div>` : ''}
${item.kind === 'label' ? `<div class="label">${esc(item.text)}</div>` : ''}
${item.kind === 'qr' ? `<div class="qr"><div class="card"><b>${esc(item.text)}</b><img src="data:image/png;base64,${readFileSync(item.image).toString('base64')}"><small>${esc(item.sub)}</small></div></div>` : ''}
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const item of spec) {
  await page.setContent(html(item), { waitUntil: 'load' });
  // The web font, if the network gives it; otherwise the fallback fonts above.
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `${item.id}.png`), omitBackground: true });
}
await browser.close();
console.log(`${spec.length} overlays in ${out}`);
