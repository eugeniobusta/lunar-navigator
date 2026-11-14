# Project: Lunar Landing Site Navigator (HackAthlone 2026, NASA Space Apps)

Compare lunar landing sites and dates by when the Sun (power) and Earth (direct-to-Earth comms)
are above the real terrain horizon. Static web app + Python precompute pipeline.

## Read first
- docs/INTERFACES.md: data contracts. Never change a contract without the lead (Eugenio).
- docs/SCIENCE.md: formulas, conventions, constants. Follow them exactly.
- docs/OWNERSHIP.md: who owns which files. Edit only files your owner owns unless told otherwise.
- docs/DECISIONS.md: one line per decision. Append when you make a decision.

## Stack
- engine/ (Python 3.11, uv): skyfield, numpy, rasterio, pyproj, requests, pytest.
- scripts/: one-off pipeline scripts that write web/public/data/*.json.
- web/ (React 18 + TypeScript + Vite): d3 for charts, zustand for state, vitest for tests.
- firmware/moonbox/: Arduino sketch for the tabletop demo.

## Commands
- make test: pytest + vitest
- make data: run the full precompute pipeline (ephemeris, horizons, grids)
- make dev: run web dev server (run it in a separate terminal, not inside Claude)
- make build: production web build
- make e2e: browser smoke test of the built site (every tab opens, no console errors). CI runs it on every PR;
  first time locally: `cd web && npx playwright install chromium`

## Hard rules
- NEVER read files in data/ or web/public/data/ into the conversation. Inspect them with scripts that print shapes/summaries.
- Conventions: angles in degrees in all files; longitude east-positive in [-180, 180]; azimuth clockwise from north in [0, 360);
  time in UTC ISO-8601; lunar radius 1737.4 km; frame MOON_ME (DE421).
- No new dependencies without asking the owner of package.json (Rahan) or pyproject.toml (Kien).
- Small, focused changes. Do not refactor files outside the task.
- Every numeric function gets a test with a known answer.
- Work on your own branch feat/<name>-<topic>. Never push to main. Open a PR with `gh pr create`.
- Before opening a PR: `git fetch && git rebase origin/main`, then `make test` and `npm run build` must pass.
- Don't put the NASA logo or insignia anywhere in the app.
