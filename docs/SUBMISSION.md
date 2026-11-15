# NASA Space Apps submission draft (ready to paste)

Every number below is in docs/PITCH_NUMBERS.md or docs/VALIDATION.md. Check the word limits of the form before
pasting; the summary is 98 words.

## Project name

Claude's P.L.A.N: Lunar Landing Site Navigator

## High-level summary (under 100 words)

At the Moon's south pole the Sun never rises more than a few degrees, so a single ridge decides whether a lander
has power and a radio link to Earth. Our web app uses NASA's LOLA terrain and JPL's ephemeris to show, for any site
and hour from 2026 to 2029, whether the Sun and Earth are above the real skyline. It compares sites, shows what a
launch slip costs, finds the days a mission can land, tests the whole polar region against NASA's Artemis III
requirements, and lets you stand on the Moon in 3D or VR.

## Final project link

- Live app: https://claudes-plan-lunar-navigator.vercel.app
- 3D / VR view: https://claudes-plan-lunar-navigator.vercel.app/xr/
- Code, data and documentation: https://github.com/eugeniobusta/lunar-navigator

## Detailed project description

**What it does.** Claude's P.L.A.N: Lunar Landing Site Navigator (P.L.A.N for Polar Lunar Augmented Navigation)
has one site with two views, switched in the menu bar: Simple ("Explore a site" and "Plan a landing", in plain
steps, for a first visit) and Detailed (one page per tool, listed below). Both use the same data, map and scoring.
It answers the two questions a south-pole lander lives or dies by:
will it have sunlight for power, and will it see Earth for a direct radio link?

- **Overview.** Pick a landing site and a date. The whole horizon is unrolled into one chart with the real
  skyline, the Sun's path and Earth's wobble, and one sentence says what the numbers mean for a lander.
- **Compare sites and slip the launch.** At Nobile Rim 1 a 10-day stay starting on 9 January 2027 has 100 %
  sunlight. Land 14 days later and it has 12.5 %.
- **Window Finder.** Describe the mission and get every landing day that works. A 14-day mission at Malapert Massif
  (at least 70 % sunlight, 50 % Earth in view, no night longer than 48 hours) can land on 32 of the next 365 days,
  in 13 short clusters at most 3 days long.
- **Site Finder (the landing map).** Every 120 m square within 6 degrees of the pole is tested against NASA's
  Artemis III landing requirements, drawn over shaded relief with the craters named. 14.3 % of the ground passes
  all of them (14,928 of 104,184 km2), in 5,297 "Goldilocks zones", ranked by a 0 to 100 score. The map shows
  three classes: green good, amber acceptable, red poor; ground that fails a NASA limit is hatched red and says
  which limit. Tick boxes in four groups say what matters for the mission (or pick Power first, Radio link, Ice
  science); five parameters can be turned round (prefer colder ground, for ice). Click any spot for its
  measurements, what is good and weak there, how sure the numbers are, and what to do next.

**How it works.** A Python pipeline computes, once, the position of the Sun and Earth as seen from the Moon for
every hour (Skyfield with JPL's DE421 ephemeris), and for each site the terrain skyline: from NASA's LOLA elevation
map we look outward in 720 directions, up to 150 km, and keep the highest angle the ground reaches, allowing for the
Moon's curvature. The browser combines the two: the Sun or Earth is "up" when its centre is above the skyline.
Percentages, longest nights, landing windows and battery charge all follow from that. Everything is computed in
the browser from static files; there is no server-side computation.

**How we know it is right.** Our Sun and Earth positions differ from JPL Horizons by at most 0.0007 degrees
(3 sites, 20 times each). Our long-run sunlight differs from NASA's published illumination maps by at most 3.5
percentage points and Earth visibility by at most 4.3, over the nine Artemis candidate sites. The browser's maths
matches the Python reference to 0.00022 degrees.

**What we found.**
- Sunlight (56 % of the ground), Earth visibility (49 %) and slope (46 %) each rule out about half of the polar
  region; together they leave 14.3 %.
- A few hundred metres matter: near Malapert Massif, sunlight over 2027 ranges from 0 % to 56 % within 2.5 km.
- Two weeks matter: the launch-slip example above.
- Our filter does not simply rediscover NASA's nine candidate regions: 1 of our top 20 zones is near one. But 6 of
  the 9 candidate points pass every limit, and 8 of the 9 have a passing zone within 12.5 km. Which region is best
  depends on the mission: among 4,224 confirmed zones, Malapert Massif ranks 1st for the radio link (Earth always
  in view), and Mons Mouton 29th for power.
- An honest limit: the spot where the IM-2 lander came down in 2025 passes every one of our limits on a 120 m map.
  It fell into a crater 20 m across. Passing means "worth a closer look with finer data", not "safe to land".

**Benefits.** Mission planners, students and the public can see in seconds what otherwise takes an illumination
study: which sites work, when, and why. Everything is explained in plain words, works on a phone, and can be
shared as a link that reopens the exact view.

**Goals.** Make the south pole's strange lighting understandable; give Artemis-era and commercial lander teams a
quick first filter for sites and dates; publish every intermediate result so others can check it and build on it.

**Tools, languages and hardware.** Python 3 (Skyfield, NumPy, rasterio, pyproj, pytest), TypeScript, React, Vite,
d3, zustand, vitest, Playwright, the Immersive Web SDK with three.js for the VR view, GitHub Actions, Vercel.
A Meta Quest 3 for VR. Formulas are in docs/SCIENCE.md, the criteria in docs/criteria.md.

## NASA data used, and how

| NASA data | How we used it |
|-----------|----------------|
| **LRO LOLA elevation map LDEM_75S_120M** (PDS Geosciences Node) | The terrain: the skyline around every site, slopes for the landing and walking limits, and the 3D ground. |
| **NASA Goddard PGDA lunar polar illumination and Earth visibility maps** (product 69, AVGVISIB_75S_120M_201608) | The long-run sunlight and Earth-in-view layers of Site Finder, the permanent shadows, and an independent check of our own model (within 3.5 and 4.3 percentage points). |
| **JPL DE421 ephemeris and NAIF lunar orientation and frame kernels** (de421.bsp, moon_pa_de421_1900-2050.bpc, moon_080317.tf, pck00008.tpc) | The position of the Sun and Earth as seen from the Moon, every hour from November 2026 to December 2029. |
| **JPL Horizons API** | An independent check of those positions (largest difference 0.0007 degrees). |
| **LRO Diviner Polar Resource Product** (PDS Geosciences Node) | Mean ground temperature and the depth at which water ice is stable, two of the soft criteria. |
| **NASA "Artemis Human Landing System Update" (2024), NTRS 20240009596** | The six hard limits of Site Finder: within 6 degrees of the pole, landing slope under 10 degrees, EVA slope under 20 degrees within 2 km, direct communication with Earth, lit for the surface stay, 100 m x 100 m accuracy. |
| **NASA NSSDCA "Lunar Artifact Impacts and Landings"** | Positions and outcomes of the 41 lunar landing attempts in our lessons table. |
| **NASA releases on the Artemis III candidate regions** (19 Aug 2022, 28 Oct 2024) | The 6.5-day stay and the names of the nine regions. |

The challenge resources NASA Quickmap, Moon Trek and JPL Horizons are listed, with what we took from each, in
docs/PARAMETERS.md.

## Space Agency Partner and other data, tools and resources

**Other data**
- Wueller et al. 2026, "Assessing Potential Landing Sites With Favorable Illumination and Accessible, Potentially
  Volatile-Rich Permanently Shadowed Regions Within Artemis Candidate Landing Regions", JGR Planets,
  doi:10.1029/2025JE009434 (CC BY 4.0), and its Zenodo data set (record 17084058): the coordinates of the nine
  Artemis candidate points, which we verified against the paper's Table A1.
- Mazarico et al. 2011, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030: the method behind the PGDA
  illumination maps.
- Williams et al. 2019, JGR Planets, doi:10.1029/2019JE006028: the 110 K cold-trap temperature.
- Yale Bright Star Catalogue (BSC5, via github.com/brettonw/YaleBrightStarCatalog): the stars in the VR sky.
- Mission sources for individual landing attempts are linked row by row in `missions.csv`.
- No Space Agency Partner data was used.

**Software and services**
- Python: Skyfield, NumPy, rasterio, pyproj, requests, pytest, ruff, uv.
- Web: React 18, TypeScript, Vite, d3, zustand, vitest, Playwright, ESLint; fonts Barlow and Barlow Semi Condensed
  (Google Fonts).
- VR: Immersive Web SDK (IWSDK) 1.1.0, three.js, pmndrs uikit.
- GitHub and GitHub Actions for code and tests; Vercel for hosting.

**Team concept.** The idea of standing on the Moon in VR and choosing the exact landing point comes from our
teammate Ahmed's concept for the 3D view; the map's "Stand here in 3D / VR" and `/xr/` build on it.

**Licences.** Our code is MIT; the data we derived is CC BY 4.0; NASA and JPL source data keeps its providers'
terms (DATA_LICENSE.md quotes each one). The NASA insignia is not used. This is not an official NASA product.

## Use of Artificial Intelligence

**Tools.** AI coding assistants: Claude Code (Anthropic) with Claude Fable 5.2 and Claude Opus 5.5, and OpenAI
Codex.

**What they did.** They wrote most of the code (the Python data pipeline, the web app, the VR view), the tests,
the visual design and the documentation, working from prompts and reviews by the team. Research runs with web
search collected the sources for the landing criteria, the list of past lunar landings and the check of the
Artemis coordinates.

**AI-generated audio.** The narrator of the 3D / VR view is an AI voice: ElevenLabs (voice "Dan", model
`eleven_multilingual_v2`), 17 short clips generated ahead of time; the app only plays the files, and the text of
every clip is in docs/NARRATION.md. The VR view says so on screen ("Voice: AI-generated with ElevenLabs"). The
three videos in `media/` (submission-30s, pitch-3min, pitch-2min) are silent screen recordings with no narration.

**AI-generated images and video.** None in the app or in those videos. The pitch deck lists two more AI tools
whose use a teammate still has to confirm (media/REFERENCES.md, items marked CONFIRM). The NASA logo is not used.

**How we checked.**
- Every number in the app and in this text comes from code we ran, not from a model's memory.
- The results are compared with independent NASA and JPL data: positions against JPL Horizons (largest difference
  0.0007 degrees), sunlight and Earth visibility against NASA's PGDA maps (largest differences 3.5 and 4.3
  percentage points).
- Every threshold in the landing criteria carries its source with a quotation; the ones we chose ourselves are
  marked "team choice".
- Every change went through a pull request with automated tests: 57 Python tests, 166 browser-maths tests and 11
  end-to-end browser tests.
- The app, the README and the Data & Method page each state that the project was built with AI assistance.
