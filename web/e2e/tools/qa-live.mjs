// usage (from web/): node e2e/tools/qa-live.mjs https://claudes-plan-lunar-navigator.vercel.app public/data /tmp/qa.json
// End-to-end QA of the map-first site (docs/REFINEMENT_BRIEF.md sections 7 and 8). Every figure the page shows for a
// spot, a zone or a site is recomputed here from the published files with this script's own arithmetic.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const [base, dataDir, outJson] = process.argv.slice(2);
const bytes = (p) => new Uint8Array(readFileSync(`${dataDir}/${p}`));
const text = (p) => readFileSync(`${dataDir}/${p}`, "utf8");
const csv = (p) => { const [h, ...rows] = text(p).trim().split("\n").map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'))); return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""]))); };
const KEYS = ["sunlight", "earth", "landing_slope", "shadow", "walkable", "temperature", "ice", "hollow"];
const layers = KEYS.map((k) => bytes(`suitability/layers/south_pole_${k}.u8`)), limits = bytes("suitability/south_pole_limits.u8");
const weightsFile = JSON.parse(text("suitability/weights.json"));
const zones = csv("suitability/zones.csv"), zl = csv("suitability/zones_layers.csv"), siteValues = csv("suitability/site_values.csv");
const LIMIT_NAMES = [[1, "landing slope under 10°"], [2, "walkable ground within 2 km"], [4, "sunlight for the whole stay"], [8, "Earth in view"], [16, "within 6° of the pole"]];
const R = 1737400, N = 1024, HALF = 220000;
const xy = (lat, lon) => { const rho = 2 * R * Math.tan(((90 + lat) * Math.PI) / 360), l = (lon * Math.PI) / 180; return [rho * Math.sin(l), rho * Math.cos(l)]; };
const cellOf = (lat, lon) => { const [x, y] = xy(lat, lon), px = (2 * HALF) / N; return Math.floor((HALF - y) / px) * N + Math.floor((x + HALF) / px); };
const mapScore = (q, w) => { const den = 255 * KEYS.reduce((a, k) => a + w[k], 0); if (!den) return null; const num = KEYS.reduce((a, k, i) => a + w[k] * q[i], 0); return Math.floor((200 * num + den) / (2 * den)); };
const sub = (v, rej, ideal) => Math.min(1, Math.max(0, (v - rej) / (ideal - rej)));
const even = (x) => { const f = Math.floor(x); return x - f !== 0.5 ? Math.round(x) : f % 2 === 0 ? f : f + 1; };
const zoneScore = (m, dark, noEarth, w) => { const w6 = KEYS.reduce((a, k) => a + w[k], 0), t = w6 + w.darkness + w.no_earth; return even((w6 / t) * m + ((100 * w.darkness) / t) * sub(dark, 354, 85) + ((100 * w.no_earth) / t) * sub(noEarth, 336, 0)); };
const cls = (s) => (s >= 70 ? "Good" : s >= 40 ? "Acceptable" : "Poor");
const preset = (k) => weightsFile.presets.find((p) => p.key === k).weights;
const rankFor = (w) => zones.map((z, i) => { const m = mapScore(KEYS.map((k) => +zl[i][k]), w); return { id: +z.rank, ok: z.stay_window_ok === "True", area: +z.area_km2, score: zoneScore(m, +z.longest_dark_h, +z.longest_no_earth_h, w) }; })
  .sort((a, b) => b.ok - a.ok || b.score - a.score || b.area - a.area || a.id - b.id);

const report = { base, when: new Date().toISOString(), checks: [], problems: [] };
const ok = (name, pass, detail = "") => { report.checks.push({ name, pass: !!pass, detail }); if (!pass) report.problems.push(`${name}: ${detail}`); };
const browser = await chromium.launch();
// This network drops connections now and then: every navigation is retried.
const go = async (page, url, opts) => { for (let t = 0; ; t++) { try { return await page.goto(url, opts); } catch (e) { if (t >= 5) throw e; await new Promise((r) => setTimeout(r, 2000)); } } };

for (const [label, width, height] of [["1440x900", 1440, 900], ["390x844", 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.location().url.includes("/xr/")) errors.push(m.text()); });
  const open = async (path) => { await go(page, base + path, { waitUntil: "domcontentloaded" }); await page.waitForSelector(".map-view canvas", { timeout: 40000 }); await page.waitForFunction(() => !document.querySelector(".map-loading") && document.querySelector(".map-legend li"), null, { timeout: 60000 }); await page.waitForTimeout(250); };

  // 1. Launch: fresh load, time until the map layers are painted.
  const t0 = Date.now();
  await open("/");
  const loadMs = Date.now() - t0;
  ok(`${label} launch: map is home and loads`, (await page.getByRole("tab", { name: "Map", exact: true }).getAttribute("aria-selected")) === "true", `${loadMs} ms to painted layers`);
  report[`load_ms_${label}`] = loadMs;
  // 2. Correct region and geography.
  const mapText = await page.locator(".map-view").innerText();
  const need = ["South Pole", "Towards Earth (0° E)", "84° S", "86° S", "88° S", "Shackleton", "Haworth", "Shoemaker", "Faustini", "de Gerlache", "Cabeus", "Malapert", "Nobile", "Amundsen"];
  ok(`${label} region: rings, compass and nine crater names`, need.every((n) => mapText.includes(n)), need.filter((n) => !mapText.includes(n)).join(", "));
  // 3. The heat map is drawn: the canvas holds green, amber and red pixels inside the circle.
  const colours = await page.evaluate(() => { const c = document.querySelector(".map-view canvas"), g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height).data; let green = 0, amber = 0, red = 0; for (let i = 0; i < d.length; i += 16) { const r = d[i], gg = d[i + 1], b = d[i + 2]; if (gg > r + 25 && gg > b + 25) green++; else if (r > 170 && gg > 120 && b < 110) amber++; else if (r > gg + 40 && r > b + 30) red++; } return { green, amber, red }; });
  ok(`${label} heat map drawn in three classes`, colours.green > 20 && colours.amber > 200 && colours.red > 200, JSON.stringify(colours));
  // 4. Map-to-data correspondence: an Artemis marker, clicked, gives that site's coordinates.
  const sites = JSON.parse(text("sites.json")).sites;
  const mm = sites.find((s) => s.id === "mma01");
  await page.getByRole("button", { name: "Artemis candidate: Malapert Massif" }).click();
  const head = await page.locator(".spot h2").innerText();
  const m = head.match(/([\d.]+)° S, ([\d.]+)° ([EW])/);
  const lat = -m[1], lon = m[3] === "W" ? -m[2] : +m[2];
  ok(`${label} marker to data: Malapert Massif`, Math.abs(lat - mm.lat) < 0.002 && Math.abs(lon - mm.lon) < 0.01, `${head} vs ${mm.lat}, ${mm.lon}`);
  // A raw click 40 px right of the pole cross lands where the projection says (lon 90 E, the right distance).
  await page.getByRole("button", { name: "Show the whole region" }).click({ force: true }).catch(() => {});
  const scale = await page.locator(".map-scale").evaluate((el) => ({ km: parseFloat(el.innerText), px: el.querySelector("span").getBoundingClientRect().width }));
  const box = await page.locator(".map-view").boundingBox();
  await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2);
  const h2 = (await page.locator(".spot h2").innerText()).match(/([\d.]+)° S, ([\d.]+)° ([EW])/);
  const kmRight = 40 * (scale.km / scale.px), expectLat = -90 + (2 * Math.atan((kmRight * 1000) / (2 * R)) * 180) / Math.PI;
  ok(`${label} click to data: 40 px right of the pole`, Math.abs(-h2[1] - expectLat) < 0.03 && Math.abs(+h2[2] - 90) < 3 && h2[3] === "E", `${h2[0]} vs ${expectLat.toFixed(3)}, 90 E`);

  if (label === "1440x900") {
    // 5. Spots: displayed score, class, failed limits and each measurement against the files.
    const zoneCell = new Map(); zones.forEach((z, i) => { const c = cellOf(+z.lat, +z.lon); if (!zoneCell.has(c)) zoneCell.set(c, i); });
    const spots = [...[0, 1, 2, 9, 49, 499].map((i) => [+zones[i].lat, +zones[i].lon]), [-84.0173, 23.4217], [-88.0241, 0], [-85.9425, -0.9437], [-89.45, -137], [-86.2, 40], [-84.6, -60], [-87.3, 120], [-85.1, 170], [-88.9, 60], [-84.3, 5], [-86.9, -100], [-85.5, 85]];
    let spotBad = 0; const spotNotes = [];
    for (const [la, lo] of spots) {
      await open(`/?tab=map&spot=${la},${lo}`);
      const c = cellOf(la, lo), q = KEYS.map((_, k) => layers[k][c]), bits = limits[c];
      const isZone = zoneCell.has(c);
      const verdict = (await page.locator(".verdict-line").innerText()).replace(/\s+/g, " ");
      const shown = +(verdict.match(/score (\d+)/) ?? [])[1];
      const w = preset("everything");
      const zi = isZone ? zoneCell.get(c) : -1;
      const want = isZone ? zoneScore(mapScore(KEYS.map((k) => +zl[zi][k]), w), +zones[zi].longest_dark_h, +zones[zi].longest_no_earth_h, w) : mapScore(q, w);
      const failed = LIMIT_NAMES.filter(([b]) => bits & b).map(([, n]) => n);
      const wantWord = failed.length ? "Unsafe" : cls(want);
      let good = shown === want && verdict.startsWith(wantWord);
      if (isZone) { const subline = await page.locator(".spot .sub").first().innerText(); const rk = rankFor(w).findIndex((z) => z.id === zi + 1) + 1; if (!subline.includes(`Zone ${zi + 1}: rank ${rk.toLocaleString("en-GB")} of`)) { good = false; spotNotes.push(`${la},${lo}: "${subline.slice(0, 60)}" expected zone ${zi + 1} rank ${rk}`); } }
      if (failed.length) { const f = await page.locator(".fails").innerText(); good &&= failed.every((n) => f.includes(n)); }
      // measurements: number shown against the byte's value
      const rows = await page.locator(".measure tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.innerText.trim())));
      if (!isZone) {
        const B = weightsFile.layers;
        rows.forEach((r, i) => { const b = B[i], v = b.reject + (q[i] / 255) * (b.ideal - b.reject), num = parseFloat(r[1].replace(/[^\d.\-]/g, " ").trim()); if (q[i] > 0 && q[i] < 255 && !(bits & [4, 8, 1, 0, 2, 0, 0, 0][i]) && !(Math.abs(num - v) <= Math.max(0.06, Math.abs(v) * 0.006))) { good = false; spotNotes.push(`${la},${lo} ${b.key}: shows ${r[1]}, file ${v.toFixed(2)}`); } });
      } else {
        const z = zones[zi]; const pairs = [[0, +z.sun_pct], [1, +z.earth_pct], [2, +z.landing_slope_deg], [4, +z.eva_walkable_pct]];
        for (const [i, v] of pairs) { const num = parseFloat(rows[i][1]); if (Math.abs(num - v) > 0.51) { good = false; spotNotes.push(`${la},${lo} zone row ${i}: shows ${rows[i][1]}, file ${v}`); } }
      }
      if (!good) { spotBad++; spotNotes.push(`${la},${lo}: shows "${verdict}", expected ${wantWord} ${want}, failed ${failed.join("; ")}`); }
    }
    ok(`spots: score, class, failed limits and measurements match the files (${spots.length} spots)`, spotBad === 0, spotNotes.join(" | "));

    // 6. Every layer alone: legend in real units from weights.json bounds; the picture changes.
    const expectLegend = { sunlight: "70 % of the time or more", earth: "70 % of the time or more", landing_slope: "5° or less", shadow: "2 km or less", walkable: "95% or more", temperature: "150 K or more", ice: "ice stable at the surface (0 m)", hollow: "level with or above its surroundings" };
    const sums = new Set(); let layerBad = [];
    for (const k of KEYS) {
      await open(`/?tab=map&pick=${k}`);
      const lg = await page.locator(".map-legend").innerText();
      const info = weightsFile.layers.find((l) => l.key === k);
      if (!lg.includes(`${info.label} alone`) || !lg.includes(`Green, good: ${expectLegend[k]}`)) layerBad.push(`${k}: ${lg.split("\n").slice(0, 3).join(" / ")}`);
      sums.add(await page.evaluate(() => { const c = document.querySelector(".map-view canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 40) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) % 1000000007; return s; }));
    }
    ok("every layer alone: named, legend in real units", layerBad.length === 0, layerBad.join(" | "));
    ok("every layer alone draws a different map", sums.size === KEYS.length, `${sums.size} distinct pictures of ${KEYS.length}`);
    for (const k of ["darkness", "no_earth"]) { await open(`/?tab=map&pick=${k}`); const lg = await page.locator(".map-legend").innerText(); ok(`zone-only parameter ${k}: says it has no map`, lg.includes("NASA safety limits only")); }

    // 7. Opacity changes the picture, not the answer.
    await open("/");
    const answer = async () => (await page.locator(".landing-head").innerText()).match(/zone \d+, score \d+ \(\w+\)/)[0];
    const pix = () => page.evaluate(() => { const c = document.querySelector(".map-view canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 40) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) % 1000000007; return s; });
    const a0 = await answer(), p0 = await pix();
    await page.getByRole("slider", { name: "Combined score opacity" }).fill("20");
    await page.getByRole("slider", { name: "NASA safety limits opacity" }).fill("0");
    await page.waitForTimeout(300);
    ok("opacity changes the picture", (await pix()) !== p0);
    ok("opacity does not change the answer", (await answer()) === a0, `${a0} -> ${await answer()}`);

    // 8. Rankings: the ten best under each preset against an independent ranking of zones.csv.
    let rankBad = [];
    for (const p of weightsFile.presets) {
      await open(`/?tab=map&preset=${p.key}`);
      await page.getByRole("group", { name: "Side panel" }).getByRole("button", { name: "Best zones", exact: true }).click();
      const shown = await page.locator(".ranked tbody tr").evaluateAll((trs) => trs.map((tr) => [tr.children[1].innerText.trim(), parseInt(tr.children[3].innerText)]));
      const want = rankFor(p.weights).slice(0, 10).map((z) => [String(z.id), z.score]);
      if (JSON.stringify(shown) !== JSON.stringify(want)) rankBad.push(`${p.key}: shown ${JSON.stringify(shown.slice(0, 3))} want ${JSON.stringify(want.slice(0, 3))}`);
      if (p.key === "balanced" && JSON.stringify(shown.map((s) => s[0])) !== JSON.stringify(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"])) rankBad.push("balanced is not the published order");
      if (p.key === "balanced" && shown.some(([id, s]) => +zones[id - 1].score !== s)) rankBad.push("balanced scores differ from zones.csv");
    }
    ok("ten best zones under each of the five presets match an independent ranking", rankBad.length === 0, rankBad.join(" | "));

    // 9. Explanations follow the ticks.
    await open("/?tab=map&spot=-84.01724,23.42232");
    const all = await page.locator(".reasons").first().locator("li").count();
    await open("/?tab=map&preset=radio&spot=-84.01724,23.42232");
    const radio = await page.locator(".spot").innerText();
    ok("explanations update with the ticks", all >= 4 && radio.includes("Earth in view") && !radio.match(/Good here[\s\S]*Mean ground temperature/), `${all} good reasons under everything`);

    // 10. Compare: scores for two sites against site_values.csv.
    await open("/");
    await go(page, `${base}/?site=nr107&compare=mma01&tab=compare`, { waitUntil: "networkidle" });
    await page.waitForSelector(".compare.criteria");
    const overall = (await page.locator(".compare.criteria .overall").innerText()).replace(/\s+/g, " ");
    const siteScore = (id) => { const r = siteValues.find((s) => s.id === id); const v = { sunlight: [+r.sun_pct, 25, 70], earth: [+r.earth_pct, 25, 70], landing_slope: [+r.landing_slope_deg, 10, 5], shadow: [+r.psr_distance_km, 20, 2], walkable: [+r.eva_walkable_pct, 50, 95], temperature: [+r.temp_avg_k, 110, 150], ice: [r.ice_depth_m === "" ? 9 : +r.ice_depth_m, 1, 0], hollow: [+r.hollow_depth_m, 70, 0], darkness: [+r.longest_dark_h, 354, 85], no_earth: [+r.longest_no_earth_h, 336, 0] }; return Math.round((100 * Object.values(v).reduce((a, [x, rej, id2]) => a + sub(x, rej, id2), 0)) / 10); };
    ok("Compare: both overall scores match site_values.csv", overall.includes(`score ${siteScore("nr107")}`) && overall.includes(`score ${siteScore("mma01")}`), `${overall} vs ${siteScore("nr107")}, ${siteScore("mma01")}`);

    // 11. Navigation, reload, and the four next steps.
    for (const name of ["Map", "Site sky", "Window finder", "Compare", "Battery", "Data", "Method"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await page.waitForFunction(() => { const t = document.querySelector("main").innerText.trim(); return t.length > 40 && !/^Loading/.test(t); }, null, { timeout: 30000 });
    }
    ok("navigation: seven pages render", true);
    await open("/?tab=map&pick=sunlight,temperature&flip=temperature&spot=-84.0173,23.4217");
    const before = page.url(); await page.reload(); await page.waitForSelector(".spot h2");
    ok("reload keeps the view", page.url() === before && (await page.locator(".map-legend").innerText()).includes("Sunlight + Temperature"), page.url());
    const href = await page.getByRole("link", { name: "Stand here in 3D / VR" }).getAttribute("href");
    ok("3D / VR link carries the spot", /lat=-84\.0173.*lon=23\.4217/.test(href), href);
    await page.getByRole("button", { name: "See its sky" }).click(); await page.waitForSelector("svg.sky");
    ok("See its sky opens the skyline", true);
    // keyboard: the map takes focus and zooms with +
    await open("/"); await page.locator(".map-view").focus(); const bar = () => page.locator(".map-scale span").evaluate((el) => el.getBoundingClientRect().width / parseFloat(el.parentElement.innerText));
    const s0 = await bar(); await page.keyboard.press("+"); await page.waitForTimeout(500); const s1 = await bar();
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("0"); await page.waitForTimeout(500);
    ok("keyboard: + zooms in, 0 shows the whole region again", s1 > s0 * 1.3 && Math.abs((await bar()) - s0) < 0.01, `${s0.toFixed(2)} -> ${s1.toFixed(2)} px per km`);
    // Data links
    await page.getByRole("tab", { name: "Data", exact: true }).click(); await page.waitForSelector("main a");
    const links = [...new Set(await page.locator("main a").evaluateAll((as) => as.map((a) => a.href)))];
    let bad = [];
    for (const u of links) { let st = 0; for (let t = 0; t < 4 && !(st >= 200 && st < 400); t++) { if (t) await new Promise((r) => setTimeout(r, 2500 * t)); try { st = (await ctx.request.get(u, { timeout: 30000, maxRedirects: 5 })).status(); } catch { st = 0; } } if (!(st >= 200 && st < 400)) bad.push(`${st} ${u}`); }
    report.data_links = { total: links.length, failing: bad };
    ok(`Data page links open (${links.length})`, bad.every((b) => /^403 /.test(b)) && bad.length <= 3, bad.join(" | "));
  }
  ok(`${label} no console errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}
// /xr/ answers
const ctx = await browser.newContext(); let xr = 0; for (let t = 0; t < 4 && xr !== 200; t++) { try { xr = (await ctx.request.get(`${base}/xr/`, { timeout: 30000 })).status(); } catch { xr = 0; } }
ok("/xr/ answers", xr === 200, String(xr));
await browser.close();
writeFileSync(outJson, JSON.stringify(report, null, 1));
console.log(`${report.checks.filter((c) => c.pass).length} of ${report.checks.length} checks pass`);
for (const c of report.checks) console.log(c.pass ? "  ok  " : "  FAIL", c.name, c.detail ? `(${c.detail.slice(0, 300)})` : "");
