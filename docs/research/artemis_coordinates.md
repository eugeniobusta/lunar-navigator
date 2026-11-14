# Verification of the nine Artemis "representative points" against Wueller et al. 2026

Date of check: 2026-11-14. Nothing was guessed; every value below was read from a file I downloaded.

## Result in one line

All nine points are CONFIRMED, in two independent primary sources: (A) Table A1 of the published paper
(4 decimals) and (B) the attribute table of the paper's Zenodo shapefile (6 significant figures, identical
to the team's values digit for digit). The three "suspect" points are not transcription errors: they are
exactly what the authors published.

## Sources actually opened

| # | Source | Result |
|---|---|---|
| 1 | Wiley: `https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009434`, `/doi/pdf/...`, `/doi/epdf/...`, `/doi/pdfdirect/...` | all HTTP 403 (bot wall) with curl. NOT read. Supporting-information URL not attempted successfully (the batch containing it was blocked; SI was not read). |
| 2 | ESS Open Archive / Authorea preprint | not found via OpenAlex title search (only the journal DOI and a UZH copy came back). essopenarchive.org itself not queried. |
| 3 | Crossref `api.crossref.org/works/10.1029/2025JE009434` | 200. vol 131, issue 3, published 2026-02-27, licence CC BY 4.0. |
| 3 | OpenAlex `api.openalex.org/works/doi:10.1029/2025JE009434` | 200. oa_status hybrid; repository copies: ETH `hdl.handle.net/20.500.11850/797022` (doi 10.3929/ethz-c-000797022) and UZH ZORA `zora.uzh.ch/handle/20.500.14742/246335` (doi 10.5167/uzh-293044). |
| 3 | Semantic Scholar API | 200, openAccessPdf points only to the Wiley DOI. |
| 3 | Europe PMC | 200, 0 hits. |
| 3 | arXiv API (Wueller + Artemis) | no entries returned. |
| 3 | NASA ADS `ui.adsabs.harvard.edu/abs/10.1029/2025JE009434/abstract` | HTTP 405 to curl. NOT read. |
| 3 | Unpaywall | 422 with test@example.com ("Please use your own email address"); not retried. |
| 3 | UZH ZORA | connection failed (curl code 000). NOT read. |
| 3 | CORE, Muenster "miami", ResearchGate | not tried (paper already obtained). |
| 3 | **ETH Research Collection** (DSpace API) | **200 - full publisher PDF obtained** (first try 429 rate limit, retry OK). `https://www.research-collection.ethz.ch/server/api/core/bitstreams/fdbbd74d-ec07-4adc-9869-51a416cce9f1/content` -> `paper/wueller2026.pdf`, 6,498,128 bytes, 35 pages, md5 7faa621a519e9d73be163157f2609b88. Text extracted with macOS PDFKit to `paper/wueller2026_full.txt`. |
| 4 | **Zenodo** `https://zenodo.org/api/records/17084058` | **200.** Files: Landing_Sites.zip (11.85 MB), PSR_Volatile_Estimates.zip, Diffusion_Modeling_Crater_Ages_Soderblom.xlsx, Illumination_Modeling.zip (10.7 MB). CC BY 4.0, v1, dated 2025-09-15. Downloaded only Landing_Sites.zip. |
| 5 | Other papers / LPSC abstracts with these ids | not searched (not needed). |

Zenodo note: `Landing_Sites.zip` contains two .lyrx files and an inner `Landing_Sites.zip`; the inner zip
overwrote the outer one on extraction (so the file now in `zenodo/` is the inner archive, 12,743,507 bytes).
From it I extracted only `LandingSites.*` and `ExplorationArea_2km.*` into `zenodo/inner/` (the 885 MB GeoTIFF
was not extracted). `LandingSites.dbf` has 130 point records with fields
`Landing_Re, StereoX, StereoY, Latitude, Longitude, Name, SunDays25..32, Sun_Earth2/SunEarth26..32, ID, coldest_te, oldest_PSR, PSR_AREA`.

Projection caveat (matters if the team reads the .shp geometry rather than the Latitude/Longitude columns):
the .prj is `Stereographic_South_Pole`, `standard_parallel_1 = -70`, radius 1737400. The simple formula
`lat = -90 + 2*atan(r/(2R))` is therefore wrong by ~0.12 deg (gives -86.0647 for MMA01). Dividing r by
k0 = (1+sin 70deg)/2 = 0.969846 first reproduces the Latitude column to 4 decimals for all 130 sites.
`lon = atan2(x, y)` is correct as is.

## The nine points

Paper quote = row of "Table A1. List of Representative Candidate Landing Sites (CLSs) for the Artemis Candidate
Landing Regions (CLRs)", columns "Landing site Latitude Longitude", pp. 24-27 of the PDF (text as extracted,
no space between id and latitude). Zenodo = `Latitude` / `Longitude` columns of LandingSites.dbf.

| id | Team value | Paper Table A1 (verbatim) | Zenodo dbf | Status |
|---|---|---|---|---|
| PCB03 | -83.5630, -68.2009 | `PCB03−83.5630−68.2010` | -83.5630, -68.2009 | CONFIRMED |
| HW02 | -86.8076, -21.7194 | `HW02−86.8080−21.7190` | -86.8076, -21.7194 | CONFIRMED |
| MMA01 | -85.9425, -0.94365 | `MMA01−85.9420−0.9440` | -8.59425e+01, -9.43650e-01 | CONFIRMED |
| MMP06 | -84.5961, 30.4525 | `MMP06−84.5960 30.4520` | -84.5961, 30.4525 | CONFIRMED |
| MMO01 | -85.4160, 31.8506 | `MMO01−85.4160 31.8510` | -85.4160, 31.8506 | CONFIRMED |
| NR107 | -85.1978, 37.1774 | `NR107−85.1980 37.1770` | -85.1978, 37.1774 | CONFIRMED |
| NR208 | -83.9064, 57.8114 | `NR208−83.9060 57.8110` | -83.9064, 57.8114 | CONFIRMED |
| dGR203 | -88.1408, -71.6955 | `dGR203−88.1410−71.6960` | -88.1408, -71.6955 | CONFIRMED |
| SP07 | -87.1306, 127.857 | `SP07−87.1310 127.8570` | -87.1306, 127.857 | CONFIRMED |

The paper prints 3 significant decimals padded with a zero; the team's values are the Zenodo values.
Region names in the paper: MMA is "Mons Malapert (MMA)" (not "Malapert Massif"); PCB is "Peak Near Cabeus B (PCB)".

## What the paper says about what these points are

- "we manually selected representative CLSs that all have shallow slopes (<5°) and, if present, are in or near highly illuminated areas."
- "Because the CLSs are manually selected representatives, they can be shifted within the suitable landing area in Figure 2 and still meet the HLS criteria. A list of all 130 landing sites and their coordinates is included in Table A1."
- "125 of the 130 CLSs (∼96%) were at slopes shallower than 5°." No per-site slope value is given anywhere (paper or dbf).
- Illumination metric given is NOT average sunlight: Table A2 = "Maximum Number of Consecutive Days With Sun or Sun and Earth Illumination for 130 CLS for the Midsummers From 2025 to 2032"; "we consider illumination for at least 10 consecutive days as favorable". The dbf SunDays/SunEarth columns equal Table A2.
- On the 6-degree question the paper only says: "13 candidate landing regions (CLRs; NASA, 2022a) within the initial Artemis exploration zone (AEZ; >84°S) that were narrowed down to nine CLRs two years later (NASA, 2024; Figure 1)". It studies 16 CLRs (2022 and 2024 lists combined).

## The three suspect regions: all sites (Zenodo dbf; Sun = max consecutive sunlit days in midsummers 2025,26,27,28,29,30,31,32; identical to paper Table A2)

### Peak Near Cabeus B (PCB) - 5 sites, ALL north of 84 S
| id | lat | lon E | Sun days 2025..2032 |
|---|---|---|---|
| PCB01 | -83.7633 | -69.9829 | 2,1,15,0,0,1,15,1 |
| PCB02 | -83.6317 | -67.6339 | 13,0,8,13,13,2,6,13 |
| PCB03 | -83.5630 | -68.2009 | 17,1,13,0,0,8,11,17 |
| PCB04 | -83.3691 | -67.6646 | 16,3,14,0,0,9,12,16 |
| PCB05 | -83.5388 | -71.9419 | 2,5,15,0,0,11,15,16 |

No replacement at latitude <= -84 exists in this source: the southernmost PCB site is PCB01 at -83.7633.
Paper: "only 0.5% or 2.1 km2 of the total area suitable for landing"; "none of these sites offer access to nearby PSRs that maintain surface temperatures below 125 K".

### Nobile Rim 2 (NR2) - 9 sites
| id | lat | lon E | Sun days 2025..2032 | note |
|---|---|---|---|---|
| NR201 | -84.0539 | 56.4813 | 15,14,2,9,11,14,0,12 | **<= -84** |
| NR202 | -84.1553 | 59.8351 | 17,17,2,9,11,16,0,12 | **<= -84**, southernmost |
| NR203 | -83.6871 | 57.0082 | 16,0,3,10,12,15,1,13 | |
| NR204 | -83.7847 | 57.6830 | 1,2,3,9,11,3,3,3 | PSR <110 K (paper Table 3) |
| NR205 | -83.6185 | 59.0568 | 18,0,3,20,12,18,1,13 | |
| NR206 | -83.7805 | 59.2824 | 17,17,3,9,12,17,1,12 | |
| NR207 | -83.9181 | 59.3265 | 17,17,3,9,11,17,1,12 | |
| NR208 | -83.9064 | 57.8114 | 7,13,3,9,11,13,1,12 | team's current point |
| NR2_K2023 | -84.0737 | 59.1974 | 17,17,2,9,11,16,0,12 | **<= -84**, site of Kring et al. 2023 |

Replacements inside 6 deg: NR202, NR2_K2023 or NR201.

### Mons Mouton Plateau (MMP) - 11 sites
| id | lat | lon E | Sun days 2025..2032 | Sun+Earth 2025..2032 |
|---|---|---|---|---|
| MMP01 | -85.1114 | 26.7102 | 15,0,6,13,14,1,4,14 | 14,0,6,13,14,1,4,14 |
| MMP02 | -84.8055 | 24.8871 | 15,0,6,13,14,15,4,15 | 15,0,6,12,14,15,4,15 |
| MMP03 | -84.9683 | 31.1530 | 8,8,1,8,8,8,0,8 | 7,8,1,7,8,8,0,7 |
| MMP04 | -84.6863 | 20.8866 | 15,0,8,14,15,2,6,15 | 15,0,7,14,14,2,5,15 |
| MMP05 | -84.4159 | 28.2118 | 11,11,3,9,11,11,1,10 | 10,11,3,9,10,10,1,10 |
| MMP06 | -84.5961 | 30.4525 | 10,10,3,9,9,10,1,10 | 9,9,3,9,9,9,1,9 (team's current point) |
| MMP07 | -84.6834 | 37.3387 | 12,2,4,11,12,12,2,12 | 1,1,4,0,1,1,2,1 |
| MMP08 | -84.2114 | 40.8100 | 14,0,5,11,13,14,3,14 | 4,0,4,11,12,13,2,4 |
| MMP09 | -83.6844 | 32.8848 | 12,0,4,11,12,11,2,12 | (north of 84 S) |
| MMP10 | -84.1383 | 25.6422 | 15,0,7,13,14,1,5,15 | 15,0,6,13,14,1,4,15 |
| MMP11 | -84.2690 | 36.6724 | 16,0,6,12,14,16,4,15 | 15,0,6,12,13,15,4,15 |

MMP06 is one of the weaker MMP sites for sunlight (never more than 10 consecutive days); the paper selected it for
PSR access: "Landing sites MMP02, MMP05, and MMP06 provide access to PSRs with temperatures remaining below 110 K".
Better-lit sites south of 84 S in the same region: MMP02 (also PSR <110 K), MMP11, MMP04, MMP01, MMP10.

## Oddities noticed in the sources (not affecting the nine points)
- Paper Table A1 as extracted lists FRA02..FRA08 only; FRA01 is in Table A2 and in the dbf (-87.6425, 97.2617). Possibly a row lost in text extraction or in the paper; not checked visually.
- Paper Table A1 heads the dGR101..105/011 block "de Gerlache Rim 2 (dGR2)" (should be Rim 1).
- dbf also contains MMA_K2023, HW_K2023, dGKM_K2023, NR2_K2023, dGR2_K2023 and sites 001, 007, 011.

## Local files
- `/Users/eugenio/hackathlone/.research/paper/wueller2026.pdf`, `wueller2026_full.txt` (PDFKit text), `wueller2026.txt` (ETH text bitstream, truncated at 100 kB)
- `/Users/eugenio/hackathlone/.research/zenodo/inner/LandingSites.{shp,dbf,prj,...}`
- `/Users/eugenio/hackathlone/.research/dl/sites.txt` (all 130 sites dumped), `dbf.py`, `tab.py`, `pdf2txt.js` (helper scripts)
