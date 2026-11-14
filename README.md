# Lunar Landing Site Navigator

At the Moon's south pole the Sun never climbs more than a few degrees, so one ridge decides whether a lander has
power and whether it can see Earth to call home. This tool shows, for real terrain and any date from November 2026
to December 2029, when a landing site has sunlight and a radio link, and where the good sites are.
Built by team **Claude's Plan** at HackAthlone 2026 for the NASA Space Apps Challenge "Lunar Landing Site Navigator".

**Live: https://claudes-plan-lunar-navigator.vercel.app** · 3D / VR: https://claudes-plan-lunar-navigator.vercel.app/xr/

## The 3-minute tour

Each link opens the app in exactly that state.

1. **Ask where to land.** [The map](https://claudes-plan-lunar-navigator.vercel.app/?tab=map) is the home page:
   every 120 m square within 6° of the pole, tested against NASA's Artemis III landing requirements, over shaded
   relief with the craters named. 14.3 % of the ground passes, in 5,297 zones. Green is good, amber acceptable,
   red poor for what you tick; hatched red is unsafe and says which limit fails. Tick a group or a single
   parameter, or pick "Power first", "Radio link" or "Ice science": the classes and the ranking follow. One
   parameter by itself reads in real units, as [sunlight alone](https://claudes-plan-lunar-navigator.vercel.app/?tab=map&pick=sunlight).
2. **Click a spot.** [The best zone for everything](https://claudes-plan-lunar-navigator.vercel.app/?tab=map&spot=-84.01732,23.42168):
   its measurements, what is good and what is weak there, how sure the numbers are, and four next steps.
3. **See its sky.** [Malapert Massif, January 2027](https://claudes-plan-lunar-navigator.vercel.app/?site=mma01&date=2027-01-09&days=14&tab=overview).
   The chart is the whole horizon unrolled, with the real skyline. Drag the time slider: the Sun skims the ridges
   and Earth bobs in the north. One sentence says what it means: sunlight 51 % of the time, Earth always in view.
4. **Slip the launch.** [Nobile Rim 1 against Malapert](https://claudes-plan-lunar-navigator.vercel.app/?site=nr107&compare=mma01&date=2027-01-09T22:00Z&days=10&tab=compare).
   A 10-day stay at Nobile Rim 1 has 100 % sunlight. Drag "Launch slip" to +14 days: it falls to 12.5 %.
5. **Ask when to land.** [Window Finder](https://claudes-plan-lunar-navigator.vercel.app/?site=mma01&date=2026-11-14&days=14&tab=windows),
   then "Find landing days". A 14-day mission at Malapert works on 32 days of the next 12 months, three days a month.
6. **Stand on the Moon.** [3D / VR](https://claudes-plan-lunar-navigator.vercel.app/xr/): the same data as a
   place you can stand in, on a laptop or a Meta Quest 3.
7. **Check us.** The [Data page](https://claudes-plan-lunar-navigator.vercel.app/?tab=data) lists every source with
   its terms and every file we publish; the Method page shows our numbers against JPL's and NASA's.

## How it works

1. **Where the Sun and Earth are.** Skyfield with JPL's DE421 ephemeris gives their positions from the Moon's
   centre every hour, in the Moon's own frame. The browser turns that into elevation and azimuth for any site.
2. **The skyline.** From NASA's LOLA elevation map (120 m per pixel) we walk outward from each site in 720
   directions, up to 150 km, and keep the highest angle the terrain reaches, allowing for the Moon's curvature.
3. **Lit, in contact, or neither.** The Sun or Earth is "up" when its centre is above that skyline. Everything
   else (percentages, longest night, landing windows, battery charge) is counting hours.
4. **Where to land.** Six hard limits from NASA's Artemis III requirements (within 6° of the pole, landing slope
   under 10°, walkable ground within 2 km, Earth in view, lit for the stay, a 100 m box) and a 0 to 100 score for
   the rest, shown as green (70 or more), amber (40 to 69) or red. What counts is yours to tick. Every threshold has
   a source or is marked "team choice":
   [docs/criteria.md](docs/criteria.md), [docs/criteria.csv](docs/criteria.csv).

Formulas: [docs/SCIENCE.md](docs/SCIENCE.md). File formats: [docs/INTERFACES.md](docs/INTERFACES.md).
One page for non-scientists: [docs/CHEATSHEET.md](docs/CHEATSHEET.md).

## Data used

| Data | From | Used for |
|------|------|----------|
| LOLA LDEM_75S_120M elevation map | NASA LRO, PDS Geosciences Node | Skylines, slopes, the relief under the map, the 3D terrain |
| Lunar polar illumination and Earth visibility maps (product 69) | NASA Goddard PGDA | Where-to-land limits and score; check of our model |
| Diviner Polar Resource Product (temperature, depth of stable ice) | NASA LRO Diviner, PDS | Two soft criteria |
| DE421 ephemeris and lunar orientation kernels | JPL / NAIF, via Skyfield | Sun and Earth positions |
| Horizons API | JPL | Check of our Sun and Earth positions |
| CGI Moon Kit: LROC WAC colour map, LOLA elevation | NASA Scientific Visualization Studio | The whole Moon in the 3D / VR view (display only) |
| Artemis candidate landing sites | Wueller et al. 2026, JGR Planets | The nine Artemis points (verified against the paper) |
| Names and positions of craters and mountains | IAU Gazetteer of Planetary Nomenclature (USGS) | Labels on the map |
| Lunar landing attempts, 1965 to 2025 | NASA NSSDCA and mission sources | Lessons table |

Each provider's terms are quoted in [DATA_LICENSE.md](DATA_LICENSE.md) and on the Data tab. Everything we compute
is published in `web/public/data/` (listed in `index.json`, described in [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md))
under CC BY 4.0; the code is MIT.

## Validation

| Check | Result |
|-------|--------|
| Sun and Earth positions against JPL Horizons, 3 sites x 20 times | largest difference 0.0007° (target: under 0.05°) |
| Browser maths against the Python reference, 3 sites x 20 times | largest difference 0.00022° |
| Long-run sunlight against NASA's PGDA map, 9 Artemis sites | within 3.5 percentage points |
| Long-run Earth visibility against NASA's PGDA map, 9 Artemis sites | within 4.3 percentage points |
| Skyline sampling against a 30 times finer march | under-reads by at most 0.08° |
| Artemis coordinates against Wueller et al. 2026, Table A1 | all nine confirmed |

Details, and what the tool does not model: [docs/VALIDATION.md](docs/VALIDATION.md). An honest limit: the IM-2
lander's 2025 landing spot passes every one of our limits on the 120 m map; it fell into a crater 20 m across.
Passing means "worth a closer look", not "safe".

## Run it

You need git, Node 22, Python 3.11 or later and [uv](https://docs.astral.sh/uv/).

```
git clone https://github.com/eugeniobusta/lunar-navigator.git && cd lunar-navigator
make setup && make dev        # the app, on the data already in the repository
make test                     # Python and browser-maths tests;  make e2e  runs the browser smoke test
make download && make data    # optional: fetch the raw NASA data (about 1 GB) and rebuild every file (about 2 minutes)
```

The 3D / VR view: `make xr-dev` ([docs/XR.md](docs/XR.md)). Team workflow: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Team: Claude's Plan

Eugenio Busta (lead, integration) · Kien (science) · Chinh (algorithms, site map) · Rahan (app, shareable links) ·
Ahmed Diallo (power, 3D / VR concept) · Luke (story and pitch)

## Use of AI

This project was built with AI coding assistants: Claude Code (Claude Fable 5.2 and Claude Opus 5.5) and
OpenAI Codex.

- **What they did**: wrote most of the code (the Python data pipeline, the web app, the VR view), the tests, the
  visual design and these documents, working from prompts and reviews by the team (docs/PROMPTS.md). Research
  runs with web search gathered the sources for the landing criteria, the list of past landings and the check of
  the Artemis coordinates (docs/research/).
- **What keeps it honest**: every number in the app and in the pitch comes from code we ran, not from a model's
  memory. Sun and Earth positions are checked against JPL Horizons (largest difference 0.0007 degrees) and long-run
  sunlight and Earth visibility against NASA's PGDA maps (largest difference 4.3 percentage points):
  docs/VALIDATION.md. Every change goes through a pull request with automated tests, and thresholds we chose
  ourselves are marked "team choice" in docs/criteria.csv.
- **What it is not**: results are our own computations from open NASA and JPL data. This is not an official NASA
  product and implies no NASA endorsement.
