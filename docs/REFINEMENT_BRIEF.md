Big refinement round. Read docs/REFINEMENT_BRIEF.md: it is our acceptance checklist (P0 science before P1 bugs before
P2 UX before P3 visuals; nothing invented; nothing claimed untested). Where this message differs from it, this message
wins. The VR session works in parallel and will import your shared code, so do PART A first and merge it before the rest.

AUDIT (15 minutes, no edits): the brief's section 1 audit, short, as docs/AUDIT.md. Then fix in priority order.

PART A, shared logic in web/src/lib/analysis/ (pure TS; branch feat/eugenio-rag-model):
1. Traffic-light classification for every parameter from docs/criteria.csv: green = good range (safest), amber =
   acceptable, red = rejected. Discrete 3 classes per pixel plus the exact value for tooltips. Missing data = grey,
   never green.
2. Direction: each parameter has a "prefer" direction from criteria.csv, and the ones where a mission might want the
   opposite (landing slope, ice nearby, ice depth, temperature, hollow depth) can be flipped by the user ("prefer
   less" / "prefer more"); flipping swaps green and red for that parameter only. NASA hard limits never flip and
   always win: a pixel failing one is red with the label "unsafe: fails <limit>".
3. Groups: Safe ground (landing slope, walkable ground, hollow depth), Power and heat (sunlight, short nights,
   temperature), Radio link (Earth in view, never out of contact), Ice and science (ice nearby, ice depth). A group
   tick = all its parameters.
4. Combined map for any selection: weighted score as now, then green >= 70, amber 40-69, red < 40, and red where any
   hard limit fails. Thresholds in docs/criteria.md with the reasoning. Tests: every class boundary, flips, missing
   data, hard-limit override, and that "NASA-style balance" still reproduces the published scores exactly.

PART B, the website (branch feat/eugenio-map-first), map first:
1. The site opens on the landing map: the south pole within 6 deg as the main element, full width, with a real
   relief basemap (hillshade from our LOLA DEM, already in data/) under the traffic-light overlay. Smooth zoom and pan
   (mouse, trackpad, touch), latitude rings (84, 86, 88 deg), a compass rose that says "South Pole" at the centre and
   points "towards Earth (0 deg E)", labels for the major craters (Shackleton, Haworth, Shoemaker, Faustini,
   de Gerlache, Cabeus, Malapert, Nobile, Amundsen) with positions from the IAU Gazetteer of Planetary Nomenclature
   (cite it in the Data tab), Artemis sites and past landings as distinct markers.
2. Layer panel, expand and retract: the 4 groups, each a tick box with a chevron; open a group to see its
   parameters, each with tick box, plain one-line meaning, the flip control where allowed, an importance control
   (low / normal / high) and an opacity slider. Presets as a small row above. Opacity only changes how it looks,
   never the score (test it). One legend under the map: green / amber / red with the real-unit ranges of whatever
   is shown, plus grey = no data and a hatch = fails a NASA limit (never colour alone). Colour-blind mode keeps working.
3. Click any spot: a side panel with coordinates, score and class, the measurements, "good here" and "weak here"
   generated from explain.ts, failed limits, data uncertainty, and four actions: "See its sky" (the skyline view,
   which becomes a page you reach from here), "Find landing days", "Compare with...", "Stand here in 3D / VR".
4. Navigation: Map (home), Site sky, Window Finder, Compare, Battery, Data, Method. Keep every existing feature;
   update URL state, smoke tests, README tour links.
PART C, visual redesign away from the generic AI look (branch feat/eugenio-instrument-ui): direction "mission
chart": the map dominates; one quiet side panel like a flight plan; hierarchy from type size and weight, not boxes;
no all-caps labels, no pill buttons everywhere, no identical bordered cards, no decorative gradients or glows; sentence
case; tabular numbers; one icon set used consistently; consistent spacing scale. Keep Earthrise for the chrome and the
sky; traffic-light colours only for suitability: green #6FBF73, amber #F0B429, red #E5484D (check AA and CVD with the
colour-blind mode). Screenshot every screen at 1920x1080, 1440x900 and 390x844 and critique until it reads as a
professional mission-planning tool and a first-time visitor understands it in 5 seconds.
PART D, the brief's sections 7-8 end-to-end QA on the live site after deploy, backup screenshots of every essential
screen in media/screenshots/final/, docs/AUDIT.md updated with what was fixed and what remains. Then report and wait.
