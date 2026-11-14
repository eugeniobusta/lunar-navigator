# Audit, 14 Nov 2026 (refinement round)

Section 1 of docs/REFINEMENT_BRIEF.md, done before any edit. Numbers come from scripts run on the raw grids and the
published files on this date. "Fixed" notes are added at the end as the round goes on.

## What was inspected

- **Structure**: Python pipeline (`engine/`, `scripts/`, `make data`) writes static files to `web/public/data/`;
  React 18 + TypeScript + Vite app in `web/`; a separate VR view in `xr/` that imports `web/src/lib/analysis/`.
  No server, no external API at run time: every number shown is in a published file.
- **Projection**: one grid convention everywhere: south polar stereographic on a 1737.4 km sphere, lon 0 towards
  +y (up, towards Earth), lon 90 E towards +x, row 0 the northern edge. Source grids are 120 m (LOLA LDEM_75S_120M
  and NASA PGDA product 69, same pixel grid; the pipeline asserts the PGDA transform). The map grid is 1024 x 1024
  over 440 km (about 430 m per pixel).
- **Scoring**: hard limits and a 0 to 100 score in `engine/criteria.py`, reproduced bit for bit in the browser by
  `web/src/lib/analysis/suitability.ts` (tests compare every pixel and every zone).

## A. Working

- Sky panorama, Window Finder, Compare, Battery, Data and Method tabs; shareable links; 3D / VR link.
- Where to land: tick boxes, presets, zone ranking, "Click any spot", "Why here?", Artemis rank table.
- Tests on main: 53 Python, 108 browser-maths, 19 VR, 5 browser smoke tests.
- Sun and Earth positions agree with JPL Horizons to 0.0007 deg; long-run sunlight and Earth visibility agree with
  NASA's PGDA maps to within 4.3 percentage points at the nine Artemis points (docs/VALIDATION.md).

## B. Incomplete

- The map cannot be panned or zoomed smoothly (a 1x / 2x / 4x selector inside a scroll box).
- No relief under the heat map, no crater names, no latitude rings other than 84 deg S.
- No traffic-light classes: the map is a continuous green ramp on grey; a single parameter is a ramp from black.
- No per-layer opacity. No way to prefer the opposite direction of a parameter (colder ground for ice science).
- "Click any spot" shows sub-scores as percentages; real values appear only with "Show the numbers".
- "Why here?" lists every sentence; it does not separate what is good from what is weak.

## C. Confirmed bugs

- README step 4 of "How it works" still says "The weights are yours to change" (it is tick boxes now).
- The single-parameter legend uses a CSS gradient, which the design rules forbid, and colour is its only signal.
- The 3D Moon tab embeds the VR view in a frame; in a headless browser it renders black, so it has never been
  verified by script. A person must look at it.

## D. Suspected (to check, not yet confirmed)

- Class boundaries read back from the 8-bit layers can be off by one step. Measured: the class from the byte
  differs from the class from the source value in 0.11 % to 0.23 % of map pixels per parameter (0.67 % for ice
  depth). It only happens within 0.4 % of a parameter's range from a boundary.
- Two Data-tab links (the Wueller et al. DOI and Zenodo) answer 403 to scripts; they open in a real browser.

## E. Scientific uncertainties

- **Each map pixel shows its best 120 m square** (a passing one if any). The map is therefore optimistic about
  area; the percentages in the text (14.3 % passes) are computed on the 120 m grid and are not affected.
- **The 120 m map cannot see small hazards.** The IM-2 landing spot passes every limit here; the lander fell
  into a crater about 20 m across. Passing means "worth a closer look".
- **Slope baseline**: NASA's limit is over 100 m; ours is over 120 m, the steepest of four one-sided differences.
- **Sunlight and Earth percentages** are NASA's long-run averages (PGDA product 69), not the mission dates. Our
  own hour-by-hour model (2026 to 2029) is run only at zone best cells and at the listed sites.
- **Temperature and ice depth** come from the Diviner Polar Resource Product, a thermal model on a mesh of about
  0.5 km, averaged in 600 m bins. Ice depth is where ice would be stable, not where ice has been found.
- **Missing data**: inside the 6 deg region no layer has a missing source value (checked on all 7,235,020 cells).
  "No stable ice within 2.87 m" (41.7 % of the region) is an answer, scored 0, not a gap.
- **Temperature direction**: the score treats warmer mean ground as better (hardware needs less heating). A
  mission after ice wants the opposite. Both readings are defensible; the user should be able to choose.
- **Team choices**: the 25 % sunlight screen, the 50 % walkable share, the 70 % ideals and the score classes are
  ours, marked as such in docs/criteria.csv. Thresholds quoted from NASA are quoted with their source.
- **Not independently checked**: our landing slope against LOLA's own slope product, and temperature against a
  second source. PGDA illumination is itself computed from LOLA, so it is not independent of our terrain.

## F. UI / UX weaknesses

- The first screen is the sky panorama of one site, not the map: a visitor does not see "where to land" first.
- Nine tabs, a long page under "Where to land" (map, three tables, lessons), two map modes with different panels.
- Chips, pills and bordered panels everywhere; no single hierarchy; ten parameter colours plus the score green.
- Steep or dark ground is plain grey: nothing says "unsafe" or which limit fails until you click.

## G. Performance

- Where to land loads nine 1 MB grids (about 0.6 MB each over the wire) plus zones.csv (0.7 MB).
- Main bundle 333 kB, Where to land chunk 25 kB. Recolouring the 1024 x 1024 map runs on every tick change.
- The published score grid lets the default view draw before the layers arrive.

## H. Priorities for this round

1. P0: traffic-light model with hard limits that always win, missing data never green, direction flips, tested.
2. P1: map-first home with relief, smooth zoom and pan, rings, compass, crater names (IAU), markers.
3. P2: one layer panel (groups, flips, importance, opacity), one legend with real units and a hatch for unsafe
   ground, a click panel with measurements, good here / weak here, failed limits and uncertainty.
4. P3: "mission chart" visual pass.
5. P4: end-to-end QA on the live site, backup screenshots, this file updated.

## Outcome of the round (added at the end, 14 Nov 2026)

Evidence for each line is in docs/VALIDATION.md section 8.

### Fixed

- **P0** Traffic-light model shared with the VR (`rag.ts`): three classes, grey for no data, NASA limits always
  win and say which one fails, five directions can be flipped, thresholds and reasoning in docs/criteria.md
  section 8. PR #34.
- **P0** Geography checked against an independent source: the nine named craters sit on depressions of our
  terrain at their IAU positions. PR #35.
- **P0** Missing data counted: none inside the region; the code path for it is tested anyway.
- **P1** The site opens on the map: relief from our LOLA data, smooth zoom and pan, rings, compass, IAU names,
  markers, one legend with real units and a hatch. PR #35.
- **P1** A link slightly off a zone's centre showed a score that disagreed with the headline. PR #40.
- **P1** With one parameter ticked, a zone could read "score 100, acceptable". PR #37.
- **P2** Layer panel (groups, flips, importance, show alone, opacity), spot panel (measurements, good here, weak
  here, failed limits, how sure, four next steps), Compare judges both sites as landing sites. PRs #35, #37.
- **P3** Visual pass: no chips, no card grids, one icon set, spacing scale, traffic-light colours only for
  suitability. PR #37.
- **C** README no longer says "the weights are yours to change"; the gradient legend is gone; the IAU gazetteer's
  terms are quoted from its own FAQ (the first link we used answered HTTP 500). PRs #35, #38.

### Remains

- **Not tested on the presentation computer.** Load time, resolution and browser there are unknown.
- **The VR scene** was not looked at by this session, and `scripts/record_footage.mjs` (the VR session's) clicks a
  "Where to land" tab that no longer exists.
- **Each map pixel still shows its best 120 m square.** The spot panel says so; the area figures are unaffected.
- **Landing slope, temperature, ice depth and permanent shadow** have no second source to compare with.
- **Opacity is per layer shown**, not a blend of several layers at once: with several parameters ticked the map
  shows their combined class, and any one of them can be shown alone.
- **Zoomed in, the overlay is the 430 m map grid.** The 120 m site tiles are used by the VR, not by this map.
- **The two time-model parameters** (longest night, longest time without Earth) are known at zone centres and
  listed sites only, so a clicked spot that is not a zone is scored without them, and says so.
- **Audio** (brief section 6) was not attempted.
- One Data-page link (the Wueller et al. DOI) answers 403 to scripts and opens in a browser.

## After the integration of Chinh's redesign (14 Nov 2026, late)

Evidence: docs/VALIDATION.md section 9.

- **Changed on purpose**: the first screen is his homepage again, not the map (the lead's decision); the map is
  one click away in both views ("Plan a landing", or "Site Finder"). His look uses uppercase headlines, pill
  switches and cards, which the earlier visual pass had removed.
- **Fixed**: the menu bar ran into the countdown at 1440 px; it now folds by measurement. The countdown is tested
  against the Python model.
- **Remains**: in Site Finder the spot panel is long, so on a wide screen there is empty space under the map
  beside it. The menu folds behind the Menu button on the homepage at 1440 px in the Detailed view, because the
  countdown takes the room. The demo videos show the older site. `web/public/media/` adds 1.8 MB of photos to the
  homepage. Google Fonts is still loaded from Google.
