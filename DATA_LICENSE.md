# Data licence

## Our derived data: CC BY 4.0

The files in `web/public/data/` (ephemeris, terrain horizons, grids, terrain export, validation tables, site list)
and `docs/PITCH_NUMBERS.md` were computed by team Claude's Plan and are licensed under the
[Creative Commons Attribution 4.0 International licence](https://creativecommons.org/licenses/by/4.0/).

You may copy, redistribute and adapt them for any purpose, provided you give credit, for example:

> Lunar Landing Site Navigator, team Claude's Plan, HackAthlone 2026 (NASA Space Apps Challenge).
> https://github.com/eugeniobusta/lunar-navigator. Derived from NASA LOLA, NASA GSFC PGDA and JPL DE421 data.

The data comes with no warranty. It is a hackathon product, not an official NASA product, and must not be used
for real mission decisions. Known limits are listed in docs/VALIDATION.md section 5.

## Source data keeps its own terms

Our licence covers only what we added. The NASA and JPL data these files are derived from, and the files in
`tests/fixtures/horizons/` (raw JPL Horizons responses), stay under their providers' terms. As read on their own
pages on 14 November 2026:

| Source | Terms as stated by the provider | Where |
|--------|---------------------------------|-------|
| LOLA LDEM_75S_120M (data set LRO-L-LOLA-4-GDR-V1.0), PDS Geosciences Node | The PDS pages we read state no licence and no restrictions; PDS asks users to cite the data they use. | https://pds.nasa.gov/datastandards/citing/ |
| NASA GSFC PGDA Lunar Polar Illumination (product 69), AVGVISIB_75S_120M_201608 | No licence stated. "Please cite the Mazarico et al. (2011) reference": Mazarico, E., et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030. | https://pgda.gsfc.nasa.gov/products/69 |
| JPL Horizons | No licence stated. Requested citation: NASA/JPL Solar System Dynamics. Data retrieved on 2026-11-14. Horizons API. https://ssd.jpl.nasa.gov | https://ssd.jpl.nasa.gov/about/ |
| NAIF generic kernels (de421.bsp, moon_pa_de421_1900-2050.bpc, moon_080317.tf, pck00008.tpc) | "SPICE kernels placed on the NAIF server may be downloaded and used by anyone"; redistribution is permitted if unmodified; acknowledgement is encouraged. We do not redistribute the kernels. | https://naif.jpl.nasa.gov/naif/rules.html |
| Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), JSON conversion by Bretton Wade | The catalogue page states no licence; the JSON conversion repository is MIT-licensed (its LICENSE file, read 14 November 2026). `stars.json` holds positions and magnitudes of 287 stars from it. | https://github.com/brettonw/YaleBrightStarCatalog |
| Wueller et al. (2026), JGR Planets, doi:10.1029/2025JE009434 (site coordinates) | CC BY 4.0 according to the licence registered with Crossref (we could not open the publisher's page to confirm). | https://api.crossref.org/works/10.1029/2025JE009434 |

`web/public/data/terrain/south_pole_sun.u8` and `south_pole_earth.u8` are resampled copies of the NASA PGDA maps,
not our own results: credit NASA GSFC PGDA and cite Mazarico et al. (2011) when you use them.

Software: Skyfield is MIT-licensed. Our code is MIT-licensed (see LICENSE).
The NASA insignia and logotype are not used anywhere in this project.
