# Site list (owners: Eugenio + Kien). Source of truth for web/public/data/sites.json

Longitude east-positive. "verify" = confirm before the demo; never show an unverified site as exact.

## Artemis candidate regions (first crewed landing now planned as Artemis IV, early 2028)
Representative candidate landing sites from Wueller et al. 2026 (JGR Planets, doi:10.1029/2025JE009434), Table A1.
**Verified on 14 Nov 2026**: all nine match the paper's Table A1 (to its 4 decimals) and the paper's Zenodo data
set (digit for digit). Details and quotes: docs/research/artemis_coordinates.md.

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

NASA PGDA long-run values at each point (AVGVISIB_75S_120M_201608, Sun % / Earth %), measured by
`scripts/validate_pgda.py` on 14 Nov; ours in brackets (2009-2028, centre of disc, 2 m observer). See docs/VALIDATION.md table 4.
pcb03 49.3/70.3 (51.5/71.8), hw02 46.8/59.3 (46.9/57.6), mma01 45.1/100.0 (45.5/100.0), mmp06 14.1/52.9 (12.6/49.2),
mmo01 69.7/56.2 (70.9/58.5), nr107 49.8/60.1 (52.9/57.5), nr208 30.6/55.0 (30.8/52.8), dgr203 56.8/55.8 (56.7/54.3),
sp07 52.8/46.6 (49.3/42.3).
Three points look odd and are nevertheless what the authors published:
- **pcb03** (83.56 S) and **nr208** (83.91 S) lie more than 6 deg from the pole, outside NASA's own limit. All five
  of the paper's Peak near Cabeus B sites are north of 84 S; for Nobile Rim 2 the paper has three sites inside
  the limit (NR201, NR202, NR2_K2023).
- **mmp06** sits in a hollow with 14 % average sunlight. The paper chose it for access to a permanent shadow below
  110 K, not for light; its best-lit Mons Mouton Plateau sites south of 84 S are MMP02, MMP04, MMP11, MMP01, MMP10.
We keep the nine points as they are, so every number stays comparable with earlier ones. Swapping a point for
another site of the same region is the lead's call.

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
