.PHONY: setup test data download mocks dev build

setup:      ## install Python and web dependencies
	uv sync
	cd web && npm ci

test:       ## pytest + vitest
	uv run pytest -q
	cd web && npm test

download:   ## fetch raw NASA data into data/ (~520 MB, run once, share by USB)
	uv run python scripts/download_data.py

data:       ## full precompute pipeline -> web/public/data/ (Kien fills this in)
	@echo "TODO(Kien): ephemeris, horizons, grids"

mocks:      ## regenerate web/src/mocks/
	uv run python scripts/make_mocks.py

dev:        ## web dev server (run in its own terminal, not inside Claude)
	cd web && npm run dev

build:      ## production web build
	cd web && npm run build
