# Site list (owners: Eugenio + Kien). Source of truth for web/public/data/sites.json

Longitude east-positive. "verify" = confirm before the demo; never show an unverified site as exact.

## Artemis candidate regions (first crewed landing now planned as Artemis IV, early 2028)
Representative points nearest each region centre, from Wueller et al. 2026 (JGR Planets,
doi:10.1029/2025JE009434), as tabulated by another Space Apps team. Kien: confirm against the paper if accessible.

| id      | name                | lat       | lon        | quality   |
|---------|---------------------|-----------|------------|-----------|
| pcb03   | Peak near Cabeus B  | -83.5630  | -68.2009   | published |
| hw02    | Haworth             | -86.8076  | -21.7194   | published |
| mma01   | Malapert Massif     | -85.9425  | -0.94365   | published |
| mmp06   | Mons Mouton Plateau | -84.5961  | 30.4525    | published |
| mmo01   | Mons Mouton         | -85.4160  | 31.8506    | published |
| nr107   | Nobile Rim 1        | -85.1978  | 37.1774    | published |
| nr208   | Nobile Rim 2        | -83.9064  | 57.8114    | published |
| dgr203  | de Gerlache Rim 2   | -88.1408  | -71.6955   | published |
| sp07    | Slater Plain        | -87.1306  | 127.857    | published |

Sanity anchors (PGDA long-run Sun% / Earth%, as read by another team; use only to catch gross errors):
Haworth 36.9/53.5, Malapert 45.7/100.0, Mons Mouton 73.8/60.7, Nobile Rim 1 53.4/60.7,
de Gerlache Rim 2 54.9/55.3, Slater Plain 48.5/46.3.

## Missions (story sites)
| id        | name                                   | lat      | lon      | quality  | note |
|-----------|----------------------------------------|----------|----------|----------|------|
| im2       | IM-2 Athena (Mons Mouton), Mar 2025    | -84.78   | 29.13    | approximate (intended site, LROC) | Tipped in a crater, mission ended < 1 day |
| griffin1  | Griffin Mission 1 (Nobile region)      | verify   | verify   | verify   | Astrobotic, NET Nov 2026, Falcon Heavy |
| bluemoon1 | Blue Moon MK1 (Shackleton connecting ridge) | verify | verify | verify | Blue Origin, slipped to 2027 |
| change7   | Chang'e-7 (Shackleton rim region)      | verify   | verify   | verify   | Postponed Aug 2026; narrow Sun-alignment window |

## Historic / contrast (terrain = flat: outside the polar DEM)
| id      | name                     | lat      | lon       | quality |
|---------|--------------------------|----------|-----------|---------|
| apollo11| Apollo 11                | 0.6741   | 23.4730   | published |
| ch3     | Chandrayaan-3 Vikram     | -69.373  | 32.319    | published (outside 75S DEM -> flat) |
| ce4     | Chang'e-4 (far side)     | -45.4446 | 177.5991  | published |
| bg1     | Blue Ghost 1 (Mare Crisium) | 18.56 | 61.81     | approximate |

Contrast lessons: Apollo 11 (Earth always high, two-week day/night), Chang'e-4 (Earth never visible:
needs a relay satellite), Chandrayaan-3 (mission lasted one lunar day: no night survival).
