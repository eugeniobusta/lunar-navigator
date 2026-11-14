"""Landing criteria: terrain measures, hard limits and the 0-100 suitability score (docs/criteria.md). Owner: Eugenio.

Everything here works on plain numpy grids in the polar stereographic projection of docs/SCIENCE.md section 3
(row 0 = largest y). The thresholds live in CRITERIA below; scripts/build_suitability.py writes them to
docs/criteria.csv, so the table people read is the table the code uses.
"""
import numpy as np

R_M = 1737400.0
STAY_H = 156  # surface stay used for "lit for the whole stay": 6.5 days


def scale_factor(shape, scale_m, line_offset, sample_offset):
    """Map metres per ground metre in polar stereographic with k0 = 1 at the pole (1.000 at the pole, 1.003 at 84 S)."""
    rows, cols = shape
    x = (np.arange(cols) - sample_offset) * scale_m
    y = (line_offset - np.arange(rows)) * scale_m
    return 1.0 + (x[None, :] ** 2 + y[:, None] ** 2) / (4.0 * R_M**2)


def landing_slope_deg(h, scale_m, k=1.0):
    """Slope (deg) over one pixel (120 m), taking the steeper of the two one-sided differences on each axis.

    That is the finest baseline the 120 m map allows and it errs on the steep side: a pixel passes only if the
    ground falls away gently towards all four neighbours.
    """
    h = np.asarray(h, dtype=np.float64)
    dx = np.abs(np.diff(h, axis=1))
    dy = np.abs(np.diff(h, axis=0))
    sx = np.zeros_like(h)
    sy = np.zeros_like(h)
    sx[:, :-1] = dx
    sx[:, 1:] = np.maximum(sx[:, 1:], dx)
    sy[:-1, :] = dy
    sy[1:, :] = np.maximum(sy[1:, :], dy)
    return np.degrees(np.arctan(np.hypot(sx, sy) / scale_m * k))


def baseline_slope_deg(h, scale_m, half_px, k=1.0):
    """Slope (deg) between points half_px pixels either side of each pixel: the grade over a 2 * half_px baseline."""
    h = np.asarray(h, dtype=np.float64)
    gx = np.full_like(h, np.nan)
    gy = np.full_like(h, np.nan)
    gx[:, half_px:-half_px] = h[:, 2 * half_px:] - h[:, :-2 * half_px]
    gy[half_px:-half_px, :] = h[2 * half_px:, :] - h[:-2 * half_px, :]
    return np.degrees(np.arctan(np.hypot(gx, gy) / (2 * half_px * scale_m) * k))


def disc_mean(values, radius_px):
    """Mean of `values` over a disc of radius_px around every pixel (FFT convolution; edges wrap, so pad first)."""
    v = np.asarray(values, dtype=np.float64)
    r = int(np.ceil(radius_px))
    yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
    disc = (xx * xx + yy * yy <= radius_px * radius_px).astype(np.float64)
    kernel = np.zeros_like(v)
    kernel[:2 * r + 1, :2 * r + 1] = disc
    kernel = np.roll(kernel, (-r, -r), axis=(0, 1))
    out = np.fft.irfft2(np.fft.rfft2(v) * np.fft.rfft2(kernel), s=v.shape)
    return out / disc.sum()


def distance_px(mask, cap_px):
    """Exact Euclidean distance (pixels) from every pixel to the nearest True pixel, capped at cap_px."""
    mask = np.asarray(mask, dtype=bool)
    rows, cols = mask.shape
    idx = np.arange(cols)
    big = 10 * (rows + cols)
    left = np.maximum.accumulate(np.where(mask, idx, -big), axis=1)
    right = np.minimum.accumulate(np.where(mask, idx, big)[:, ::-1], axis=1)[:, ::-1]
    g = np.minimum(np.minimum(idx - left, right - idx), cap_px + 1).astype(np.float64)  # along each row
    best = g * g
    for dy in range(1, cap_px + 1):  # then the lower envelope down the columns, as far as the cap
        d2 = g * g + dy * dy
        best[dy:, :] = np.minimum(best[dy:, :], d2[:-dy, :])
        best[:-dy, :] = np.minimum(best[:-dy, :], d2[dy:, :])
    return np.minimum(np.sqrt(best), cap_px)


def subscore(v, reject, ideal):
    """0 at the reject bound, 1 at the ideal bound, linear in between (works for 'more is better' and 'less is better')."""
    return np.clip((np.asarray(v, dtype=np.float64) - reject) / (ideal - reject), 0.0, 1.0)


def encode_score(score, passes, valid):
    """uint8 grid: 0..100 = score where every hard limit passes; 101..201 = 101 + score where one fails; 255 = no data."""
    s = np.clip(np.rint(score), 0, 100).astype(np.uint8)
    out = np.where(passes, s, s + 101).astype(np.uint8)
    out[~valid] = 255
    return out


# ---- Thresholds. Hard limits follow NASA's Artemis III landing requirements; the rest are soft (docs/criteria.md). ----
HLS = "NASA, Artemis Human Landing System Update (2024), NTRS 20240009596, https://ntrs.nasa.gov/citations/20240009596"
LANDING_SLOPE_MAX = 10.0   # deg, hard: "Surface slope for landing (100m): <10 deg"
EVA_SLOPE_MAX = 20.0       # deg: "Surface slope limit for EVA (2km): <20 deg"; steeper ground cannot be walked
EVA_RADIUS_M = 2000.0      # the walking radius
EVA_WALKABLE_MIN = 50.0    # %, hard (team choice): at least half the ground within 2 km must be walkable
EVA_HALF_PX = 8            # +/- 960 m: the grade over a 1.92 km baseline, reported only
SUN_MIN_PCT = 25.0         # NASA PGDA average sunlight, hard screen for "lit for the whole stay" (team choice)
EARTH_MIN_PCT = 25.0       # NASA PGDA average Earth visibility, hard: NASA's own map removes "Earth visibility < 25%"
LAT_MAX = -84.0            # hard: "Land within 6 deg latitude of the South Pole"
PSR_MIN_PX = 70            # permanent shadow counts from 1 km2 (70 pixels of 120 m)
ARTEMIS_NEAR_KM = 12.5     # "inside or within 5 km of" a 15 km Artemis region = within 7.5 + 5 km of its point
DARK_REJECT_H = 354.0      # the night away from the poles (NASA Glenn: "Non-polar latitudes night durations ~354 hours")
DARK_IDEAL_H = 85.0        # NASA's night-survival goal for the Lunar Terrain Vehicle: "at least 85 hours"
NO_EARTH_REJECT_H = 336.0  # Earth's two-week cycle at the pole: "visible two weeks, not visible two weeks"
# Soft terms of the map score: (grid key, reject bound, ideal bound, weight).
SOFT = [
    ("sun_pct", SUN_MIN_PCT, 70.0, 0.30),
    ("earth_pct", EARTH_MIN_PCT, 70.0, 0.20),
    ("landing_slope_deg", LANDING_SLOPE_MAX, 5.0, 0.20),
    ("psr_distance_km", 20.0, 2.0, 0.15),
    ("eva_walkable_pct", EVA_WALKABLE_MIN, 95.0, 0.10),
    ("temp_avg_k", 110.0, 150.0, 0.05),
]
MAP_SHARE = 0.70           # zone score = 70 % map score + 15 % longest darkness + 15 % longest time without Earth


def map_score(g):
    """0-100 suitability from the per-pixel parameters: weighted mean of the soft sub-scores (docs/criteria.md).

    A term with no data at a pixel (temperature outside Diviner's coverage) is left out and the weights rescaled.
    """
    total = 0.0
    weight = 0.0
    for key, reject, ideal, w in SOFT:
        v = g.get(key)
        if v is None:
            continue
        ok = np.isfinite(v)
        total = total + np.where(ok, subscore(np.where(ok, v, reject), reject, ideal), 0.0) * w
        weight = weight + ok * w
    return 100.0 * total / weight


def zone_score(z):
    """Zone score 0-100: 70 % map score at the best cell, 15 % longest darkness, 15 % longest time without Earth."""
    dark = float(subscore(z["longest_dark_h"], DARK_REJECT_H, DARK_IDEAL_H))
    no_earth = float(subscore(z["longest_no_earth_h"], NO_EARTH_REJECT_H, 0.0))
    return round(MAP_SHARE * z["map_score"] + 15.0 * dark + 15.0 * no_earth)


def _row(parameter, kind, unit, ideal, acceptable, reject, weight, reason, source):
    return {"parameter": parameter, "kind": kind, "unit": unit, "ideal": ideal, "acceptable": acceptable,
            "reject": reject, "weight_pct": weight, "reason": reason, "source": source}


_W = {key: round(100 * MAP_SHARE * w, 1) for key, _, _, w in SOFT}  # share of the zone score, percent
CRITERIA = [
    _row("Distance from the pole", "hard", "deg of latitude", "within 6 (84 S or further south)", "", "more than 6",
         "", "Artemis III must land near the south pole, where the ice and the long sunlight are.",
         f'"Land within 6 deg latitude of the South Pole". {HLS}'),
    _row("Landing slope", "hard", "deg, across 120 m", "under 10", "", "10 or more", "",
         "A lander on a steep slope can tip over; NASA sets the limit at 10 degrees for the landing area.",
         f'"Surface slope for landing (100m): <10 deg". {HLS}. We measure across 120 m, the finest the map allows, '
         "and take the steepest side."),
    _row("Walkable ground within 2 km", "hard", "% of the ground with slope under 20 deg", "at least 50", "",
         "under 50", "", "Astronauts in suits cannot walk on ground steeper than 20 degrees, and walk at most about 2 km.",
         f'"Surface slope limit for EVA (2km): <20 deg" and "No EVAs can occur in black areas". {HLS}. The 50 % share '
         "is a team choice: NASA gives the slope and the distance, not how much of the ground must be walkable."),
    _row("Sunlight for the whole stay", "hard", "% of time, NASA PGDA long-run average", "at least 25", "",
         "under 25", "", "The crew needs daylight for the whole 6.5-day stay, for power, warmth and to see.",
         f'"Artemis III will require the surface to be lit for the duration of the surface stay". {HLS}. Stay of 6.5 days: '
         "NASA release of 19 Aug 2022. The 25 % screen is a team choice: of 192 points we modelled above it, 99.0 % "
         "have a 6.5-day stretch with Sun and Earth both up. Each zone is then checked with our own model."),
    _row("Earth in view", "hard", "% of time, NASA PGDA long-run average", "at least 25", "", "under 25", "",
         "With no relay satellite, the radio only works while Earth is above the skyline.",
         f'"Direct with Earth (DWE) communication; assume no comm relay is available"; the NASA map removes '
         f'"Earth visibility < 25%". {HLS}'),
    _row("Landing accuracy", "hard", "m", "a 100 m x 100 m box that passes", "", "no such box", "",
         "The lander can only be steered to within about 100 m, so the whole box around the target must be safe.",
         f'"Human Landing Accuracy Requirements 100 m x 100 m". {HLS}. One cell of our 120 m map covers the box.'),
    _row("Sunlight, long-run", "soft", "% of time", "70 or more", "25 to 70", "under 25 (hard limit)", _W["sun_pct"],
         "More sunlight means more solar power and fewer cold nights.",
         "Team choice of the 70 % ideal: only the best ridges reach it. Data: NASA GSFC PGDA product 69, "
         "https://pgda.gsfc.nasa.gov/products/69 (Mazarico et al. 2011)."),
    _row("Earth in view, long-run", "soft", "% of time", "70 or more", "25 to 70", "under 25 (hard limit)", _W["earth_pct"],
         "More time with Earth in view means more time to talk to mission control.",
         'Team choice of the 70 % ideal. NASA: "regions with greater Earth visibility are preferred" '
         "(NTRS 20250011660, https://ntrs.nasa.gov/citations/20250011660). Data: PGDA product 69."),
    _row("Landing slope", "soft", "deg, across 120 m", "5 or less", "5 to 10", "10 or more (hard limit)",
         _W["landing_slope_deg"], "Flatter ground leaves a margin for boulders and small craters the map cannot see.",
         'Apollo lunar module design surface: "a mean surface slope of 6 deg or less" (NASA TN D-6850, '
         "https://ntrs.nasa.gov/citations/19720018253). 5 deg is a team choice just inside it."),
    _row("Distance to permanent shadow", "soft", "km", "2 or less", "2 to 20", "more than 20", _W["psr_distance_km"],
         "Water ice may survive only where the Sun never shines, so the science is in the permanent shadows nearby.",
         'Walking radius: "PSRs located within 2 km, the current radial limit for astronauts without a rover" '
         "(Wueller et al. 2026, doi:10.1029/2025JE009434). Rover reach: \"up to 20 km without recharging\" "
         "(NASA, NTRS 20230002802). Shadow = PGDA average sunlight of 0, patches of 1 km2 or more (team choice)."),
    _row("Walkable ground within 2 km", "soft", "% of the ground with slope under 20 deg", "95 or more", "50 to 95",
         "under 50 (hard limit)", _W["eva_walkable_pct"], "The more of the surroundings the crew can walk, the more they can explore.",
         f"Team choice of the 95 % ideal; the 20 deg and 2 km come from {HLS}."),
    _row("Mean ground temperature", "soft", "K, yearly average 2 cm below the surface", "150 or more", "110 to 150",
         "under 110", _W["temp_avg_k"], "Very cold ground means the spot is nearly always dark, and hardware needs more heating.",
         '110 K: "surfaces below 110 K capable of cold trapping water" (Williams et al. 2019, doi:10.1029/2019JE006028). '
         "150 K ideal is a team choice. Data: LRO Diviner Polar Resource Product, "
         "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/ (a thermal model on a ~0.5 km mesh)."),
    _row("Longest darkness, 2026 to 2029", "soft", "hours in a row", "85 or less", "85 to 354", "354 or more", 15.0,
         "Most landers are built for one lunar day and die in a long night; a short night can be survived on batteries.",
         'Ideal: NASA\'s rover goal to "survive an extended lunar night duration of at least 85 hours" (NTRS 20230002802). '
         'Reject: "Non-polar latitudes night durations ~354 hours" (NASA Glenn, NTRS 20210026571). Computed by our own model '
         "at each zone's best cell."),
    _row("Longest time without Earth, 2026 to 2029", "soft", "hours in a row", "0", "up to 336", "336 or more", 15.0,
         "While Earth is below the skyline the lander is out of contact.",
         'Team choice, anchored on NASA\'s description: "Earth is in a 2-week cycle: visible two weeks, not visible two weeks" '
         f"({HLS}). Computed by our own model at each zone's best cell."),
    _row("Signal delay to Earth", "reported", "seconds, one way", "", "", "", "",
         "Radio takes about 1.2 to 1.36 seconds to cross from the Moon to Earth from every site, so it cannot rank sites; "
         "a delay under about 1.16 seconds is physically impossible.",
         "Light time from our ephemeris (JPL DE421). Distance range 357,000 to 407,000 km: NASA NSSDC Moon Fact Sheet, "
         "https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html"),
    _row("Height", "reported", "m above the 1737.4 km sphere", "", "", "", "",
         "High ground sees over its neighbours, which is why the best-lit spots are peaks and crater rims.",
         "LOLA LDEM_75S_120M, PDS Geosciences Node. Not scored by itself: its effect is already in the sunlight and Earth numbers."),
]


def write_criteria_csv(path):
    """docs/criteria.csv from the CRITERIA table: the table people read is the table the code uses."""
    import csv
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(CRITERIA[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(CRITERIA)
