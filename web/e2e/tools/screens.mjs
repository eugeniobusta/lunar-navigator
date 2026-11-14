// usage (from web/): FORMAT=jpeg node e2e/tools/screens.mjs https://claudes-plan-lunar-navigator.vercel.app ../media/screenshots/final
// Every page of both views (s = Simple, d = Detailed) at the three sizes.  : every essential screen at 1920x1080, 1440x900 and 390x844
import { chromium } from "@playwright/test";
const [base, out, which] = process.argv.slice(2);
const sizes = { "1920": [1920, 1080], "1440": [1440, 900], "390": [390, 844] };
const finder = async (p) => { await p.waitForSelector(".map-view"); await p.waitForFunction(() => !document.querySelector(".map-loading") && document.querySelector(".map-legend li"), null, { timeout: 30000 }); };
const pages = [
  // The Simple view
  ["s01-home", "/?view=simple", null],
  ["s02-explore-a-site", "/?view=simple&site=mma01&date=2027-01-09&days=14&tab=explore", async (p) => { await p.waitForSelector("svg.sky"); }],
  ["s03-plan-a-landing", "/?view=simple&tab=plan", async (p) => { await finder(p); await p.waitForFunction(() => /days have a landing time that works/i.test(document.body.innerText), null, { timeout: 60000 }); }],
  ["s04-plan-unsafe-spot", "/?view=simple&tab=plan&spot=-88.0241,0", finder],
  ["s05-3d-moon", "/?view=simple&site=mma01&tab=moon3d", null],
  ["s06-data-and-method", "/?view=simple&tab=data", null],
  // The Detailed view
  ["d01-home", "/?view=detailed", null],
  ["d02-overview", "/?view=detailed&site=mma01&date=2027-01-09&days=14&tab=overview", async (p) => { await p.waitForSelector("svg.sky"); }],
  ["d03-site-finder", "/?view=detailed&tab=map", finder],
  ["d04-site-finder-sunlight-alone", "/?view=detailed&tab=map&pick=sunlight", finder],
  ["d05-site-finder-layers-open", "/?view=detailed&tab=map", async (p) => { await finder(p); const t = p.getByRole("button", { name: "What matters for your mission?" }); if (await t.count()) await t.click(); await p.getByRole("button", { name: /Show the parameters of Safe ground/ }).click(); await p.getByRole("button", { name: /Show the parameters of Ice and science/ }).click(); }],
  ["d06-site-finder-best-zone", "/?view=detailed&tab=map&spot=-84.01724,23.42232", finder],
  ["d07-site-finder-unsafe-spot", "/?view=detailed&tab=map&spot=-88.0241,0", finder],
  ["d08-site-finder-colour-blind", "/?view=detailed&tab=map&preset=radio", async (p) => { await finder(p); await p.getByLabel("Colour-blind palette").check(); }],
  ["d09-window-finder", "/?view=detailed&site=mma01&date=2026-11-14&days=14&tab=windows", async (p) => { await p.getByRole("grid").waitFor(); }],
  ["d10-compare-sites", "/?view=detailed&site=nr107&compare=mma01&date=2027-01-09T22:00Z&days=10&tab=compare", null],
  ["d11-battery", "/?view=detailed&site=mma01&date=2027-01-09&days=14&tab=power", null],
  ["d12-3d-moon", "/?view=detailed&site=mma01&tab=moon3d", null],
  ["d13-data-and-method", "/?view=detailed&tab=data", null],
  ["d14-how-it-works", "/?view=detailed&tab=method", null],
];

const browser = await chromium.launch();
for (const name of (which ? which.split(",") : Object.keys(sizes))) {
  const [width, height] = sizes[name];
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  for (const [id, path, act] of pages) {
    if (process.env.ONLY && !process.env.ONLY.split(",").some((o) => id.includes(o))) continue;
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    for (let t = 0; ; t++) { try { await page.goto(base + path, { waitUntil: "networkidle" }); break; } catch (e) { if (t >= 5) throw e; await page.waitForTimeout(2000); } }
    if (act) await act(page);
    await page.waitForTimeout(600);
    const jpg = process.env.FORMAT === "jpeg";
    await page.screenshot({ path: `${out}/${id}-${name}.${jpg ? "jpg" : "png"}`, ...(jpg ? { type: "jpeg", quality: 86 } : {}), fullPage: !/home|data-and-method|how-it-works/.test(id) });
    if (errors.length) console.log(id, name, "ERRORS", errors.slice(0, 2).join(" | "));
    await page.close();
  }
  await ctx.close();
  console.log("done", name);
}
await browser.close();
