# Landing criteria and Goldilocks zones (owner: Eugenio)

How `scripts/build_suitability.py` decides where a crewed lander could set down near the south pole.
Thresholds with their sources: docs/criteria.csv. Parameters and datasets: docs/PARAMETERS.md. File formats:
docs/INTERFACES.md section 10. Quotes behind every number: docs/research/criteria_research.md.

## 1. Hard limits: pass or fail

They come from NASA's "Key Artemis III Landing Requirements" (Artemis Human Landing System Update, 2024,
NTRS 20240009596). That source is a seminar slide deck, not a requirements document: it gives the numbers as short
bullets without definitions, so each line below says how we turned the bullet into a test on a 120 m map.

| # | NASA's wording | Our test at each 120 m cell | Our own choice in it |
|---|----------------|-----------------------------|----------------------|
| 1 | "Land within 6 deg latitude of the South Pole" | latitude 84 S or further south | none |
| 2 | "Surface slope for landing (100m): <10 deg" | slope under 10 deg across 120 m, steepest side | 120 m instead of 100 m: the map's pixel |
| 3 | "Surface slope limit for EVA (2km): <20 deg"; "No EVAs can occur in black areas" | at least 50 % of the ground within 2 km has a slope under 20 deg (across 240 m) | the 50 % share |
| 4 | "Direct with Earth (DWE) communication; assume no comm relay is available"; map mask "Earth visibility < 25%" | NASA PGDA average Earth visibility of 25 % or more | none: 25 % is NASA's mask |
| 5 | "Artemis III will require the surface to be lit for the duration of the surface stay" | NASA PGDA average sunlight of 25 % or more, then a check with our own model (below) | the 25 % screen |
| 6 | "Human Landing Accuracy Requirements 100 m x 100 m" | the cell itself: 120 m x 120 m covers the box | none |

**Why 25 % sunlight.** "Lit for the whole stay" depends on the landing date, which a map cannot know. An average
tells whether such a stay can exist at all. We calibrated the screen on the 243 points where we already have full
terrain horizons (the three 9 x 9 grids): of the 192 points with NASA averages of at least 25 % sunlight and 25 %
Earth visibility, 99.0 % have a stretch of 6.5 days with Sun and Earth both up between Nov 2026 and Dec 2029 in our
model. With a 5 % sunlight screen (NASA's own map mask) it is 93.1 %.

**The check with our own model.** For every zone we compute the terrain horizon at its best cell and run our hourly
ephemeris. `stay_window_ok` is true if Sun and Earth are both above the horizon for at least 156 hours in a row
(6.5 days: NASA's 2022 figure; NASA's 2026 abstract says about 5.75 to 6.25 days, so 6.5 is the cautious choice).
Zones that fail this check are listed after all zones that pass it.

## 2. The suitability score, 0 to 100

Each soft criterion gives a sub-score between 0 and 1:

    s = clamp( (value - reject) / (ideal - reject), 0, 1 )

so it is 0 at the "reject" bound, 1 at the "ideal" bound and a straight line in between. It works the same way
whether more is better (sunlight) or less is better (slope).

**Map score** (every 120 m cell):

    map_score = 100 * ( 0.30 * s_sunlight + 0.20 * s_earth + 0.20 * s_landing_slope
                      + 0.15 * s_shadow_distance + 0.10 * s_walkable + 0.05 * s_temperature )

| Term | Reject (s = 0) | Ideal (s = 1) | Weight |
|------|----------------|---------------|--------|
| Sunlight, long-run (NASA PGDA) | 25 % | 70 % | 0.30 |
| Earth in view, long-run (NASA PGDA) | 25 % | 70 % | 0.20 |
| Landing slope | 10 deg | 5 deg | 0.20 |
| Distance to permanent shadow | 20 km | 2 km | 0.15 |
| Walkable ground within 2 km | 50 % | 95 % | 0.10 |
| Mean ground temperature | 110 K | 150 K | 0.05 |

Where Diviner has no temperature the term is dropped and the other weights are rescaled.

**Zone score** (one per zone, at its best cell), adding the two things only our time model can give:

    zone_score = 0.70 * map_score + 15 * s_darkness + 15 * s_no_earth

| Term | Reject (s = 0) | Ideal (s = 1) |
|------|----------------|---------------|
| Longest darkness, Nov 2026 to Dec 2029 | 354 h (the night away from the poles) | 85 h (NASA's rover night-survival goal) |
| Longest time without Earth | 336 h (Earth's two-week absence) | 0 h |

The weights are a team choice: power first (sunlight and darkness together carry 36 % of the zone score), then the
radio link (29 %), then safe ground (21 %), then science access (10.5 %). Change them in `engine/criteria.py` and
rerun; docs/criteria.csv is written from the same table.

## 3. Goldilocks zones

A zone is a connected patch of cells where every hard limit passes (cells touching by a side or a corner). Each
zone is described at its best cell, the one with the highest map score. Rank: zones whose stay window our model
confirms first, then by zone score, then by area.

## 4. What came out (this build)

- Area within 6 deg of the pole: 104,184 km2. Passing every hard limit: 14,928 km2, 14.3 %.
- Share of the area failing each limit (they overlap): sunlight 55.6 %, Earth in view 49.3 %, landing slope 45.7 %,
  walkable ground 5.5 %.
- 5,297 zones; 643 of them are 1 km2 or larger; the largest is 2,192 km2. Our model confirms the 6.5-day window
  for 4,224 of them.
- Best zone: 84.44 S, 19.21 E, score 77: 57 % sunlight, Earth always in view, slope 3.4 deg, longest darkness 14.0 days.

## 5. Honest check: does this rediscover NASA's nine regions?

Not as its top picks.

- **1 of our top 20 zones** lies inside or within 5 km of an Artemis candidate region (Malapert Massif, rank 13).
- **6 of the 9 Artemis points pass every hard limit at the point itself.** The three that fail: Peak near Cabeus B
  and Nobile Rim 2, whose tabulated points lie at 83.56 S and 83.91 S, just outside 6 deg; and Mons Mouton Plateau,
  whose point has only 14 % sunlight (it sits in a hollow, flagged in docs/SITES.md).
- **8 of the 9 regions have passing zones nearby**, ranked between 13 and 192. Only Peak near Cabeus B has none,
  because its point is outside the 6 deg circle.
- Ground near the nine points is 3.3 % of the area searched and 5.9 % of the ground that passes: 1.8 times its share.

Why the lists differ:
1. We rank single 120 m cells. NASA picks regions about 15 km across that hold enough low-slope ground for a
   landing ("Regions that maintain sufficient low-slope area ... were prioritized", NTRS 20250011660).
2. NASA's factors include "science potential" and "launch window availability" (release of 28 Oct 2024). We have no
   science value in the score beyond distance to permanent shadow, and no launch windows.
3. Our top cells are Earth-facing high ground with 100 % Earth visibility, which our weights reward strongly.
4. "Inside a region" is approximate here: NASA has published no outlines for the nine regions, so we use a circle of
   12.5 km (half of a 15 km region plus 5 km) around the representative points of Wueller et al. 2026.

## 6. What a past landing says about these criteria

IM-2 Athena (84.79 S, 29.20 E, March 2025) landed at a spot that **passes every one of our hard limits** (slope
3.6 deg across 120 m, 47 % sunlight, 93 % Earth visibility, score 73). It ended on its side in a crater about 20 m
across, in shadow. A 120 m map cannot see a 20 m crater. Passing these criteria means "worth a closer look with
5 m data", not "safe to land".
IM-1 Odysseus (80.13 S) fails two: the slope across 120 m at its spot is 14.3 deg, and it is 9.9 deg from the pole.

## 7. Limits

- 120 m terrain: boulders and craters smaller than that are invisible (see IM-2).
- Sunlight and Earth averages are NASA's 18.6-year means for the ground itself; our time model uses a 2 m mast.
- The temperature is a model 2 cm below the surface on a ~0.5 km mesh.
- No dust, no thermal design, no descent trajectory, no launch windows, no science ranking.
