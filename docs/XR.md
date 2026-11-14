# The VR view (xr/): handover for Ahmed

A game-like simulation where every number is real data: choose an Artemis site from orbit, fly there, see 1:1
terrain about 30 km around it with heat maps, choose the exact landing point, then stand there 2 m above the
ground and watch the real Sun and Earth move over the real skyline. Works on a laptop and in a Meta Quest 3.
Live at `/xr/` on the project site; the website can embed it with `/xr/?site=<id>&t=<ISO time>&embed=1`.

## Run it

| What | Command | Notes |
|------|---------|-------|
| Install | `make setup` | installs web/ and xr/ |
| Dev server + Quest 3 emulator | `make xr-dev` | https://localhost:8081 in a managed Chromium window; "Enter XR" at the top is the emulator's button and exists only in dev |
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
`t` (UTC start of the 30-day window, e.g. `2026-11-24T00:00Z`), `demo=1` (opens Orbit with the Goldilocks heat map
on), `embed=1` (hides the title box). Without `t`, Orbit shows now, and a site or zone opens at the next hour at
which the whole Sun is above its skyline (`nextSunUp` in `guide.ts`, a search with `computeSeries`).

## File map (xr/src)

| File | What it does | Change it when |
|------|--------------|----------------|
| `index.ts` | Creates the IWSDK world and registers the one system. | never, normally |
| `experience.ts` | The whole flow: Orbit, flight, Land, Stand; laptop camera and mouse; VR ray, pinch, thumbstick; builds the models for the HUD and the VR panel. Constants at the top: window length, globe scale, raised-view height, enlarge factor. | behaviour, modes, input |
| `terrain.ts` | Terrain material (lighting, heat-map ramps, palette), the GPU shadow pass, mesh builder, the depth scheme. | look of the ground, heat-map colours, shadow quality |
| `geo.ts` | Frames: MOON_ME to the scene, fields of true 3D positions (curvature included), picking a ground point, CPU copy of the shadow test. Tested. | never, unless the maths is wrong |
| `data.ts` | Loaders for everything in `/data/`, including optional files (zones, missions, score, layers, presets, criteria); `tileFromPole` cuts a tile from the south-pole grid for a zone no site tile covers. | a data file changes shape |
| `guide.ts` | What the view says and ranks: demo start time, "Why here?" lines, priorities (re-rank, recolour), the tour's four captions. Only calls `explain.ts`, `suitability.ts` and `computeSeries`. Tested. | tour text, a new preset or criterion |
| `perf.ts` | Automatic quality in the headset: the three detail levels and the rule that lowers them. Tested. | frame rate on the Quest |
| `objects.ts` | Lander, rocket, Sun disc, Earth, stars, labels, sight lines, markers. | models and labels |
| `hud.ts` | Laptop interface (plain DOM and CSS, Earthrise tokens) and the credits line. | laptop UI text and layout |
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
- "Your priorities": the presets of `suitability/weights.json`. Choosing one re-ranks all 5,297 zones with
  `rankZones` and recolours the Goldilocks map with `mapScoreGrid` on the published layers; cells that fail a
  hard limit stay uncoloured. "Goldilocks map score" in the landing-point panel is the map score of that cell; a
  zone's score also counts its longest darkness and time without Earth, so the two differ.
- Tour: four stops, each waiting for "Next". Every number in a caption is computed when the stop opens: the Sun's
  highest elevation at the pole from the ephemeris, the passing area from `summary.json`, the best zone and its
  "Why here?" lines under the priorities in use, the Sun's path over the two days that stop 4 plays.
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
| 0:00 | Orbit, Goldilocks map on | "This is the Moon's south pole, built from NASA's laser altimeter. Nothing here is drawn by hand." Press "Tour". |
| 0:08 | Stop 1: the pole, heat map off | "The Sun never climbs more than 1.6 degrees here, so every hill throws a shadow kilometres long. Power and darkness are decided by the skyline." |
| 0:20 | Stop 2: Goldilocks map | "We tested every 120 metre square against NASA's Artemis III limits. 14.3 % passes: 14,928 square kilometres, in 5,297 zones." |
| 0:32 | Stop 3: flight to the best zone | "This is the best zone for balanced priorities, score 77 of 100. Every line is a criterion with its value and verdict. Change the priorities and the ranking changes live." |
| 0:46 | Stop 4: standing there | "Now we stand on it, eyes 2 metres up, at true scale. Two days pass: the Sun slides about 24 degrees round the horizon, the shadows sweep, and Earth stays in view for the radio link." |
| 0:58 | "Finish" | "Real terrain, real Sun, real Earth: choose where to land before you fly." |

The numbers in the "Say" column are the ones the captions showed on 14 Nov 2026; read them off the screen if the
data has been rebuilt. Stop 3's zone and score change with the priorities preset; stop 4's Sun heights with the date.

## Footage

`node scripts/record_footage.mjs` records `media/vr-tour.webm` (the tour on the laptop view, 56 s) and
`media/web-30s.webm` (Malapert Overview, Window Finder, Where to land, then the VR; 32 s) at 1920 x 1080 from the
production build; the header of the script says how to serve it. No cursor is drawn, no sound.

## Known issues

- Not yet tested on a real Quest 3: only in the IWSDK emulator. Frame rate on the headset is unmeasured.
- A zone further than 29 km from every site's centre has no 120 m tile. It opens on a tile interpolated from the
  ~430 m south-pole grid (heights within 0.5 m of that grid), with the NASA maps at their own pixels, no slope
  map, and a note on screen. The list marks these zones "430 m terrain".
- Tour stop 4 plays 2 days at 4 hours per second and repeats. The speed buttons mean hours per second (1x = 1 hour
  per second), so "100x" would show the 2 days in half a second.
- Goldilocks zones are drawn as rings with the zone's area around its best cell (zones.geojson holds points, not
  outlines); the true shapes are what the "Goldilocks score" heat map shows (only cells that pass every hard limit
  are coloured). Orbit rings the best 40 zones and lists the best 10, under the priorities in use.
- Zones, the score layer and past landings are optional files: if one is missing its feature is hidden, nothing breaks.
- Ordinary objects (lander, markers, lines, panel, controllers) always draw in front of terrain, because terrain
  and sky use their own logarithmic depth range (see the comment in `terrain.ts`). From far away the lander can
  show through a ridge.
- At 2 m the ground is one bilinear 120 m facet: there is no small-scale relief in the LOLA 120 m product.
- The reference concept `xr/reference/ahmed_concept.html` was not available on the build machine, so the lander is
  a plain procedural model, not Ahmed's.
- Labels in Orbit hide when they overlap; hover or zoom to see them all.

## Test on the Quest 3

1. Laptop and Quest on the same Wi-Fi. `make xr-dev`, then `cd xr && npx @iwsdk/cli dev status` and read
   `runtimeUrls.network` (for example https://192.168.x.x:8081).
2. In the Quest Browser open that URL, accept the certificate warning, press "Enter VR".
   Or open the deployed site at `/xr/` (HTTPS, no warning).
3. Check: (a) the relief table in Orbit and the panel on your left; (b) point at a site marker or a name and pull
   the trigger, or pinch with a bare hand; (c) in Land you stand 2 km above the point: aim at the ground, trigger
   to move the landing point; (d) A or X, or "Stand here": you are on the surface, eyes 2 m up; (e) thumbstick
   left or right scrubs time, or pinch and drag on the time bar; (f) "Enlarge 5x", heat maps, Play at 1x, 10x, 100x.
4. Frame rate: press "Stats" on the panel. It shows frames per second, milliseconds per frame (mean of the last
   72 frames) and the detail level. Target 72 fps (13.9 ms). In the headset detail is automatic: when the mean
   frame time of a second is over 13.9 ms by more than 5 %, terrain and shadow detail drop one level (high, medium,
   low) and stay there until you leave VR. The levels are the `LEVELS` table in `xr/src/perf.ts`.
5. "Tour: 4 stops" on the panel: read each caption, press "Next" (during the flight "Next" waits).
6. Over USB with automation: the `iwsdk-native-xr-test` skill in `xr/.claude/skills/`.
