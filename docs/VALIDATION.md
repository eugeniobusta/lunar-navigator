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

## 7. Automated tests and release check (14 Nov 2026)
- `make test`: 53 Python tests and 108 browser-maths tests pass. `make e2e`: 5 end-to-end browser tests pass
  (every tab opens with content and no console error, the Window Finder returns a calendar, Where to land answers
  clicks and presets, a shared link reopens the same view). CI runs all of them on every pull request.
- Release check with a scripted browser at 1440 x 900 and 390 x 844: every tab, all 14 sites, every preset and
  control; no console errors, no failed requests, no sideways scrolling; every control reachable by keyboard shows
  a visible focus; no page text below WCAG AA contrast (chart colours are checked by calculation, lowest 4.1 for
  large text).
- Links on the Data tab: 222 distinct, all open without a login. Two (the Wueller et al. DOI and its Zenodo record)
  refuse scripted requests with HTTP 403 and open normally in a browser.
