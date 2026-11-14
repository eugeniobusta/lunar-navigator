# Landing-site criteria research: Lunar South Pole Navigator

Compiled 2026-11-14. Every number below was read from the fetched page, PDF text layer, or data label named next to it. Nothing is from memory.

Confidence labels:
- **CONFIRMED** = I read the number on the cited page/file myself.
- **SECONDARY** = number comes from a non-primary source (news, a deck citing another document, a search-result snippet).
- **DERIVED** = I computed it from a cited primary number or data file; the calculation is shown.
- **NOT FOUND** = no official number found.

Limits of this research:
- The NTRS PDFs were read through NTRS's own text extraction (`.pdf.txt`). I could not render the slides as images (no PDF renderer on this machine), so map legends and anything that exists only as a picture were not read.
- Wiley (JGR Planets), Science and PNAS full texts returned HTTP 403. For those papers I only have abstracts (via OpenAlex, Europe PMC, Crossref).
- The Artemis III Science Definition Team report PDF was too large to fetch and has no NTRS text copy; it was not read.

---

## PART 1. Artemis III hard limits

### Primary source

"2024 NASA LaRC/ARC EDL Summer Seminar Series: Artemis Human Landing System Update", Alicia Dwyer Cianciolo, NASA Langley, 1 Aug 2024. 32 slides. NTRS 20240009596.

- Citation page: https://ntrs.nasa.gov/citations/20240009596
- PDF: https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf
- Text layer: https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf.txt

Important caveat: this is a **seminar presentation**, not a requirements document. The slide is titled "Key Artemis III Landing Requirements". The numbers are stated as short slide bullets with no definitions of baseline, averaging, or percentage of time.

The full requirements slide reads, verbatim:

> Key Artemis III Landing Requirements
> 1. Land within 6 deg latitude of the South Pole
> 2. Surface slope for landing (100m): <10 deg
> 3. Surface slope limit for EVA (2km): <20 deg
> 4. Direct with Earth (DWE) communication; assume no comm relay is available
> 5. Lighting  a. Surface Lighting  b. Approach lighting
> 6. Land within 100 m of a target
> Objective: Identify locations that are viable for landing and meet all requirements and constraints

The same six slides appear again in the NASA 2025 Space Apps deck "Artemis Human Landing System Overview" (NTRS 20250009323, https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf), with identical wording.

### 1a. Landing-area slope below 10 degrees

- **Finding:** Confirmed. The "100 m" is given only as a bracketed tag. The deck does not say whether 100 m is a slope baseline or the size of the landing area.
- **Value:** < 10 deg, tagged "(100m)".
- **Quotes:** "Surface slope for landing (100m): <10 deg" and "Slopes for landing must be less than 10 deg".
- **Extra detail on the same slide:** "White contours show regions of continuous 8 deg slope". The deck does not explain why 8 deg is drawn.
- **Source:** https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf (slides 21 and 23)
- **Confidence:** CONFIRMED for the value. Baseline definition NOT FOUND.

Related 8-degree figures (these are not the same thing as the 10 deg terrain limit):
- A NASA JSC deck says: "The Human Landing System will have slope tolerance that is at least 8 degrees." It states this is "inferred from" HLS-S-R-0071. Source: https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf . Confidence: CONFIRMED on that deck, but the deck itself calls it an inference.
- The Wueller et al. (2026) data set names its landing raster "HLS_LandingAreas_8°_-100m_buffer", i.e. that study used 8 deg with a 100 m buffer. Source: https://zenodo.org/records/17084058 (file list inside Landing_Sites.zip). Confidence: CONFIRMED as a file name only; I could not read the paper's methods text.

### 1b. EVA / traverse slope below 20 degrees

- **Finding:** Confirmed as a number. The wording supports "no EVA on any terrain steeper than 20 deg, assessed over the area within 2 km", not "average slope over a 2 km baseline". The deck never says "average" or "baseline".
- **Value:** < 20 deg, tagged "(2km)".
- **Quotes:**
  - "Surface slope limit for EVA (2km): <20 deg"
  - "Slopes for Extravehicular Activity (EVA) must be less than 20 deg"
  - "Black designates areas of slope > 20 deg" / "No EVAs can occur in black areas"
- **Source:** https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf (slides 21 and 24)
- **Confidence:** CONFIRMED for the value and the mask wording. The meaning of "(2km)" as a radius is my reading, supported by 2c below, not stated in the deck.
- **Why 20 deg:** the suit requirement, per a NASA JSC deck: "Astronaut in suit must be able to walk up, down, across a 20-degree slope". Source: https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf . Confidence: CONFIRMED on that deck (it cites the xEVA System Requirements Document, which I did not read).

### 1c. Site sunlit for the whole surface stay

- **Finding:** Confirmed as a requirement. The HLS deck gives **no duration in days**. Durations come from other NASA sources and they differ.
- **Quote (HLS deck):** "Artemis III will require the surface to be lit for the duration of the surface stay"
- **Mask used on that slide:** "Solar visibility less 5%" (areas removed). This is a map mask, not a stated requirement.
- **Source:** https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf (slide 26)
- **Confidence:** CONFIRMED.

Stay length:
| Value | Quote | Source | Confidence |
|---|---|---|---|
| 6.5 days | "continuous access to sunlight throughout a 6.5-day period – the planned duration of the Artemis III surface mission" | NASA release, 19 Aug 2022: https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ | CONFIRMED |
| about 5.75 to 6.25 days | "Surface stay duration varies approximately 5.75 to 6.25 days depending on mission epoch" | NASA LPSC 2026 abstract, NTRS 20250011660: https://ntrs.nasa.gov/citations/20250011660 | CONFIRMED |
| 6.5 days | "remain sunlit throughout 6.5 days, the nominal duration of the first Artemis surface missions" | Wueller et al. 2026 abstract, doi:10.1029/2025JE009434 (read via https://api.openalex.org/works/doi:10.1029/2025JE009434) | CONFIRMED (abstract only) |

Supporting statements:
- "Solar illumination remains a critical requirement for the entire crewed surface stay" (NTRS 20250011660). CONFIRMED.
- "Peak lighting conditions are periodic and shift 2-3 weeks earlier each year" (HLS deck, slide 27). CONFIRMED.
- NRHO constraint behind the ~6.5 days: "can only descend to the surface once every 6.5 days" (HLS deck, slide 20). CONFIRMED.

The newest NASA number is the 5.75 to 6.25 day range. 6.5 days is the older public figure and is the conservative choice.

### 1d. Earth visible / direct-to-Earth communication

- **Finding:** Confirmed as a requirement, but **no "continuous" wording and no required fraction** is stated. The only number is a map mask at 25 percent.
- **Quotes:**
  - "Direct with Earth (DWE) communication; assume no comm relay is available"
  - "Artemis III will require Earth to be visible for communications"
  - Mask on the slide: "Earth visibility < 25%" (areas removed)
- **Source:** https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf (slides 21 and 25)
- **Confidence:** CONFIRMED for the wording. Required fraction / continuity: NOT FOUND.
- **Context that matters for a time-based criterion:** "Earth is in a 2-week cycle: visible two weeks, not visible two weeks" and "Sun and Earth only rise above the horizon ~2 to 7 deg" (same deck, slide 19). CONFIRMED.
- **Later NASA wording is conditional:** "If Artemis III employs a Direct-to-Earth (DTE) communication architecture, regions with greater Earth visibility are preferred." (NTRS 20250011660). CONFIRMED.

### 1e. Within 6 degrees of latitude of the south pole

- **Finding:** Confirmed verbatim, in two NASA sources.
- **Quotes:** "Land within 6 deg latitude of the South Pole" (HLS deck) and "Each of these regions is located within six degrees of latitude of the lunar South Pole" (NASA 2022 release).
- **Sources:** HLS deck PDF above; https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
- **Confidence:** CONFIRMED. This means latitude 84 S or further south.

### 1f. Landing accuracy 100 m

- **Finding:** Confirmed, but the deck uses two different phrasings and NASA's 2022 release uses a third. They are not the same shape.
- **Quotes:**
  - "Land within 100 m of a target" (HLS deck, slides 21 and 28)
  - "Human Landing Accuracy Requirements 100 m x 100 m" (HLS deck, slide 28)
  - "A landing site is a location within those regions with an approximate 328-foot (100-meter) radius." (NASA 2022 release)
- **Sources:** as above.
- **Confidence:** CONFIRMED. Which shape is the formal requirement: NOT FOUND.
- **Comparison on the same slide:** "Apollo 11 landing ellipse: 17 x 5 km".

### Candidate regions: selection criteria wording

13 regions, 19 Aug 2022. Source: https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ . CONFIRMED.
- "using criteria including terrain slope, ease of communications with Earth, and lighting conditions"
- "Specific landing sites are tightly coupled to the timing of the launch window"
- "the goal to land close enough to a permanently shadowed region to allow crew to conduct a moonwalk"

9 regions, 28 Oct 2024. Source: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ . CONFIRMED.
- List, "in no priority order": Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain.
- "Factors in the selection process included science potential, launch window availability, terrain suitability, communication capabilities with Earth, and lighting conditions."
- "The agency will select sites within regions for Artemis III after it identifies the mission's target launch dates"
- This release contains no slope number, no region size and no coordinates.

NASA's later explanation of the downselect (NTRS 20250011660, https://ntrs.nasa.gov/api/citations/20250011660/downloads/AIIIUpdateLPSC2026.docx). CONFIRMED.
- "Regions that maintain sufficient low-slope area to accommodate a safe landing were prioritized."
- Hazards assessed: "impact craters, block populations, and rough or highly variable terrain"
- No numeric thresholds are given in this abstract.

### Region size

- **Value:** about 15 by 15 km. Stated only for the 2022 set of 13.
- **Quote:** "Each region is approximately 9.3 by 9.3 miles (15 by 15 kilometers)."
- **Source:** https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
- **Confidence:** CONFIRMED for the 13 regions. For the 9 regions of 2024: NOT FOUND. The 2024 map clearly shows regions of different sizes, and the 2024 release gives no size.

### Region centre / corner coordinates

- **Official NASA coordinates for the 9 regions: no official number found.** Not in either NASA release, not in NTRS 20250011660, not on the PGDA page. The Wueller et al. 2026 full text was not readable (HTTP 403), so I cannot say whether it has a coordinate table.

What does exist (DERIVED, not official):

The Zenodo data set for Wueller et al. 2026 (https://zenodo.org/records/17084058, file Illumination_Modeling.zip) holds one georeferenced raster per region, for "all 16 Artemis candidate landing regions". I read the GeoTIFF tags of the Midsummer 2025 rasters. Projection in the files: polar stereographic, origin latitude -90, scale 1.0, radius 1,737,400 m. Pixel size 60 m.

These are the **footprints of that study's rasters**, which are 18 to 30 km wide. They are larger than NASA's nominal 15 km boxes and are not NASA's region outlines. Use the centres as approximate positions only.

| Region (file name) | Raster size | Centre X, Y (m, south polar stereographic) | Centre lat, lon (deg, east positive) |
|---|---|---|---|
| Peak near Cabeus B | 21 x 21 km | -180240, 70092 | -83.629, -68.750 |
| Haworth | 30 x 30 km | -38390, 91565 | -86.727, -22.747 |
| Malapert Massif | 21 x 21 km | -502, 121955 | -85.980, -0.236 |
| Nobile Rim 1 | 21 x 21 km | 84216, 110286 | -85.426, 37.366 |
| Nobile Rim 2 | 21 x 21 km | 157233, 95139 | -83.945, 58.823 |
| de Gerlache Rim 2 | 21 x 21 km | -48313, 22720 | -88.239, -64.815 |
| Slater Plain | 21 x 21 km | 70475, -50328 | -87.145, 125.531 |
| Mons Mouton Plateau tile 11 | 30 x 30 km | 64237, 162351 | -84.247, 21.587 |
| Mons Mouton Plateau tile 12 | 30 x 30 km | 92006, 162244 | -83.855, 29.557 |
| Mons Mouton Plateau tile 13 | 30 x 30 km | 116915, 162369 | -83.409, 35.756 |
| Mons Mouton Plateau tile 21 | 30 x 30 km | 63404, 133873 | -85.118, 25.343 |
| Mons Mouton Plateau tile 22 | 30 x 30 km | 91873, 134036 | -84.645, 34.428 |
| Mons Mouton Plateau tile 23 | 30 x 30 km | 116903, 134273 | -84.134, 41.044 |

Notes on this table:
- The data set has no separate "Mons Mouton" raster. The six "MonsMoutonPlateau" tiles together cover roughly 83 x 58 km. Which tiles correspond to NASA's "Mons Mouton" versus "Mons Mouton Plateau" region is not stated in the files I read.
- Conversion used: r = sqrt(X^2 + Y^2); lat = -90 + 2*atan(r / (2 * 1737400)) in degrees; lon = atan2(X, Y).
- Several Mons Mouton tile centres are north of 84 S, i.e. outside the "within 6 deg" limit. That is a property of the raster tiling, not a statement about NASA's regions.
- Rasters for the seven dropped 2022 regions (Amundsen Rim, Connecting Ridge, Connecting Ridge Extension, de Gerlache-Kocher Massif, de Gerlache Rim, Faustini Rim A, Leibnitz Beta Plateau, Peak near Shackleton) are in the same archive.

Other official geometry (older site set only): NASA PGDA product 78, "High-Resolution LOLA Topography for Lunar South Pole Sites" (https://pgda.gsfc.nasa.gov/products/78), publishes 5 m/pix DEM and slope GeoTIFFs plus an "ROI shapefile archive" per site. Its site list includes Haworth, Malapert massif (Site23), Nobile rim 1 (Site06), Nobile rim 2 (DM2). It does **not** list Mons Mouton, Mons Mouton Plateau, Slater Plain, Peak near Cabeus B or de Gerlache Rim 2 in the part of the page I read. Confidence: CONFIRMED for the listed names. I did not download the shapefiles.

---

## PART 2. Soft criteria

### 2a. Lander slope tolerance in other programmes

| Lander | Value | Quote | Source | Confidence |
|---|---|---|---|---|
| Apollo LM (design surface) | mean slope 6 deg, effective slope 12 deg | "a mean surface slope of 6° or less and an effective slope of 12° or less, including the effects of depressions or protuberances" | NASA TN D-6850, "Apollo experience report: Lunar module landing gear subsystem", NTRS 19720018253: https://ntrs.nasa.gov/api/citations/19720018253/downloads/19720018253.pdf | CONFIRMED (OCR text renders the degree sign as a quote mark) |
| Apollo LM (certified performance) | 0.998 probability of stable landing at 12 deg or less | "the probability of attaining a stable landing on a slope of 12° or less is 0.998" | same | CONFIRMED |
| Starship HLS | at least 8 deg | "The Human Landing System will have slope tolerance that is at least 8 degrees." | https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf | CONFIRMED on the deck; deck says it is inferred |
| IM Nova-C (IM-1) | site slope 12 deg; design limit not disclosed | "an estimated slope at the landing site of 12 degrees"; "Intuitive Machines hadn't disclosed the maximum slope for a safe landing" | https://thespacereview.com/article/4749/1 | SECONDARY |
| IM Nova-C design limit | 10 deg appears on Wikipedia and in news snippets only | n/a | n/a | No official number found |
| Astrobotic Griffin | n/a | n/a | n/a | No official number found |
| Surveyor (design limit) | n/a | n/a | n/a | No official number found |
| Chang'e 3 / 4 / 5 | n/a | n/a | n/a | No official number found |

Evidence for an "ideal" slope near 5 deg:
- The only 5-degree figure I found in a NASA document is a map legend in the Scoville deck: "Red = 100 m radius landing circle w/ slope <5deg". That is one study's choice, not a requirement. CONFIRMED on the deck.
- The Apollo design figure of 6 deg mean slope is the best citable anchor for a "comfortable" value.

### 2b. Temperatures

Water-ice stability threshold:
| Value | Quote | Source | Confidence |
|---|---|---|---|
| 110 K | "surfaces below 110 K capable of cold trapping water over 1 Gyr" | Williams et al. 2019, JGR Planets, "Seasonal Polar Temperatures on the Moon", doi:10.1029/2019JE006028 (abstract via https://api.crossref.org/works/10.1029/2019JE006028) | CONFIRMED (abstract) |
| 110 K (annual maximum) | "also exhibit annual maximum temperatures below 110 K" | Li et al. 2018, PNAS, doi:10.1073/pnas.1802345115 (abstract via Europe PMC, PMC6130389) | CONFIRMED (abstract) |
| 3.5 percent | "only ∼3.5% of cold traps exhibit ice exposures" | same | CONFIRMED (abstract) |
| 38 K | "subsurface temperatures are estimated to be 38 kelvin" (LCROSS site) | Paige et al. 2010, Science 330, doi:10.1126/science.1187726 (abstract via Europe PMC) | CONFIRMED (abstract) |

Correction for the lead: the **Paige et al. 2010 abstract does not contain "110 K"**. I could not read the full paper. Cite Williams 2019 or Li 2018 for 110 K. What Paige's own data product uses instead is a sublimation-rate definition: "depth at which water ice would be sublimated at a rate of 1 kg m-2 per billion years" (Diviner PRP label, see 2f). CONFIRMED.

Illuminated and shadowed surface temperatures at the south pole:
| Value | Quote | Source | Confidence |
|---|---|---|---|
| above 54 C (130 F) sunlit | "creating temperatures upwards of 130°F (54°C) during sunlit periods" | https://www.nasa.gov/feature/moons-south-pole-is-full-of-mystery-science-intrigue | CONFIRMED |
| -203 C (-334 F) in PSRs | "experience temperatures as low as -334°F (-203°C)" | same | CONFIRMED |
| 50 to 100 K at night | "Night low temperatures span 50-100K for all latitudes" | NASA Glenn, "Lunar Power Hibernation", NTRS 20210026571: https://ntrs.nasa.gov/api/citations/20210026571/downloads/Lunar%20Power%20Hibernation%2022-1-11.pdf | CONFIRMED |
| 50 K | "survive the lunar night temperatures of 50 K on the south pole and in the permanently shadowed regions" | NASA LTV thermal paper, NTRS 20230002802: https://ntrs.nasa.gov/api/citations/20230002802/downloads/LTV_Thermal_Challenges__TFAWS.pdf | CONFIRMED |

Real data check: the first rows of the Diviner south polar resource product (near 75.9 S) show temp_avg about 162 K and temp_max about 272 K. Source: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab . CONFIRMED (five rows read; not a statistic).

Operating temperature range for lander hardware / electronics: **no official number found.** The commonly quoted "-40 to +85 C" did not appear in any NASA source I fetched. The only -40 C figure found was a battery constraint in a search snippet of a NASA Glenn deck, which I did not verify on the page.

### 2c. Distance from lander to a PSR

| Item | Value | Quote | Source | Confidence |
|---|---|---|---|---|
| Artemis III walking radius | 2 km | "access to PSRs located within 2 km, the current radial limit for astronauts without a rover" | Wueller et al. 2026 abstract, doi:10.1029/2025JE009434 (via OpenAlex) | CONFIRMED (abstract); peer-reviewed, not a NASA requirement |
| Artemis III EVA area | 2 km | "Surface slope limit for EVA (2km): <20 deg" | HLS deck, NTRS 20240009596 | CONFIRMED |
| Artemis III walking radius (earlier trade) | 1.38 km radial, 1.67 km walked | "Walking distance = 1.67 km, expected radial distance = 1.38 km" | https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf | CONFIRMED on the deck (2021, cites Del Greco et al. 2021) |
| Walking speed | 2 km/hr | "Walking rate = 2km/hr." | same | CONFIRMED |
| EVA duration | 6 hours +/- 2 | "Nominal EVA excursion is 6 hours +/- 2 hours." | same | CONFIRMED |
| Time allowed in a PSR | 2 hours | "After exposure to 2 hours of the thermal environment of Permanently Shadowed Regions" | same | CONFIRMED |
| LTV range | up to 20 km per charge | "explore distances of up to 20 km without recharging batteries" | NTRS 20230002802: https://ntrs.nasa.gov/api/citations/20230002802/downloads/LTV_Thermal_Challenges__TFAWS.pdf | CONFIRMED (NASA paper describing the RFI, not the contract requirement) |
| VIPER traverse | 20 km | "within a traverse planned for 20 km in the Moon's south pole region (landing site: Mons Mouton" | NASA SpaceOps paper, NTRS 20250004636: https://ntrs.nasa.gov/api/citations/20250004636/downloads/20250004636.pdf | CONFIRMED |
| VIPER duration | 100 days | "designed for 100-days (four lunar days) of nominal surface operations" | same | CONFIRMED |

Also relevant: "Artemis III will likely not have means for humans to descend into large PSRs due to crew safety associated with steep slopes and extreme thermal environments." (Scoville deck). CONFIRMED.

The Artemis III Science Definition Team report was not read, so I cannot say whether it states an EVA radius.

### 2d. Lunar night survival

| Item | Quote | Source | Confidence |
|---|---|---|---|
| CLPS design life | "CLPS landers/robotics provide single lunar day of operation" | NASA Glenn, NTRS 20210026571: https://ntrs.nasa.gov/api/citations/20210026571/downloads/Lunar%20Power%20Hibernation%2022-1-11.pdf | CONFIRMED |
| Night length (non-polar) | "Non-polar latitudes night durations ~354 hours" | same | CONFIRMED |
| Blue Ghost Mission 1 | "The mission lasted for about 14 days, or the equivalent of one lunar day, and multiple hours into the lunar night before coming to an end." | https://www.nasa.gov/news-release/nasa-science-continues-after-fireflys-first-moon-mission-concludes/ | CONFIRMED |
| Blue Ghost hours into night | "just over 5 hours" | Firefly page returned HTTP 403; figure seen in a search snippet only | SECONDARY |
| IM-1 Odysseus | "the electronics on board will likely not survive the cold temperatures during the two-week lunar night" | https://thespacereview.com/article/4749/1 | SECONDARY |
| IM-2 Athena | planned about 10 days before night; ended within a day after landing on its side | search snippets only | SECONDARY, not verified on a page |
| LTV night survival goal | "survive an extended lunar night duration of at least 85 hours, or 125 hours if deemed possible" | NTRS 20230002802 | CONFIRMED |
| Artemis III light | "Artemis III will require the surface to be lit for the duration of the surface stay" | HLS deck, NTRS 20240009596 | CONFIRMED |

354 hours is 14.75 days. Polar sites differ: at the south pole, darkness length depends on local topography and season, so a per-pixel "longest darkness" number has to come from an illumination model, not from the 354-hour figure.

### 2e. Earth-Moon one-way light time

- **Finding:** NASA gives distances, not light time. The light times below are DERIVED by dividing by c = 299,792.458 km/s.
- **Source:** NASA NSSDC Moon Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
- **Quotes:** table values "Perigee (10^6 km)* 0.3633", "Apogee (10^6 km)* 0.4055", "Semimajor axis (10^6 km) 0.3844"; footnote "the distance from the Moon to Earth roughly ranges from 357,000 km to 407,000 km".
- **Confidence:** distances CONFIRMED; light times DERIVED.

| Distance (centre to centre) | One-way light time |
|---|---|
| 357,000 km (extreme minimum) | 1.191 s |
| 363,300 km (mean perigee) | 1.212 s |
| 384,400 km (semimajor axis) | 1.282 s |
| 405,500 km (mean apogee) | 1.353 s |
| 407,000 km (extreme maximum) | 1.358 s |

**Correction for the lead:** "under about 1.2 s is impossible" is slightly too strict. At the extreme minimum distance the centre-to-centre light time is 1.19 s. Surface to surface (subtracting Earth radius 6,378 km and Moon radius 1,737 km, my arithmetic) it is about 1.16 s. A safe statement is: **a one-way delay below about 1.16 s is physically impossible; typical values are 1.2 to 1.36 s.** A south-pole site is not at the sub-Earth point, so its real minimum is a little above 1.16 s.

For exact values at a site and date, use JPL Horizons (see 2g).

### 2f. LRO Diviner south polar gridded temperature products

Bundle: "LRO Diviner Derived Data Bundle 1", https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/ . Collections are named in https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/readme.txt . All CONFIRMED from labels and directory listings.

**There is no single ready-made "mean surface temperature at 240 m" map in this bundle.** There are three relevant products:

1. **Polar Cumulative Products (PCP), 240 m. This is the 240 m product.**
   - What it is: "bolometric brightness temperatures ... binned at 240 m and 0.25 hours of local time", from nadir observations 5 Jul 2009 to 17 Feb 2019. Reference: Williams et al. 2019.
   - Coverage: latitude -90 to -80 (80S to 90S). Not 75S.
   - Grid: "MAP_PROJECTION_TYPE = POLAR STEREOGRAPHIC", "MAP_SCALE = 240 <m/pix>".
   - Format: ASCII table (.tab), fixed 59-byte rows, one header row, with PDS3 .lbl and PDS4 .xml labels. About 190 to 220 MB per file.
   - Columns: x, y (polar stereographic, "normalized by the mean lunar radius 1737.4 km", so multiply by 1737.4 to get km), clon (deg), clat (deg), tbol (K).
   - Units: kelvin. No scale or offset. "Empty bins are omitted", so it is a sparse point list and must be rasterised.
   - Files, diurnal: 96 summer + 96 winter local-time files, `pcp_avg_tbol_pols_sum_ltimNN_240.tab` and `pcp_avg_tbol_pols_win_ltimNN_240.tab`, NN = 01 to 96.
     - Folder: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_pcp/diurnal/ltim/pols/
     - Example: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_pcp/diurnal/ltim/pols/pcp_avg_tbol_pols_sum_ltim01_240.tab
   - Files, seasonal: 6 seasons (ls030, ls090, ls150, ls210, ls270, ls330) x 24 subsolar-longitude bins, `pcp_avg_tbol_pols_lsXXX_slonNN_240.tab`.
     - Folder: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_pcp/seasonal/slon/pols/
   - A second diurnal set binned by subsolar longitude is at .../data_derived_pcp/diurnal/slon/pols/ (I did not list it).
   - To get a mean, max or min map you must combine the 96 (or 192) files yourself: roughly 20 GB per season.
   - Format file: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/label/dlre_pcp.fmt

2. **Polar Resource Product (PRP). One file with annual average and maximum temperature. Easiest to use, but it is a model and not 240 m.**
   - File: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab (604,800,210 bytes)
   - Label: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.lbl ; format: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/label/dlre_prp.fmt
   - What it is: "produced from thermal model fits to Diviner north and south polar observations from the first year of mapping orbit".
   - Grid: not a raster. "The mesh consists of 2,880,000 triangles and covers a square region centered on the pole to 80 degrees latitude." Vertex spacing in the first rows is about 0.49 km (my reading of the coordinates).
   - Format: ASCII, 210-byte rows, 15 columns: three triangle vertices (x, y, z in km), tri_clon, tri_clat (deg), tri_calt (km), temp_avg, temp_max, ice_depth.
   - temp_avg: "The annual average temperature (K), calculated at a depth of 2 cm below the surface". Note: 2 cm depth, not the surface.
   - temp_max: "The annual maximum temperature (K), calculated at the surface".
   - ice_depth (m): 0 means ice is stable at the surface; -999 means deeper than 2.8738 m.
   - Units: kelvin and metres. No scale or offset. No minimum temperature column.
   - Version warning in the catalog: "The previous version of this dataset, V1.0, was erroneous in that it lacked any meaningful data." Use V2.0 (this file).

3. **Global Cumulative Product (GCP). Too coarse for site work.**
   - File: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/global_cumul_avg_cyl_90s80s_002.tab
   - "binned at 0.5 degree latitude and longitude and 0.25 hours of local time", 5 Jul 2009 to 1 Apr 2015, latitude -90 to -80. ASCII, 113-byte rows, 11 columns. Missing value -9999.

Full format description for all three: Diviner RDR SIS, https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/document/Diviner_RDR_SIS.pdf (not read).

### 2g. What each tool offers for the south pole

**NASA PGDA (Goddard), the documented source behind most polar layers.** CONFIRMED on the pages.
- Lunar Polar Illumination, https://pgda.gsfc.nasa.gov/products/69 : average solar illumination, permanent shadow, average Earth visibility, sky visibility. South pole grids: 65S-90S at 240 m/px, 75S-90S at 120 m/px, 85S-90S at 60 m/px. Averages "over hourly timesteps spanning 18.6 years". Formats IMG, JP2, GeoTIFF, COG. Polar stereographic, radius 1737.4 km, true scale at the pole. Caveat on the page: Earth counts as visible "if any part of its disc is not obscured, so it may be very slightly optimistic".
- High-Resolution LOLA Topography for Lunar South Pole Sites, https://pgda.gsfc.nasa.gov/products/78 : per-site 5 m/pix elevation (m), slope (degrees), height and slope uncertainty, ROI shapefiles. Stated accuracy: "median RMS slope error ~ 1.5 - 2.5°". Slope baseline is not stated on the page.

**LROC QuickMap (quickmap.lroc.asu.edu).** Partly confirmed; I did not retrieve the full layer inventory.
- LOLA Average Sun Visibility and Average Earth Visibility layers on the South Pole orthographic projection: "New LOLA Sun and Earth visibility layers are also now available for the Orthographic (South Pole)". Source: https://lroc.im-ldi.com/posts/1153 . CONFIRMED. Units and resolution not stated there (the underlying PGDA product is a fraction of time at 240/120/60 m).
- Terrain slope (SLDEM and GLD100 based) and permanent shadow as searchable layers, and "LRO LEND Polar Water Equivalent Hydrogen": all named in the same post. CONFIRMED as layer names only.
- Diviner layers added July 2024: "Bolometric Temp Anomaly, Regolith Temp, Regolith Temp Anomaly, Rock Abundance", plus "Mini-RF S1 over Malapert" and ShadowCam product search. Source: https://www.actgate.com/post/july-2024-quickmap-release . CONFIRMED as names; units and resolution not stated.
- LAMP and M3 ice layers in QuickMap: NOT FOUND in the pages I read.

**NASA Moon Trek (trek.nasa.gov/moon).** NOT FOUND. The API page (https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon) confirms a "South Pole" tile service exists but lists no layers in its text, and direct requests to trek.nasa.gov from this machine failed. I have no verified list of Moon Trek south-pole layers.

**JPL Horizons (ssd.jpl.nasa.gov/horizons).** Documented at https://ssd.jpl.nasa.gov/horizons/manual.html . CONFIRMED.
- It gives geometry for a point on the Moon, not maps. It does **not** model local terrain, so it cannot say whether a ridge blocks the Sun or Earth.
- Surface site syntax: `{g: E.Long, latitude, h @ } BODY`, example in the manual "g: 348.8, -43.3, 0 @ 301" (east longitude deg, latitude deg, height km; 301 is the Moon).
- Observer-table quantities relevant here: 4 "Apparent azimuth & elevation (AZ-EL)"; 20 "Target range & range rate (relative to observer)"; 21 "Down-leg light-time", "Units: MINUTES"; 34 "Local Apparent Solar Time"; 35 "Earth to site light-time"; 10 "Illuminated fraction".
- Use: set the site as observer and Earth (399) or Sun (10) as target to get elevation above the ideal horizon and exact light time for any date.

---

## Summary of the six hard limits

| Item | Lead's belief | Result |
|---|---|---|
| 1a | slope < 10 deg over 100 m | Confirmed verbatim: "Surface slope for landing (100m): <10 deg". Meaning of "100m" not defined. |
| 1b | EVA slope < 20 deg within 2 km | Confirmed verbatim: "Surface slope limit for EVA (2km): <20 deg". It is a mask ("No EVAs can occur in black areas"), not an average over a 2 km baseline. |
| 1c | sunlit for whole stay | Confirmed: "lit for the duration of the surface stay". No days in this deck. 6.5 days (NASA 2022) or about 5.75 to 6.25 days (NASA 2026). |
| 1d | Earth visible / DTE | Confirmed as a requirement. "Continuous" and any fraction are not stated; the only number is a 25 percent map mask. |
| 1e | within 6 deg of the pole | Confirmed verbatim. |
| 1f | 100 m accuracy | Confirmed, with three phrasings: "within 100 m of a target", "100 m x 100 m", and "100-meter radius" (2022 release). |
