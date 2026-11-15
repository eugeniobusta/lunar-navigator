# The VR view (xr/): handover for Ahmed

A short, game-like journey for curious people who are not engineers, where every number is real data. Three
stages, one small panel each, a few large buttons, always one obvious thing to press next:

1. **The whole Moon.** "Start" sets the Sun, the Earth and the Moon in motion.
2. **The south pole.** Six places to land; "Show safe landing colours" lays the green, amber and red map over them.
3. **On the surface.** You stand there at 1:1; "Play" runs the days; point at the ground to move.

Works on a laptop and in a Meta Quest 3. Live at `/xr/` on the project site; the website can embed it with
`/xr/?site=<id>&t=<ISO time>&embed=1`. The detailed controls (tick boxes, groups, directions, importance, opacity,
presets, best zones, "Why here?") are on the website, not here.

## Run it

| What | Command | Notes |
|------|---------|-------|
| Install | `make setup` | installs web/ and xr/ |
| Dev server + Quest 3 emulator | `make xr-dev` | https://localhost:8081 in a managed Chromium window; the "Runtime / Editor" toolbar and the "Enter XR" button are the dev server's own tools and are never in a production build |
| Tests | `make test` | includes `xr/src/*.test.ts` (frames and shadows, the journey, the ground detail, the legend, automatic quality) |
| Production build | `make build && make xr` | writes `web/dist/xr/`, which Vercel serves at `/xr/` |
| Every button, on the laptop view | `node scripts/xr_journey_check.mjs` | 67 checks against a served production build (see "How it was tested") |

The app reads the published data at `/data/` (the files in `web/public/data/`). In dev, `xr/vite.config.ts` serves
that folder at the same URL; nothing is copied. It imports `web/src/lib/analysis` directly (`computeSeries`,
`computeMetrics`, `demHorizon`, `classGrid`, `paintClasses`): there is one copy of the maths.

Driving the emulator from Claude Code or a shell, with the dev server running (from `xr/`):
`npx @iwsdk/cli xr enter --input-json '{}'`, `npx @iwsdk/cli browser screenshot --output-file shot.png`,
`npx @iwsdk/cli xr look-at ...`, `npx @iwsdk/cli xr select ...`. In a dev build the app logs where each panel
button is in the room (`[panel] ...`) and every moment (`[moment] ...`), so a script can aim at a button by its id.
`xr/AGENTS.md` and `xr/.claude/skills/` (written by the IWSDK scaffolder) explain the rest.

URL parameters: `site` (a site id with terrain, e.g. `mma01`: opens standing there), `lat` and `lon` (a point
within 10 degrees of the pole, as the website's map sends: opens standing at that point, on the tile of the
nearest site that covers it), `t` (UTC start of the 30-day window, e.g. `2026-11-24T00:00Z`), `stage=pole`
(opens at the south pole), `embed=1` (hides the title box), `detail=high|medium|low` (the headset's detail level
on the laptop view, for measuring: see "Frame rate"). Without `t`, the journey starts now, and a place opens at
the next hour at which the whole Sun is above its skyline (`nextSunUp` in `guide.ts`). The address bar always
holds a link back to where you stand.

## The journey

| Stage | Panel | What happens |
|-------|-------|--------------|
| 1. The whole Moon (opening view) | "Whole Moon" (selected), "South Pole", green "Start" | "Start" runs time, a month every 30 seconds: the line between day and night sweeps across the globe, the Sun circles, the Earth turns and shows its phase; the button becomes "Pause". "South Pole" goes down to the pole. |
| 2. The south pole | "Back to whole Moon", the switch "Show safe landing colours", six places: Malapert Massif (marked "Recommended: Earth always in the sky, the Sun skims a giant ridge"), Mons Mouton, Haworth, Nobile Rim 1, de Gerlache Rim 2, "IM-2 Athena's landing spot" | The same six are large markers on the ground; the recommended one pulses. Picking one, on the panel or on the ground: the rocket flies there (caption "Flying to Malapert Massif, 85.9 S"), a short fade, you have landed. |
| 3. On the surface | green "Play", the switch "Faster", "Back to the south pole"; "Sun: up / below the hills", "Earth: in view / hidden", the date and "day N of 30" | "Play" runs the days, one every 10 seconds (2.5 seconds with "Faster"): the Sun rises, circles low and sets, the Earth barely moves, shadows sweep the ground. Point at the ground and pull the trigger, or pinch, to move there (a ring shows where); on a laptop click the ground, drag to look, scroll to zoom the view. You stay inside the site's tile (61 km across, 120 m per pixel). |

Always there: "?" (top right) opens one screen of help with "Close", "Frame rate" and, in the headset, "Leave VR".
One caption line says what just happened. The first time through, an arrow points at the next button to press:
"Start", then "South Pole"; Malapert Massif; "Play". Changes of scene go through a short fade to black; the
view is never turned for you.

Small permanent labels: "Sun and Earth: sizes and distances not to scale" (stages 1 and 2) and "Surface detail
illustrative; terrain shape from NASA LOLA" (stage 3).

Keys on the laptop: Space is Start / Play, the arrow keys step an hour (a day with Shift), Escape goes back a stage.

## File map (xr/src)

| File | What it does | Change it when |
|------|--------------|----------------|
| `index.ts` | Creates the IWSDK world and registers the one system. | never, normally |
| `experience.ts` | The whole flow: the three stages, the flight, fades, the Sun and Earth, laptop camera and mouse, VR ray and pinch, teleport, what each button does (`press`), warming up during the opening view. Constants at the top. | behaviour, input |
| `journey.ts` | The journey as data, no three.js: the six places, the speeds of time, the named moments and their captions, the event hook, the panel of each stage (`stageView`) and its first-time hints, the Earth rotation angle. Tested. | panel text, captions, moments |
| `ground.ts` | The illustrative detail of the surface: the detail tile (small craters, roughness), its shadow pass, the patch of real geometry round the visitor, rocks and their shadows. The pure part is tested. | the look of the ground |
| `terrain.ts` | Terrain material (lighting, the regolith shading and detail of the surface, the map overlay), the GPU shadow pass, mesh builder, slope texture, the depth scheme. | look of the terrain, shadow quality |
| `geo.ts` | Frames: MOON_ME to the scene, fields of true 3D positions (curvature included), the height of the drawn mesh at a point, CPU copy of the shadow test. Tested. | never, unless the maths is wrong |
| `data.ts` | Loaders for what the VR reads from `/data/`; `tileFromPole` cuts a tile from the south-pole grid for a point no site tile covers. | a data file changes shape |
| `guide.ts` | What comes from the website's analysis code: the time a site opens at, the "Everything" selection, the colours and legend words of the map. Tested against the website's own files. | the website changes its legend |
| `moon.ts` | The whole-Moon view as pure maths: the pole frame, the globe's mesh and heights, the cap's edge, the compass, the zoom from the whole Moon to the pole. Tested. | zoom, compass, cap edge |
| `globe.ts` | Loads the CGI Moon Kit maps and the pictures of the Earth and the Sun (smaller ones in a headset), the globe's material, the fade between scenes. | the globe's look |
| `perf.ts` | Automatic quality in the headset: the three detail levels and the rule that lowers them. Tested. | frame rate on the Quest |
| `objects.ts` | Lander, rocket, the Sun's disc and glow, the Earth, stars, labels, markers. | models and labels |
| `hud.ts` | Laptop interface (plain DOM and CSS, Earthrise tokens): the stage panel, the caption, "?" and "Enter VR", the credits line. | laptop UI layout |
| `vrpanel.ts` | The floating panel in VR (a canvas on a plane; buttons are rectangles hit by the app's own ray; the hint arrow is a small mesh of its own). Buttons are 7.4 cm high. | VR UI |

| `voice.ts` | The narrator (which line plays when, one channel, the Voice switch) and the three sound effects. The rules are pure and tested. | what is said or heard, and when |

`iwsdk.config.json` holds the WebXR settings (VR, hand tracking, emulator device). `public/scenes/` is an empty
IWSDK scene: everything is generated from data at run time. `public/moon/` and `public/sky/` hold the pictures of
the Moon, the Earth and the Sun (display only). `public/voice/` holds the narrator's 17 clips and their text.

## How it stays real

- **Scene frame.** Tangent to the 1737.4 km sphere at the centre of the terrain grid, axes along the grid
  (+X = grid +x, +Y = up, -Z = grid +y). Every vertex is at its true 3D position, so the Moon's curvature is in
  the scene. Degrees, east-positive longitude, UTC, MOON_ME throughout.
- **Sun and Earth directions** come from `/data/ephemeris.json` (JPL DE421), interpolated between the hourly
  samples. On the surface they are placed by azimuth and elevation from `computeSeries` on the skyline that
  `demHorizon` works out at the exact point where you stand, 2 m up: the same code as the website. "Sun: up" means
  the centre of the disc is above that skyline; "Earth: in view" the same for the Earth.
- **Shadows** of the terrain are computed on the GPU by marching the height field towards the Sun (docs/SCIENCE.md
  sections 3 and 4), with the Sun's real semi-diameter.
- **Stage 1 and 2: not to scale, on purpose.** The Sun and the Earth are drawn close to the Moon and far too
  large, in their real directions from the Moon, so that one look shows where the light comes from. The label on
  the panel says so. The Earth is turned the way it really faces: celestial frame to MOON_ME with the quaternions
  of `/data/stars.json`, and the Earth rotation angle (`earthRotationAngle` in `journey.ts`, IERS 2010). A test
  runs this chain backwards on the Sun's direction and finds noon over Greenwich at 12:00 UTC to within the
  equation of time (-3.90, 3.41 and 0.45 deg E on three dates).
- **Stage 3: real sizes.** On the surface the Sun is drawn at its real angular size (about 0.53 degrees) and the
  Earth at the size its real distance gives (about 1.9 degrees). Only the Sun has a glow; the sky is black and
  shadows are sharp, because there is no air.
- **The whole Moon** is the NASA SVS CGI Moon Kit (LROC colour, LOLA heights); within 7 degrees of the pole it is
  our own 430 m LOLA grid, drawn as a round cap of the globe; a ring of the kit's LOLA heights joins the two. On
  the 86 S circle the kit's heights differ from ours by 5.7 m on average (135 m rms).
- **Safe landing colours** are the website's traffic-light classes for all ten parameters ("Everything"):
  `classGrid` on the published layers, painted by `paintClasses`. Green good, amber acceptable, red poor; ground
  that fails a NASA limit is hatched as well as red (never colour alone); grey is no data. The legend uses the
  website's words, and a test fails if the website changes them. The map stops at the 84 S circle.
- **The recommendation.** "Earth always in the sky" at Malapert Massif holds in our model: Earth in view 100.0 %
  of the 1157 days of the ephemeris, 2 m above the site's point (`journey.test.ts`, which prints the same figures
  for all six places).
- **The surface: shape from LOLA, detail illustrative.** The ground's shape is the site's LOLA tile at 1:1. LOLA
  at 120 m per pixel cannot see anything smaller than a football pitch, so `ground.ts` adds a fixed pattern of
  small craters, roughness and rocks. It is not measured, it is the same pattern at every site, and no number
  comes from it; the label on the panel says so. The added relief stays between -1.5 m and +0.45 m (a test
  samples 40,000 points: -1.11 m to +0.37 m), so with your eyes 2 m above the ground you stand on it can never
  hide a Sun or an Earth that the numbers say are in view. A rock can, as a rock would.
- **Regolith shading.** Lunar soil is not a matt wall: it sends light back towards the Sun. The surface uses the
  Lommel-Seeliger law with a phase function that falls away from the Sun's direction and a surge close to it
  (display constants, in `terrain.ts`). The detail's own shadows are recomputed on the GPU as the Sun moves; rocks
  cast a strip of shadow of length height / tan(Sun elevation), capped at 18 m.
- **Level of detail.** Within 22 m the detail is real geometry (a 64 m patch, half a metre between vertices), so
  craters have depth in stereo; to 29 m it fades into the plain mesh; beyond, it is shading only, and beyond
  about 2 km it goes over into its own average. The detail tile is read at three scales (12 m, 96 m, 700 m).
- **Moving.** A ray from the controller, the hand or the mouse is marched against the drawn ground; the point it
  hits becomes the new standing point, and the skyline, the Sun and the Earth are computed again for it.
- **Time.** One 30-day window from `t`. Stage 1 runs 24 hours per second, stage 3 runs 2.4 (9.6 with "Faster");
  at the end of the window time starts over. Time only runs where there is a button to stop it.

## Moments and narration

The journey is a sequence of named moments (`MOMENTS` in `journey.ts`): `moon-intro`, `start-motion`,
`fly-to-pole`, `pole-arrived`, `site-recommended`, `colours-on`, `flight`, `landed`, `play`, `play-first-sunrise`,
`sunset`, `earth-in-view`, `teleport` and so on. Each one fills the caption slot with one short line built from
numbers the app computed, and is announced twice: to listeners in the code (`journey.on(fn)`) and as a
`lunar-moment` event on `window`. `docs/NARRATION.md` lists every moment, when it fires and a draft narration
with its sources, for a fuller voice-over later.

## Voice, sound and the movable menu (headset only)

Sound starts when the visitor enters VR (their press on "Enter VR" is the gesture the browser asks for) and
stops when they leave; the laptop view is silent.

- **Narrator** (`xr/src/voice.ts`). Voice: AI-generated with ElevenLabs (voice "Dan", id
  `BHr135B5EUBtaWheVj8S`, model `eleven_multilingual_v2`), generated ahead of time by `scripts/make_voice.mjs`
  into `xr/public/voice/`: 17 MP3 clips (64 kbit/s, 8 to 13 seconds, 1.3 MB in all) and `lines.json` (clip ->
  text). The app only plays these files; it never calls ElevenLabs, and the API key is not in the repository
  (the script reads `~/.elevenlabs_key`). The full text of every clip is in docs/NARRATION.md.
  - A clip belongs to a moment of the journey: 11 general ones (`moon-intro`, `start-motion`, `pole-arrived`,
    `site-recommended`, `colours-on`, `play`, `play-first-sunrise`, `sunset`, `earth-in-view`, `earth-hidden`,
    `teleport`) and one per place for `landed`. Each says one thing about what you see and one thing to do.
  - It plays the first time its moment is heard, never again. Any new moment stops the clip that is playing
    (so clips never overlap, and a change of stage silences the voice). While a clip plays its text is the
    caption. On entering VR the clip of the stage you are in plays, because its moment fired before sound was
    allowed. At the pole the recommendation (5 s without a pick) waits for the voice to finish.
  - General clips say no number that depends on the place or the time; site clips only use the long-run
    figures of the table in docs/NARRATION.md, said as "over three years". Tests check both against the files.
  - To change a line: edit `LINES` in `scripts/make_voice.mjs` and run it; only changed or missing clips are
    generated, and it prints the characters used (the whole script is 2,627).
- **Sound effects**: WebAudio oscillators, no files. A click on every button press (0.07 s), a whoosh on the
  way down to the pole and on a move (0.5 s), a low tone on landing (0.6 s); each at a tenth of the voice's
  level or less (`EFFECT_S`, `EFFECT_PEAK`, `EFFECT_OF` in `voice.ts`, tested).
- **Voice switch**: the speaker button beside "?" on the VR panel, on by default. Off silences the voice and
  the effects; the journey's own captions stay.
- **Movable menu**: the bar with six dots above the panel is its handle. The panel is an IWSDK entity with
  `RayInteractable` and `DistanceGrabbable` (movement mode `MoveFromTarget`, no rotation or scaling;
  `features.grabbing` in `iwsdk.config.json`). Only the handle accepts pointer events, so IWSDK's ray takes
  the panel by the handle (trigger, or a pinch) and carries it; the panel's buttons keep the app's own ray
  test and click as before. The app turns the panel to face the visitor while it is held and when it is let
  go; it stays where it is dropped. If a new stage finds it behind the visitor it comes back in front.
- Nothing here runs per frame except IWSDK's grab system itself; a clip ends through the audio node's
  `onended` and effects are scheduled once.

## Pictures and credits

On screen (the credits line on the laptop, the bottom of the panel in the headset): "Terrain: NASA LOLA. Moon
globe: NASA SVS CGI Moon Kit (LROC colour, LOLA relief). Earth: NASA Blue Marble. Sun: NASA SDO. Illumination:
NASA Goddard PGDA. Ephemeris: JPL DE421. Voice: AI-generated with ElevenLabs."

| Picture | Exact source | Link | Licence |
|---------|--------------|------|---------|
| Earth | NASA Goddard Scientific Visualization Studio, "Blue Marble - A Seamless Image Mosaic of the Earth (WMS)", item 2915, file `bluemarble-2048.png`. Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio; the Blue Marble Next Generation data is courtesy of Reto Stockli (NASA/GSFC) and NASA's Earth Observatory | https://svs.gsfc.nasa.gov/2915 (file: https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png) | public domain (NASA) |
| Sun | NASA Solar Dynamics Observatory, "Spotless Sun", PIA21582, the full disc on 13 March 2017. Credit: NASA/GSFC/Solar Dynamics Observatory | https://images.nasa.gov/details/PIA21582 (file: https://images-assets.nasa.gov/image/PIA21582/PIA21582~orig.jpg) | public domain (NASA) |
| Moon | NASA SVS CGI Moon Kit: `lroc_color_poles_4k.tif`, `ldem_16_uint.tif` | https://svs.gsfc.nasa.gov/4720 | public domain (NASA) |

Voice: AI-generated with ElevenLabs (voice "Dan", model `eleven_multilingual_v2`); the clips are in `xr/public/voice/`, their text in docs/NARRATION.md.

`scripts/export_sky_textures.py` and `scripts/export_moon_globe.py` download the sources into `data/` and write
`xr/public/sky/` (0.4 MB) and `xr/public/moon/` (7 MB). The Sun's picture is cut to its disc and brightened (its
brightest 1 % becomes white); the Earth's is drawn 1.8 times brighter than the file, because a true picture of
the Earth is dark.

## 60-second stage demo

1. (0:00) Open `/xr/`. "This is the whole Moon from NASA's LRO maps, south pole towards you." Press **Start**:
   "A month in 30 seconds. The Sun circles the Moon, the Earth hangs above, and the line between day and night
   sweeps across. Directions are real; sizes and distances are not to scale, as the label says."
2. (0:15) **South Pole**. "We go down to where Artemis wants to land. Six places." Switch **Show safe landing
   colours** on: "Green is good to land on, amber acceptable, red poor, hatched fails a NASA limit: the same map
   as the website."
3. (0:28) Press **Malapert Massif**: "Recommended: in our model the Earth never leaves its sky." The rocket flies,
   the caption reads "Flying to Malapert Massif, 85.9 S".
4. (0:36) On the surface. "This is the real shape of the ground from NASA's laser altimeter, at 1:1. The small
   craters and rocks are illustrative, and it says so." Press **Play**: "One day every 10 seconds. The Sun never
   climbs: it skims the horizon, so every rock throws a shadow many times its height." Read the caption when the
   Sun rises or sets: it carries a number computed for this exact spot.
5. (0:52) Point at the ground and click: "And you can walk." **Back to the south pole** to pick another place.

## Footage

`node scripts/record_footage.mjs <base> vr` records the three stages at 1920 x 1080 from the production build
(the header of the script says how to serve it): `media/clips/08-vr-moon.webm` (stage 1 with Start, 22 s),
`media/clips/09-vr-pole.webm` (stage 2: the colours, Malapert Massif, the flight, the landing, 22 s) and
`media/clips/10-vr-surface.webm` (stage 3: Play, the sunrise of 17 December 2026 at Malapert, a move, 28 s).
No cursor is drawn, no sound. With `web` instead of `vr` it records `media/web-30s.webm`.

## Frame rate

Budget: 72 fps, 13.9 ms per frame. What can be measured without the headset is the laptop view of the production
build in headless Chromium on the build machine (Apple GPU), vertical sync off, at the Quest 3's pixel count
(3360 x 1760), reading `window.lunarStats()` (mean of 72 frames; the longest frame of six such windows). The
Quest's GPU is much slower than this machine's, so these numbers show what the redesign cost, not what the headset
does. "Before" is the build before the redesign (commit 1043567); "headset detail" is `?detail=high`, the level the
headset starts at.

| Stage | Before, ms | After, ms | After, longest frame, ms | Before, headset detail, ms | After, headset detail, ms | After, headset detail, longest, ms |
|-------|-----------:|----------:|-------------------------:|---------------------------:|--------------------------:|-----------------------------------:|
| 1. Whole Moon | 3.1 | 3.0 | 5.2 | 2.9 | 2.7 | 4.8 |
| 1. Whole Moon, Start (new) | none | 5.6 | 8.7 | none | 3.4 | 6.9 |
| 2. South pole | 4.1 | 4.2 | 5.2 | 3.4 | 3.5 | 6.4 |
| 2. South pole, colours on | 4.1 | 4.4 | 5.1 | 3.4 | 3.4 | 5.7 |
| 3. Surface | 3.2 | 4.8 | 6.6 | 3.3 | 3.9 | 6.8 |
| 3. Surface, Play | 5.7 | 6.9 | 11.4 | 4.2 | 4.5 | 11.7 |
| 3. Surface, Play, Faster | none | 6.7 | 13.2 | none | 4.3 | 11.0 |

The surface is the stage that got dearer: the detailed ground costs 0.6 ms at headset detail on this machine
(1.6 ms at full detail). "Before" for "Surface, Play" ran time at 10 hours per second, "after" at 2.4. These
runs are of the merged build with the machine otherwise idle; an earlier idle run agreed within 0.5 ms, and runs
taken while another browser was busy on the same GPU were 1 to 3 ms slower in every stage, the unchanged ones
included, with single frames of up to 38 ms. Triangles drawn per frame at headset detail: 59,560 (whole Moon), 184,566 (pole),
210,550 (surface).

What keeps it within budget:

- **No stall on entering a stage.** During the opening view the app compiles every program the later stages
  need (`renderer.compileAsync`, with the surface's terrain material on a hidden mesh), uploads the pictures of
  the Earth and the Sun and the panel, builds the detail tile, fetches the recommended place's terrain and paints
  the colours. A place's terrain is built during the black of the fade, and its programs are compiled before the
  fade lifts.
- The panel is a canvas: it is drawn and uploaded again only when its content changes (a press, a new day, a
  sunrise), never per frame. The date on it has no clock time for that reason. The hint arrow moves as a mesh.
- On the surface, while time runs, the hills' shadows and the small detail's shadows are recomputed on
  alternate turns, so no frame pays for both; in the headset a turn comes every third frame.
- The ground costs the same five texture reads per pixel as before the redesign (the field's slopes now come
  from one half-float texture instead of four height reads; the detail tile carries slopes, shadow and albedo
  in one texture), plus one read of the tile's average.
- 2K maps and a 128 x 64 globe in the headset (4K and 384 x 192 on a laptop); fewer rocks at lower detail levels.
- If frames still run long on the headset, the automatic quality lowers the detail (step 6 of the Quest test).

## How it was tested

- `make test`: pytest, the website's vitest, and the tests in `xr/src` (frames and shadows against the analysis
  library; the journey's panels, hints, captions and moments; the Earth's orientation; the six places from the
  data; the ground detail's bounds; the drawn mesh's height; the legend against the website's files; the
  narrator's lines, files, rules and the effects' lengths; the panel's drag geometry).
- `node scripts/xr_journey_check.mjs` on the production build, laptop view: 90 checks, every button of every
  stage, each of the six places from the panel and one from its marker, Play and Faster by the clock, a move by
  clicking the ground, 14 moments, the link parameters, and no console errors. The last 23 are the voice, the
  effects and the menu, driven without a headset through `window.lunarTest` and `window.lunarVoice`: the 17
  files exist and decode; nothing sounds before "entering"; the stage's clip plays with its text as the
  caption; a new moment stops it; a clip is spoken once; the Voice switch silences voice and effects and brings
  them back; the whoosh and the landing tone sound; the place's clip plays on landing. The handle is dragged
  with the real mouse through IWSDK's grab (the panel follows, stays when released, faces the viewer), a click
  on the panel's body does not move it, and a button pressed by a ray still clicks.
- IWSDK emulator, voice and menu: entering VR spoke `moon-intro`; "Start" spoke `start-motion`; with the Voice
  switch off the pole stayed silent, with it on `pole-arrived` and `colours-on` played; landing at Malapert
  Massif spoke its clip and "Play" spoke `play`. The handle was dragged with the controller's trigger and with a
  hand pinch (three times), and buttons were pressed after each drag. No console errors. One pinch press on a
  place's button, right after a pinch drag, did nothing; the same press repeated worked, and two further
  drag-then-press rounds worked.
- Not yet run on a real Quest 3 (see "Test on the Quest 3").

## Known issues

- The last test on a real Quest 3 (14 Nov 2026) was before the whole Moon and before this redesign: smooth then.
  Everything since has run in the IWSDK emulator and on a laptop only.
- The detail pattern repeats: every 96 m (small craters), every 700 m (larger ones). It is the same at every site.
- Rock shadows are flat strips laid on the ground: on rough ground a long one can cut across a crater rim.
- A point further than 29 km from every site's centre has no 120 m tile. It opens on a tile interpolated from the
  ~430 m south-pole grid, with a note on the panel.
- Ordinary objects (lander, rocks, markers, panel, controllers) always draw in front of terrain, because terrain
  and sky use their own logarithmic depth range (see the comment in `terrain.ts`).
- "Sun" and "Earth" labels stay visible when the hills hide the disc itself: they show where it is.
- At the end of the 30 days time jumps back to day 1.
- The lander is a plain procedural model.

## Test on the Quest 3

1. In the Quest Browser open the deployed site at `/xr/` (https://claudes-plan-lunar-navigator.vercel.app/xr/)
   and press "Enter VR", the only VR button on the page. Do not test from the dev server (port 8081): it adds the
   IWSDK toolbar. To try unmerged work, serve a production build: `make build && make xr && cd web && npx vite
   preview --host`.
2. Stage 1. The Moon is in front of you, the panel on your left, an arrow beside "Start". Check: the text on the
   panel reads easily; "Start" (trigger, then again with a bare-hand pinch): the day-night line moves, the Sun
   circles the Moon, the Earth turns; "Pause" stops it. Is the motion smooth?
3. "South Pole": the pole comes down in front of you like a table, without a jump. Six markers; Malapert pulses.
   Switch "Show safe landing colours" on and off. Point at a marker and pull the trigger: does it fly there?
   Otherwise press "Malapert Massif". Watch for a stutter during the flight and the fade.
4. Stage 3. You are on the surface. Check: the ground close to your feet (craters with depth, rocks, sharp
   shadows; nothing swimming or flickering); the horizon; the Sun and the Earth if they are up. "Play": shadows
   should sweep smoothly; then "Faster". Point at the ground 5 to 20 m away: a ring shows; trigger or pinch: a
   short fade and you stand there. Try a far hillside too.
5. "?" opens the help. "Back to the south pole", then another place, then "Back to whole Moon".
   Voice and menu. On entering VR a voice says "This is the Moon, seen from below its south pole...", with
   the same words in the yellow caption line. Check: is the voice clear, natural and not too loud? Listen to
   how it says "Malapert", "Nobile" and "de Gerlache". Each new step speaks once ("Start", arriving at the
   pole, the colours, each place the first time you land, "Play", the first sunrise, sunset, Earth in view or
   hidden, your first move); pressing something stops the voice at once. Do the click, the whoosh (South Pole,
   a move) and the low tone on landing sound quiet beside it? Press the speaker button beside "?": everything
   goes silent; press it again. Point at the bar above the panel, hold the trigger (or pinch) and move your
   hand: the panel follows and faces you; release: it stays. Press a button on the moved panel: it must click,
   not drag. Is there a second ray or cursor that was not there before?
6. Frame rate: "?" then "Frame rate". The line shows frames per second, milliseconds per frame (mean of the last
   72 frames), the longest single frame of those 72 and the detail level. Close the help; the line stays on the
   panel. Read it in each of: whole Moon; whole Moon with Start; south pole; south pole with the colours; surface;
   surface with Play; surface with Play and Faster. Target 72 fps (13.9 ms). In the headset detail is automatic:
   when the mean frame time of a second is over 13.9 ms by more than 5 %, terrain and shadow detail drop one
   level (high, medium, low) and stay there until you leave VR (`LEVELS` in `xr/src/perf.ts`). Note the level too.
7. Over USB with automation: the `iwsdk-native-xr-test` skill in `xr/.claude/skills/`.
