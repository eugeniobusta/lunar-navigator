// Safety net: opens the built site, visits every page, and fails on any console error or blank page.
// The site is two main pages: Explore a site (what a site is like) and Plan a landing (where, when, battery).
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

/** Opens the homepage and follows its "Explore a site" button. */
async function openExplore(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible();
  await page.locator(".hero-buttons").getByRole("link", { name: "Explore a site" }).click();
  await expect(page.getByRole("tab", { name: "Explore a site", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("svg.sky")).toBeVisible(); // the skyline has real terrain loaded
}

test("the homepage: hero, countdown, numbers, two steps, back to the top", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page).toHaveURL(/tab=home/);
  await expect(page.getByRole("img", { name: /^The Moon, two-thirds lit/ })).toBeVisible();
  await expect(page.locator(".live")).toContainText(/(Sunrise|Sunset) at .+ in/);
  await expect(page.locator(".home-stats")).toContainText("5,297");
  await expect(page.getByRole("heading", { name: "Explore a site" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plan a landing" })).toBeVisible();
  const toTop = page.getByRole("button", { name: "Back to the top" });
  await expect(toTop).toBeHidden();
  await page.getByRole("heading", { name: "Every number, yours to check" }).scrollIntoViewIfNeeded();
  await expect(toTop).toBeVisible();
  await toTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator(".hero-buttons").getByRole("link", { name: "Plan a landing" }).click();
  await expect(page.getByRole("tab", { name: "Plan a landing", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Claude's P.L.A.N: home" }).click();
  await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Explore a site: the skyline, what it means, the checklist, and a comparison", async ({ page }) => {
  const errors = watchErrors(page);
  await openExplore(page);
  await expect(page.getByText("Showing mock data")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "What would you see?" })).toBeVisible();
  await expect(page.locator("svg.sky")).toContainText("Earth now");
  await expect(page.locator("svg.sky")).toContainText("Sun now");
  await expect(page.locator(".verdict").first()).toContainText(/Sunlight .* Earth/);
  await expect(page.locator(".vitals > div")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Stand there in 3D / VR" })).toHaveAttribute("href", /^\/xr\/\?site=\w+&t=/);
  // The checklist is folded away; open it.
  await page.getByText("Why is this site good or bad? The full checklist").click();
  await expect(page.locator(".why-list > li")).toHaveCount(11); // everything is ticked by default
  const earthRow = page.locator(".why-list > li", { hasText: "Earth in view" });
  await expect(earthRow).toContainText("100% of the time");
  await expect(earthRow.locator(".why-verdict")).toHaveText("good");
  // Compare: same dates, another site, three measures.
  await expect(page.getByRole("combobox", { name: /^Compare with/ })).toHaveValue("hw02");
  await expect(page.locator(".duel-row:not(.duel-names)")).toHaveCount(3);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ai-assisted/);
  expect(errors).toEqual([]);
});

test("every page renders something and logs no errors", async ({ page }) => {
  const errors = watchErrors(page);
  await openExplore(page);
  const names = await page.getByRole("tab").allTextContents();
  expect(names).toEqual(["Explore a site", "Plan a landing", "3D Moon", "Data & Method"]);
  for (const name of names) {
    await test.step(`page: ${name}`, async () => {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect.poll(async () => {
        const text = (await page.locator("main").innerText()).trim();
        return /^Loading/.test(text) ? 0 : text.length;
      }, { timeout: 20_000, message: `page "${name}" stayed blank` }).toBeGreaterThan(40);
      await expect(page.locator("main")).not.toContainText("could not be loaded");
    });
  }
  // Data & Method: two sections behind one switch, and the reference tables.
  await page.getByRole("tab", { name: "Data & Method", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use of AI" })).toBeVisible();
  await page.getByText("The landing criteria, with sources").click();
  await expect(page.getByRole("cell", { name: /Artemis III must land near the south pole/ })).toBeVisible();
  await page.getByRole("button", { name: "How it works" }).click();
  await expect(page).toHaveURL(/tab=method/);
  await expect(page.getByRole("heading", { name: "Positions of the Sun and Earth" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Plan a landing: where, when, and the battery", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?tab=plan");
  await expect(page.getByRole("heading", { name: "Where is it safe to land?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Rank 1: zone #\d+$/ })).toBeVisible();
  // Step 2 runs on the skyline computed at the chosen zone.
  await expect(page.getByRole("heading", { name: /\d+ of \d+ days have a landing time that works/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".step").nth(1)).toContainText(/real skyline around zone #\d+/);
  const grid = page.getByRole("grid");
  expect(await grid.getByRole("gridcell").count()).toBeGreaterThan(300); // 12 months of days
  expect(await grid.locator(".cal-day.ok").count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Find landing days" }).click();
  // Step 3: the first good landing, with a battery.
  await expect(page.locator(".step").nth(2).locator(".verdict")).toContainText(/Landing at zone #\d+ on /);
  expect(errors).toEqual([]);
});

test("Plan a landing: ticks decide the map and the ranking", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?tab=plan");
  const big = page.locator(".presets.big");
  await expect(big.getByRole("button", { name: "Everything", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".answer")).toContainText(/Best landing spots for everything on the list: 5,297 zones; best is #\d+ \(score \d+\)/);
  await expect(page.getByText("Loading the map layers")).toHaveCount(0);
  // A preset sets the ticks.
  await big.getByRole("button", { name: "Power first", exact: true }).click();
  await expect(page.locator(".tick.on")).toHaveCount(2);
  await expect(page.locator(".answer")).toContainText("Best landing spots for Sunlight + Short nights");
  // The detailed ticks are behind "Customise"; one tick shows that parameter's own map.
  const side = page.getByRole("button", { name: "What matters for your mission?" });
  await side.click();
  await expect(page.locator("#finder-side")).toBeVisible();
  await page.getByLabel(/^Short nights/).uncheck();
  await expect(page.locator(".answer")).toContainText("Showing Sunlight by itself: 25 % of time (dark) to 70 % of time or more (full colour)");
  await page.getByLabel(/^Earth in view/).check();
  await page.getByText("Fine-tune importance").click();
  await page.locator('fieldset:has-text("Earth in view")').getByLabel("High").check();
  await expect(page).toHaveURL(/&pick=sunlight,earth&imp=earth:high$/);
  // Choosing a zone folds the sidebar away; zone #3 is rank 3 under the published weights.
  await big.getByRole("button", { name: "NASA-style balance", exact: true }).click();
  await page.getByRole("button", { name: /^Rank 3: zone #3,/ }).click();
  await expect(page.getByRole("heading", { name: "Rank 3: zone #3" })).toBeVisible();
  await expect(page.locator("#finder-side")).toBeHidden();
  await page.getByText("Why this zone? The full checklist").click();
  await expect(page.locator(".why").first()).toContainText("Longest darkness");
  // Click any spot.
  await page.getByRole("button", { name: "Click any spot", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick a spot" })).toBeVisible();
  const map = page.locator(".land-map svg");
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.18 } }); // towards Malapert, north of the pole
  await expect(page.getByRole("heading", { name: /^\d+\.\d{3}° S, \d+\.\d{3}° [EW]$/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Score for your choice/ })).toContainText("of 100");
  await expect(page.getByRole("button", { name: /^Open the 3D view at / })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the view lives in the URL, and old page links open the page that holds them", async ({ page }) => {
  const errors = watchErrors(page);
  // An old Compare-sites link opens Explore with the same sites and dates.
  await page.goto("/?site=hw02&compare=nr107&date=2027-03-14&days=14&tab=compare&preset=ice");
  await expect(page.getByRole("tab", { name: "Explore a site", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Landing site")).toHaveValue("hw02");
  await expect(page.getByRole("combobox", { name: /^Compare with/ })).toHaveValue("nr107");
  await expect(page.getByLabel("Landing date (UTC)")).toHaveValue("2027-03-14");
  await expect(page.getByLabel("Mission length")).toHaveValue("14");
  await expect(page).toHaveURL(/site=hw02&compare=nr107&date=2027-03-14&days=14&tab=explore&preset=ice$/);
  // The preset travels to Plan.
  await page.getByRole("tab", { name: "Plan a landing", exact: true }).click();
  await expect(page.locator(".presets.big").getByRole("button", { name: "Ice science", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".presets.big").getByRole("button", { name: "Power first", exact: true }).click();
  await expect(page).toHaveURL(/tab=plan&preset=power$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Plan a landing", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".presets.big").getByRole("button", { name: "Power first", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Old links: Site Finder and Window Finder open Plan; Overview opens Explore; an old w= link still opens.
  await page.goto("/?tab=land&w=42,28,28,21,14,7,0,0,30,30");
  await expect(page.locator(".presets.big").getByRole("button", { name: "NASA-style balance", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/?tab=windows");
  await expect(page.getByRole("tab", { name: "Plan a landing", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goto("/?tab=overview");
  await expect(page.getByRole("tab", { name: "Explore a site", exact: true })).toHaveAttribute("aria-selected", "true");
  // Nonsense is ignored: the homepage, and the default site.
  await page.goto("/?site=nope&tab=evil&days=0&date=1999-01-01&preset=%3Cb%3E");
  await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible();
  await page.getByRole("tab", { name: "Explore a site", exact: true }).click();
  await expect(page.getByLabel("Landing site")).toHaveValue("mma01");
  expect(errors).toEqual([]);
});
