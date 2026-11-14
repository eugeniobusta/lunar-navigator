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
| bsc5-short.json | 1 MB | https://raw.githubusercontent.com/brettonw/YaleBrightStarCatalog/master/bsc5-short.json (Yale Bright Star Catalogue, 5th ed.) | Real stars in the VR sky |
| lroc_color_poles_4k.tif, ldem_16_uint.tif (data/moonkit/) | 13 MB, 33 MB | https://svs.gsfc.nasa.gov/4720 (NASA Scientific Visualization Studio, CGI Moon Kit; public domain). `scripts/export_moon_globe.py` downloads them | The whole Moon in the VR view: LROC WAC colour and LOLA relief (display only) |
| bluemarble-2048.png, sdo_PIA21582.jpg (data/sky/) | 1.5 MB, 0.1 MB | https://svs.gsfc.nasa.gov/2915 (NASA Goddard Scientific Visualization Studio, Blue Marble; public domain) and https://images.nasa.gov/details/PIA21582 (NASA Solar Dynamics Observatory, "Spotless Sun", 13 March 2017; public domain). `scripts/export_sky_textures.py` downloads them | The Earth and the Sun in the VR view (display only) |
| pck00008.tpc | small | Skyfield `load(...)` (NAIF generic_kernels/pck) | Constants |

Optional (only if time): ldem_85s_20m_float.img (920 MB) for near-field refinement within ~150 km of the pole.
Context reading: PGDA products 69 (illumination), 78 and 81 (5 m south-pole DEMs, Barker et al. 2021).

Download once on the fastest connection and share by USB stick, not six times over venue Wi-Fi.
