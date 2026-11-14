"""engine/topo.py + the committed ephemeris.json against cached JPL Horizons observer tables (tolerance 0.05 deg)."""
import pytest

from scripts.fetch_horizons_fixtures import BODIES, EPHEMERIS, SITES, compare, fixture_path, parse_response

HAVE = EPHEMERIS.exists() and all(fixture_path(s, b).exists() for s in SITES for b in BODIES)


@pytest.mark.skipif(not HAVE, reason="run scripts/fetch_horizons_fixtures.py")
def test_matches_jpl_horizons():
    res = compare()
    assert set(res) == set(SITES)
    for site, by_body in res.items():
        for body, (n, d_el, d_az, _) in by_body.items():
            assert n == 20, (site, body)
            assert d_el < 0.05 and d_az < 0.05, (site, body, d_el, d_az)


@pytest.mark.skipif(not HAVE, reason="run scripts/fetch_horizons_fixtures.py")
def test_fixture_is_the_airless_mean_earth_frame():
    text = fixture_path("mma01", "sun").read_text()
    assert "MEAN_ME" in text and "NO (AIRLESS)" in text
    rows = parse_response(text)
    assert rows[0][0].isoformat() == "2027-01-01T00:00:00+00:00"
    assert 0 <= rows[0][1] < 360 and -90 <= rows[0][2] <= 90
