# Parameter inventory (owner: Eugenio). What the open data gives for the south pole, and how we use it.

Everything below is computed by `scripts/build_suitability.py` from the raw files in `data/` (`make download`), on the
LOLA 120 m grid (polar stereographic, docs/SCIENCE.md section 3), over a 464 km square centred on the pole.
Thresholds: docs/criteria.csv. Method and formula: docs/criteria.md. Research notes with quotes: docs/research/.

## Parameters we compute

| Parameter | Unit | Dataset | URL | Native resolution | How we compute it | Used as |
|-----------|------|---------|-----|-------------------|-------------------|---------|
| Elevation | m above the 1737.4 km sphere | LRO LOLA LDEM_75S_120M | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ | 120 m | Read as is (the label gives km; we convert to m). | Reported |
| Landing slope | deg | LOLA LDEM_75S_120M | same | 120 m | Height difference to each of the four neighbours; on each axis we keep the steeper side, then combine the two axes. Corrected for the map's scale factor. NASA's limit is tagged "(100m)"; 120 m is the finest this map allows. | Hard limit (< 10), soft score |
| Walkable ground within 2 km (EVA slope) | % of ground | LOLA LDEM_75S_120M | same | 120 m (slope across 240 m) | Slope from central differences (240 m). Share of the disc of radius 2 km around each cell where that slope is under 20 deg. | Hard limit (>= 50 %), soft score |
| Grade over 2 km | deg | LOLA LDEM_75S_120M | same | 120 m | Height difference between points 960 m either side of the cell, both axes. | Reported |
| Sunlight, long-run | % of time | NASA GSFC PGDA Lunar Polar Illumination, AVGVISIB_75S_120M_201608 | https://pgda.gsfc.nasa.gov/products/69 | 120 m | Read as is (int16 x 4e-05). NASA's average over hourly steps across 18.6 years (Mazarico et al. 2011). | Hard screen (>= 25 %), soft score |
| Earth in view, long-run | % of time | PGDA AVGVISIB_75S_120M_201608_EARTH | same | 120 m | Read as is. Earth counts as visible if any part of its disc shows. | Hard limit (>= 25 %), soft score |
| Distance to permanent shadow | km | PGDA sunlight map | same | 120 m | Cells with average sunlight exactly 0, kept only in patches of 1 km2 or more; exact straight-line distance to the nearest one, capped at 20.4 km. | Soft score |
| Mean ground temperature | K | LRO Diviner Polar Resource Product (PRP), dlre_prp_south.tab | https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/ | about 0.5 km mesh (2,880,000 triangles) | Yearly average temperature 2 cm below the surface, from Diviner's thermal model. Triangle centres averaged in 600 m bins on our grid. | Soft score (5 % of the map score) |
| Longest darkness | hours in a row | Our model: LOLA terrain + JPL DE421 | docs/SCIENCE.md | hourly, Nov 2026 to Dec 2029 | Terrain horizon at the point (720 directions, to 150 km), then the longest run of hours with the Sun's centre below it. | Soft score, at zone best cells |
| Longest time without Earth | hours in a row | Our model | docs/SCIENCE.md | hourly, Nov 2026 to Dec 2029 | Same, for the centre of Earth. | Soft score, at zone best cells |
| Longest stretch with Sun and Earth | hours in a row | Our model | docs/SCIENCE.md | hourly, Nov 2026 to Dec 2029 | Longest run of hours with both above the horizon. A zone's stay window is confirmed if this is at least 156 h (6.5 days). | Check of the hard limits, at zone best cells |
| Earth-Moon signal delay | seconds, one way | Our ephemeris (JPL DE421 via Skyfield) | docs/INTERFACES.md section 2 | hourly | Earth-Moon distance divided by the speed of light: 1.19 to 1.36 s (centre to centre), mean 1.28 s. | Reported only |
| Distance from the pole | deg of latitude | Geometry | | exact | From the map projection. | Hard limit (<= 6) |

### Why the signal delay does not rank sites
Radio travels at the speed of light, and the Moon is 357,000 to 407,000 km away (NASA NSSDC Moon Fact Sheet). That
gives 1.19 to 1.36 seconds one way from centre to centre, about 0.03 s less from surface to surface. Every site on the
Moon is within 1,737 km of the centre, which changes the delay by at most 0.006 s. So the delay is the same for every
site to within a hundredth of a second, and a delay under about 1.16 s is physically impossible. We report it and do
not score it.

### Temperature: what we could and could not get
The brief asked for Diviner's south polar products at 240 m. That product (Polar Cumulative Products, 80 S to 90 S)
exists, but as 96 local-time files per season of about 200 MB each, roughly 20 GB to build one mean map. We did not
download it. We used the Polar Resource Product instead: one 605 MB file with the yearly average and maximum
temperature. It is a thermal model fitted to Diviner data on a ~0.5 km mesh, and its average is for 2 cm below the
surface, not the surface itself. It covers the whole area we score.

## What the challenge resources offer for the south pole

| Resource | What it gives | Resolution | Where documented | How we used it |
|----------|---------------|------------|------------------|----------------|
| NASA GSFC PGDA (the data behind the polar layers) | Average sunlight, permanent shadow, average Earth visibility, sky visibility | 240 m (65 S-90 S), 120 m (75 S-90 S), 60 m (85 S-90 S) | https://pgda.gsfc.nasa.gov/products/69 | Downloaded the 120 m Sun and Earth maps |
| NASA GSFC PGDA site DEMs | Elevation and slope for selected south-pole sites | 5 m | https://pgda.gsfc.nasa.gov/products/78 | Not used (covers a few sites only) |
| LROC QuickMap | LOLA Sun and Earth visibility on the south-pole view, terrain slope, permanent shadow, LEND hydrogen, Diviner temperature layers, Mini-RF, ShadowCam | varies; not stated on the pages we read | https://lroc.im-ldi.com/posts/1153 and https://www.actgate.com/post/july-2024-quickmap-release | Viewer only; we took the same PGDA and LOLA data from the archives |
| NASA Moon Trek | A south-pole tile service exists | not verified | https://trek.nasa.gov/moon | Not used: we could not reach the site to list its layers |
| JPL Horizons | Sun and Earth azimuth, elevation, range and light time for any point and date; no terrain | exact ephemeris | https://ssd.jpl.nasa.gov/horizons/manual.html | Check of our Sun and Earth positions (docs/VALIDATION.md table 1) |
| LRO Diviner (PDS) | Temperatures: 240 m polar products by local time; yearly average and maximum from a thermal model | 240 m; ~0.5 km mesh | https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/ | Downloaded the Polar Resource Product |

Not included: hydrogen and ice detections (LEND, LAMP, M3, Mini-RF). We use distance to permanent shadow as the
stand-in for "ice may be here".
