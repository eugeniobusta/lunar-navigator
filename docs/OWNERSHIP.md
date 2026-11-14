# File ownership (one owner per file; ask the owner before touching their files)

Update Sat 09:30: the build is split between two AI sessions so humans only do what AI can't.
- web/** and firmware/** are built by the cloud Claude session (branches feat/claude-*), reviewed and merged by Eugenio.
- engine/**, scripts/**, tests/, web/public/data/ephemeris.json and horizons/** are built by Eugenio's local
  Claude Code (Fable 5.2), because only a laptop can reach the NASA/JPL servers (branches feat/kien-*).
- The per-person table below still says who REVIEWS each area and answers questions about it.
- Once the MVP is on main (real data for the 9 Artemis sites), the per-person table applies again for new
  features: see docs/BACKLOG.md.


| Path | Owner | Branch prefix |
|------|-------|---------------|
| CLAUDE.md, AGENTS.md, docs/INTERFACES.md, docs/DECISIONS.md, docs/OWNERSHIP.md, Makefile, .github/, web/public/data/sites.json, docs/SITES.md | Eugenio | feat/eugenio-* |
| engine/**, scripts/**, pyproject.toml, tests/ (python), docs/SCIENCE.md, docs/VALIDATION.md, web/public/data/ephemeris.json, web/public/data/horizons/** | Kien | feat/kien-* |
| web/src/lib/analysis/**, web/src/workers/**, web/src/styles/tokens.css, web/src/components/ui/** | Chinh | feat/chinh-* |
| web/package.json, web/vite.config.ts, web/src/App.tsx, web/src/routes/**, web/src/state/**, web/src/charts/**, web/src/mocks/**, vercel.json | Rahan | feat/rahan-* |
| web/src/lib/power/**, web/src/lib/serial/**, web/src/routes/power/**, firmware/** (incl. firmware/ring/) | Ahmed | feat/ahmed-* |
| web/src/content/**, docs/PITCH.md, media/**, README.md (story sections) | Luke | feat/luke-* |

Shared-file rule: if you need a new route, dependency, or contract field, post in the team chat and the owner adds it.
