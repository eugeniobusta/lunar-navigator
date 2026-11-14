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

`index.json` also carries `third_party`: the credits of pictures and textures that are not ours (the NASA
photographs of the website as `website_photos[]` with `file`, `nasa_id`, `title`, `credit`, `date`, `shown`,
`source`; the VR textures as `vr_textures[]`; and `nasa_media_terms`). They are listed for credit only and are
not covered by our licence. See docs/CREDITS.md.

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

## basemap/ (the relief and the names under the landing map)

Written by `scripts/export_basemap.py`. Same projection as the terrain grids: south polar stereographic on a
1737.4 km sphere, row 0 the northern edge, lon 0 (towards Earth) up, lon 90 E to the right.

| File | What it is |
|------|------------|
| `basemap/relief.jpg` | Shaded relief, 2048 x 2048 pixels over the 440 km square of the suitability grids (about 215 m per pixel), 8-bit greyscale. |
| `basemap/relief_wide.jpg` | Shaded relief of the whole LOLA map (to 75 deg S), 2048 x 2048 pixels, about 447 m per pixel. |
| `basemap/basemap.json` | `images[]` (`file`, `size` in pixels, `half_width_m`: the image covers -half_width_m to +half_width_m in x and y), `projection`, `shading` (method, the four light directions `azimuths_deg` with their `weights`, `altitude_deg`, `vertical_exaggeration`, `note`), `sources`. |
| `basemap/features.json` | `source`, `note`, and `features[]`: `id` (gazetteer feature ID), `name`, `type` (Crater, Mons, Lacus), `lat`, `lon` (centre, degrees, east positive), `diameter_km`, `rank` (major: always labelled; minor: labelled when zoomed in), `url` (the feature's gazetteer page). |

The relief is computed shading of the LOLA heights, lit from four directions at once so every slope reads. It is
not a photograph and not the real sunlight. The feature list is copied from the IAU Gazetteer of Planetary
Nomenclature as read on 14 Nov 2026 (`docs/research/iau_features.csv`).

## terrain/sites/<site_id>/tile.json and its five binary grids

A 512 x 512 close-up of the terrain around each site with `terrain = "dem"`, at the elevation map's own 120 m
pixels (61.44 km across), for the VR view (docs/INTERFACES.md section 9).

| Field | Type | Unit | Meaning |
|-------|------|------|---------|
| `version` | integer | | Format version (1). |
| `site_id` | string | | The site this tile is centred on. |
| `proj` | string | | PROJ string of the map projection (see Conventions). |
| `size` | integer | px | Rows and columns: 512. |
| `pixel_m` | number | m | Pixel size: 120. |
| `x_min_m`, `y_max_m` | number | m | Outer edges of the tile. Centre of pixel (row, col): `x = x_min_m + (col + 0.5) * pixel_m`, `y = y_max_m - (row + 0.5) * pixel_m`. |
| `height_min_m`, `height_max_m` | number | m | Height range used to scale `height.u16`. |
| `site.x_m`, `site.y_m` | number | m | Site position in the map projection. |
| `site.row`, `site.col` | number | px | Site position as fractional pixel indices (an integer is a pixel centre). |
| `site.height_m` | number | m | Ground height at the site (full-resolution elevation map). |
| `far.size`, `far.pixel_m`, `far.x_min_m`, `far.y_max_m`, `far.height_min_m`, `far.height_max_m` | number | px, m | The same grid fields for `far.u16`: 512 pixels of 600 m. |
| `files.height`, `files.sun`, `files.earth`, `files.slope`, `files.far` | string | | Names of the five binary files. |
| `sources[].name`, `sources[].url` | string | | Where the source data comes from. |

| File | Encoding | Value |
|------|----------|-------|
| `height.u16` | 512 x 512 little-endian uint16, row-major, row 0 = northern edge (largest y), column 0 = smallest x | `height_m = height_min_m + v / 65535 * (height_max_m - height_min_m)`; the elevation map's own pixels, not resampled |
| `sun.u8` | 512 x 512 uint8, same layout | NASA PGDA average sunlight at its native 120 m pixels, percent 0 to 100; 255 = no data |
| `earth.u8` | 512 x 512 uint8, same layout | NASA PGDA average Earth visibility, percent 0 to 100; 255 = no data |
| `slope.u8` | 512 x 512 uint8, same layout | Terrain slope in whole degrees, measured across 240 m; 255 = no data |
| `far.u16` | 512 x 512 little-endian uint16, same layout, 600 m pixels | Heights of the wider surroundings (each pixel the mean of 5 x 5 elevation-map pixels), scaled with `far.height_min_m` and `far.height_max_m` |

The two visibility grids are NASA data (cite Mazarico et al. 2011), not our own results.

## suitability/ (landing criteria and Goldilocks zones)

Where a crewed lander could set down, by NASA's Artemis III requirements and our 0 to 100 score
(docs/criteria.md, docs/INTERFACES.md section 11).

| File | Encoding | Value |
|------|----------|-------|
| `suitability/south_pole_score.u8` | 1024 x 1024 uint8 on the `terrain/south_pole.json` grid | `0..100`: every hard limit passes, value = score. `101..201`: a hard limit fails, score = value - 101. `255`: no data. Each ~430 m pixel shows its best 120 m cell. |
| `suitability/south_pole_limits.u8` | same grid | Bit flags of the hard limits that fail: 1 landing slope, 2 walkable ground (EVA), 4 sunlight, 8 Earth in view, 16 more than 6 deg from the pole. 0 = all pass, 255 = no data. |
| `suitability/sites/<site_id>_score.u8` | 512 x 512 uint8 on the `terrain/sites/<site_id>/tile.json` grid, 120 m | Same values as `south_pole_score.u8`, one per 120 m cell. |
| `suitability/sites/<site_id>_limits.u8` | same tile grid | Same bit flags as `south_pole_limits.u8`. |
| `suitability/zones.geojson` | GeoJSON FeatureCollection of Points | The 500 best zones; `coordinates` = [east longitude, latitude]; `properties` = the zones.csv columns. |

### suitability/zones.csv

One row per Goldilocks zone: a connected area where every hard limit passes. All values are at the zone's best
120 m cell.

| Column | Unit | Meaning |
|--------|------|---------|
| `rank` | | 1 = best. Zones whose stay window our model confirms come first, then by `score`, then by area. |
| `lat`, `lon` | deg | Position of the best cell (east longitude). |
| `x_m`, `y_m` | m | The same position in the map projection. |
| `area_km2` | km2 | Area of the whole zone. |
| `score` | 0-100 | Zone score: 70 % `map_score`, 15 % longest darkness, 15 % longest time without Earth. |
| `map_score` | 0-100 | Score from the per-cell parameters (docs/criteria.md section 2). |
| `elevation_m` | m | Height above the 1737.4 km sphere. |
| `landing_slope_deg` | deg | Slope across 120 m, steepest side. Hard limit: under 10. |
| `eva_slope_deg` | deg | Grade between points 960 m either side of the cell. Reported only. |
| `eva_walkable_pct` | % | Share of the ground within 2 km with a slope under 20 deg. Hard limit: at least 50. |
| `sun_pct` | % | NASA PGDA long-run average sunlight. Hard screen: at least 25. |
| `earth_pct` | % | NASA PGDA long-run average Earth visibility. Hard limit: at least 25. |
| `psr_distance_km` | km | Distance to the nearest permanent shadow of 1 km2 or more; 20.4 means "more than 20 km". |
| `temp_avg_k` | K | Diviner yearly average temperature 2 cm below the surface; empty where there is no data. |
| `longest_dark_h` | h | Our model, Nov 2026 to Dec 2029: longest run of hours with the Sun's centre below the terrain horizon. |
| `longest_no_earth_h` | h | Our model: longest run of hours with Earth's centre below the horizon. |
| `longest_sun_and_earth_h` | h | Our model: longest run of hours with both above the horizon. |
| `stay_window_ok` | True / False | True if `longest_sun_and_earth_h` is at least 156 (a 6.5-day stay). |
| `model_sun_pct`, `model_earth_pct` | % | Our model's share of hours sunlit and with Earth in view, Nov 2026 to Dec 2029 (2 m observer). |
| `nearest_artemis_region` | | Name of the closest Artemis candidate point. |
| `nearest_artemis_km` | km | Distance to it. |
| `near_artemis` | True / False | True if that distance is 12.5 km or less (inside or within 5 km of a 15 km region). |

### suitability/summary.json

| Field | Unit | Meaning |
|-------|------|---------|
| `version` | | Format version (1). |
| `region_km2` | km2 | Area within 6 deg of the pole. |
| `pass_km2`, `pass_pct_of_region` | km2, % | Ground that passes every hard limit. |
| `fail_pct_of_region` | % | Share of the region failing each hard limit (`landing_slope`, `eva_slope`, `sunlight`, `earth`); they overlap. |
| `zones`, `zones_stay_window_ok`, `zones_1km2_or_more`, `largest_zone_km2` | | Zone counts and the largest zone. |
| `top20_near_artemis`, `top20_nearest_regions` | | How many of the 20 best zones are near an Artemis point, and which. |
| `artemis_near_km` | km | The distance used for "near": 12.5. |
| `zones_near_artemis`, `pass_km2_near_artemis`, `pass_pct_near_artemis`, `region_pct_near_artemis` | | Zones and passing ground near the nine Artemis points, and the share of the region that is near them. |
| `signal_delay_s` | s | One-way Earth-Moon light time from our ephemeris: `min`, `max`, `mean`. |
| `psr_km2_in_region` | km2 | Permanent shadow (patches of 1 km2 or more) within 6 deg of the pole. |
| `temperature_available` | | True if the Diviner file was present when the files were built. |
| `artemis` | | Per Artemis point: `id`, `name`, `passes_at_point`, `failed_limits`, `score_at_point`, `zones_nearby`, `best_zone_rank_nearby`, `best_zone_score_nearby`. |
| `artemis_points_passing`, `artemis_regions_with_a_zone` | | How many of the nine points pass, and how many have a zone within 12.5 km. |

### suitability/layers/ and suitability/weights.json ("Your priorities")

Each soft criterion as its own layer, so the score can be recomputed under any weights
(docs/INTERFACES.md section 11; code in web/src/lib/analysis/suitability.ts).

| File | Encoding | Value |
|------|----------|-------|
| `suitability/layers/south_pole_<key>.u8` | 1024 x 1024 uint8, the `terrain/south_pole.json` grid | Sub-score of one criterion: 0 = at its reject bound, 255 = at its ideal bound. `<key>`: `sunlight`, `earth`, `landing_slope`, `shadow`, `walkable`, `temperature`, `ice` (depth of stable ice), `hollow` (depth below the surroundings). |
| `suitability/layers/sites/<site_id>_<key>.u8` | 512 x 512 uint8, the site's tile grid, 120 m | The same, one value per 120 m cell. |

`suitability/weights.json`:

| Field | Meaning |
|-------|---------|
| `version` | Format version (1). |
| `layers[].key`, `layers[].label` | Layer key (as in the file names) and display name. |
| `layers[].parameter`, `layers[].unit` | The zones.csv column the layer is made from, and its unit. |
| `layers[].reject`, `layers[].ideal` | Values that map to 0 and to 255. |
| `layers[].file`, `layers[].site_file` | Paths of the layer grids, relative to `suitability/`. |
| `zone_terms[].key`, `zone_terms[].label`, `zone_terms[].column`, `zone_terms[].unit`, `zone_terms[].reject`, `zone_terms[].ideal` | The two terms known only at zone best cells: longest darkness and longest time without Earth, with their bounds in hours. |
| `default` | Key of the default preset: `everything`. |
| `importance` | The weight of a ticked parameter by importance: `low` 1, `normal` 2, `high` 4 (that is 0.5, 1 and 2). |
| `presets[].key`, `presets[].label` | The presets: `everything`, `power`, `radio`, `ice`, and `balanced` ("NASA-style balance", the weights of the published scores). |
| `presets[].ticked` | The parameters the preset ticks. |
| `presets[].weights` | The weights that follow (normal importance = 2), or for `balanced` its own exact weights. Only ratios matter. |
| `confirmed_zones` | Number of zones whose 6.5-day stay window our model confirms; Artemis ranks are among these. |

`suitability/zones_layers.csv`, one row per zone in the order of zones.csv:

| Column | Meaning |
|--------|---------|
| `rank` | The zone's rank in zones.csv. |
| `sunlight`, `earth`, `landing_slope`, `shadow`, `walkable`, `temperature`, `ice`, `hollow` | The layer values (0 to 255) at the zone's best cell. |
| `ice_depth_m` | Depth at which water ice is stable at that cell, metres (Diviner Polar Resource Product); empty = none within 2.87 m. |
| `hollow_depth_m` | How far that cell sits below the mean ground within 2 km, metres; negative = above its surroundings. |

`suitability/site_values.csv`, one row per site with modelled terrain (the numbers behind "Why here?" on Overview):

| Column | Meaning |
|--------|---------|
| `id`, `name`, `lat`, `lon` | The site (as in sites.json). |
| `passes_hard_limits`, `failed_limits` | Whether the 120 m cell at the site passes every hard limit, and which it fails. |
| `map_score` | Map score at the site, 0 to 100 (balanced weights). |
| `elevation_m`, `landing_slope_deg`, `eva_slope_deg`, `eva_walkable_pct`, `sun_pct`, `earth_pct`, `psr_distance_km`, `temp_avg_k` | The criteria values at the site; same meaning as in zones.csv. |
| `longest_dark_h`, `longest_no_earth_h`, `longest_sun_and_earth_h` | Our model at the site, Nov 2026 to Dec 2029, hours. |
| `ice_depth_m`, `hollow_depth_m` | As in zones_layers.csv. |

`suitability/artemis_points.csv`, one row per Artemis candidate point:

| Column | Meaning |
|--------|---------|
| `id`, `name`, `lat`, `lon` | The point (as in sites.json). |
| `passes_hard_limits` | yes / no: whether the 120 m cell at the point passes every hard limit. |
| `failed_limits` | The limits it fails: `landing_slope`, `eva_slope`, `sunlight`, `earth`, `latitude`. |
| `sunlight`, `earth`, `landing_slope`, `shadow`, `walkable`, `temperature`, `ice`, `hollow` | Layer values (0 to 255) at the point. |
| `longest_dark_h`, `longest_no_earth_h`, `longest_sun_and_earth_h` | Our model at the point, Nov 2026 to Dec 2029, hours. |
| `score_everything`, `score_power`, `score_radio`, `score_ice`, `score_balanced` | The point scored like a zone under each preset, 0 to 100. |
| `rank_everything`, `rank_power`, `rank_radio`, `rank_ice`, `rank_balanced` | 1 + the number of confirmed zones that score higher under that preset. |

## criteria.csv

The landing criteria as a table (also in docs/criteria.csv). One row per criterion.

| Column | Meaning |
|--------|---------|
| `parameter` | What is measured, in plain words. |
| `kind` | `hard` (must pass), `soft` (scored) or `reported` (shown, not scored). |
| `unit` | Unit and how it is measured. |
| `ideal` | Range that gets the full sub-score (for hard limits: the passing range). |
| `acceptable` | Range that passes but scores less. |
| `reject` | Range that fails (hard) or scores zero (soft). |
| `weight_pct` | Share of the zone score, in percent (soft criteria only; they add up to 100). |
| `reason` | Why it matters, in one sentence. |
| `source` | Where the threshold comes from, with a quote where one exists; "team choice" where we set it ourselves. |

## missions.csv

Every lunar soft-landing attempt that reached the Moon, 1965 to 2025, plus Peregrine (also in docs/missions.csv).
Research notes: docs/research/missions_notes.md.

| Column | Unit | Meaning |
|--------|------|---------|
| `id` | | Short identifier. |
| `name` | | Mission name. |
| `operator` | | Operator and country. |
| `landing_date_utc` | UTC date | Day of touchdown or impact; empty if the craft never reached the Moon. |
| `lat`, `lon` | deg | Position, east longitude; empty if none. |
| `coords_quality` | | `measured` (found in orbital images or published after landing), `approximate`, `target` (intended point only) or `none`. |
| `outcome` | | `landed`, `tipped over`, `crashed` or `lost before landing`. |
| `outcome_detail` | | What happened, in one sentence. |
| `lesson` | | What it teaches about terrain, light, night or Earth visibility, or that the site was not the cause. |
| `source_url` | | A source for the position and outcome. |
| `in_criteria_area` | yes / no | Whether the spot is inside the area where we can compute our criteria (south of 77 S). |
| `c_landing_slope_deg`, `c_eva_slope_deg`, `c_sun_pct`, `c_earth_pct`, `c_psr_distance_km`, `c_temp_avg_k` | | Our criteria values at that spot (same meaning as the zones.csv columns without `c_`). |
| `c_score` | 0-100 | Map score at that spot. |
| `c_passes_hard_limits` | yes / no | Whether the spot passes every hard limit. |
| `c_failed_limits` | | The limits it fails: `landing_slope`, `eva_slope`, `sunlight`, `earth`, `latitude`. |
| `c_longest_dark_h`, `c_longest_no_earth_h` | h | Our model at that spot, Nov 2026 to Dec 2029. |
## stars.json

Real stars for the VR sky (docs/INTERFACES.md section 11).

| Field | Type | Unit | Meaning |
|-------|------|------|---------|
| `version` | integer | | Format version (1). |
| `source` | string | | Catalogue and kernels used. |
| `mag_limit` | number | mag | Faintest V magnitude included: 3.5. |
| `n_stars` | integer | | Number of stars: 287. |
| `stars` | number[4 * n_stars] | -, mag | Per star: x, y, z of its ICRF unit vector (J2000 catalogue position), then its V magnitude. Brightest first. |
| `names` | object | | Proper name by star index, where the catalogue gives one. |
| `frame` | string | | What the quaternions do: rotate ICRF vectors into MOON_ME_DE421. |
| `start_utc`, `step_s`, `n` | string, number, integer | UTC, s | Time of the first orientation, spacing (6 hours) and count. |
| `quat_xyzw` | number[4 * n] | | Unit quaternions (x, y, z, w), one per time step. |

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
