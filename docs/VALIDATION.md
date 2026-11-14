# Validation (owner: Kien). Every number in the pitch must trace to a row here.

## 1. Ephemeris vs JPL Horizons
| Site | Times | Max abs error Sun alt / az (deg) | Max abs error Earth alt / az (deg) |
|------|-------|----------------------------------|------------------------------------|
| (fill) | 20 | | |

Method: Horizons API, EPHEM_TYPE=OBSERVER, CENTER='coord@301', COORD_TYPE=GEODETIC,
SITE_COORD='<E-lon>,<lat>,<alt km>', QUANTITIES='4', CSV_FORMAT=YES. Fixtures in tests/fixtures/.

## 2. TypeScript vs Python
Same 3 sites x 20 times: max difference between web/src/lib/analysis and engine/topo.py (deg).

## 3. Horizon mask sanity tests
Synthetic flat DEM gives the pure curvature dip; synthetic cone gives the expected angle within 0.1 deg.

## 4. Long-run illumination vs NASA PGDA maps
| Site | Our Sun % | PGDA Sun % | Diff | Our Earth % | PGDA Earth % | Diff | Notes |
|------|-----------|------------|------|-------------|--------------|------|-------|

Expected sources of difference: DEM resolution (120 m), observer height (2 m vs surface), centre-of-disc vs
any-part definition (Earth), averaging period (PGDA ~18.6 yr vs ours 2009-2028).

## 5. Known limitations (say these out loud if asked)
- Line-of-sight only: no link budget, no DSN station scheduling, no thermal model.
- 120 m terrain: very local boulders and small craters are not resolved.
- Historic/far-side sites use a flat horizon.
