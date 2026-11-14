// Safety net: opens the built site, visits every tab, and fails on any console error or blank tab.
// A change that breaks someone else's tab fails CI here instead of on stage.
import { expect, test, type Page } from "@playwright/test";

/** Collects console errors and uncaught exceptions from the app itself (not from the embedded /xr/ view). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.location().url.includes("/xr/")) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`exception: ${e.message}`));
  return errors;
}

async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("tab").first()).toBeVisible();
  await expect(page.locator("svg.sky")).toBeVisible(); // the skyline has real terrain loaded
}

test("the app loads real data and the skyline explains itself", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await expect(page.getByText("Showing mock data")).toHaveCount(0);
  // "Why here?" on Overview: one sentence per criterion for the selected site.
  await expect(page.getByRole("heading", { name: /^Why here\? Malapert Massif/ })).toBeVisible();
  await expect(page.locator(".why li")).toHaveCount(11);
  await expect(page.locator(".why")).toContainText("Earth in view 100% of the time: good.");
  await expect(page.getByText("You are standing at")).toBeVisible();
  await expect(page.locator("svg.sky")).toContainText("Earth now");
  await expect(page.locator("svg.sky")).toContainText("Sun now");
  await expect(page.getByRole("link", { name: "Stand on the Moon (3D / VR)" })).toHaveAttribute("href", /^\/xr\/\?site=\w+&t=/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ai-assisted/);
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use of AI" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("every tab renders something and logs no errors", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  const names = await page.getByRole("tab").allTextContents();
  expect(names).toEqual(expect.arrayContaining(["Overview", "Where to land", "Window Finder", "Compare sites", "Battery", "3D Moon", "Data", "Method"]));
  for (const name of names) {
    await test.step(`tab: ${name}`, async () => {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      // Not blank: once any "Loading..." note is gone, the tab must hold real content.
      await expect.poll(async () => {
        const text = (await page.locator("main").innerText()).trim();
        return /^Loading/.test(text) ? 0 : text.length;
      }, { timeout: 20_000, message: `tab "${name}" stayed blank` }).toBeGreaterThan(40);
      await expect(page.locator("main")).not.toContainText("could not be loaded");
    });
  }
  expect(errors).toEqual([]);
});

test("Window Finder returns a calendar", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await page.getByRole("tab", { name: "Window Finder", exact: true }).click();
  await page.getByRole("button", { name: "Find landing days" }).click();
  await expect(page.getByRole("heading", { name: /\d+ of \d+ days have a landing time that works/ })).toBeVisible();
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  expect(await grid.getByRole("gridcell").count()).toBeGreaterThan(300); // 12 months of days
  expect(await grid.locator(".cal-day.ok").count()).toBeGreaterThan(0);  // Malapert has landing days
  expect(errors).toEqual([]);
});

test("Where to land shows the map, a zone and the criteria", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await page.getByRole("tab", { name: "Where to land", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Zone 1:/ })).toBeVisible();
  await page.getByRole("button", { name: /^Zone 3,/ }).click();
  await expect(page.getByRole("heading", { name: /^Zone 3:/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Why here\? Zone 3/ })).toBeVisible();
  await expect(page.locator(".why")).toContainText("Passes every hard limit");
  // "Your priorities": another preset re-scores the map and re-ranks the zones, so the selected zone moves.
  await page.getByRole("button", { name: "Ice science first", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ice science first", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: /^Zone 3:/ })).toHaveCount(0);
  await expect(page.getByText(/^Rank \d+ with your priorities; rank 3 with the balanced ones/)).toBeVisible();
  await expect(page.getByText("Loading the map layers")).toHaveCount(0);
  await page.getByRole("button", { name: "Balanced", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Zone 3:/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Malapert Massif/ }).first()).toContainText("32 (65)");
  // Layers view (Chinh's Site Map, same scoring engine): one criterion at a time, click a spot for its numbers.
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick a spot" })).toBeVisible();
  await page.getByRole("button", { name: "Sunlight", exact: true }).click();
  await page.getByLabel("Colour-blind palette").check();
  await page.getByLabel("Show the numbers").check();
  const map = page.locator(".land-map svg");
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.18 } }); // towards Malapert, north of the pole
  await expect(page.getByRole("heading", { name: /^\d+\.\d{3}° S, \d+\.\d{3}° [EW]$/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Score with your priorities/ })).toContainText("of 100");
  await expect(page.getByRole("button", { name: /^Open the 3D view at / })).toBeVisible();
  await page.getByRole("button", { name: "Zones", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Zone 3:/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Artemis III must land near the south pole/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the view lives in the URL: a shared link opens the same view and survives a reload", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?site=hw02&compare=nr107&date=2027-03-14&days=14&tab=compare&preset=ice");
  await expect(page.getByRole("tab", { name: "Compare sites", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Landing site")).toHaveValue("hw02");
  await expect(page.getByLabel("Compare with")).toHaveValue("nr107");
  await expect(page.getByLabel("Landing date (UTC)")).toHaveValue("2027-03-14");
  await expect(page.getByLabel("Mission length")).toHaveValue("14");
  // The priorities preset travels too.
  await page.getByRole("tab", { name: "Where to land", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ice science first", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/site=hw02&compare=nr107&date=2027-03-14&days=14&tab=land&preset=ice$/);
  // Changing the view rewrites the address; a reload brings the same view back.
  await page.getByRole("button", { name: "Power first", exact: true }).click();
  await page.getByLabel("Landing site").selectOption("mma01");
  await expect(page).toHaveURL(/site=mma01&compare=nr107&date=2027-03-14&days=14&tab=land&preset=power$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Where to land", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Landing site")).toHaveValue("mma01");
  await expect(page.getByRole("button", { name: "Power first", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Custom sliders travel as w=...; nonsense in the query is ignored.
  await page.getByLabel(/^Sunlight/).fill("55");
  await expect(page).toHaveURL(/&w=55,15,20,10,5,10,0,0,60,0$/);
  await page.goto("/?site=nope&tab=evil&days=0&date=1999-01-01&preset=%3Cb%3E");
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Landing site")).toHaveValue("mma01");
  expect(errors).toEqual([]);
});
