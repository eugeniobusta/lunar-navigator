// Safety net: opens the built site in both views (Simple and Detailed), visits every page, and fails on any
// console error or blank page.
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

const SIMPLE = ["Explore a site", "Plan a landing", "3D Moon", "Data & Method"];
const DETAILED = ["Overview", "Site Finder", "Window Finder", "Compare sites", "Battery", "3D Moon", "Data & Method"];

/** Opens a page and waits for the data. */
async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Claude's P.L.A.N: home" })).toBeVisible();
}
/** Opens Site Finder (the Detailed view) and waits for the map layers. */
async function openFinder(page: Page, query = "") {
  await open(page, `/?tab=map${query}`);
  await expect(page.locator(".map-view canvas")).toBeVisible();
  await expect(page.getByText("Loading the map layers")).toHaveCount(0, { timeout: 30_000 });
}
/** The pages of the menu, whether they sit in the bar or behind the Menu button. */
const tabNames = (page: Page) => page.locator("#pages .tab").allTextContents();
const viewButton = (page: Page, name: "Simple" | "Detailed") => page.getByRole("group", { name: "View" }).getByRole("button", { name, exact: true });
/** Opens a page from the menu, through the Menu button when the pages are folded behind it. */
async function goTab(page: Page, name: string) {
  const tab = page.locator("#pages .tab", { hasText: new RegExp(`^${name.replace(/[&]/g, "\\$&")}$`) });
  // The bar may fold or unfold while the page settles (the countdown arrives, the fonts load), so try again.
  await expect(async () => {
    if (!(await tab.isVisible())) await page.getByRole("button", { name: "Menu" }).click({ timeout: 2000 });
    await tab.click({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(tab).toHaveClass(/\bon\b/);
}
const openGroup = (page: Page, name: string) => page.getByRole("button", { name: `Show the parameters of ${name}` }).click();
/** The choices fold away once a spot is chosen; this brings them back. */
async function showChoices(page: Page) {
  const toggle = page.getByRole("button", { name: "What matters for your mission?" });
  if (await toggle.count()) await toggle.click();
  await expect(page.locator("#finder-side")).toBeVisible();
}

test("one site, two views: Simple by default, the switch keeps the place, the browser remembers", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  // First visit: the homepage in the Simple view.
  await expect(viewButton(page, "Simple")).toHaveAttribute("aria-pressed", "true");
  expect(await tabNames(page)).toEqual(SIMPLE);
  await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible();
  await expect(page.locator(".home-stats")).toContainText("14.3 %");
  await expect(page.getByText("Showing mock data")).toHaveCount(0);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ai-assisted/);
  await expect(page).toHaveTitle("Claude's P.L.A.N: Lunar Landing Site Navigator");
  // Every homepage picture is credited in place.
  for (const credit of ["Moon: NASA Goddard", "Photo: NASA, Apollo 8, Earthrise (AS08-14-2383)", "Photo: NASA, Artemis II crew, A New View of the Moon (art002e009287)"])
    await expect(page.locator(".home")).toContainText(credit);
  // Detailed: one page per tool, and the link says so.
  await viewButton(page, "Detailed").click();
  expect(await tabNames(page)).toEqual(DETAILED);
  await expect(page).toHaveURL(/\?view=detailed&/);
  for (const credit of ["Artemis II crew, Shadows at the Edge of Lunar Day (art002e009281)", "Artemis II crew, Earthset from Orion (art002e021278)",
    "NASA/Charles Beason", "Apollo 15, James Irwin and the Lunar Roving Vehicle (AS15-86-11603)"]) await expect(page.locator(".home")).toContainText(credit);
  // Switching keeps the site, the date and the page that holds the same thing.
  await page.goto("/?view=detailed&site=hw02&date=2027-03-14&days=14&tab=compare&preset=ice");
  await expect(page.getByRole("tab", { name: "Compare sites" })).toHaveAttribute("aria-selected", "true");
  await viewButton(page, "Simple").click();
  await expect(page.getByRole("tab", { name: "Explore a site" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?view=simple&site=hw02&compare=\w+&date=2027-03-14&days=14&tab=explore&preset=ice$/);
  await expect(page.getByLabel("Landing site")).toHaveValue("hw02");
  await page.getByRole("tab", { name: "Plan a landing" }).click();
  await expect(page.getByRole("button", { name: "Ice science", exact: true })).toHaveAttribute("aria-pressed", "true");
  await viewButton(page, "Detailed").click();
  await expect(page.getByRole("tab", { name: "Site Finder" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Ice science", exact: true })).toHaveAttribute("aria-pressed", "true");
  // The browser remembers the view: a plain link opens in the one used last.
  await page.goto("/");
  await expect(viewButton(page, "Detailed")).toHaveAttribute("aria-pressed", "true");
  // Links from before there were two views open the page they always did; view= in a link wins over memory.
  await page.goto("/?tab=explore");
  await expect(viewButton(page, "Simple")).toHaveAttribute("aria-pressed", "true");
  await page.goto("/?tab=windows");
  await expect(page.getByRole("tab", { name: "Window Finder" })).toHaveAttribute("aria-selected", "true");
  await page.goto("/?view=simple&tab=land");
  await expect(page.getByRole("tab", { name: "Plan a landing" })).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

for (const [view, names] of [["simple", SIMPLE], ["detailed", DETAILED]] as const) {
  test(`${view} view: every page renders something and logs no errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, `/?view=${view}`);
    expect(await tabNames(page)).toEqual(names);
    for (const name of names) {
      await test.step(`page: ${name}`, async () => {
        await goTab(page, name);
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        // Not blank: once any "Loading..." note is gone, the page must hold real content.
        await expect.poll(async () => {
          const text = (await page.locator("main").innerText()).trim();
          return /^Loading/.test(text) ? 0 : text.length;
        }, { timeout: 20_000, message: `page "${name}" stayed blank` }).toBeGreaterThan(40);
        await expect(page.locator("main")).not.toContainText("could not be loaded");
      });
    }
    // Data & Method: both sections, in both views.
    await expect(page.getByRole("heading", { name: "Use of AI" })).toBeVisible();
    await expect(page.locator("main")).toContainText("IAU Gazetteer of Planetary Nomenclature");
    await expect(page.locator("main")).toContainText("Pictures and textures");
    await page.getByRole("button", { name: "How it works" }).click();
    await expect(page.locator("main")).toContainText("JPL Horizons");
    // Home again by the name in the corner.
    await page.getByRole("button", { name: "Claude's P.L.A.N: home" }).click();
    await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("the menu bar fits: nothing overlaps or leaves the screen at 1920, 1440, 1280 and 390 px, in both views", async ({ page }) => {
  const errors = watchErrors(page);
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const view of ["simple", "detailed"]) {
      for (const tab of ["home", "data"]) {
        await open(page, `/?view=${view}&tab=${tab}`);
        if (tab === "home") await expect(page.locator(".nav .live:not(.live-measure), .nav[data-menu]")).not.toHaveCount(0);
        await page.waitForTimeout(400); // the countdown appears once the skyline has loaded, and the bar re-measures
        const boxes = await page.evaluate(() => {
          const bar = document.querySelector(".nav")!;
          const seen = [...bar.children].filter((el) => !/-measure/.test(el.className) && getComputedStyle(el).display !== "none" && getComputedStyle(el).position !== "absolute");
          return seen.map((el) => { const r = el.getBoundingClientRect(); return { name: el.className.split(" ")[0], left: r.left, right: r.right }; });
        });
        const label = `${w}px ${view} ${tab}: ${boxes.map((b) => `${b.name} ${Math.round(b.left)}-${Math.round(b.right)}`).join(", ")}`;
        boxes.forEach((b, i) => {
          expect(b.left, label).toBeGreaterThanOrEqual(0);
          expect(b.right, label).toBeLessThanOrEqual(w);
          if (i) expect(b.left, label).toBeGreaterThanOrEqual(boxes[i - 1].right - 0.5);
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: no sideways scrolling`).toBe(true);
        // Every page is reachable: in the bar, or behind the Menu button.
        const menu = page.getByRole("button", { name: "Menu" });
        if (await menu.isVisible()) {
          await menu.click();
          await expect(page.getByRole("tab", { name: "Data & Method" })).toBeVisible();
          await expect(page.getByRole("group", { name: "View" }).first()).toBeVisible();
          await menu.click();
        } else await expect(page.getByRole("tab", { name: "Data & Method" })).toBeVisible();
      }
    }
  }
  // On a phone the menu opens, changes the page and the view, and closes again.
  await open(page, "/?view=simple");
  await page.getByRole("button", { name: "Menu" }).click();
  await viewButton(page, "Detailed").click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("tab", { name: "Battery" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Battery" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Battery" })).toBeHidden();
  expect(errors).toEqual([]);
});

test("the homepage countdown is the next sunrise or sunset over the real skyline", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, "/?view=simple");
  const clock = page.locator(".nav .live:not(.live-measure)");
  await expect(clock).toContainText(/^(Sunrise|Sunset) at Malapert Massif in\s*(\d+d )?\d\d:\d\d:\d\d$/);
  // It counts down, and its tooltip gives the UTC time it is counting to (unit tests check that time against the model).
  const first = await clock.locator("b").innerText();
  await expect(clock.locator("b")).not.toHaveText(first, { timeout: 5000 });
  await expect(clock).toHaveAttribute("title", /over the real skyline at Malapert Massif: \d{4}-\d\d-\d\d \d\d:\d\d UTC/);
  await clock.click();
  await expect(page.getByRole("tab", { name: "Explore a site" })).toHaveAttribute("aria-selected", "true");
});

test("Explore a site (Simple): the sky, what it means for a lander, the checklist, another site", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "/?view=simple&site=mma01&date=2027-01-09&days=14&tab=explore");
  await expect(page.locator("svg.sky")).toBeVisible();
  await expect(page.locator("svg.sky")).toContainText("Earth now");
  await expect(page.locator("svg.sky")).toContainText("Sun now");
  await expect(page.locator(".verdict")).toContainText("Sunlight 51% of the time, Earth always in view");
  await expect(page.locator(".vitals").first()).toContainText("51%");
  await expect(page.getByRole("link", { name: "Stand there in 3D / VR" })).toHaveAttribute("href", /^\/xr\/\?site=mma01&t=/);
  await page.getByText("Why is this site good or bad? The full checklist").click();
  await expect(page.locator(".why-list > li")).toHaveCount(11); // everything is ticked by default
  await page.locator(".why-list summary", { hasText: "Earth in view" }).click();
  await expect(page.locator(".why-list li", { hasText: "Earth in view" }).locator(".why-detail")).toContainText("70% or more is ideal");
  await page.getByRole("combobox", { name: "Compare with" }).selectOption("nr107");
  await expect(page.locator(".duel")).toContainText("Nobile Rim 1");
  await expect(page.locator(".credit-line")).toContainText("NASA, Apollo 17 (AS17-148-22727)");
  expect(errors).toEqual([]);
});

test("Plan a landing (Simple): presets only, the same map and scoring, the checklist, landing days and battery", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "/?view=simple&tab=plan");
  await expect(page.locator(".map-view canvas")).toBeVisible();
  await expect(page.getByText("Loading the map layers")).toHaveCount(0, { timeout: 30_000 });
  // Presets, no tick boxes; the legend in words; the best zone already checked.
  await expect(page.getByRole("button", { name: "Everything", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".steps input[type=checkbox]:not([aria-label]):visible")).toHaveCount(1); // only the colour-blind switch
  const legend = page.locator(".map-legend");
  for (const line of ["Green, good: score 70 to 100", "Amber, acceptable: score 40 to 69", "Red, poor: score under 40", "Hatched: unsafe, fails a NASA limit", "Grey: no data"]) await expect(legend).toContainText(line);
  await expect(page.locator(".score-big b")).toHaveText("76"); // the same score as Site Finder gives zone 2
  await expect(page.locator(".land-side")).toContainText("Rank 1: zone 2");
  await expect(page.getByRole("heading", { name: /^Why here\? Zone 2 against what matters/ })).toBeVisible();
  await expect(page.locator(".why-list > li")).toHaveCount(11);
  await page.locator(".why-list summary", { hasText: "Landing slope" }).click();
  await expect(page.locator(".why-list li", { hasText: "Landing slope" }).locator(".why-detail")).toContainText("5 degrees or less is ideal");
  // Another mission, another best place.
  await page.getByRole("button", { name: "Radio link", exact: true }).click();
  await expect(page.locator(".land-side")).toContainText("Rank 1: zone 12");
  await expect(page.locator(".score-big b")).toHaveText("100");
  await expect(page.locator(".why-list > li")).toHaveCount(6); // the five NASA limits (Earth in view is one of them) and never out of contact
  // Click unsafe ground: red, hatched, and it says which limit fails.
  const map = page.locator(".map-view");
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.4 } });
  await expect(page.locator(".verdict-line")).toContainText("Unsafe");
  await expect(page.locator(".fails")).toContainText(/Fails .*NASA limit/);
  await expect(page.getByRole("link", { name: "Stand here in VR" })).toHaveAttribute("href", /^\/xr\/\?site=\w+&t=.*&lat=-\d+\.\d+&lon=-?\d+(\.\d+)?$/);
  // Steps 2 and 3 follow the chosen place: back to the best zone, then landing days and the battery.
  await page.locator(".answer").getByRole("button", { name: /^zone \d+$/ }).click();
  await expect(page.getByRole("heading", { name: /\d+ of \d+ days have a landing time that works/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator(".steps .verdict")).toContainText(/Landing at zone \d+ on /);
  await page.getByRole("button", { name: "See its sky" }).click();
  await expect(page.getByRole("tab", { name: "Explore a site" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("svg.sky")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Overview and Window Finder (Detailed): the sky explains itself, and 32 landing days at Malapert reproduce", async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, "/?site=mma01&date=2027-01-09&days=14&tab=overview");
  await expect(viewButton(page, "Detailed")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("svg.sky")).toBeVisible();
  await expect(page.getByText("You are standing at")).toBeVisible();
  await expect(page.locator(".verdict")).toContainText("Sunlight 51% of the time, Earth always in view");
  await expect(page.getByRole("heading", { name: /^Why here\? Malapert Massif/ })).toBeVisible();
  await expect(page.locator(".why-list > li")).toHaveCount(11);
  await expect(page.getByRole("link", { name: "Stand on the Moon (3D / VR)" })).toHaveAttribute("href", /^\/xr\/\?site=\w+&t=/);
  await page.goto("/?site=mma01&date=2026-11-14&days=14&tab=windows");
  await expect(page.getByRole("heading", { name: /^32 of 36[56] days have a landing time that works$/ })).toBeVisible({ timeout: 30_000 });
  const grid = page.getByRole("grid");
  expect(await grid.getByRole("gridcell").count()).toBeGreaterThan(300); // 12 months of days
  expect(await grid.locator(".cal-day.ok").count()).toBe(32);
  await grid.locator(".cal-day.ok").first().click(); // a green day opens that landing
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Battery" }).click();
  await expect(page.locator("main")).toContainText(/Runs out|Survives/);
  expect(errors).toEqual([]);
});

test("Site Finder (Detailed): the map, layers, groups, flips and opacity; ticks decide the classes and the ranking", async ({ page }) => {
  const errors = watchErrors(page);
  await openFinder(page);
  await expect(page.locator(".answer")).toContainText("14.3% of the ground within 6° of the pole passes every NASA Artemis III limit.");
  // The legend says what the three colours mean, with words and a hatch, never colour alone.
  const legend = page.locator(".map-legend");
  for (const line of ["Green, good: score 70 to 100", "Amber, acceptable: score 40 to 69", "Red, poor: score under 40", "Hatched: unsafe, fails a NASA limit", "Grey: no data"]) await expect(legend).toContainText(line);
  // Geography on the map: the rings, the compass, the named craters (IAU), Artemis points, a past landing.
  const map = page.locator(".map-view");
  for (const text of ["South Pole", "Towards Earth (0° E)", "84° S", "86° S", "88° S", "Shackleton", "Haworth", "Shoemaker", "Faustini",
    "de Gerlache", "Cabeus", "Malapert", "Nobile", "Amundsen", "IM-2 Athena"]) await expect(map).toContainText(text);
  await expect(map.getByRole("button", { name: /^Artemis candidate:/ })).toHaveCount(9);
  // His page around it: the folding sidebar, the region at a glance, the ten best.
  await expect(page.locator("#finder-side")).toBeVisible();
  await expect(page.locator(".glance .card")).toHaveCount(3);
  await expect(page.locator(".glance")).toContainText("Why the rest fails");
  await expect(page.locator(".ranked tbody tr")).toHaveCount(10);
  // Default: everything ticked in four groups, NASA limits locked on.
  await expect(page.getByRole("button", { name: "Everything", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const g of ["Safe ground", "Power and heat", "Radio link", "Ice and science"]) await expect(page.getByRole("checkbox", { name: g, exact: true })).toBeChecked();
  await expect(page.locator(".limits-row input[type=checkbox]")).toBeDisabled();
  await expect(page.locator(".answer")).toContainText(/Best zone now: zone \d+, score \d+ \((good|acceptable|poor)\)/);
  // A preset sets the ticks; the groups show how much of each is ticked.
  await page.getByRole("button", { name: "Power first", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Radio link", exact: true })).not.toBeChecked();
  await expect(page.locator(".group", { hasText: "Power and heat" }).locator(".count")).toHaveText("2 of 3");
  await expect(legend).toContainText("Sunlight alone"); // short nights has no map of its own
  await expect(legend).toContainText("Green, good: 70 % of the time or more");
  await expect(legend).toContainText("Red, poor: under 25 % of the time");
  // A group opens to its parameters, each with one plain line and its controls.
  await openGroup(page, "Power and heat");
  await expect(page.locator(".param")).toHaveCount(3);
  await expect(page.locator(".param", { hasText: "Sunlight" })).toContainText("How much of the time the Sun is up");
  await page.getByRole("radio", { name: "Sunlight: high importance" }).check();
  await expect(page).toHaveURL(/&pick=sunlight,darkness&imp=sunlight:high$/);
  // Flip: temperature can be turned round (prefer colder), sunlight cannot.
  await page.getByRole("checkbox", { name: /^Temperature/ }).check();
  await expect(page.getByRole("radio", { name: /^Sunlight: prefer/ })).toHaveCount(0);
  const best = async () => (await page.locator(".answer").innerText()).match(/zone (\d+), score (\d+)/)!.slice(1).join(":");
  const warm = await best();
  await page.getByRole("radio", { name: "Temperature: prefer less (colder)" }).check();
  await expect(page).toHaveURL(/&flip=temperature$/);
  expect(await best()).not.toBe(warm);
  // One parameter alone on the map, with its own opacity. Opacity never changes the answer.
  await page.locator(".param", { hasText: "Temperature" }).getByRole("button", { name: "Show alone on the map" }).click();
  await expect(legend).toContainText("Temperature alone");
  await expect(legend).toContainText("Green, good: under 110 K"); // flipped: cold is green
  const before = await best();
  await page.getByRole("slider", { name: "Temperature opacity" }).fill("30");
  await page.getByRole("slider", { name: "NASA safety limits opacity" }).fill("0");
  expect(await best()).toBe(before);
  await legend.getByRole("button", { name: "Back to the combined map" }).click();
  await expect(legend).toContainText("Combined score of Sunlight + Temperature");
  // A group tick is all its parameters.
  await page.getByRole("checkbox", { name: "Ice and science", exact: true }).check();
  await expect(page).toHaveURL(/&pick=sunlight,shadow,temperature,ice,darkness&imp=sunlight:high&flip=temperature$/);
  // The published ranking is one click away and reproduces zones.csv: zone 3 is rank 3.
  await page.getByRole("button", { name: "NASA-style balance", exact: true }).click();
  await expect(page.locator(".ranked tbody tr").nth(2)).toContainText(/^3\s*3/);
  await page.locator("details", { hasText: "Where the nine Artemis candidate points rank" }).locator("summary").click();
  await expect(page.getByRole("row", { name: /Malapert Massif/ }).last()).toContainText("32 (65)");
  // Nothing ticked is allowed, and says so.
  await page.getByRole("button", { name: "Everything", exact: true }).click();
  for (const g of ["Safe ground", "Power and heat", "Radio link", "Ice and science"]) await page.getByRole("checkbox", { name: g, exact: true }).uncheck();
  await expect(legend).toContainText("NASA safety limits only");
  await expect(page.locator(".zones-list")).toContainText("Nothing is ticked");
  // The sidebar folds away and comes back.
  await page.getByRole("button", { name: "Hide the choices" }).click();
  await expect(page.locator("#finder-side")).toBeHidden();
  await showChoices(page);
  expect(errors).toEqual([]);
});

test("Site Finder (Detailed): click a spot for its numbers, zoom and pan, then its sky, landing days, comparison and 3D", async ({ page }) => {
  const errors = watchErrors(page);
  await openFinder(page);
  // Before any click the panel is about the best zone for the ticks, with its score big.
  await expect(page.locator(".land-side")).toContainText("Rank 1: zone 2 (the best for your choice)");
  await expect(page.locator(".score-big b")).toHaveText("76");
  await expect(page.locator(".tiles")).toContainText("Sunlight, long-run");
  await expect(page.locator(".land-side .hbars li")).toHaveCount(10);
  const map = page.locator(".map-view");
  const box = (await map.boundingBox())!;
  // Unsafe ground: red, hatched, and it says which NASA limits fail. The choices fold away.
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.4 } });
  await expect(page.locator("#finder-side")).toBeHidden();
  await expect(page.locator(".spot-coord")).toHaveText(/^\d+\.\d{3}° S, \d+\.\d{3}° [EW]$/);
  await expect(page.locator(".verdict-line")).toContainText("Unsafe");
  await expect(page.locator(".fails")).toContainText(/Fails \d? ?(a )?NASA limits?: .*(landing slope under 10°|sunlight for the whole stay|Earth in view)/);
  await expect(page.locator(".measure tbody tr")).toHaveCount(8);
  await expect(page.locator(".spot")).toContainText("How sure is this?");
  await expect(page).toHaveURL(/&spot=-\d+\.\d+,-?\d+(\.\d+)?$/);
  // The best zone: its own numbers, what is good and weak, the checklist, and the four next steps.
  await page.locator(".answer").getByRole("button", { name: /^zone \d+$/ }).click();
  await expect(page.locator(".spot .sub").first()).toContainText(/Zone \d+: rank 1 of 5,297/);
  await expect(page.locator(".verdict-line")).toContainText("Good");
  await expect(page.locator(".measure tbody tr")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Good here" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weak here" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Why here\? Zone 2 against what you ticked/ })).toBeVisible();
  await expect(page.locator(".why-list > li")).toHaveCount(11);
  await expect(page.getByRole("link", { name: "Stand here in 3D / VR" })).toHaveAttribute("href", /^\/xr\/\?site=\w+&t=.*&lat=-\d+\.\d+&lon=-?\d+\.\d+$/);
  // Zoom with the buttons and the wheel, pan by dragging: the scale changes, nothing breaks, a drag is not a click.
  const bar = () => page.locator(".map-scale span").evaluate((el) => el.getBoundingClientRect().width / parseFloat(el.parentElement!.innerText));
  await page.getByRole("button", { name: "Show the whole region" }).click();
  await expect(page.getByRole("button", { name: "Show the whole region" })).toBeDisabled(); // the move has finished
  const whole = await bar();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await map.hover({ position: { x: box.width * 0.5, y: box.height * 0.3 } });
  await page.mouse.wheel(0, -600);
  await expect.poll(bar).toBeGreaterThan(whole * 1.5);
  const now = (await map.boundingBox())!;
  await page.mouse.move(now.x + now.width * 0.5, now.y + now.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(now.x + now.width * 0.3, now.y + now.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".verdict-line")).toContainText("Good");
  await page.getByRole("button", { name: "Show the whole region" }).click();
  await expect(page.getByRole("button", { name: "Show the whole region" })).toBeDisabled();
  expect(await bar()).toBeCloseTo(whole, 2);
  // Colour-blind palette names its own colours.
  await page.getByLabel("Colour-blind palette").check();
  await expect(page.locator(".map-legend")).toContainText("Yellow, good");
  await expect(page.locator(".map-legend")).toContainText("Dark blue, poor");
  await page.getByLabel("Colour-blind palette").uncheck();
  // On to the site pages, and back: the spot is still selected.
  await page.getByRole("button", { name: "See its sky" }).click();
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("svg.sky")).toBeVisible();
  await page.getByRole("tab", { name: "Site Finder" }).click();
  await expect(page.locator(".verdict-line")).toContainText("Good");
  await page.locator(".actions").getByRole("button", { name: "Find landing days" }).click();
  await expect(page.getByRole("tab", { name: "Window Finder" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Site Finder" }).click();
  await page.getByLabel("Compare with another site").selectOption("hw02");
  await expect(page.getByRole("tab", { name: "Compare sites" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Compare with")).toHaveValue("hw02");
  // Compare: his head-to-head, and both judged as landing sites by the map's rules.
  await expect(page.locator(".duel-head")).toContainText("Haworth");
  await expect(page.getByRole("heading", { name: "As landing sites, for what you ticked in Site Finder" })).toBeVisible();
  await expect(page.locator(".compare.criteria tbody tr")).toHaveCount(11);
  await expect(page.locator(".compare.criteria .overall")).toContainText(/(Good|Acceptable|Poor), score \d+|Unsafe: fails/);
  await expect(page.locator(".reasons-line")).toHaveCount(2);
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
  // The map's preset travels too.
  await page.getByRole("tab", { name: "Site Finder", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ice science", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?view=detailed&site=hw02&compare=nr107&date=2027-03-14&days=14&tab=map&preset=ice$/);
  // Changing the view rewrites the address; a reload brings the same view back.
  await page.getByRole("button", { name: "Power first", exact: true }).click();
  await expect(page).toHaveURL(/&tab=map&preset=power$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Site Finder", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Power first", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Hand-set ticks travel as pick=...; the old tab name and an old link with exact weights still open; nonsense is ignored.
  await openGroup(page, "Ice and science");
  await page.getByRole("checkbox", { name: /^Ice depth/ }).check();
  await expect(page).toHaveURL(/&tab=map&pick=sunlight,ice,darkness$/);
  await page.goto("/?tab=land&w=42,28,28,21,14,7,0,0,30,30");
  await expect(page.getByRole("tab", { name: "Site Finder", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "NASA-style balance", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/?tab=land&w=80,15,20,10,5,10,0,0,60,0");
  await expect(page.getByText("This link carries its own exact weights.")).toBeVisible();
  // A shared spot opens selected, with its panel.
  await page.goto("/?tab=map&pick=sunlight&spot=-84.0173,23.4217");
  await expect(page.locator(".spot-coord")).toHaveText("84.017° S, 23.422° E");
  await expect(page.locator(".map-legend")).toContainText("Sunlight alone");
  // The README's link to the best zone for everything: zone 2 of zones.csv, recognised as that zone.
  await page.goto("/?tab=map&spot=-84.01724,23.42232");
  await expect(page.locator(".spot .sub").first()).toContainText("Zone 2: rank 1 of 5,297");
  await expect(page.locator(".score-big b")).toHaveText("76");
  await page.goto("/?site=nope&tab=evil&days=0&date=1999-01-01&preset=%3Cb%3E&spot=999,1&view=expert");
  await expect(page.getByRole("heading", { name: "Choose where to land before you fly" })).toBeVisible();
  await page.getByRole("link", { name: "See a site hour by hour" }).click();
  await expect(page.getByLabel("Landing site")).toHaveValue("mma01");
  expect(errors).toEqual([]);
});
