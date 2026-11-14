# Data downloads (owner: Kien). Everything goes in data/ (gitignored). ~1.1 GB total.

| File | Size | URL | Used for |
|------|------|-----|----------|
| ldem_75s_120m_float.img + .lbl (+ .xml) | 232 MB | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ | Horizon masks |
| AVGVISIB_75S_120M_201608.TIF | ~ | https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608.TIF | Sun % validation |
| AVGVISIB_75S_120M_201608_EARTH.TIF | ~ | https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608_EARTH.TIF | Earth % validation |
| dlre_prp_south.tab | 605 MB | https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab | Mean ground temperature for the landing criteria (LRO Diviner Polar Resource Product) |
| de421.bsp | 17 MB | loaded by Skyfield `load('de421.bsp')` | Ephemeris |
| moon_pa_de421_1900-2050.bpc | ~ | Skyfield `load(...)` (NAIF generic_kernels/pck) | Lunar orientation |
| moon_080317.tf | small | Skyfield `load(...)` (NAIF generic_kernels/fk/satellites) | MOON_ME frame |
| pck00008.tpc | small | Skyfield `load(...)` (NAIF generic_kernels/pck) | Constants |

Optional (only if time): ldem_85s_20m_float.img (920 MB) for near-field refinement within ~150 km of the pole.
Context reading: PGDA products 69 (illumination), 78 and 81 (5 m south-pole DEMs, Barker et al. 2021).

Download once on the fastest connection and share by USB stick, not six times over venue Wi-Fi.
