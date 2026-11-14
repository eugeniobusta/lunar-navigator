// usage (from web/): FORMAT=jpeg node e2e/tools/screens.mjs https://claudes-plan-lunar-navigator.vercel.app ../media/screenshots/final  : every essential screen at 1920x1080, 1440x900 and 390x844
import { chromium } from "@playwright/test";
const [base, out, which] = process.argv.slice(2);
const sizes = { "1920": [1920, 1080], "1440": [1440, 900], "390": [390, 844] };
const pages = [
  ["01-map", "/?tab=map", null],
  ["02-map-sunlight-alone", "/?tab=map&pick=sunlight", null],
  ["03-map-layers-open", "/?tab=map", async (p) => { await p.getByRole("button", { name: /Show the parameters of Safe ground/ }).click(); await p.getByRole("button", { name: /Show the parameters of Ice and science/ }).click(); }],
  ["04-map-best-zone", "/?tab=map&spot=-84.01724,23.42232", null],
  ["05-map-unsafe-spot", "/?tab=map&spot=-88.0241,0", null],
  ["06-map-best-zones", "/?tab=map", async (p) => { await p.getByRole("group", { name: "Side panel" }).getByRole("button", { name: "Best zones" }).click(); }],
  ["07-map-colour-blind", "/?tab=map&preset=radio", async (p) => { await p.getByLabel("Colour-blind palette").check(); }],
  ["08-site-sky", "/?site=mma01&date=2027-01-09&days=14&tab=overview", null],
  ["09-window-finder", "/?site=mma01&date=2026-11-14&days=14&tab=windows", async (p) => { await p.getByRole("button", { name: "Find landing days" }).click(); await p.getByRole("grid").waitFor(); }],
  ["10-compare", "/?site=nr107&compare=mma01&date=2027-01-09T22:00Z&days=10&tab=compare", null],
  ["11-battery", "/?site=mma01&date=2027-01-09&days=14&tab=power", null],
  ["12-data", "/?tab=data", null],
  ["13-method", "/?tab=method", null],
];
const browser = await chromium.launch();
for (const name of (which ? which.split(",") : Object.keys(sizes))) {
  const [width, height] = sizes[name];
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: name === "390" ? 2 : 1 });
  for (const [id, path, act] of pages) {
    if (process.env.ONLY && !process.env.ONLY.split(",").some((o) => id.includes(o))) continue;
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    for (let t = 0; ; t++) { try { await page.goto(base + path, { waitUntil: "networkidle" }); break; } catch (e) { if (t >= 5) throw e; await page.waitForTimeout(2000); } }
    if (path.includes("tab=map")) { await page.waitForSelector(".map-view"); await page.waitForFunction(() => !document.querySelector(".map-loading"), null, { timeout: 30000 }); }
    if (act) await act(page);
    await page.waitForTimeout(600);
    const jpg = process.env.FORMAT === "jpeg";
    await page.screenshot({ path: `${out}/${id}-${name}.${jpg ? "jpg" : "png"}`, ...(jpg ? { type: "jpeg", quality: 86 } : {}), fullPage: id !== "12-data" && (!path.includes("tab=map") || name === "390") });
    if (errors.length) console.log(id, name, "ERRORS", errors.slice(0, 2).join(" | "));
    await page.close();
  }
  await ctx.close();
  console.log("done", name);
}
await browser.close();
