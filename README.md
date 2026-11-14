# Lunar Landing Site Navigator

HackAthlone 2026 · NASA Space Apps Challenge #11.

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

## Team

Eugenio Busta (lead) · Kien · Chinh · Rahan · Ahmed Diallo · Luke
