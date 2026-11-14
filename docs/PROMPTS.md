# Prompt book

One prompt = one Claude Code session = one branch = one PR. Copy the text exactly; it relies on CLAUDE.md and docs/.
Claude Code: pick the model with `/model`, plan mode with Shift+Tab, `/clear` after each prompt.
Before each prompt: `git switch main && git pull && git switch -c <branch>`. After: ask Claude to commit, push and `gh pr create`.
Prompts marked *chat* go in claude.ai, not in the repo.

## Eugenio (lead) and shared

### E0 (Eugenio)

When: Fri night after 19:55 (or Sat 08:00) · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `main (lead only)`

```text
The docs CLAUDE.md, AGENTS.md and docs/*.md are already committed. Read them. Scaffold the project skeleton exactly as described, with NO feature logic:
1. Python: pyproject.toml (uv) for package `engine` with deps skyfield, numpy, rasterio, pyproj, requests, pytest, ruff. Empty modules engine/__init__.py, topo.py, dem.py, horizon.py (docstrings only). tests/test_smoke.py.
2. Web: Vite + React 18 + TypeScript in web/ with d3, zustand, vitest. Create the folders in docs/OWNERSHIP.md with index.ts files that export the TYPES from docs/INTERFACES.md sections 5 and 6; functions throw new Error('not implemented').
3. web/src/mocks/: sites.json (3 sites), ephemeris.json (48 hourly samples), horizons/mma01.json, matching INTERFACES.md exactly. Plausible made-up numbers, with a "mock": true field.
4. Makefile targets: test, data (prints TODO), dev, build. .gitignore: data/, web/public/data/* except sites.json. .claude/settings.json that denies Read on data/** and web/public/data/**.
5. .github/workflows/ci.yml: on pull_request run pytest, vitest and the web build.
Run make test and the web build, and fix until both pass. Commit "chore: scaffold", push to main, and print the tree (depth 3).
```

### E1 (Eugenio)

When: Sat 08:30, before the team starts · Tool: Claude Code · Model: **Fable 5.2** · Mode: plan mode, read-only

```text
Read CLAUDE.md and every file in docs/. Act as a senior reviewer for a 24-hour, 6-person build.
Find: (1) physics or maths errors in SCIENCE.md (frames, sign conventions, parallax, curvature, disc-fraction formula); (2) gaps in INTERFACES.md that will block parallel work (units, index conventions, missing fields, array layout); (3) ownership collisions in OWNERSHIP.md; (4) the 5 biggest schedule risks.
Output a numbered list of minimal edits as exact "old text -> new text". Do not edit files. Be blunt and keep it short.
```

### E2 (Eugenio)

When: Every merge window (11, 13, 15, 17, 19, 21, 23h) · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal

```text
Review PR #<N>. Run `gh pr diff <N>` and `gh pr checks <N>`. Check: (a) it only touches files its author owns per docs/OWNERSHIP.md; (b) it follows docs/INTERFACES.md exactly; (c) numeric code has tests; (d) no data files or secrets committed. List blocking issues only, max 5 lines. If there are none, reply MERGE.
```

### E3 (Anyone)

When: When git reports conflicts · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `your branch`

```text
Rebase my branch onto origin/main. For conflicts in files I do NOT own (docs/OWNERSHIP.md), take origin/main's version. For files I own, merge both sides carefully and keep main's contract changes. Then run make test and the web build, fix only what my changes broke, and force-push with --force-with-lease. Explain each conflict in one line.
```

### E4 (Eugenio)

When: Sat 16:30 (integration for the 17:00 MVP gate) · Tool: Claude Code · Model: **Opus 5.5** · Mode: plan mode, then execute · Branch: `feat/eugenio-integration`

```text
Integrate the merged modules end to end with REAL data: run make data (scripts already exist), load web/public/data/* in the app instead of mocks, and make Explore and Compare work for every site in sites.json. Fix integration bugs at the boundaries only. Ask before changing any file you don't own per docs/OWNERSHIP.md. Add a Playwright smoke test: open /explore?site=mma01, assert the panorama and the metric cards render with numbers. Report what still fails.
```

### E5 (Eugenio)

When: Sat 22:00 (after feature freeze) · Tool: Claude Code · Model: **Fable 5.2** · Mode: plan mode, read-only

```text
Act as a NASA CLPS mission-design engineer AND a hackathon judge. Read engine/, scripts/, web/src/lib/, docs/SCIENCE.md, docs/VALIDATION.md and README.md.
List, ranked by how much each would hurt us in front of an expert judge: every scientific or numerical error, every unjustified assumption, every claim the data does not support, and any UI wording that overstates accuracy. For each, give the minimal fix (file and change). Then list the 10 hardest questions a judge could ask, with the honest answer our code supports. Do not edit files.
```

### E6 (Eugenio + Rahan)

When: Sat 20:00 and Sun 09:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/rahan-deploy`

```text
Make the production build deployable on Vercel as a static site (web/ as root, output dist/), with web/public/data served gzip-compressed and SPA rewrites so deep links like /compare?a=mma01&b=hw02 work. Add `make offline` that builds and serves dist/ locally with `npx serve`, for the demo laptop without Wi-Fi. Verify both, and print the total size of dist/.
```

## Kien (science)

### K0 (Kien)

When: Fri night (learning, no project code) · Tool: claude.ai chat · Model: **Sonnet 5.5 (Free plan model is fine)** · Mode: chat

```text
I'm a CS + physics student. Tomorrow I build the science engine for a lunar landing-site tool. Teach me, with one worked numeric example each: (1) the MOON_ME (mean Earth / polar axis) frame and why we use it; (2) converting a Moon-centred vector into topocentric altitude/azimuth at a lunar lat/lon (east/north/up basis); (3) why Earth parallax matters on the Moon but Sun parallax doesn't; (4) a horizon mask from a DEM: great-circle marching and the curvature-corrected elevation angle; (5) polar stereographic projection on a sphere of R=1737.4 km; (6) lunar libration and why Earth rises and sets at the south pole. End with the 5 mistakes people make most often, and 6 quiz questions with answers.
```

### K1 (Kien)

When: Sat 09:15 · Tool: Claude Code · Model: **Opus 5.5** · Mode: plan mode, then execute · Branch: `feat/kien-ephemeris`

```text
Implement scripts/build_ephemeris.py and engine/topo.py following docs/INTERFACES.md section 2 and docs/SCIENCE.md section 2 exactly.
- ephemeris.json: hourly from 2026-11-01T00:00Z to 2029-12-31T23:00Z. Use Skyfield with de421.bsp, moon_pa_de421_1900-2050.bpc, moon_080317.tf and pck00008.tpc (in data/kernels/; never read them into the chat). APPARENT positions of the Sun and Earth observed from the Moon's centre, rotated into frame MOON_ME_DE421 with frame.rotation_at(t). Write sun_dir (unit), sun_semidiam_deg and earth_km. Vectorise over time.
- engine/topo.py: altaz(lat, lon, height_km, sun_dir, earth_km) per SCIENCE section 2 (Earth parallax included).
- Tests: for sites mma01, hw02 and apollo11 x 10 times, compare engine/topo against Skyfield's own topocentric altaz from moon + pc.build_latlon_degrees(frame, lat, lon). Max error < 0.01 deg.
- Export tests/fixtures/topo_reference.json (site, index, sunEl, sunAz, earthEl, earthAz) for the TypeScript team.
Print the output file size (must be under 3 MB) and the max test error. Commit, push and open a PR.
```

### K2 (Kien)

When: Sat 11:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/kien-horizons-api`

```text
Write scripts/fetch_horizons_fixtures.py: for sites mma01, hw02 and apollo11, query the JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api, EPHEM_TYPE=OBSERVER, CENTER='coord@301', COORD_TYPE=GEODETIC, SITE_COORD='<east lon>,<lat>,<alt km>', QUANTITIES='4', CSV_FORMAT=YES) for the Sun (COMMAND='10') and Earth (COMMAND='399') at 20 times spread across 2027-2028. Save the raw responses to tests/fixtures/horizons/ (don't paste them into the chat). Add a test comparing engine/topo against them (tolerance 0.05 deg), and fill table 1 of docs/VALIDATION.md with the measured max errors. If Horizons is unreachable, cache whatever succeeded and report.
```

### K3 (Kien)

When: Sat 11:30 · Tool: Claude Code · Model: **Opus 5.5 (switch to Fable 5.2 only if it fails twice)** · Mode: plan mode, then execute · Branch: `feat/kien-horizon`

```text
Implement engine/dem.py, engine/horizon.py and scripts/build_horizons.py per docs/SCIENCE.md section 3 and docs/INTERFACES.md sections 3-4.
- dem.py: open data/ldem_75s_120m_float.img via its .lbl. Read units, scale and projection offsets FROM THE LABEL (print the relevant label keys; don't guess). Provide height_at(lat, lon) with bilinear interpolation via pyproj polar stereographic (R=1737400 m). Inspect the array only through printed shape/min/max.
- horizon.py: vectorised (numpy) ray-march over 720 azimuths x distances (1 px steps to 5 km, then +1.5% per step to 150 km), with the curvature-corrected angle formula. Observer height 2 m. Under 5 s per site.
- Tests: synthetic flat DEM gives the pure curvature dip (compare with the analytic value); synthetic cone of known height and distance gives the expected angle within 0.1 deg; a real-site horizon is within -5..+15 deg everywhere.
- build_horizons.py: write horizons/<id>.json for every terrain=dem site in sites.json, plus horizons/<id>_grid.json (9x9, 500 m spacing) for every site with has_grid=true. Flat sites get elev_deg all zeros and dem="flat".
Report runtime per site and a 1-line horizon summary per site (min/max/mean elevation).
```

### K4 (Kien)

When: Sat 15:00 · Tool: Claude Code · Model: **Opus 5.5** · Mode: plan mode, then execute · Branch: `feat/kien-validate`

```text
Write scripts/validate_pgda.py. Build a separate long-run ephemeris (2009-01-01 to 2028-12-31, every 6 h, same method as build_ephemeris; do NOT write it to web/public/data). For each Artemis site, compute % of time the Sun's centre and the Earth's centre are above our horizon. Sample NASA PGDA AVGVISIB_75S_120M_201608.TIF and _EARTH.TIF at each site (read the TIF metadata for scaling and nodata first). Also compute an 'any part of disc visible' Earth % to match PGDA's definition. Fill table 4 of docs/VALIDATION.md (ours vs PGDA, differences, a 1-line explanation each). Flag any site where we differ by more than 10 points, and investigate the top one before finishing.
```

### K5 (Kien)

When: Sat 19:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/kien-pitch-numbers`

```text
Write scripts/pitch_numbers.py that prints, from our own data only: (1) max Sun elevation over 2027 at mma01, hw02, dgr203 and apollo11; (2) for griffin1 or nr107: how % sunlit and % Earth-visible over a 10-day stay change if landing slips by 0, 3, 7 and 14 days from a reference date we choose; (3) across the mma01 9x9 grid: min and max % sunlit within 2 km of the site. Output a markdown table to docs/PITCH_NUMBERS.md. These are the numbers Luke and Eugenio will say on stage, so each must be reproducible.
```

## Chinh (algorithms, design)

### C1 (Chinh)

When: Sat 09:15 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/chinh-design-system`

```text
Create the design system: web/src/styles/tokens.css and web/src/components/ui/ (Card, MetricCard with label/value/unit/trend, Badge, Legend, Toggle, Slider, Tabs, Tooltip).
Direction: a calm 'mission control' dark theme with a light variant. Semantic colours: sun = amber, earth = blue, both = teal, dark = slate, warning = red. Must be colour-blind safe (never encode meaning by red/green alone; pair colour with icon or pattern) and meet WCAG AA contrast. 4/8 px spacing scale, system font stack, tabular numbers for metrics. Add a /styleguide route component that renders every component (Rahan wires the route). No business logic, no new dependencies.
```

### C2 (Chinh)

When: Sat 10:00 · Tool: Claude Code · Model: **Sonnet 5.5 (Opus 5.5 if TS and Python disagree)** · Mode: plan mode, then execute · Branch: `feat/chinh-analysis-core`

```text
Implement web/src/lib/analysis/ (geometry.ts, visibility.ts, series.ts, metrics.ts) exactly per docs/INTERFACES.md section 5 and docs/SCIENCE.md sections 2 and 4.
- geometry: ENU basis and topocentric alt/az from MOON_ME vectors (Earth parallax included). Typed arrays, no allocations inside loops.
- visibility: horizon lookup with linear interpolation and azimuth wrap; disc fraction formula.
- series: computeSeries(eph, hz, startIdx, endIdx). metrics: computeMetrics (all fields; durations in hours from sample counts x stepS).
- vitest: unit tests with hand-computed cases (pole, equator, Sun on the horizon, wrap at 359.75 deg). When tests/fixtures/topo_reference.json exists (Kien), add a test that we match it within 0.01 deg.
Performance: computeSeries over 27,768 samples must take < 30 ms. Print the benchmark.
```

### C3 (Chinh)

When: Sat 13:00 · Tool: Claude Code · Model: **Opus 5.5** · Mode: plan mode, then execute · Branch: `feat/chinh-window-finder`

```text
Implement findWindows (docs/INTERFACES.md section 5) in web/src/lib/analysis/windows.ts, plus a Web Worker wrapper in web/src/workers/windows.worker.ts.
Algorithm: prefix sums over sunlit/earthVis/both for O(1) percentages per window. Precompute maximal dark runs and no-Earth runs; answer 'longest run inside [t, t+D)' with a sparse table (RMQ) over full runs plus clipping at both window edges, so each start time is O(1). Evaluate every hourly start, keep the best start per UTC day. Score = 0 if any constraint fails, otherwise the mean of normalised margins (document the formula in a comment).
Tests: brute-force reference implementation on random series must match exactly. Benchmark: 15 sites x 2 years in under 300 ms inside the worker. Export 3 MissionSpec presets: 'Artemis-like stay' (156 h, sun >= 90%, earth >= 50%, max dark 12 h), 'CLPS 10-day robotic' (240 h, sun >= 70%, earth >= 50%, max dark 48 h), 'Survive a night' (336 h, sun >= 40%, earth >= 30%, max dark 120 h).
```

### C4 (Chinh)

When: Sat 17:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/chinh-grid`

```text
Add web/src/lib/analysis/grid.ts: given a site's _grid.json and a time window, compute sunPct, earthPct, bothPct and longestDarkH for all 81 points (reuse computeSeries/computeMetrics with each point's horizon and lat/lon). Add the UI component web/src/components/ui/GridHeatmap.tsx: a 9x9 heat map with a metric selector, a cell tooltip and the centre cell outlined, and the caption 'each square = 500 m'. Clicking a cell emits the point index. Keep it < 50 ms per window.
```

### C0 (Chinh)

When: Fri night (learning) · Tool: claude.ai chat · Model: **Sonnet 5.5** · Mode: chat

```text
Tomorrow I write the browser-side analysis for a lunar landing-site tool in TypeScript. Refresh me, with short TS examples using typed arrays: (1) prefix sums for 'percentage of true values in any window' in O(1); (2) maximal runs of zeros and a sparse table (RMQ) to get the longest run inside any window in O(1), including clipping runs at the window edges; (3) moving work into a Vite Web Worker with transferable ArrayBuffers; (4) avoiding allocations in hot loops. Then (5) a 10-minute primer on topocentric alt/az from a body-fixed vector via an east/north/up basis. Finish with 5 test cases I should write first.
```

## Rahan (app)

### R1 (Rahan)

When: Sat 09:15 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: plan mode, then execute · Branch: `feat/rahan-shell`

```text
Build the app shell in web/: routes /explore, /compare, /windows, /power, /about, /styleguide (React Router). Zustand store holding the selected site(s), time index, window length, playback state and theme. ALL state mirrors to URL query params so every view is shareable. Data layer web/src/state/data.ts: fetch /data/sites.json, /data/ephemeris.json and /data/horizons/<id>.json, falling back to web/src/mocks when missing, and convert to the typed-array shapes in docs/INTERFACES.md section 5. Cache per site.
Site picker grouped by Artemis / Missions / Historic, with search. UTC date-time picker. Top bar with the project name placeholder. Use Chinh's tokens.css and ui components (if not merged yet, import paths only and leave placeholders). Responsive down to 375 px, keyboard navigable. No new dependencies beyond react-router-dom.
```

### R2 (Rahan)

When: Sat 11:00 · Tool: Claude Code · Model: **Sonnet 5.5 (Opus 5.5 for axis or projection bugs)** · Mode: plan mode, then execute · Branch: `feat/rahan-panorama`

```text
In web/src/charts/ build with d3 + SVG:
1. SkyPanorama: x = azimuth 0-360 (N, E, S, W labels), y = elevation with an adjustable vertical exaggeration (label it). Terrain horizon filled; Sun path and Earth path over the selected window as lines coloured by time; current Sun and Earth drawn as discs at TRUE angular size (scaled); shading when the Sun is below the horizon.
2. Timeline: three rows (Sunlit, Earth visible, Both) as filled bars across the window, with a draggable playhead synced to the store's time index.
3. Playback: play/pause/speed (1 h/frame up to 24 h/frame).
Use computeSeries from web/src/lib/analysis (mock it if not merged). Explore route = panorama + timeline + MetricCards + big countdowns ('Sunset in 31 h', 'Earthset in 4 d 2 h').
```

### R3 (Rahan)

When: Sat 14:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/rahan-compare`

```text
Build /compare: up to 3 scenarios side by side (site + landing time + stay length), each with a mini panorama, a timeline and metrics. Add a 'launch slips by N days' slider (0-30) that shifts every scenario and shows metric deltas (green/red + arrow icons, not colour alone). A 'best scenario' highlight based on bothPct. A share button that copies the URL.
```

### R4 (Rahan)

When: Sat 17:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/rahan-windows-ui`

```text
Build /windows (Window Finder) using findWindows from web/src/workers (Chinh). A mission spec form with the 3 presets plus custom fields. A heat map: rows = sites, columns = days (2027-01-01 to 2028-12-31), colour = score, infeasible = hatched. Hover shows the metrics for that day; clicking opens /explore at that site and best start time. Show a progress indicator while the worker runs. Above the chart, one sentence: 'Each cell answers: if we land this day, does the mission meet its power and comms needs?'
```

### R0 (Rahan)

When: Fri night (learning) · Tool: claude.ai chat · Model: **Sonnet 5.5** · Mode: chat

```text
Tomorrow I build a React 18 + TypeScript + Vite app with d3 charts. Give me compact, modern patterns for: (1) d3 inside React without fights (refs + useEffect vs. rendering SVG with React and using d3 only for scales); (2) a 360-degree panorama chart with a wrapped x axis (0-360 azimuth) and an animated playhead; (3) a zustand store synced two ways with URL query params; (4) lazy-loading JSON from /public and converting to Float64Array; (5) a heat map of ~15 x 730 cells that stays fast (canvas vs SVG); (6) deploying a Vite SPA on Vercel with deep-link rewrites. Short code snippets, no fluff.
```

## Ahmed (power, MoonBox)

### A0 (Ahmed)

When: Fri night (learning + kit check) · Tool: claude.ai chat or Codex chat · Model: **Sonnet 5.5** · Mode: chat

```text
I'm a mechatronics/control student. Tomorrow I build (a) a lunar lander power and battery simulation and (b) a tabletop 'MoonBox': an Arduino that shows the Sun and Earth direction around a model of a lunar horizon, driven over Web Serial from a browser. Explain: (1) why polar landers use vertical, sun-tracking solar panels; (2) a simple energy-balance battery model and how to size a battery to survive the longest darkness; (3) Web Serial API basics in Chrome (requestPort, write, line protocol) and the matching Arduino Serial parsing without String fragmentation; (4) driving a WS2812 ring vs. a 28BYJ-48 stepper + SG90 servo (wiring, power, libraries); (5) mapping azimuth to a ring LED index and elevation to servo angle with vertical exaggeration. Give me a parts list, a wiring checklist, and the 5 most common failures.
```

### A1 (Ahmed)

When: Sat 09:15 · Tool: Claude Code or Codex · Model: **Sonnet 5.5 (Codex: default model)** · Mode: plan mode, then execute · Branch: `feat/ahmed-power`

```text
Implement simulatePower in web/src/lib/power/power.ts exactly per docs/INTERFACES.md section 6 and docs/SCIENCE.md section 5 (vertical_tracking, vertical_fixed, horizontal; hourly energy balance; clamp state of charge; batteryNeededWh = largest cumulative deficit). Pure functions, typed arrays.
vitest with analytic cases: constant full sun gives linear charging to capacity; total darkness drains at load W; horizontal panels at sun elevation 1.5 deg produce about 2.6% of vertical tracking; vertical_fixed facing away produces 0. Also export 3 presets: 'Small CLPS lander' (2 m2, 28%, 1500 Wh, 120 W), 'Rover' (0.5 m2, 28%, 400 Wh, 40 W), 'Science station' (6 m2, 30%, 10000 Wh, 300 W). Mark presets as illustrative, not real spacecraft specs.
```

### A2 (Ahmed)

When: Sat 11:00 · Tool: Codex or Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/ahmed-moonbox-fw`

```text
Write firmware/moonbox/moonbox.ino for the protocol in docs/INTERFACES.md section 7 (115200 baud, newline-terminated, parse into a fixed char buffer, no String class). Build option [A or B, choose one]:
A) WS2812 ring with N LEDs (FastLED): LED at round(az/360*N) amber with brightness proportional to frac for the SUN; blue for the EARTH if vis=1, dim red if 0. Azimuth 0 = the LED marked 'N'.
B) 28BYJ-48 stepper (AccelStepper) rotating the terrain turntable to -sun_az, and an SG90 servo setting lamp elevation = clamp(el * K, 0, 60) with K = vertical exaggeration constant (default 10); Earth on a separate LED.
Respond to HELLO with MOONBOX,1. Include a demo mode that sweeps the Sun around when no serial data arrives for 5 s. Add firmware/moonbox/README.md with the wiring table and pin map.
```

### A3 (Ahmed)

When: Sat 14:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/ahmed-serial`

```text
Implement web/src/lib/serial/moonbox.ts (Web Serial: connect, HELLO handshake, a throttled send at max 20 Hz, disconnect, error states) and a <MoonBoxButton/> component that, while connected, streams SUN and EARTH lines for the store's current time index and selected site (use computeSeries values at that index). Feature-detect navigator.serial and show 'Use Chrome or Edge' otherwise. No new dependencies.
```

### A4 (Ahmed)

When: Sat 16:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/ahmed-power-ui`

```text
Build the /power route in web/src/routes/power/: a PowerConfig form with the presets, a state-of-charge chart over the selected window (d3, with sunlit periods shaded), a big verdict ('Survives' / 'Battery empty after 41 h'), 'battery needed to survive' in Wh, and a panel-mode comparison row (vertical_tracking vs horizontal) showing why polar landers use vertical panels. Uses simulatePower and the selected site and window from the store.
```

### A5 (Ahmed)

When: Sat 19:00 · Tool: Claude Code · Model: **Sonnet 5.5** · Mode: normal · Branch: `feat/ahmed-ring`

```text
Write firmware/ring/make_ring.py: read web/public/data/horizons/<id>.json and output an SVG (A4 landscape, can tile across 2 pages) of the horizon profile as a cut-out strip for a cylinder of radius r_mm (default 100), with vertical exaggeration K (default 10): height_mm = r_mm * tan(min(K * elev_deg, 70 deg)). Include azimuth ticks every 30 deg, N/E/S/W marks, a glue tab, and the caption '<site> horizon, vertical exaggeration xK'. CLI args: --site, --radius, --k.
```

## Luke (story, media)

### L1 (Luke)

When: Fri night · Tool: claude.ai (Pro), web search on · Model: **Sonnet 5.5** · Mode: chat

```text
I'm the storyteller and presenter for a NASA Space Apps team building a tool that tells lunar mission planners when a landing site has sunlight (power) and a line of sight to Earth (radio), especially at the Moon's south pole. Search the web and give me, with a source link for every fact: (1) why Chang'e-7's launch was postponed in Aug 2026 and what was said about the Sun-alignment window; (2) what happened to Intuitive Machines' IM-2 Athena lander in March 2025 and why the mission ended so quickly; (3) the current status of Astrobotic Griffin Mission 1 (target region, launch date); (4) Artemis II (2026) and why the first crewed landing is now Artemis IV, early 2028, at the south pole; (5) Chandrayaan-3's lunar-night ending. Then write 3 different 15-second opening hooks for a 3-minute pitch based on these facts. Flag anything you are not sure of.
```

### L2 (Luke)

When: Sat 09:30 · Tool: claude.ai · Model: **Sonnet 5.5** · Mode: chat

```text
Plan our social content for a 48-hour hackathon (HackAthlone, NASA Space Apps at TUS Athlone, 13-15 Nov). Goal: win People's Choice and the Storytelling prize. Platforms: Instagram, TikTok, LinkedIn. Give a schedule of 6 posts/reels (Sat morning to Sun after the pitch) with a hook, shot list, caption and hashtags for each, tagging @spaceappsathlone and @hack_athlone. Keep the tone fun but technically correct. Include one 20-second explainer 'Why the Sun never rises at the Moon's south pole'.
```

### L3 (Luke)

When: Sat 12:00 (portal opened 09:00) · Tool: claude.ai · Model: **Sonnet 5.5** · Mode: chat

```text
Draft our NASA Space Apps project submission text from the notes below: title, a 1-sentence high-level summary, a 300-word project description (what it does, how it works, benefits, intended impact), the NASA data used (LOLA LDEM_75S_120M, PGDA illumination maps, JPL Horizons / DE421 via Skyfield), the references list, and a transparent 'Use of AI' section (Claude, Codex, ElevenLabs: what they were used for). English, no hype, every claim checkable. Notes: [paste docs/DECISIONS.md and the README].
```

### L4 (Luke)

When: Sat 15:00 · Tool: Claude Code (Codex also fine) · Model: **Haiku 5.5** · Mode: normal · Branch: `feat/luke-content`

```text
Create web/src/content/explainers.json: for each key (solar_elevation, earthset, libration, horizon_mask, permanently_shadowed_region, direct_to_earth, vertical_solar_panels, why_south_pole, lunar_day, no_atmosphere), give {"kid": <=35 words for a 12-year-old, "planner": <=35 words for an engineer}. Facts only; mark anything uncertain with "VERIFY". Also create web/src/content/about.md: what the tool is, the data sources with links, the team, and 'not an official NASA product'.
```

### L5 (Luke)

When: Sat 20:00 (draft), Sun 06:30 (final) · Tool: claude.ai · Model: **Opus 5.5** · Mode: chat

```text
Write our pitch. Slot: [X] minutes plus [Y] min Q&A (confirm with organisers). Speakers: Luke (hook and story), Eugenio (live demo), Ahmed (power and the MoonBox physical demo), Kien (validation and Q&A). Inputs: [paste docs/PITCH_NUMBERS.md, VALIDATION.md summary, feature list]. Structure: hook (real event) -> problem in one picture -> live demo with 3 'wow' beats (launch-slip heat map, move the lander 500 m, battery survives or dies with MoonBox shadow) -> validation numbers -> who uses it and what's next. Give the script with timings per line, slide-by-slide outline (max 7 slides, no NASA logo), and the 12 hardest judge questions with 2-sentence answers.
```

### L6 (Luke)

When: Sat 23:00 · Tool: ElevenLabs + claude.ai · Model: **Sonnet 5.5** · Mode: chat

```text
Write the voiceover script for (a) a 2-minute demo video and (b) a 30-second cut, from this screen-recording plan: [list of shots]. Calm documentary tone, short sentences, numbers spoken clearly. Mark pauses. Mark where on-screen captions are needed. Then give me the ElevenLabs settings you recommend for a clear narrator voice.
```
