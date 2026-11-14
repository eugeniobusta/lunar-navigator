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

/** Opens the site on its home page, the landing map, and waits for the map layers. */
async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("tab").first()).toBeVisible();
  await expect(page.locator(".map-view canvas")).toBeVisible();
  await expect(page.getByText("Loading the map layers")).toHaveCount(0, { timeout: 30_000 });
}
const openGroup = (page: Page, name: string) => page.getByRole("button", { name: `Show the parameters of ${name}` }).click();
const side = (page: Page, name: string) => page.getByRole("group", { name: "Side panel" }).getByRole("button", { name, exact: true }).click();

test("the app opens on the landing map, and a site's sky explains itself", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await expect(page.getByRole("tab", { name: "Map", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Where can a lander touch down at the Moon's south pole?" })).toBeVisible();
  await expect(page.locator(".landing-head")).toContainText("14.3% of the ground within 6° of the pole passes every NASA Artemis III limit.");
  await expect(page.getByText("Showing mock data")).toHaveCount(0);
  // The legend says what the three colours mean, with words and a hatch, never colour alone.
  const legend = page.locator(".map-legend");
  await expect(legend).toContainText("Green, good: score 70 to 100");
  await expect(legend).toContainText("Amber, acceptable: score 40 to 69");
  await expect(legend).toContainText("Red, poor: score under 40");
  await expect(legend).toContainText("Hatched: unsafe, fails a NASA limit");
  await expect(legend).toContainText("Grey: no data");
  // Geography on the map: the rings, the compass, the named craters (IAU), Artemis points, a past landing.
  const map = page.locator(".map-view");
  for (const text of ["South Pole", "Towards Earth (0° E)", "84° S", "86° S", "88° S", "Shackleton", "Haworth", "Shoemaker", "Faustini",
    "de Gerlache", "Cabeus", "Malapert", "Nobile", "Amundsen", "IM-2 Athena"]) await expect(map).toContainText(text);
  await expect(map.getByRole("button", { name: /^Artemis candidate:/ })).toHaveCount(9);
  // Site sky: the old first page, one click away.
  await page.getByRole("tab", { name: "Site sky", exact: true }).click();
  await expect(page.locator("svg.sky")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Why here\? Malapert Massif/ })).toBeVisible();
  await expect(page.locator(".why li")).toHaveCount(11); // everything is ticked by default
  await expect(page.locator(".why")).toContainText("Earth in view 100% of the time: good.");
  await expect(page.getByText("You are standing at")).toBeVisible();
  await expect(page.locator("svg.sky")).toContainText("Earth now");
  await expect(page.locator("svg.sky")).toContainText("Sun now");
  await expect(page.getByRole("link", { name: "Stand on the Moon (3D / VR)" })).toHaveAttribute("href", /^\/xr\/\?site=\w+&t=/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ai-assisted/);
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use of AI" })).toBeVisible();
  await expect(page.locator("main")).toContainText("IAU Gazetteer of Planetary Nomenclature");
  expect(errors).toEqual([]);
});

test("every page renders something and logs no errors", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  const names = await page.getByRole("tab").allTextContents();
  expect(names).toEqual(["Map", "Site sky", "Window finder", "Compare", "Battery", "Data", "Method"]);
  for (const name of names) {
    await test.step(`page: ${name}`, async () => {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      // Not blank: once any "Loading..." note is gone, the page must hold real content.
      await expect.poll(async () => {
        const text = (await page.locator("main").innerText()).trim();
        return /^Loading/.test(text) ? 0 : text.length;
      }, { timeout: 20_000, message: `page "${name}" stayed blank` }).toBeGreaterThan(40);
      await expect(page.locator("main")).not.toContainText("could not be loaded");
    });
  }
  expect(errors).toEqual([]);
});

test("Window Finder returns a calendar", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await page.getByRole("tab", { name: "Window finder", exact: true }).click();
  await page.getByRole("button", { name: "Find landing days" }).click();
  await expect(page.getByRole("heading", { name: /\d+ of \d+ days have a landing time that works/ })).toBeVisible();
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  expect(await grid.getByRole("gridcell").count()).toBeGreaterThan(300); // 12 months of days
  expect(await grid.locator(".cal-day.ok").count()).toBeGreaterThan(0);  // Malapert has landing days
  expect(errors).toEqual([]);
});

test("Map: layers, groups, flips and opacity; ticks decide the classes and the ranking", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  // Default: everything ticked in four groups, NASA limits locked on.
  await expect(page.getByRole("button", { name: "Everything", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const g of ["Safe ground", "Power and heat", "Radio link", "Ice and science"]) await expect(page.getByRole("checkbox", { name: g, exact: true })).toBeChecked();
  await expect(page.locator(".limits-row input[type=checkbox]")).toBeDisabled();
  await expect(page.locator(".landing-head")).toContainText(/Best zone now: zone \d+, score \d+ \((good|acceptable|poor)\)/);
  // A preset sets the ticks; the groups show how much of each is ticked.
  await page.getByRole("button", { name: "Power first", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Radio link", exact: true })).not.toBeChecked();
  await expect(page.locator(".group", { hasText: "Power and heat" }).locator(".count")).toHaveText("2 of 3");
  await expect(page.locator(".map-legend")).toContainText("Sunlight alone"); // short nights has no map of its own
  await expect(page.locator(".map-legend")).toContainText("Green, good: 70 % of the time or more");
  await expect(page.locator(".map-legend")).toContainText("Red, poor: under 25 % of the time");
  // A group opens to its parameters, each with one plain line and its controls.
  await openGroup(page, "Power and heat");
  await expect(page.locator(".param")).toHaveCount(3);
  await expect(page.locator(".param", { hasText: "Sunlight" })).toContainText("How much of the time the Sun is up");
  await page.getByRole("radio", { name: "Sunlight: high importance" }).check();
  await expect(page).toHaveURL(/&pick=sunlight,darkness&imp=sunlight:high$/);
  // Flip: temperature can be turned round (prefer colder), sunlight cannot.
  await page.getByRole("checkbox", { name: /^Temperature/ }).check();
  await expect(page.getByRole("radio", { name: /^Sunlight: prefer/ })).toHaveCount(0);
  const best = async () => (await page.locator(".landing-head").innerText()).match(/zone (\d+), score (\d+)/)!.slice(1).join(":");
  const warm = await best();
  await page.getByRole("radio", { name: "Temperature: prefer less (colder)" }).check();
  await expect(page).toHaveURL(/&flip=temperature$/);
  expect(await best()).not.toBe(warm);
  // One parameter alone on the map, with its own opacity. Opacity never changes the answer.
  await page.locator(".param", { hasText: "Temperature" }).getByRole("button", { name: "Show alone on the map" }).click();
  await expect(page.locator(".map-legend")).toContainText("Temperature alone");
  await expect(page.locator(".map-legend")).toContainText("Green, good: under 110 K"); // flipped: cold is green
  const before = await best();
  await page.getByRole("slider", { name: "Temperature opacity" }).fill("30");
  await page.getByRole("slider", { name: "NASA safety limits opacity" }).fill("0");
  expect(await best()).toBe(before);
  await page.locator(".map-legend").getByRole("button", { name: "Back to the combined map" }).click();
  await expect(page.locator(".map-legend")).toContainText("Combined score of Sunlight + Temperature");
  // A group tick is all its parameters.
  await page.getByRole("checkbox", { name: "Ice and science", exact: true }).check();
  await expect(page).toHaveURL(/&pick=sunlight,shadow,temperature,ice,darkness&imp=sunlight:high&flip=temperature$/);
  // The published ranking is one click away and reproduces zones.csv: zone 3 is rank 3.
  await page.getByRole("button", { name: "NASA-style balance", exact: true }).click();
  await side(page, "Best zones");
  await expect(page.locator(".ranked tbody tr")).toHaveCount(10);
  await expect(page.locator(".ranked tbody tr").nth(2)).toContainText(/^3\s*3/);
  await page.locator("details", { hasText: "Where the nine Artemis candidate points rank" }).locator("summary").click();
  await expect(page.getByRole("row", { name: /Malapert Massif/ }).last()).toContainText("32 (65)");
  // Nothing ticked is allowed, and says so.
  await side(page, "Layers");
  await page.getByRole("button", { name: "Everything", exact: true }).click();
  for (const g of ["Safe ground", "Power and heat", "Radio link", "Ice and science"]) await page.getByRole("checkbox", { name: g, exact: true }).uncheck();
  await expect(page.locator(".map-legend")).toContainText("NASA safety limits only");
  await side(page, "Best zones");
  await expect(page.locator(".zones-list")).toContainText("Nothing is ticked");
  expect(errors).toEqual([]);
});

test("Map: click a spot for its numbers, zoom and pan, then go on to its sky, landing days, comparison and 3D", async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  const map = page.locator(".map-view");
  const box = (await map.boundingBox())!;
  // Unsafe ground near Haworth's floor: red, hatched, and it says which NASA limits fail.
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.36 } });
  await expect(page.getByRole("heading", { name: /^\d+\.\d{3}° S, \d+\.\d{3}° [EW]$/ })).toBeVisible();
  await expect(page.locator(".verdict-line")).toContainText("Unsafe");
  await expect(page.locator(".fails")).toContainText(/Fails \d? ?(a )?NASA limits?: .*(landing slope under 10°|sunlight for the whole stay)/);
  await expect(page.locator(".measure tbody tr")).toHaveCount(8);
  await expect(page.locator(".spot")).toContainText("How sure is this?");
  await expect(page).toHaveURL(/&spot=-\d+\.\d+,-?\d+(\.\d+)?$/);
  // The best zone: its own numbers, what is good and weak, and the four next steps.
  await page.locator(".landing-head").getByRole("button", { name: /^zone \d+$/ }).click();
  await expect(page.locator(".spot .sub").first()).toContainText(/Zone \d+: rank 1 of 5,297/);
  await expect(page.locator(".verdict-line")).toContainText(/Good\s*score\s*\d+\s*of 100/);
  await expect(page.locator(".measure tbody tr")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Good here" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weak here" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stand here in 3D / VR" })).toHaveAttribute("href", /^\/xr\/\?site=\w+&t=.*&lat=-\d+\.\d+&lon=-?\d+\.\d+$/);
  // Zoom with the buttons and the wheel, pan by dragging: the labels move, minor names appear, nothing breaks.
  const scale = page.locator(".map-scale");
  const whole = await scale.innerText();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await map.hover({ position: { x: box.width * 0.5, y: box.height * 0.3 } });
  await page.mouse.wheel(0, -600);
  await expect(scale).not.toHaveText(whole);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".verdict-line")).toContainText("Good"); // a drag is not a click: the spot stays
  await page.getByRole("button", { name: "Show the whole region" }).click();
  await expect(scale).toHaveText(whole);
  // Colour-blind palette keeps the words.
  await page.getByLabel("Colour-blind palette").check();
  await expect(page.locator(".map-legend")).toContainText("Yellow, good");
  await expect(page.locator(".map-legend")).toContainText("Dark blue, poor");
  await page.getByLabel("Colour-blind palette").uncheck();
  // On to the site pages, and back.
  await page.getByRole("button", { name: "See its sky" }).click();
  await expect(page.getByRole("tab", { name: "Site sky", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("svg.sky")).toBeVisible();
  await page.getByRole("button", { name: "Back to the map" }).click();
  await expect(page.locator(".verdict-line")).toContainText("Good");
  await page.getByRole("button", { name: "Find landing days" }).first().click();
  await expect(page.getByRole("tab", { name: "Window finder", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await page.getByLabel("Compare with another site").selectOption("hw02");
  await expect(page.getByRole("tab", { name: "Compare", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Compare with")).toHaveValue("hw02");
  // Compare also judges both as landing sites, by the same rules as the map, and says which is better for what.
  await expect(page.getByRole("heading", { name: "As landing sites, for what you ticked on the map" })).toBeVisible();
  await expect(page.locator(".compare.criteria tbody tr")).toHaveCount(11);
  await expect(page.locator(".compare.criteria .overall")).toContainText(/(Good|Acceptable|Poor), score \d+|Unsafe: fails/);
  await expect(page.locator(".reasons-line")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("the view lives in the URL: a shared link opens the same view and survives a reload", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?site=hw02&compare=nr107&date=2027-03-14&days=14&tab=compare&preset=ice");
  await expect(page.getByRole("tab", { name: "Compare", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Landing site")).toHaveValue("hw02");
  await expect(page.getByLabel("Compare with")).toHaveValue("nr107");
  await expect(page.getByLabel("Landing date (UTC)")).toHaveValue("2027-03-14");
  await expect(page.getByLabel("Mission length")).toHaveValue("14");
  // The map's preset travels too.
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ice science", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/site=hw02&compare=nr107&date=2027-03-14&days=14&tab=map&preset=ice$/);
  // Changing the view rewrites the address; a reload brings the same view back.
  await page.getByRole("button", { name: "Power first", exact: true }).click();
  await expect(page).toHaveURL(/&tab=map&preset=power$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Map", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Power first", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Hand-set ticks travel as pick=...; the old tab name and an old link with exact weights still open; nonsense is ignored.
  await openGroup(page, "Ice and science");
  await page.getByRole("checkbox", { name: /^Ice depth/ }).check();
  await expect(page).toHaveURL(/&tab=map&pick=sunlight,ice,darkness$/);
  await page.goto("/?tab=land&w=42,28,28,21,14,7,0,0,30,30");
  await expect(page.getByRole("tab", { name: "Map", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "NASA-style balance", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/?tab=land&w=80,15,20,10,5,10,0,0,60,0");
  await expect(page.getByText("This link carries its own exact weights.")).toBeVisible();
  // A shared spot opens selected, with its panel.
  await page.goto("/?tab=map&pick=sunlight&spot=-84.0173,23.4217");
  await expect(page.getByRole("heading", { name: "84.017° S, 23.422° E" })).toBeVisible();
  await expect(page.locator(".map-legend")).toContainText("Sunlight alone");
  await page.goto("/?site=nope&tab=evil&days=0&date=1999-01-01&preset=%3Cb%3E&spot=999,1");
  await expect(page.getByRole("tab", { name: "Map", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Site sky", exact: true }).click();
  await expect(page.getByLabel("Landing site")).toHaveValue("mma01");
  expect(errors).toEqual([]);
});
