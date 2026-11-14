# Lunar Landing Site Navigator

Team **Claude's Plan** · HackAthlone 2026 · NASA Space Apps Challenge #11.

Pick a landing site near the lunar south pole and a date, and see when the Sun (power) and Earth
(direct-to-Earth comms) are above the real terrain horizon. Compare sites, slip the launch date,
find the landing days that meet a mission's needs, and check whether the battery survives the dark.

## Start here (everyone, 5 minutes)

1. Install: Node 22, Python 3.11+, [uv](https://docs.astral.sh/uv/), git, `gh`, Claude Code.
2. `gh auth login`, then `gh repo clone eugeniobusta/lunar-navigator && cd lunar-navigator`
3. `make setup` then `make test` (both must pass)
4. `make dev` in its own terminal to see the app.
5. Open **docs/PROMPTS.md**, find your section, run your next prompt.

## How we work

- **One owner per file** (docs/OWNERSHIP.md). Need a change in someone else's file? Ask them in the chat.
- **One prompt = one branch = one PR.** Branch names: `feat/<name>-<topic>`. Nobody pushes to `main`.
- **Merge windows** at 11:00, 13:00, 15:00, 17:00, 19:00, 21:00 and 23:00. Eugenio merges (squash).
- **Contracts are law**: docs/INTERFACES.md. Build against `web/src/mocks/` until real data lands in `web/public/data/`.
- Before a PR: `git fetch && git rebase origin/main && make test && make build`.
- Gates: **13:00** (data + shell), **17:00** MVP deployed on real data, **21:00** everything in. Freeze 22:00.

## Layout

| Path | What | Owner |
|------|------|-------|
| `engine/`, `scripts/`, `tests/` | Python precompute (Skyfield, LOLA DEM) | Kien |
| `web/src/lib/analysis/`, `web/src/workers/` | Visibility, metrics, Window Finder | Chinh |
| `web/src/` app shell, routes, charts, state | React app | Rahan |
| `web/src/lib/power/`, `web/src/lib/serial/`, `firmware/` | Battery simulator, MoonBox | Ahmed |
| `web/src/content/`, `docs/PITCH.md`, `media/` | Story, copy, pitch | Luke |
| `docs/`, `CLAUDE.md`, `web/public/data/sites.json` | Contracts, sites, integration | Eugenio |

## Data

Raw NASA data (~520 MB) is not in git: `make download` puts it in `data/`. Download once, share by USB.
Sources and validation: docs/DATA.md, docs/SCIENCE.md, docs/VALIDATION.md.

## Open data

Live app: https://claudes-plan-lunar-navigator.vercel.app (open the **Data** tab).

- **What we use**: NASA LOLA LDEM_75S_120M (PDS Geosciences Node), NASA Goddard PGDA lunar polar illumination maps
  (product 69), the JPL Horizons API, JPL DE421 and NAIF lunar kernels via Skyfield, and the Artemis candidate points
  of Wueller et al. 2026. Each provider's terms are quoted in DATA_LICENSE.md and on the Data tab.
- **What we publish**: every file in `web/public/data/` (hourly ephemeris, terrain horizons, 9 x 9 grids, the
  south-pole terrain export, and our validation tables as CSV), listed with sizes in `web/public/data/index.json`
  and downloadable from the Data tab. Every field is described in docs/DATA_DICTIONARY.md.
- **Licences**: code MIT (LICENSE); our derived data CC BY 4.0 (DATA_LICENSE.md); NASA and JPL source data keeps
  its own terms.
- **Rebuild it yourself**: `git clone https://github.com/eugeniobusta/lunar-navigator.git && cd lunar-navigator`,
  then `make download` (about 1 GB) and `make data` (about 2 minutes on our laptop).

## Use of AI

This project was built with AI coding assistants: Claude Code (Claude Fable 5.2 and Claude Opus 5.5) and
OpenAI Codex.

- **What they did**: wrote most of the code (the Python data pipeline, the web app, the VR view), the tests, the
  visual design and these documents, working from prompts and reviews by the team (docs/PROMPTS.md). Two research
  runs with web search gathered the sources for the landing criteria and the list of past landings
  (docs/research/).
- **What keeps it honest**: every number in the app and in the pitch comes from code we ran, not from a model's
  memory. Sun and Earth positions are checked against JPL Horizons (largest difference 0.0007 degrees) and long-run
  sunlight and Earth visibility against NASA's PGDA maps (largest difference 4.3 percentage points):
  docs/VALIDATION.md. Every change goes through a pull request with automated tests, and thresholds we chose
  ourselves are marked "team choice" in docs/criteria.csv.
- **What it is not**: results are our own computations from open NASA and JPL data. This is not an official NASA
  product and implies no NASA endorsement.

## Team: Claude's Plan

Eugenio Busta (lead) · Kien · Chinh · Rahan · Ahmed Diallo · Luke
