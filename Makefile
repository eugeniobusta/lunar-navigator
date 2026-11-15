.PHONY: setup test data download mocks dev build e2e xr xr-dev spectate

setup:      ## install Python and web dependencies
	uv sync
	cd web && npm ci
	cd xr && npm ci

test:       ## pytest + vitest
	uv run pytest -q
	cd web && npm test
	cd xr && npm test

download:   ## fetch raw NASA data into data/ (~520 MB, run once, share by USB)
	uv run python scripts/download_data.py

data:       ## full precompute pipeline -> web/public/data/ (needs make download first)
	uv run python scripts/build_ephemeris.py
	uv run python scripts/build_horizons.py
	uv run python scripts/export_terrain.py
	uv run python scripts/export_site_tiles.py
	uv run python scripts/build_suitability.py
	uv run python scripts/export_stars.py
	uv run python scripts/export_basemap.py
	uv run python scripts/export_open_data.py

mocks:      ## regenerate web/src/mocks/
	uv run python scripts/make_mocks.py

dev:        ## web dev server (run in its own terminal, not inside Claude)
	cd web && npm run dev

build:      ## production web build
	cd web && npm run build

e2e:        ## end-to-end smoke test in a real browser (builds first; CI runs it on every PR)
	cd web && npm run build && npm run e2e

xr:         ## production build of the VR view; with make build first, web/dist/xr is what Vercel serves at /xr/
	cd xr && npm run typecheck && npm run build
	if [ -d web/dist ]; then rm -rf web/dist/xr && cp -R xr/dist web/dist/xr; fi

xr-dev:     ## VR dev server with the Quest 3 emulator, https://localhost:8081 (run it in its own terminal)
	cd xr && npm run dev

spectate:   ## live view of a real VR session on this Mac, with a RECORD button (docs/XR.md); Ctrl+C stops it
	$(MAKE) build
	$(MAKE) xr
	node scripts/spectator_relay.mjs --tunnel
