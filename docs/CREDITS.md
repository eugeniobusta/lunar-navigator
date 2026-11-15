# Credits: every third-party picture, texture, font and library

Checked at each source on 14 November 2026. "Confirmed" means we read the statement at the source ourselves on
that date; anything we could not confirm is flagged in the last section. Data sources (LOLA, PGDA, Diviner, JPL,
the IAU gazetteer, Wueller et al.) and their terms are in [DATA_LICENSE.md](../DATA_LICENSE.md) and on the
Data & Method page.

## 1. NASA photographs on the website

Files in `web/public/media/`, added by Chinh. Each NASA ID was looked up in the NASA Image and Video Library
(`https://images-api.nasa.gov/search?nasa_id=<ID>`); all nine exist there with the title and date below. Each is
credited where it is shown and on the Data & Method page. The machine-readable list is
`docs/research/media_assets.json`, copied into `web/public/data/index.json` under `third_party`.

| File | Where it is shown | NASA ID | Title in the library | Date | Credit |
|------|-------------------|---------|----------------------|------|--------|
| moon-gibbous.jpg | Homepage, first screen | GSFC_20171208_Archive_e001860 | Waning Gibbous | 2017-12-08 | NASA Goddard |
| apollo8-earthrise.jpg | Homepage | as08-14-2383 | Apollo 8 Mission image, Earth over the horizon of the moon | 1968-12-24 | NASA |
| artemis2-lunar-day-shadows.jpg | Homepage (Detailed) | art002e009281 | Shadows at the Edge of Lunar Day | 2026-04-06 | NASA, Artemis II crew |
| artemis2-earthset.jpg | Homepage (Detailed) | art002e021278 | A Breathtaking Earthset from Orion | 2026-04-06 | NASA, Artemis II crew |
| artemis3-lighting-test.jpg | Homepage (Detailed) | CEB_1528 | NASA Engineers Simulate Lunar Lighting for Artemis III Moon Landing | 2025-05-09 | NASA/Charles Beason |
| apollo15-rover.jpg | Homepage (Detailed) | as15-86-11603 | Astronaut James Irwin works at Lunar Roving Vehicle during Apollo 15 EVA | 1971-07-31 | NASA |
| artemis2-moon-and-earth.jpg | Homepage, open data section | art002e009287 | A New View of the Moon | 2026-04-06 | NASA, Artemis II crew |
| earth-apollo17.jpg | Sky chart, Earth | as17-148-22727 | View of the Earth seen by the Apollo 17 crew traveling toward the moon | 1972-12-07 | NASA |
| sun-sdo.jpg | Sky chart, the Sun | PIA26681 | Image of Sun From NASA's Solar Dynamics Observatory | 2025-09-15 | NASA/GSFC/Solar Dynamics Observatory |

**Terms (confirmed).** NASA's "Images and Media" page (https://www.nasa.gov/nasa-brand-center/images-and-media/)
says: "NASA content used in a factual manner that does not imply endorsement may be used without needing explicit
permission", and that "The NASA Insignia, Logotype, identifiers, and imagery are not in the public domain" in the
sense that their use is governed by the Media Usage Guidelines.

**How we comply.** The photos illustrate facts about the Moon and the missions; none carries the NASA insignia or
logotype (we looked at each file: the Apollo 15 frame shows US flag decals on the rover, no NASA mark, and no
recognisable face); every one is credited; the footer and the Data & Method page say this is not a NASA product
and implies no endorsement. The Earth photo in the sky chart is masked to show Earth's phase; the caption says so.

## 2. Textures of the 3D / VR view

| Asset | Files | Source | Credit, as the source asks | Status |
|-------|-------|--------|-----------------------------|--------|
| The whole Moon (colour, relief, heights) | `xr/public/moon/` (`color_*.jpg`, `relief_*.jpg`, `height_720.u16`, `polar_height.u16`), made by `scripts/export_moon_globe.py` | NASA Scientific Visualization Studio, "CGI Moon Kit", https://svs.gsfc.nasa.gov/4720 | "Please give credit for this item to: NASA's Scientific Visualization Studio" (visualizer Ernie Wright; data: LOLA elevation, LROC WAC colour mosaic collected by Arizona State University) | Confirmed: read on the page in a browser, 15 Nov 2026 |
| Earth | `xr/public/sky/earth_2k.jpg`, `earth_1k.jpg`, made by `scripts/export_sky_textures.py` | NASA SVS, "Blue Marble - A Seamless Image Mosaic of the Earth (WMS)", item 2915, file `bluemarble-2048.png`, https://svs.gsfc.nasa.gov/2915 | "NASA/Goddard Space Flight Center Scientific Visualization Studio. The Blue Marble Next Generation data is courtesy of Reto Stockli (NASA/GSFC) and NASA's Earth Observatory." | Confirmed: read on the page in a browser, 15 Nov 2026 |
| The Sun | `xr/public/sky/sun_512.jpg`, same script | NASA Solar Dynamics Observatory, "Spotless Sun" (PIA21582), 13 March 2017, https://images.nasa.gov/details/PIA21582 | NASA/GSFC/Solar Dynamics Observatory (the line docs/XR.md uses) | Picture confirmed: in the library and on the NASA Science photojournal page under this title, an SDO image (keywords and mission say so). Credit wording not confirmed: see section 6 |
| Stars of the VR sky | `web/public/data/stars.json` | Yale Bright Star Catalogue, 5th rev. ed., JSON conversion by Bretton Wade | see DATA_LICENSE.md (the conversion is MIT) | Recorded in DATA_LICENSE.md |

The Sun's picture is cut to its disc and brightened, and the Earth's is drawn brighter than the file (docs/XR.md,
"Pictures and credits"). The same NASA terms as section 1 apply.

## 3. Our own pictures

The shaded relief under the landing map (`web/public/data/basemap/`) and the south-pole map on the homepage are
drawn by our own code from NASA's LOLA elevation map. The rock texture, boulders and stars in the sky chart are
illustration generated in the browser (`web/src/charts/regolith.ts`), not photographs. Icons are our own line
drawings (`web/src/routes/map/icons.tsx` and inline SVG).

## 4. Fonts

| Font | Loaded from | Licence | Confirmed at |
|------|-------------|---------|--------------|
| Barlow (400, 600) | Google Fonts, linked in `web/index.html` | SIL Open Font License 1.1, "Copyright 2017 The Barlow Project Authors" | https://github.com/google/fonts/blob/main/ofl/barlow/OFL.txt |
| Barlow Semi Condensed (600) | Google Fonts, linked in `web/index.html` | SIL Open Font License 1.1, same authors | https://github.com/google/fonts/blob/main/ofl/barlowsemicondensed/OFL.txt |

## 5. Libraries

Licences as declared in each installed package (`package.json` in `node_modules`, Python package metadata),
read by script.

**Website, shipped to the browser:** d3 7.9.2 (ISC), react 18.3.1 (MIT), react-dom 18.3.1 (MIT), zustand 5.1.0 (MIT).

**Website, build and test only:** vite 6.4.6 (MIT), @vitejs/plugin-react 4.7.0 (MIT), typescript 5.8.3
(Apache-2.0), vitest 5.1.0 (MIT), @playwright/test 1.65.1 (Apache-2.0), eslint 9.39.5 (MIT), @eslint/js 9.39.5
(MIT), typescript-eslint 8.72.2 (MIT), eslint-plugin-react-hooks 5.2.0 (MIT), eslint-plugin-react-refresh 0.4.26
(MIT), globals 16.5.0 (MIT), @types/d3 7.4.3, @types/react 18.3.31, @types/react-dom 18.3.7 (MIT).

**3D / VR view, shipped to the browser:** @iwsdk/core 1.1.0 (MIT), three 0.185.0 as the package super-three
(MIT), @pmndrs/uikit, @pmndrs/uikit-horizon and @pmndrs/uikit-lucide 1.0.78 (MIT: each package's LICENSE file is
the MIT text, "Copyright 2024 Bela Bohlender"; their package.json says "SEE LICENSE IN LICENSE").

**3D / VR view, build and test only:** @iwsdk/cli, @iwsdk/reference, @iwsdk/vite-plugin-dev 1.1.0 (MIT), vite
7.3.8 (MIT), vitest 5.1.0 (MIT), typescript 5.9.3 (Apache-2.0), @types/node 22.20.5 (MIT), @types/three 0.185.4
(MIT), @meta-quest/metavr 1.10.0 ("Meta Platform Technologies SDK License": a development tool for the headset
emulator, not shipped in the site; see below).

**Data pipeline (Python):** skyfield 1.55 (MIT), numpy 2.5.4 (BSD-3-Clause, with bundled parts under 0BSD, MIT,
Zlib and CC0-1.0), rasterio 1.5.2 (BSD-3-Clause), pyproj 3.8.0 (MIT), requests 2.34.2 (Apache-2.0); tests and
lint: pytest 9.2.0 (MIT), ruff 0.17.5 (MIT).

## 6. AI-generated voice

Voice: AI-generated with ElevenLabs. The narrator of the VR view (`xr/public/voice/*.mp3`, 17 clips) is a
synthetic voice: ElevenLabs text to speech, voice "Dan" (id `BHr135B5EUBtaWheVj8S`), model
`eleven_multilingual_v2`, generated by `scripts/make_voice.mjs` from text the team approved
(docs/NARRATION.md). No person recorded these lines. The use of the audio is under ElevenLabs' terms for the
account that generated it; we did not read which plan that is.

## 7. Not confirmed, or to watch

- **Credit line of the Sun picture (PIA21582).** On both NASA pages we opened (images.nasa.gov and the NASA
  Science photojournal) the credit field reads "Spotless_combo_best.tif", a file name, not a name. Both pages
  say it is a Solar Dynamics Observatory image. We credit it "NASA/GSFC/Solar Dynamics Observatory", the usual
  line for SDO pictures and the one docs/XR.md records; it is not a quote from the page.
- **@meta-quest/metavr** is under Meta's own SDK licence, not an open-source one. It is a dev dependency of `xr/`
  only. We did not read that licence in full; check it before redistributing anything built with it.
- **Photographer for the Artemis II and Apollo frames.** The library lists no photographer (or "NASA") for them;
  we credit NASA and the crew or mission as the library titles do.
- **Google Fonts** serves the font files from its own servers, so a visitor's browser contacts Google. Hosting
  the two fonts ourselves would remove that; the licence allows it.
