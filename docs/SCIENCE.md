# Science notes (owner: Kien). Formulas and conventions every module must follow.

## 1. Why the south pole is extreme (the story in numbers)
- Moon's spin axis is tilted only ~1.54 deg to the ecliptic. At the pole the Sun circles the horizon,
  never rising more than ~1.5 deg (+ local latitude offset: at 85 S the Sun peaks around 6 deg).
- Sun angular diameter from the Moon ~0.53 deg (semi-diameter ~0.26-0.27 deg). With the Sun this low,
  a ridge tens of km away decides light or dark. Shadows are sharp: no atmosphere, no refraction, no twilight.
- Synodic day 29.53 d. At the equator: ~14.8 d light, ~14.8 d night. At the poles: light depends on terrain.
- The Moon always shows roughly the same face to Earth, but libration (longitude about +/-7.9 deg, latitude about
  +/-6.7 deg) makes Earth wobble in the sky. At the south pole, Earth sits near the horizon and rises and sets
  roughly every ~2 weeks. On the far side, Earth is never visible.
- Earth angular diameter from the Moon ~1.9 deg (semi-diameter ~0.95 deg).
- Lighting shifts by about 2-3 weeks per year, and averages vary over the 18.6-year lunar nodal cycle.
  That is why a two-week launch slip can flip a site from good to bad.

## 2. Topocentric altitude/azimuth from MOON_ME vectors (Python reference AND TypeScript must match)
Site at latitude phi, east longitude lam, height H = R + surface_elev + observer_h (km), R = 1737.4 km.
  up    = ( cos(phi)cos(lam), cos(phi)sin(lam), sin(phi) )
  east  = ( -sin(lam), cos(lam), 0 )
  north = ( -sin(phi)cos(lam), -sin(phi)sin(lam), cos(phi) )
  site_km = H * up
Sun:   v = sun_dir                     (parallax from the surface is < 0.001 deg, ignore)
Earth: v = earth_km - site_km          (parallax up to ~0.26 deg, MUST include)
  el = asin( dot(v,up) / |v| )
  az = atan2( dot(v,east), dot(v,north) ) mapped to [0, 360)
Note: at exactly the pole north/east are degenerate. Sites never sit exactly at -90.

## 3. Horizon mask from the DEM
For each azimuth a in 0, 0.5, ..., 359.5 deg, march outward along the great circle:
  delta = d / R
  lat2 = asin( sin(phi)cos(delta) + cos(phi)sin(delta)cos(a) )
  lon2 = lam + atan2( sin(a)sin(delta)cos(phi), cos(delta) - sin(phi)sin(lat2) )
Sample the DEM height h_t at (lat2, lon2) with bilinear interpolation (project to polar stereographic x/y).
Obstruction elevation angle including curvature:
  theta = atan2( (R + h_t)cos(delta) - (R + h_o), (R + h_t)sin(delta) )
  where h_o = surface_elev + observer_h. The horizon is max(theta) over d.
Distances: start at 1 pixel, step 1 pixel up to 5 km, then grow geometrically (~1.5% per step) to 150 km.
Vectorise over azimuth x distance with numpy. Target < 5 s per site on a laptop.

DEM: LOLA LDEM_75S_120M (PDS float_img + .lbl), polar stereographic centred on -90.
  pyproj: "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
  CHECK the .lbl: units of the height values (km vs m), MAP_SCALE, LINE/SAMPLE_PROJECTION_OFFSET,
  and the axis orientation. Sanity check: heights in the south polar region are within about -6 to +8 km.
Sites outside DEM coverage (north of 75 S) use terrain = "flat" (horizon = 0 deg everywhere), clearly
labelled in the UI as "terrain not modelled".

## 4. Visibility
Margin m = el - horizon(az) with linear interpolation between azimuth bins (wrap at 360).
Visible fraction of a disc of angular radius r (deg):
  d = m / r ; if d >= 1 -> 1 ; if d <= -1 -> 0 ; else f = 1 - (acos(d) - d*sqrt(1 - d^2)) / pi
  (flat-horizon approximation of a circular segment; good to <1% at these scales)
sunlit   = 1 if the Sun's CENTRE is above the horizon (m > 0). Power uses f.
earthVis = 1 if the Earth's CENTRE is above the horizon. (PGDA counts ANY part visible, which is more
  optimistic. State this in the validation page.)

## 5. Power model (owner: Ahmed)
Solar constant S = 1361 W/m^2 (ignore the ~3% annual distance variation).
Incidence factor:
  vertical_tracking: cos(sun_el)            (panel rotates to face the Sun; standard at the poles)
  vertical_fixed:    max(0, cos(sun_el) * cos(sun_az - panel_az))
  horizontal:        max(0, sin(sun_el))    (why equatorial-style panels fail at the pole)
P_gen = S * area * efficiency * sunFrac * incidence
Battery: soc(t+dt) = clamp(soc(t) + (P_gen - load) * dt_h, 0, capacity). Survived if soc never hits 0.
batteryNeededWh = largest cumulative deficit over the window.

## 6. Validation targets (see docs/VALIDATION.md)
- Ephemeris: our topocentric alt/az vs JPL Horizons observer tables (CENTER='coord@301',
  SITE_COORD='E-lon,lat,alt_km', QUANTITIES='4', apparent az/el; Horizons applies no refraction off Earth).
  Target error < 0.05 deg.
- Illumination: our long-run (2009-2028, 6-hourly) % sunlit and % Earth-visible vs PGDA
  AVGVISIB_75S_120M_201608(.TIF / _EARTH.TIF) sampled at each site. PGDA averages ~18.6 years;
  explain differences honestly (resolution, observer height, centre vs any-part definition).
