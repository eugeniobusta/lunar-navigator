# Data dictionary

Every file we publish in `web/public/data/` (live at https://claudes-plan-lunar-navigator.vercel.app/data/),
field by field. The contracts are in docs/INTERFACES.md; the formulas in docs/SCIENCE.md. All files are rebuilt by
`make data`. Licence: CC BY 4.0 (DATA_LICENSE.md); NASA source data keeps its own terms.

## Conventions (all files)

| Quantity | Convention |
|----------|------------|
| Angles | Degrees. |
| Latitude | Planetocentric, north positive, -90 to 90. |
| Longitude | East positive, -180 to 180. |
| Azimuth | Clockwise from local north, 0 to 360 (0 = north, 90 = east). |
| Elevation | Angle above the local horizontal plane; negative below it. |
| Time | UTC, ISO-8601. |
| Moon | Sphere of radius 1737.4 km. Heights are metres above that sphere. |
| Frame | MOON_ME (mean Earth / polar axis) of DE421: +Z = north pole, +X = mean direction of Earth (lon 0), +Y = lon 90 E. |
| Map projection | Polar stereographic, south pole at the centre, true scale at the pole: `+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs`. +y points along lon 0, +x along lon 90 E. |
| "Sunlit" / "Earth visible" | The CENTRE of the disc is above the terrain horizon, seen from 2 m above the ground. |

## index.json

The list of published files.

| Field | Type | Meaning |
|-------|------|---------|
| `version` | integer | Format version (1). |
| `licence` | string | Licence of the files. |
| `dictionary` | string | URL of this document. |
| `files[].path` | string | Path relative to `/data/`. |
| `files[].bytes` | integer | File size in bytes. |
| `files[].format` | string | JSON, CSV, or the binary encoding. |
| `files[].description` | string | One line on what the file holds. |

## sites.json

| Field | Type | Unit | Meaning |
|-------|------|------|---------|
| `version` | integer | | Format version (1). |
| `sites[].id` | string | | Short identifier, used in file names (`horizons/<id>.json`). |
| `sites[].name` | string | | Display name. |
| `sites[].group` | string | | `artemis` (candidate region), `mission` (a flown or planned lander) or `historic`. |
| `sites[].lat` | number | deg | Latitude. |
| `sites[].lon` | number | deg | East longitude. |
| `sites[].terrain` | string | | `dem` = horizon computed from the LOLA elevation map; `flat` = outside the map, horizon 0 deg everywhere. |
| `sites[].has_grid` | boolean | | True if `horizons/<id>_grid.json` exists. |
| `sites[].note` | string | | Free text. |
| `sites[].source` | string | | Where the coordinates come from. |
| `sites[].coords_quality` | string | | `published`, `approximate`, or `verify` (under review; do not treat as exact). |

## ephemeris.json

Where the Sun and Earth are, seen from the Moon's centre, every hour. One file serves every site: the app turns
these vectors into elevation and azimuth for any latitude and longitude (docs/SCIENCE.md section 2).

| Field | Type | Unit | Meaning |
|-------|------|------|---------|
| `version` | integer | | Format version (1). |
| `frame` | string | | `MOON_ME_DE421`. |
| `source` | string | | Software and kernels used; apparent positions (light-time and aberration applied). |
| `start_utc` | string | UTC | Time of sample 0: `2026-11-01T00:00:00Z`. |
| `step_s` | integer | s | Spacing of samples: 3600. Sample i is at `start_utc + i * step_s`. |
| `n` | integer | | Number of samples: 27768 (last one 2029-12-31T23:00Z). |
| `sun_dir` | number[3n] | unitless | Unit vector from the Moon's centre to the Sun, `[x0, y0, z0, x1, ...]`, 6 decimals. |
| `sun_semidiam_deg` | number[n] | deg | Angular radius of the Sun (solar radius 695,700 km), 4 decimals. |
| `earth_km` | number[3n] | km | Earth's centre minus the Moon's centre, `[x0, y0, z0, x1, ...]`, 1 decimal. |

## horizons/&lt;site_id&gt;.json

The skyline around one site.

| Field | Type | Unit | Meaning |
|-------|------|------|---------|
| `version` | integer | | Format version (1). |
| `site_id` | string | | Matches `sites[].id`. |
| `lat`, `lon` | number | deg | Site position. |
| `surface_elev_m` | number | m | Ground height at the site above the 1737.4 km sphere (0 if flat). |
| `observer_h_m` | number | m | Height of the observer above the ground: 2.0. |
| `az_step_deg` | number | deg | Azimuth spacing: 0.5. |
| `elev_deg` | number[720] | deg | Elevation of the terrain horizon at azimuth `i * az_step_deg`, 3 decimals. Negative values mean the horizon lies below the horizontal (the observer looks down from high ground). Interpolate linearly between entries, wrapping at 360. |
| `dem` | string | | `LDEM_75S_120M`, or `flat` when terrain is not modelled (all zeros). |
| `max_range_km` | number | km | How far the terrain was searched: 150. |

## horizons/&lt;site_id&gt;_grid.json

Skylines at 81 points around a site, for "move the lander".

| Field | Type | Unit | Meaning |
|-------|------|------|---------|
| `version` | integer | | Format version (1). |
| `site_id` | string | | Matches `sites[].id`. |
| `spacing_m` | number | m | Distance between neighbouring points: 500. |
| `n` | integer | | Points per side: 9 (81 points). |
| `observer_h_m`, `az_step_deg` | number | m, deg | As in `horizons/<site_id>.json`. |
| `points[].i`, `points[].j` | integer | | Column (along map x) and row (along map y), 0 to 8. The site is `i = 4, j = 4`. |
| `points[].dx_m`, `points[].dy_m` | number | m | Offset from the site in polar-stereographic x and y, -2000 to 2000. |
| `points[].lat`, `points[].lon` | number | deg | Position of the point. |
| `points[].surface_elev_m` | number | m | Ground height at the point. |
| `points[].elev_deg` | number[720] | deg | Horizon at the point, as above. |

## terrain/south_pole.json and the three binary grids

A 1024 x 1024 picture of the south pole for the 3D view (docs/INTERFACES.md section 8).

| Field | Type | Unit | Meaning |
|-------|------|------|---------|
| `version` | integer | | Format version (1). |
| `proj` | string | | PROJ string of the map projection (see Conventions). |
| `size` | integer | px | Rows and columns: 1024. |
| `pixel_m` | number | m | Pixel size: 429.6875. |
| `x_min_m`, `y_max_m` | number | m | Outer edges of the grid: -220000 and 220000. Centre of pixel (row, col): `x = x_min_m + (col + 0.5) * pixel_m`, `y = y_max_m - (row + 0.5) * pixel_m`. |
| `height_min_m`, `height_max_m` | number | m | Height range used to scale the uint16 values. |
| `files.height`, `files.sun`, `files.earth` | string | | Names of the three binary files. |
| `sites[].id`, `sites[].name` | string | | Every site with `terrain = "dem"`. |
| `sites[].x_m`, `sites[].y_m` | number | m | Site position in the map projection. |
| `sites[].height_m` | number | m | Ground height at the site (full-resolution elevation map). |
| `sources[].name`, `sources[].url` | string | | Where the source data comes from. |

| File | Encoding | Value |
|------|----------|-------|
| `terrain/south_pole_height.u16` | 1024 x 1024 little-endian uint16, row-major, row 0 = northern edge (largest y), column 0 = smallest x | `height_m = height_min_m + v / 65535 * (height_max_m - height_min_m)` |
| `terrain/south_pole_sun.u8` | 1024 x 1024 uint8, same layout | NASA PGDA average sunlight, percent 0 to 100; 255 = no data |
| `terrain/south_pole_earth.u8` | 1024 x 1024 uint8, same layout | NASA PGDA average Earth visibility, percent 0 to 100; 255 = no data |

Each pixel is the mean of the 120 m source over its ~430 m footprint, so sharp ridges are smoothed. The two
visibility grids are resampled NASA data (cite Mazarico et al. 2011), not our own results.

## validation/jpl.csv

Our Sun and Earth positions against JPL Horizons (docs/VALIDATION.md table 1). One row per site and body.

| Column | Unit | Meaning |
|--------|------|---------|
| `site_id`, `site_name` | | Site. |
| `lat_deg`, `lon_east_deg` | deg | Site position; observer on the 1737.4 km sphere. |
| `body` | | `sun` or `earth`. |
| `n_times` | | Number of times compared (20, across 2027-2028). |
| `max_abs_elevation_error_deg` | deg | Largest difference in elevation, ours minus JPL, absolute value. |
| `max_abs_azimuth_error_deg` | deg | Largest difference in azimuth. |
| `max_abs_azimuth_error_on_sky_deg` | deg | The azimuth difference times cos(elevation): the true angular offset on the sky. |

## validation/pgda.csv

Our long-run percentages (2009-2028, every 6 hours) against NASA's PGDA maps at the nine Artemis sites
(docs/VALIDATION.md table 4). One row per site. All values are percent of time; differences are percentage points.

| Column | Meaning |
|--------|---------|
| `site_id`, `site_name` | Site. |
| `our_sun_pct_centre` | Share of time the Sun's centre is above our horizon (what the app shows). |
| `pgda_sun_pct` | NASA PGDA average sunlight at the pixel containing the site. |
| `sun_diff_points` | `our_sun_pct_centre - pgda_sun_pct`. |
| `our_earth_pct_centre` | Share of time Earth's centre is above our horizon (what the app shows). |
| `pgda_earth_pct` | NASA PGDA average Earth visibility at the pixel containing the site. |
| `earth_diff_points` | `our_earth_pct_centre - pgda_earth_pct`. |
| `our_sun_pct_disc_fraction` | Mean visible fraction of the Sun's disc (NASA's definition, as we read it). |
| `our_earth_pct_any_part` | Share of time any part of Earth's disc is visible (NASA's definition). |
| `our_sun_pct_disc_fraction_observer_0m`, `our_earth_pct_any_part_observer_0m` | The same two with the observer on the ground instead of 2 m above it. |
