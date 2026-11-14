# The VR view (xr/): handover for Ahmed

A game-like simulation where every number is real data: start at the whole Moon, come down to the south pole,
choose an Artemis site or a ranked zone, fly there, see 1:1
terrain about 30 km around it with the traffic-light map, choose the exact landing point, then stand there 2 m above the
ground and watch the real Sun and Earth move over the real skyline. Works on a laptop and in a Meta Quest 3.
Live at `/xr/` on the project site; the website can embed it with `/xr/?site=<id>&t=<ISO time>&embed=1`.

## Run it

| What | Command | Notes |
|------|---------|-------|
| Install | `make setup` | installs web/ and xr/ |
| Dev server + Quest 3 emulator | `make xr-dev` | https://localhost:8081 in a managed Chromium window; the "Runtime / Editor" toolbar and the "Enter XR" button are the dev server's own tools and are never in a production build |
| Tests | `make test` | includes `xr/src/*.test.ts` (frames and shadows, guide, automatic quality) |
| Production build | `make build && make xr` | writes `web/dist/xr/`, which Vercel serves at `/xr/` |

The app reads the published data at `/data/` (the files in `web/public/data/`). In dev, `xr/vite.config.ts` serves
that folder at the same URL; nothing is copied. It imports `web/src/lib/analysis` directly (`computeSeries`,
`computeMetrics`, `demHorizon`): there is one copy of the maths.

Driving the emulator from Claude Code or a shell, with the dev server running (from `xr/`):
`npx @iwsdk/cli xr enter --input-json '{}'`, `npx @iwsdk/cli browser screenshot --output-file shot.png`,
`npx @iwsdk/cli xr look-at ...`, `npx @iwsdk/cli xr select ...`. `xr/AGENTS.md` and `xr/.claude/skills/` (written
by the IWSDK scaffolder) explain the rest. If you start Claude Code inside `xr/`, the same tools load as MCP servers.

URL parameters: `site` (a site id with terrain, e.g. `mma01`), `zone` (a zone's published rank, e.g. `1`), `lat` and `lon` (any point within 10 degrees of the pole, as the website's map sends),
`t` (UTC start of the 30-day window, e.g. `2026-11-24T00:00Z`), `demo=1` (opens Orbit;
kept for old links), `embed=1` (hides the title box), `detail=high|medium|low` (the headset's detail level on the laptop view, for
measuring: see "Frame rate"). Without `t`, Orbit shows now, and a site or zone opens at the next hour at
which the whole Sun is above its skyline (`nextSunUp` in `guide.ts`, a search with `computeSeries`).

## File map (xr/src)

| File | What it does | Change it when |
|------|--------------|----------------|
| `index.ts` | Creates the IWSDK world and registers the one system. | never, normally |
| `experience.ts` | The whole flow: Orbit, flight, Land, Stand; laptop camera and mouse; VR ray, pinch, thumbstick; builds the models for the HUD and the VR panel. Constants at the top: window length, globe scale, raised-view height, enlarge factor. | behaviour, modes, input |
| `terrain.ts` | Terrain material (lighting, heat-map ramps, palette), the GPU shadow pass, mesh builder, the depth scheme. | look of the ground, heat-map colours, shadow quality |
| `geo.ts` | Frames: MOON_ME to the scene, fields of true 3D positions (curvature included), picking a ground point, CPU copy of the shadow test. Tested. | never, unless the maths is wrong |
| `data.ts` | Loaders for everything in `/data/`, including optional files (zones, missions, score, layers, presets, criteria); `tileFromPole` cuts a tile from the south-pole grid for a zone no site tile covers. | a data file changes shape |
| `guide.ts` | What the view says and ranks: demo start time, "Why here?" lines, the layer panel (what the map shows, its legend, the ranking, the sentence under it), the tour's four captions. Only calls `explain.ts`, `suitability.ts` and `computeSeries`. Tested. | tour text, a new preset or criterion |
| `moon.ts` | The whole-Moon view as pure maths: the pole frame, the globe's mesh and heights, the cap's edge, the compass, the zoom from the whole Moon to the pole. Tested. | zoom, compass, cap edge |
| `globe.ts` | Loads the CGI Moon Kit maps (2K in a headset, 4K elsewhere), the globe's material, the fade between scenes. | the globe's look |
| `perf.ts` | Automatic quality in the headset: the three detail levels and the rule that lowers them. Tested. | frame rate on the Quest |
| `objects.ts` | Lander, rocket, Sun disc, Earth, stars, labels, sight lines, markers. | models and labels |
| `hud.ts` | Laptop interface (plain DOM and CSS, Earthrise tokens, the website's "mission chart" look: sentence case, choices as words with a line under the one in use, one filled button for the main action, traffic-light colours only for suitability) and the credits line. | laptop UI text and layout |
| `vrpanel.ts` | The floating panel in VR (a canvas on a plane; buttons are rectangles hit by the app's own ray). | VR UI |

`iwsdk.config.json` holds the WebXR settings (VR, hand tracking, emulator device). `public/scenes/` is an empty
IWSDK scene: everything is generated from data at run time.

## How it stays real

- Scene frame: tangent to the 1737.4 km sphere at the centre of the terrain grid, axes along the grid
  (+X = grid +x, +Y = up, -Z = grid +y). Every vertex is at its true 3D position, so the Moon's curvature is in the
  scene (265 m of drop at 30 km) and the far ridges sit where the horizon maths says.
- Terrain: `terrain/sites/<id>/height.u16` (120 m, about 61 km across) plus `far.u16` (600 m, about 307 km across).
- Shadows: for each terrain pixel the GPU marches the height field towards the Sun and stores the visible fraction
  of the solar disc (docs/SCIENCE.md sections 3 and 4). `geo.test.ts` checks the same march on the CPU against
  `demHorizon + computeSeries` at Malapert: mean 0.025 deg, max 0.664 deg, 0 of 286 times disagree on lit or dark.
- The whole Moon (Orbit): three pieces of the same ground, each fading into the next.
  - Within 6.5 deg of the pole: our own 430 m LOLA grid (`terrain/south_pole_height.u16`), cut to a round cap, at
    its true 3D positions on the sphere, with the GPU shadow march.
  - Out to 35 deg from the pole: LOLA heights of NASA's CGI Moon Kit on a polar stereographic grid (2.14 km per
    pixel), also with the shadow march. Mountains outside our grid cast their shadows into it. The march runs in
    the grid's plane, so at the outer edge of this ring distances are stretched by up to 10 %: display only.
  - The rest: a sphere raised by the kit's LOLA heights, coloured by the kit's LROC WAC colour map and shaded by
    slopes derived from LOLA, with the same Sun direction and display curve. No cast shadows there.
  - The ground colour of all three is the LROC colour map. The traffic-light map is drawn over the cap only, out
    to the 84 S circle, with the opacity the user chooses.
  - Source: NASA's Scientific Visualization Studio, CGI Moon Kit (https://svs.gsfc.nasa.gov/4720), public domain.
    `scripts/export_moon_globe.py` writes `xr/public/moon/` (7 MB) and checks the kit's heights against our grid:
    on the 86 S circle the mean difference is 5.7 m and the rms 135 m (the kit is 1.9 km per pixel, ours 430 m).
    No number shown in the app is computed from the kit: it is the picture of the Moon, not the analysis.
- Zoom: 0 is the whole Moon, 1.3 m across, with the south pole tipped 78 deg towards the viewer and the Earth
  side (0 deg E) up; 1 is the pole lying in front of the viewer, the 440 km cap 1.6 m across. The Sun, the Earth
  and the stars turn with the Moon, so the lighting is the same at every zoom. Picking a site from further out
  first comes down to the pole, then flies; during the flight the view closes in on the site four times; every
  change of scene (Orbit, Land, Stand) fades through black in 0.6 s.
- Compass on the pole: a ring at the pole labelled "South Pole", an arrow along 0 deg E labelled "towards Earth",
  and the parallels of 84, 86 and 88 deg S, all drawn on the terrain.
- Past landings are marked over the whole Moon at their real coordinates; sites, zones and the latitude rings
  appear from zoom 0.55.
- Sun and Earth in the sky: azimuth and elevation from `computeSeries` at the chosen point (Earth with parallax),
  drawn at their real angular size (Sun from the ephemeris, about 0.53 deg; Earth from its distance, about 1.9 deg).
  "Enlarge" multiplies both by 5 and says so.
- Landing-point panel: "NASA map" = the PGDA pixel under the point; "Our model" = `demHorizon` at that exact point
  (2 m observer) + `computeSeries` + `computeMetrics` over the 30-day window.
- "Why here?": the sentences of `web/src/lib/analysis/explain.ts`. For a zone or a site's own point the values are
  the row of `zones.csv` or `suitability/site_values.csv`; for any other landing point they are what is known
  there: latitude, the NASA sunlight and Earth pixels, the landing slope (the formula of `engine/criteria.py` on
  the tile's heights; within 0.105 deg of zones.csv at 235 zones) and the longest darkness and time without Earth
  from `computeSeries` over the whole ephemeris (at Malapert: 404 h and 0 h, the same as site_values.csv).
- "What matters for your mission?": the website's layer panel, on the same shared code
  (`web/src/lib/analysis/rag.ts`, `suitability.ts`, `paint.ts`), so the VR and the website's map cannot disagree.
  - Presets, the locked "NASA safety limits" row, and the four groups (Safe ground, Power and heat, Radio link, Ice
    and science). A group's tick ticks all its parameters; a group opens to its parameters and closes again (one
    open at a time). A ticked parameter has its direction where it can be turned round ("Prefer colder"), its
    importance (low, normal, high) and "Show alone on the map".
  - The map is traffic lights (`classGrid`): green good, amber acceptable, red poor for what is shown; ground that
    fails a NASA limit is red and hatched (never colour alone); grey is no data. One parameter alone uses its own
    ranges; several use the combined score (green from 70, amber from 40). The legend uses the website's words
    (`guide.test.ts` checks them against `LandingMap.tsx`) and the real-unit ranges of `rag.ts`.
  - Colours are painted by the website's `paintClasses`. "Map opacity", "Unsafe ground" opacity and the
    colour-blind palette only change the picture, never a class or a score (tested). The map follows the layers
    and nothing else; standing on the surface shows bare ground.
  - Zones are ranked with `rankZonesFor` (weights and turned-round directions); the rings and the top-10 list carry
    each zone's class. Parameters known only at the zones ("Short nights", "Never out of contact") re-rank the
    zones and do not colour the map.
  - "Why here?" shows the ticked parameters plus every NASA hard limit (`explainFor`), with a turned-round
    direction read the other way. For a point that is not a zone or a site, the values are those of its map cell
    (`cellValues`), with our model's longest night and longest time without Earth at that exact point.
  - In VR the panel has short pages: the main page (tour, whole Moon or south pole, the two opacities, the legend
    with its marks), "Layers", "Best zones", "Landing sites", "Why here?". Buttons are 5 cm high on the 82 cm
    panel; text is 21 to 32 px of the 1024 px canvas (1.7 to 2.6 cm), the credits 18 px.
  - `?preset=<key>`, or `?pick=sunlight,earth` with `flip=temperature` and `imp=sunlight:high`, open with that
    choice (the website's own parameters).
  - "Score for what is ticked" in the landing-point panel is the map score of that cell with its class; a zone's
    score also counts its longest darkness and time without Earth, so the two differ.
- Tour: four stops, each waiting for "Next". It ticks "Everything" when it starts. Every number in a caption is
  computed when the stop opens: the Sun's highest elevation at the pole from the ephemeris, the passing area from
  `summary.json`, the best zone and its "Why here?" lines, the Sun's path over the two days that stop 4 plays.
- Stars: `stars.json`, Yale Bright Star Catalogue rotated by the Moon's real orientation.
- Display choices that are not data (say so if asked): terrain colour #A39888; brightness curve
  `1 - exp(-11 * lit)` because true Lambert at 1 to 6 deg of Sun is nearly black; a faint slope-shaded fill (6 %) so
  unlit ground is not pure black; the lander and rocket models; in Orbit the relief is 1.6 m across with the Earth
  at its true distance and size on the same scale.

## 60-second stage demo (it follows the tour)

Open `/xr/?demo=1` on the laptop (or put on the Quest and press "Enter VR"), then "Tour: 4 stops". The captions on
screen carry the numbers; say the line, press "Next".

| Time | Screen | Say |
|------|--------|-----|
| 0:00 | The whole Moon, south pole towards you | "This is the Moon as NASA's Lunar Reconnaissance Orbiter mapped it. The south pole is where Artemis lands." Press "Tour". |
| 0:06 | Stop 1: the view comes down to the pole, no map | "The Sun never climbs more than 1.6 degrees here, so every hill throws a shadow kilometres long. Power and darkness are decided by the skyline." |
| 0:20 | Stop 2: the traffic-light map | "We tested every 120 metre square against NASA's Artemis III limits. 14.3 % passes: 14,928 square kilometres, in 5,297 zones. Hatched red fails a limit; green, amber and red score the rest." |
| 0:32 | Stop 3: flight to the best zone | "This is the best zone with everything ticked, score 76 of 100. Every line is a criterion with its value and verdict. Tick only what matters to you and the ranking changes live." |
| 0:46 | Stop 4: standing there | "Now we stand on it, eyes 2 metres up, at true scale. Two days pass: the Sun slides about 24 degrees round the horizon, the shadows sweep, and Earth stays in view for the radio link." |
| 0:58 | "Finish" | "Real terrain, real Sun, real Earth: choose where to land before you fly." |

The numbers in the "Say" column are the ones the captions showed on 14 Nov 2026; read them off the screen if the
data has been rebuilt. The tour always runs with "Everything" ticked; stop 4's Sun heights change with the date.

## Footage

`node scripts/record_footage.mjs` records `media/vr-tour.webm` (the tour on the laptop view, 56 s) and
`media/web-30s.webm` (Malapert Overview, Window Finder, Where to land, then the VR; 32 s) at 1920 x 1080 from the
production build; the header of the script says how to serve it. No cursor is drawn, no sound.

## Frame rate

Budget: 72 fps, 13.9 ms per frame. What can be measured without the headset is the laptop view of the production
build in headless Chromium on the build machine (Apple GPU), vertical sync off, at the Quest 3's pixel count
(3360 x 1760), reading the "Stats" line (mean of 72 frames, and the longest frame of five such windows). The Quest's
GPU is much slower than this machine's, so these numbers show what the whole Moon added, not what the headset does.
"Before" is the build without the whole Moon (commit b47b75f); "headset detail" is `?detail=high`, the level the
headset starts at.

| Mode | Before, ms | After, ms | After, longest frame, ms | Before, headset detail, ms | After, headset detail, ms | After, headset detail, longest, ms |
|------|-----------:|----------:|-------------------------:|---------------------------:|--------------------------:|-----------------------------------:|
| Whole Moon | none | 3.1 | 4.4 | none | 2.9 | 4.3 |
| Orbit at the pole | 4.6 | 4.1 | 5.3 | 3.5 | 3.4 | 5.1 |
| Orbit at the pole, time running | 8.3 | 9.3 | 12.3 | 4.3 | 4.1 | 7.0 |
| Land | 4.7 | 3.9 | 5.4 | 4.0 | 3.4 | 5.8 |
| Stand | 3.8 | 3.2 | 4.8 | 3.5 | 3.3 | 6.2 |
| Stand, time running | 6.1 | 5.7 | 7.1 | 4.1 | 4.2 | 13.9 |

"After" is the build with the whole Moon and the traffic-light map. Run to run the means move by about 0.5 ms, and
a single long frame (up to 39 ms once, in Stand with time running) turned up in some runs and not in others.
Triangles drawn per frame at headset detail: 59,674 (whole Moon), 186,144 (pole), 166,874 (Land).

What keeps the whole Moon cheap in the headset: 2K maps and a 128 x 64 globe (4K and 384 x 192 on a laptop); from
the whole-Moon view the cap uses a quarter of its mesh and half its shadow map; the ring round the cap reads its
light from its shadow pass (one texture read per screen pixel) and that pass runs once in four while time runs.
If frames still run long on the headset, the automatic quality lowers the detail (step 4 of the Quest test).
`window.lunarStats()` in the browser console returns the same numbers plus draw calls and triangles.

## Known issues

- Tested once on a real Quest 3 (14 Nov 2026, before the whole Moon was added): smooth. The whole-Moon view has
  only run in the IWSDK emulator and on a laptop; its frame rate on the headset is unmeasured (see "Frame rate").
- A zone further than 29 km from every site's centre has no 120 m tile. It opens on a tile interpolated from the
  ~430 m south-pole grid (heights within 0.5 m of that grid), with the NASA maps at their own pixels, no slope
  map, and a note on screen. The list marks these zones "430 m terrain".
- Tour stop 4 plays 2 days at 4 hours per second and repeats. The speed buttons mean hours per second (1x = 1 hour
  per second), so "100x" would show the 2 days in half a second.
- Goldilocks zones are drawn as rings with the zone's area around its best cell (zones.geojson holds points, not
  outlines); the true shapes are what the map shows (ground that passes every hard limit is the part that is
  not hatched). Orbit rings the best 40 zones and lists the best 10, for what is ticked.
- Zones, the score layer and past landings are optional files: if one is missing its feature is hidden, nothing breaks.
- Ordinary objects (lander, markers, lines, panel, controllers) always draw in front of terrain, because terrain
  and sky use their own logarithmic depth range (see the comment in `terrain.ts`). From far away the lander can
  show through a ridge.
- At 2 m the ground is one bilinear 120 m facet: there is no small-scale relief in the LOLA 120 m product.
- The reference concept `xr/reference/ahmed_concept.html` was not available on the build machine, so the lander is
  a plain procedural model, not Ahmed's.
- Labels in Orbit hide when they overlap; hover or zoom to see them all.

## Test on the Quest 3

1. In the Quest Browser open the deployed site at `/xr/` and press "Enter VR", the only VR button on the page.
2. Do not test or demo from the dev server (`make xr-dev`, port 8081): it adds the IWSDK "Runtime / Editor"
   toolbar over "Stats" and "Enter VR", and a second "Enter XR" button. To try unmerged work on the headset, serve
   a production build instead: `make build && make xr && cd web && npx vite preview --host`.
3. Check: (a) the whole Moon in front of you and the panel on your left; "South pole" on the panel, or the
   thumbstick pushed forward, brings the pole down in front of you like a table, and "Whole Moon" or the
   thumbstick pulled back goes out again; (b) point at a site marker or a name and pull
   the trigger, or pinch with a bare hand; (c) in Land you stand 2 km above the point: aim at the ground, trigger
   to move the landing point; (d) A or X, or "Stand here": you are on the surface, eyes 2 m up; (e) thumbstick
   left or right scrubs time, or pinch and drag on the time bar; (f) "Enlarge 5x", "Layers" (open a group, tick, "Prefer", "Importance", "Alone"), the two opacity rows, Play at 1x, 10x, 100x.
4. Frame rate: press "Stats" on the panel. It shows frames per second, milliseconds per frame (mean of the last
   72 frames), the longest single frame of those 72, and the detail level. Read it in each mode: whole Moon,
   south pole, south pole with Play at 10x, Land, Stand, Stand with Play at 10x. Target 72 fps (13.9 ms). In the headset detail is automatic: when the mean
   frame time of a second is over 13.9 ms by more than 5 %, terrain and shadow detail drop one level (high, medium,
   low) and stay there until you leave VR. The levels are the `LEVELS` table in `xr/src/perf.ts`.
5. "Tour: 4 stops" on the panel: read each caption, press "Next" (during the flight "Next" waits).
6. Over USB with automation: the `iwsdk-native-xr-test` skill in `xr/.claude/skills/`.
