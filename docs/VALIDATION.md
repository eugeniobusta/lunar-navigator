# Validation (owner: Kien). Every number in the pitch must trace to a row here.

## 1. Ephemeris vs JPL Horizons
| Site | Times | Max abs error Sun alt / az (deg) | Max abs error Earth alt / az (deg) |
|------|-------|----------------------------------|------------------------------------|
| mma01 | 20 | 0.0007 / 0.0000 | 0.0000 / 0.0000 |
| hw02 | 20 | 0.0007 / 0.0000 | 0.0000 / 0.0000 |
| apollo11 | 20 | 0.0007 / 0.0001 | 0.0000 / 0.0001 |

Measured Sat 14 Nov by `scripts/fetch_horizons_fixtures.py` (20 times, 2027-01-01 to 2028-11-25, every 36 d 13 h),
using the shipped `web/public/data/ephemeris.json` and `engine/topo.py`, observer on the 1737.4 km sphere.
Target was < 0.05 deg. The 0.0007 deg Sun altitude error is the Sun's parallax from the surface, which we ignore
on purpose (docs/SCIENCE.md section 2). Horizons used DE441 and MEAN_ME; we use DE421 and MOON_ME_DE421.
Also: `engine/topo.py` vs Skyfield's own topocentric alt/az (3 sites x 10 times): max error 0.00068 deg.

Method: Horizons API, EPHEM_TYPE=OBSERVER, CENTER='coord@301', COORD_TYPE=GEODETIC,
SITE_COORD='<E-lon>,<lat>,<alt km>', QUANTITIES='4', CSV_FORMAT=YES. Fixtures in tests/fixtures/.

## 2. TypeScript vs Python
Same 3 sites x 20 times: max difference between web/src/lib/analysis and engine/topo.py (deg).

| Quantity | Max difference (deg) |
|----------|----------------------|
| Sun elevation | 0.00004 |
| Sun azimuth | 0.00022 |
| Earth elevation | 0.00001 |
| Earth azimuth | 0.00002 |

Measured by `web/src/lib/analysis/reference.test.ts` against `tests/fixtures/topo_reference.json`. The difference is
the rounding of ephemeris.json (6 decimals for the Sun direction, 0.1 km for Earth).

## 3. Horizon mask sanity tests
Synthetic flat DEM gives the pure curvature dip; synthetic cone gives the expected angle within 0.1 deg.
Both pass in `tests/test_horizon.py` (flat: -0.0869 deg from 2 m, within 0.0001 deg). On the real DEM the 1.5 % distance
step under-reads the horizon by at most 0.08 deg (mean 0.004 deg) compared with a 30x finer march, over the 10 DEM sites.

## 4. Long-run illumination vs NASA PGDA maps
| Site | Our Sun % | PGDA Sun % | Diff | Our Earth % | PGDA Earth % | Diff | Notes |
|------|-----------|------------|------|-------------|--------------|------|-------|
| pcb03 | 51.5 | 49.3 | +2.2 | 71.8 | 70.3 | +1.5 | Peak: the 2 m mast sees over its own ground; from 0 m we get Sun 48.8. |
| hw02 | 46.9 | 46.8 | +0.1 | 57.6 | 59.3 | -1.7 | Earth: we count the centre of the disc, PGDA any part (any-part gives 62.4). |
| mma01 | 45.5 | 45.1 | +0.4 | 100.0 | 100.0 | +0.0 | Agrees; Malapert always sees Earth. |
| mmp06 | 12.6 | 14.1 | -1.5 | 49.2 | 52.9 | -3.8 | Point lies in a hollow (NASA agrees it is dark); Earth gap is centre vs any part (any-part gives 53.7). |
| mmo01 | 70.9 | 69.7 | +1.2 | 58.5 | 56.2 | +2.3 | Summit: strong local gradient (PGDA Sun is 46.3-72.3 in the 3x3 pixels around it) plus the 2 m mast. |
| nr107 | 52.9 | 49.8 | +3.1 | 57.5 | 60.1 | -2.6 | Ridge: 2 m mast (from 0 m we get Sun 49.2); Earth is centre vs any part (any-part gives 62.3). |
| nr208 | 30.8 | 30.6 | +0.2 | 52.8 | 55.0 | -2.2 | Sun agrees; Earth is centre vs any part (any-part gives 57.4). |
| dgr203 | 56.7 | 56.8 | -0.2 | 54.3 | 55.8 | -1.5 | Sun agrees; Earth is centre vs any part (any-part gives 58.9). |
| sp07 | 49.3 | 52.8 | -3.5 | 42.3 | 46.6 | -4.3 | Our worst Sun case: the site pixel is at the top of a steep local range in the PGDA map (39.8-52.9 in 3x3 px); Earth any-part gives 47.0 (+0.4). |

Measured Sat 14 Nov by `scripts/validate_pgda.py`: our own ephemeris 2009-01-01 to 2028-12-31 every 6 h (29,220 samples),
the shipped horizons (2 m observer), PGDA maps read at the pixel containing each site (int16, scale 4e-05, no nodata).
"Our" columns count the CENTRE of the disc above the horizon, as the app does. Diff = ours - PGDA in percentage points.
Largest differences: Sun 3.5 points (sp07), Earth 4.3 points (sp07). No site differs by more than 10 points.

Like-for-like with PGDA's own definitions (mean visible fraction of the solar disc; Earth counted if any part shows):

| Site | Our Sun disc % | PGDA Sun % | Diff | Our Earth any-part % | PGDA Earth % | Diff | Ours from 0 m: Sun disc / Earth any |
|------|----------------|------------|------|----------------------|--------------|------|-------------------------------------|
| pcb03 | 51.5 | 49.3 | +2.2 | 78.3 | 70.3 | +8.1 | 48.8 / 71.8 |
| hw02 | 46.8 | 46.8 | -0.0 | 62.4 | 59.3 | +3.1 | 40.7 / 58.4 |
| mma01 | 45.5 | 45.1 | +0.4 | 100.0 | 100.0 | +0.0 | 45.1 / 100.0 |
| mmp06 | 12.6 | 14.1 | -1.4 | 53.7 | 52.9 | +0.7 | 12.1 / 53.5 |
| mmo01 | 71.0 | 69.7 | +1.3 | 63.4 | 56.2 | +7.2 | 66.8 / 59.4 |
| nr107 | 52.9 | 49.8 | +3.1 | 62.3 | 60.1 | +2.2 | 49.2 / 60.5 |
| nr208 | 30.7 | 30.6 | +0.2 | 57.4 | 55.0 | +2.4 | 29.6 / 56.8 |
| dgr203 | 56.7 | 56.8 | -0.2 | 58.9 | 55.8 | +3.1 | 52.2 / 56.0 |
| sp07 | 49.3 | 52.8 | -3.5 | 47.0 | 46.6 | +0.4 | 48.6 / 46.9 |

Investigated the largest like-for-like gap (pcb03 Earth, +8.1): it is the observer height. With the observer on the
surface (0 m) instead of a 2 m mast our any-part Earth figure is 71.8 against PGDA's 70.3 (+1.5). At a peak, 2 m is
enough to see over the convex ground nearby. The same holds for mmo01 (63.4 at 2 m, 59.4 at 0 m, PGDA 56.2).
Not like-for-like and not corrected: PGDA averages hourly steps over ~18.6 years on an earlier LOLA grid (product dated 2016-08); we use 6-hourly
steps over 20 years on the 2017 LDEM. Whether PGDA's Sun figure is exactly the mean disc fraction is our reading of
Mazarico et al. 2011; the centre-of-disc and disc-fraction columns differ by at most 0.1 point, so it does not matter here.

Expected sources of difference: DEM resolution (120 m), observer height (2 m vs surface), centre-of-disc vs
any-part definition (Earth), averaging period (PGDA ~18.6 yr vs ours 2009-2028).

## 5. Known limitations (say these out loud if asked)
- Line-of-sight only: no link budget, no DSN station scheduling, no thermal model.
- 120 m terrain: very local boulders and small craters are not resolved.
- Historic/far-side sites use a flat horizon.

## 6. Artemis coordinates vs the source paper
All nine Artemis points in `sites.json` were checked on 14 Nov 2026 against Wueller et al. 2026
(doi:10.1029/2025JE009434): Table A1 of the publisher PDF (4 decimals) and `LandingSites.dbf` in the paper's Zenodo
data set (identical to our values digit for digit). Nine of nine confirmed; none changed.
Peak near Cabeus B (83.56 S) and Nobile Rim 2 (83.91 S) lie outside NASA's 6 deg limit in the paper too, and the
Mons Mouton Plateau point was chosen by the authors for access to a cold permanent shadow, not for sunlight.
Notes and quotes: docs/research/artemis_coordinates.md.

## 7. Automated tests and release check (14 Nov 2026, before the map-first round; see section 8 for the current state)
- `make test`: 53 Python tests and 108 browser-maths tests pass. `make e2e`: 5 end-to-end browser tests pass
  (every tab opens with content and no console error, the Window Finder returns a calendar, Where to land answers
  clicks and presets, a shared link reopens the same view). CI runs all of them on every pull request.
- Release check with a scripted browser at 1440 x 900 and 390 x 844: every tab, all 14 sites, every preset and
  control; no console errors, no failed requests, no sideways scrolling; every control reachable by keyboard shows
  a visible focus; no page text below WCAG AA contrast (chart colours are checked by calculation, lowest 4.1 for
  large text).
- Links on the Data tab: 222 distinct, all open without a login. Two (the Wueller et al. DOI and its Zenodo record)
  refuse scripted requests with HTTP 403 and open normally in a browser.

## 8. Refinement round: geography, traffic lights and the end-to-end check (14 Nov 2026)

**What each parameter was checked against**

| Parameter | Our data | Reference | Method | Agreement | What stays uncertain |
|-----------|----------|-----------|--------|-----------|----------------------|
| Geography: projection, row order, longitude sign | The 1024 x 1024 terrain grid | IAU Gazetteer of Planetary Nomenclature: centre and diameter of nine named craters | Mean height on the rim circle minus mean height at 0.3 of the radius, at the gazetteer's coordinates (`tests/test_basemap.py`) | All nine are depressions, 2.0 to 3.8 km deep. With the longitude sign flipped only four would pass | The gazetteer is independent of our grids; the heights are LOLA's |
| Map to data | The map on screen | The files | A click 40 px right of the pole must report 90 deg E at the latitude the scale bar implies; an Artemis marker must report its site's coordinates | Exact to the displayed three decimals at both screen sizes | None found |
| Sun and Earth positions | Skyfield with JPL DE421 | JPL Horizons | 3 sites x 20 times (section 1) | Largest difference 0.0007 deg | None that matters here |
| Long-run sunlight and Earth in view | NASA PGDA product 69 (used as published) and our own hour-by-hour model | Each other | 9 Artemis points (section 4) | Within 3.5 and 4.3 percentage points | Both are computed from LOLA terrain, so this is not independent of the terrain |
| Signal delay | Light time from the ephemeris: 1.19 to 1.357 s | NASA NSSDC Moon Fact Sheet distance range, 357,000 to 407,000 km | Distance divided by the speed of light gives 1.19 to 1.36 s | Agrees | None |
| Landing slope, walkable ground | Computed from LOLA at 120 m | Not checked against a second product | | Not performed | Baseline is 120 m against NASA's 100 m; hazards under 120 m are invisible |
| Temperature, ice depth | Diviner Polar Resource Product, as published | Not checked against a second source | | Not performed | A thermal model on a mesh of about 0.5 km |
| Permanent shadow | PGDA average sunlight of exactly 0, patches of 1 km2 or more | Not checked against a published PSR map | | Not performed | The 1 km2 cut is a team choice |

**Missing data.** Inside the 6 degree region none of the eight layers has a missing source value (checked on all
7,235,020 cells of the 120 m grid). "No stable ice within 2.87 m" (41.7 % of the region) is an answer and scores 0.
The code still treats a no-data cell as grey, never green, and a ticked parameter with no value as zero.

**Classes read back from 8-bit layers.** Against the source values the class differs in 0.11 % to 0.23 % of map
pixels per parameter (0.67 % for ice depth), always within one step of a boundary. For the four parameters bounded
by a NASA limit, red comes from the exact limit, not from the byte.

**Scoring rules, tested** (`rag.test.ts`, `paint.test.ts`, `suitability.test.ts`): every class boundary of
docs/criteria.csv; flipped directions; missing data; a cell that fails a NASA limit is red under every preset and
every single parameter, checked on all 1,048,576 map cells; opacity changes only the alpha of a pixel;
"NASA-style balance" still reproduces every published score.

**Colour.** On the page background the class colours measure 8.1 (green), 9.7 (amber) and 4.6 (red) to 1. Under
simulated deuteranopia green and red differ by a CIELAB distance of only 15, so colour is never the only signal:
the legend carries words, unsafe ground is hatched, and the colour-blind palette (yellow, grey, dark blue) keeps
every pair at 39 or more for protanopia, deuteranopia and tritanopia.

**End-to-end check on the live site** (`web/e2e/tools/qa-live.mjs`, run at 1440 x 900 and 390 x 844 against
https://claudes-plan-lunar-navigator.vercel.app at commit 7a1dcd4): 29 of 29 checks pass.

- The map is the home page; layers painted 0.7 s after a fresh load at 1440 x 900 and 0.6 s at 390 x 844 (this
  machine and network; not measured on the presentation computer).
- Rings, compass and the nine crater names are on the map; green, amber and red are all drawn.
- 18 spots (six zones, twelve other points, safe and unsafe): the score, the class, the failed limits and every
  measurement shown equal what this script computes from the files with its own arithmetic.
- Each of the eight layers alone: its own name, its legend in real units, a different picture. The two
  parameters without a map say so.
- Opacity changes the picture and not the answer.
- The ten best zones under each of the five presets equal an independent ranking of zones.csv; under NASA-style
  balance they are zones 1 to 10 with the published scores.
- The spot panel's reasons change with the ticks. Compare's two overall scores equal site_values.csv.
- Seven pages render; a reload keeps the view; the 3D / VR link carries the clicked point; keyboard zoom works;
  no console errors at either size; `/xr/` answers.
- 228 distinct links on the Data page: all open except the Wueller et al. DOI, which answers 403 to scripts and
  opens in a browser.

On its first run this script caught a real fault: a link a few metres off a zone's centre showed the cell's map
score (83) under a headline that gave the zone's score (76). Fixed in PR #40.

**Not done.** The presentation computer, its screen and its browser were not tested: someone has to open the site
on it. The VR scene inside `/xr/` was not looked at by this session. Automated tests on main: 56 Python,
143 browser-maths, 6 browser smoke tests.

Backup screenshots of every essential screen at 1920 x 1080, 1440 x 900 and 390 x 844, taken from the live site:
`media/screenshots/final/` (`web/e2e/tools/screens.mjs`).

## 9. After the integration of Chinh's redesign: both views (14 Nov 2026, late)

The site is now one site with two views (Simple and Detailed, docs/DECISIONS.md). The science and the scoring did
not change; this section records that the integrated site still gives the same answers.

- **Automated tests on main**: 57 Python, 166 browser-maths, 39 VR, 11 browser smoke tests (both views, every
  page, the menu bar at four widths, the countdown, Explore a site, Plan a landing, Overview and Window Finder,
  Site Finder twice, shared links).
- **End-to-end check on the live site** (`web/e2e/tools/qa-live.mjs`, commit bbc631d, at 1440 x 900, 1920 x 1080,
  1280 x 800 and 390 x 844): 53 of 53 checks pass. The map checks of section 8 run again in Site Finder (18 spots,
  every layer alone, opacity, the ten best under five presets, Compare). New checks:
  - the seven Detailed pages and the four Simple pages render, and the switch moves between them;
  - **Plan a landing (Simple) gives zone 2 the score the files give, 76**, the same as Site Finder: one scoring
    engine in both views; its landing days and battery check follow the chosen place;
  - **Window Finder still finds 32 landing days** for a 14-day mission at Malapert Massif from 14 Nov 2026
    (the page counts 366 days in the 12 months it searches);
  - the menu bar: no part overlaps another or leaves the screen, in both views, at the four widths (the pages fold
    behind the Menu button when the countdown is shown and the bar is too narrow);
  - no console errors at any size; 245 distinct links on Data & Method, all open except the Wueller et al. DOI
    (403 to scripts).
- **The homepage countdown** ("Sunrise at Malapert Massif in ...") comes from `computeSeries` on the published
  ephemeris and skyline. For 14 Nov 2026 00:00 UTC the browser code and the Python model (`engine/visibility.py`)
  both put the next sunrise at 17 Nov 2026 10:12:01 UTC, within 2 seconds of each other (`countdown.test.ts`).
  The crossing is interpolated between two hourly samples, so the clock is good to a few minutes, not seconds.
- **Pictures**: all nine NASA photo IDs were found in the NASA Image and Video Library with the titles and dates we
  list; credits are on the page, on Data & Method, in `index.json` and in docs/CREDITS.md, which also says what
  could not be confirmed (the CGI Moon Kit credit line, the VR's Earth and Sun textures that are not in the
  repository yet, Meta's SDK licence).
- **Not done**: the presentation computer is still untested; the demo videos in `media/` were not re-recorded
  (the script is fixed, the footage shows the older site); the VR scene was not looked at by this session.

Screenshots of every page in both views at 1920 x 1080, 1440 x 900 and 390 x 844, from the live site:
`media/screenshots/final/` (s = Simple, d = Detailed; 60 files).
