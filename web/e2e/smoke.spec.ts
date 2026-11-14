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

/** Opens the homepage and follows its Explore button to Overview. */
async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible();
  await page.getByRole("link", { name: "Explore" }).click();
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("svg.sky")).toBeVisible(); // the skyline has real terrain loaded
}

test("the homepage: hero, numbers, a section per feature, back to the top", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page).toHaveURL(/tab=home/);
  await expect(page.getByRole("img", { name: /^The Moon, two-thirds lit/ })).toBeVisible();
  await expect(page.locator(".home-stats")).toContainText("5,297");
  await expect(page.getByRole("heading", { name: "Where is it safe to land?" })).toBeVisible();
  // Back to the top: hidden at the top, shown a screen down, and it works.
  const toTop = page.getByRole("button", { name: "Back to the top" });
  await expect(toTop).toBeHidden();
  await page.getByRole("heading", { name: "Stand on the Moon" }).scrollIntoViewIfNeeded();
  await expect(toTop).toBeVisible();
  await toTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  // A feature section opens its page; the brand comes back home.
  await page.getByRole("link", { name: "Find a landing day" }).click();
  await expect(page.getByRole("tab", { name: "Window Finder", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Claude's P.L.A.N: home" }).click();
  await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the app loads real data and the skyline explains itself", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await expect(page.getByText("Showing mock data")).toHaveCount(0);
  // "Why here?" on Overview: one sentence per criterion for the selected site.
  await expect(page.getByRole("heading", { name: /^Why here\? Malapert Massif/ })).toBeVisible();
  await expect(page.locator(".why-list > li")).toHaveCount(11); // everything is ticked by default
  // A checklist: name, value and verdict at a glance; the reason folds out on a click.
  const earthRow = page.locator(".why-list > li", { hasText: "Earth in view" });
  await expect(earthRow).toContainText("100% of the time");
  await expect(earthRow.locator(".why-verdict")).toHaveText("good");
  await expect(earthRow.locator(".why-detail")).toBeHidden();
  await earthRow.locator("summary").click();
  await expect(earthRow.locator(".why-detail")).toBeVisible();
  await expect(page.getByText("You are standing at")).toBeVisible();
  await expect(page.locator("svg.sky")).toContainText("Earth now");
  await expect(page.locator("svg.sky")).toContainText("Sun now");
  await expect(page.getByRole("link", { name: "Stand on the Moon (3D / VR)" })).toHaveAttribute("href", /^\/xr\/\?site=\w+&t=/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ai-assisted/);
  await page.getByRole("tab", { name: "Data & Method", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open data" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Use of AI" })).toBeVisible();
  await page.getByRole("button", { name: "How it works" }).click();
  await expect(page).toHaveURL(/tab=method/);
  await expect(page.getByRole("heading", { name: "Positions of the Sun and Earth" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("every tab renders something and logs no errors", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  const names = await page.getByRole("tab").allTextContents();
  expect(names).toEqual(expect.arrayContaining(["Overview", "Site Finder", "Window Finder", "Compare sites", "Battery", "3D Moon", "Data & Method"]));
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

test("Site Finder: ticks decide the map and the ranking", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await page.getByRole("tab", { name: "Site Finder", exact: true }).click();
  // Default: everything ticked, NASA limits locked on, the panel shows the best zone for that choice.
  await expect(page.getByRole("button", { name: "Everything", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".tick input:checked")).toHaveCount(11);
  await expect(page.locator(".tick.locked input")).toBeDisabled();
  await expect(page.locator(".answer")).toContainText(/Best landing spots for everything on the list: 5,297 zones; best is #\d+ \(score \d+\)/);
  await expect(page.getByRole("heading", { name: /^Rank 1: zone #\d+$/ })).toBeVisible();
  await expect(page.getByText("Loading the map layers")).toHaveCount(0);
  await expect(page.locator(".ranked tbody tr")).toHaveCount(10);
  // A preset sets the ticks.
  await page.getByRole("button", { name: "Power first", exact: true }).click();
  await expect(page.locator(".tick.on")).toHaveCount(2);
  await expect(page.locator(".answer")).toContainText("Best landing spots for Sunlight + Short nights");
  await expect(page.getByRole("heading", { name: /^Why here\? Zone #\d+ against what you ticked/ })).toBeVisible();
  await expect(page.locator(".why")).toContainText("Longest darkness");
  await expect(page.locator(".why")).not.toContainText("Mean ground temperature"); // not ticked
  // One parameter ticked: its own heat map with a legend in real units.
  await page.getByLabel(/^Short nights/).uncheck();
  await expect(page.locator(".answer")).toContainText("Showing Sunlight by itself: 25 % of time (dark) to 70 % of time or more (full colour)");
  await expect(page.locator(".legend").first()).toContainText("Sunlight: 25 % of time (dark)");
  // Importance, folded away.
  await page.getByLabel(/^Earth in view/).check();
  await page.getByText("Fine-tune importance").click();
  await page.locator('fieldset:has-text("Earth in view")').getByLabel("High").check();
  await expect(page).toHaveURL(/&pick=sunlight,earth&imp=earth:high$/);
  // The published ranking is still one click away, and reproduces zones.csv: zone #3 is rank 3.
  await page.getByRole("button", { name: "NASA-style balance", exact: true }).click();
  await page.getByRole("button", { name: /^Rank 3: zone #3,/ }).click();
  await expect(page.getByRole("heading", { name: "Rank 3: zone #3" })).toBeVisible();
  // Choosing a zone folds the sidebar away; its button brings it back.
  const sideButton = page.getByRole("button", { name: "What matters for your mission?" });
  await expect(sideButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#finder-side")).toBeHidden();
  await page.getByText("Does this find NASA's own regions?").click();
  await expect(page.getByRole("row", { name: /Malapert Massif/ }).last()).toContainText("32 (65)");
  await sideButton.click();
  await expect(page.locator("#finder-side")).toBeVisible();
  // Nothing ticked is allowed, and says so.
  await page.getByRole("button", { name: "Radio link", exact: true }).click();
  await page.getByLabel(/^Earth in view/).uncheck();
  await page.getByLabel(/^Never out of contact/).uncheck();
  await expect(page.locator(".answer")).toContainText("Nothing is ticked");
  await page.getByRole("button", { name: "Everything", exact: true }).click();
  // Click any spot (Chinh's Site Map, same scoring engine).
  await page.getByRole("button", { name: "Click any spot", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick a spot" })).toBeVisible();
  await page.getByLabel("Colour-blind palette").check();
  await page.getByLabel("Show the numbers").check();
  const map = page.locator(".land-map svg");
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.18 } }); // towards Malapert, north of the pole
  await expect(page.getByRole("heading", { name: /^\d+\.\d{3}° S, \d+\.\d{3}° [EW]$/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Score for your choice/ })).toContainText("of 100");
  await expect(page.getByRole("button", { name: /^Open the 3D view at / })).toBeVisible();
  await page.getByRole("button", { name: "Ranked zones", exact: true }).click();
  await page.getByText("The criteria", { exact: true }).click();
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
  // The Where to land preset travels too.
  await page.getByRole("tab", { name: "Site Finder", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ice science", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/site=hw02&compare=nr107&date=2027-03-14&days=14&tab=land&preset=ice$/);
  // Changing the view rewrites the address; a reload brings the same view back.
  await page.getByRole("button", { name: "Power first", exact: true }).click();
  // The site picker is on the pages that use a site; the choice travels across pages.
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByLabel("Landing site").selectOption("mma01");
  await page.getByRole("tab", { name: "Site Finder", exact: true }).click();
  await expect(page).toHaveURL(/site=mma01&compare=nr107&date=2027-03-14&days=14&tab=land&preset=power$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Site Finder", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/site=mma01/);
  await expect(page.getByRole("button", { name: "Power first", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Hand-set ticks travel as pick=...; an old link with exact weights (w=) still opens; nonsense is ignored.
  await page.getByLabel(/^Ice depth/).check();
  await expect(page).toHaveURL(/&tab=land&pick=sunlight,ice,darkness$/);
  await page.goto("/?tab=land&w=42,28,28,21,14,7,0,0,30,30");
  await expect(page.getByRole("button", { name: "NASA-style balance", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/?tab=land&w=80,15,20,10,5,10,0,0,60,0");
  await expect(page.locator(".tick.on")).toHaveCount(7);
  await expect(page.getByText("This link carries its own exact weights.")).toBeVisible();
  await page.goto("/?site=nope&tab=evil&days=0&date=1999-01-01&preset=%3Cb%3E");
  await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible(); // home
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel("Landing site")).toHaveValue("mma01");
  expect(errors).toEqual([]);
});
