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

Expected sources of difference: DEM resolution (120 m), observer height (2 m vs surface), centre-of-disc vs
any-part definition (Earth), averaging period (PGDA ~18.6 yr vs ours 2009-2028).

## 5. Known limitations (say these out loud if asked)
- Line-of-sight only: no link budget, no DSN station scheduling, no thermal model.
- 120 m terrain: very local boulders and small craters are not resolved.
- Historic/far-side sites use a flat horizon.
