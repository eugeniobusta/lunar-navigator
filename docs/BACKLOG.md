# Feature backlog after the MVP (owner: Eugenio)

The MVP is: real ephemeris + real terrain for the 9 Artemis sites, and every tab working on that data.
From the moment it is on `main`, each person works on their own branches, one feature per branch, PRs only,
following the per-person table in docs/OWNERSHIP.md. Model: Sonnet 5.5 unless stated. Plan mode first.

Start every feature with:
`git switch main && git pull && git switch -c feat/<name>-<topic>`, then paste the prompt below into Claude Code.

## Kien (science)
1. `feat/kien-grids`: "Set has_grid=true for mma01, nr107 and hw02 in sites.json and generate their 9x9 grids per
   docs/INTERFACES.md section 4 with the existing horizon code. Report runtime and min/max % sunlit across each grid."
2. `feat/kien-pitch-numbers`: prompt K5 in docs/PROMPTS.md.
3. Human job: check the 9 Artemis coordinates against Wueller et al. 2026 and the numbers in docs/VALIDATION.md.

## Chinh (algorithms, design)
1. `feat/chinh-grid-ui` (after Kien's grids): "Add a 'Move the lander' view: load horizons/<id>_grid.json when the
   site has has_grid, compute % sunlit and % Earth for each of the 81 points over the current window, draw a 9x9
   heat map (500 m cells) and let a click pick that point as the site. Follow the existing style in web/src/index.css."
2. `feat/chinh-worker` (Opus 5.5): "Move findWindows into a Web Worker in web/src/workers/ so the UI never freezes
   on a 36-month search; show progress. Keep results identical (add a test)."
3. Human job: design review of every tab on a laptop and a phone; file issues with screenshots.

## Rahan (app)
1. `feat/rahan-url-state`: "Keep site, compare site, date, mission length and tab in the URL query string so any
   view can be shared as a link and survives reload."
2. `feat/rahan-export`: "Add 'Download CSV' to Overview (hourly Sun/Earth elevation, margin, sunlit, earth visible
   for the window) and to Window Finder (one row per day)."
3. `feat/rahan-mobile`: "Make the sky panorama, timeline and charts readable at 390 px wide: larger tick text,
   horizontal scroll for the panorama, stacked controls."
4. Human job: Vercel project (root `web`, build `npm run build`, output `dist`), test the live URL on phones.

## Ahmed (VR view, xr/)
Start with docs/XR.md (how to run, file map, known issues, Quest test). Branches `feat/ahmed-*`, Opus 5.5.
1. `feat/ahmed-quest-fps`: "Measure the frame rate of /xr/ on the Quest 3 in Orbit, Land and Stand (Performance HUD).
   If any mode is under 72 fps, tune the mesh steps and shadow resolution in xr/src/experience.ts (onXRChange) and
   report before and after."
2. `feat/ahmed-lander`: "Replace the procedural lander in xr/src/objects.ts (makeLander) with the lander from
   xr/reference/ahmed_concept.html (copy the file there first). Keep the returned panel and dish groups so they
   still turn to the real Sun and Earth."
3. `feat/ahmed-score-layer`: "Make loadScoreLayer and loadZones in xr/src/data.ts match the files the website
   session ships in web/public/data/suitability/, and check the Goldilocks heat map and zone outlines in Orbit and Land."
4. `feat/ahmed-vr-comfort`: "In VR, fade to black for 200 ms when switching between Orbit, the raised view and
   Stand, and let the left thumbstick turn the view in 30 degree steps."
5. `feat/ahmed-earth-phase-labels`: "Name the brightest stars and show the Earth's phase and the Sun's azimuth as
   small labels in Stand, using stars.json names and computeSeries values only."
The old placeholder `web/src/routes/Moon3D.tsx` belongs to the website session: it embeds `/xr/?embed=1`.

## Luke (story)
1. `feat/luke-explain` (Haiku 5.5): "Add short plain-language explainers in web/src/content/ for each tab (2-3 sentences:
   what you see, why it matters for a lander) and show them under each tab's controls."
2. `feat/luke-story-mode`: "Add a 'Story' tab that walks through 4 steps with a button: the Sun at the pole,
   IM-2's short life, the launch-slip effect (Compare), and the Window Finder answer. Each step sets the site/date."
3. Human job: submission text, video, social posts, pitch script (docs/PITCH.md).

## Eugenio (lead)
1. Merge windows, integration, pitch. Confirm griffin1 / change7 / bluemoon1 coordinates before adding them.
