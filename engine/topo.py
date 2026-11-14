"""Topocentric altitude/azimuth from MOON_ME vectors (docs/SCIENCE.md section 2). Owner: Kien."""
import numpy as np

MOON_R_KM = 1737.4


def site_basis(lat, lon):
    """Local (up, east, north) unit vectors in MOON_ME for latitude and east longitude in degrees."""
    p, lam = np.radians(lat), np.radians(lon)
    cp, sp, cl, sl = np.cos(p), np.sin(p), np.cos(lam), np.sin(lam)
    up = np.array([cp * cl, cp * sl, sp])
    east = np.array([-sl, cl, 0.0])
    north = np.array([-sp * cl, -sp * sl, cp])
    return up, east, north


def altaz_of(lat, lon, v):
    """Elevation and azimuth (deg) of vectors v, shape (..., 3). Azimuth clockwise from north in [0, 360)."""
    up, east, north = site_basis(lat, lon)
    v = np.asarray(v, dtype=float)
    el = np.degrees(np.arcsin(np.clip(v @ up / np.linalg.norm(v, axis=-1), -1.0, 1.0)))
    az = np.degrees(np.arctan2(v @ east, v @ north)) % 360.0
    return el, az


def altaz(lat, lon, height_km, sun_dir, earth_km):
    """(sun_el, sun_az, earth_el, earth_az) in degrees for a site at height_km from the Moon's centre.

    sun_dir: unit vectors (..., 3), used as a direction only (surface parallax < 0.001 deg).
    earth_km: Earth centre minus Moon centre (..., 3); the site vector is subtracted (parallax up to ~0.26 deg).
    """
    up, _, _ = site_basis(lat, lon)
    sun_el, sun_az = altaz_of(lat, lon, sun_dir)
    earth_el, earth_az = altaz_of(lat, lon, np.asarray(earth_km, dtype=float) - height_km * up)
    return sun_el, sun_az, earth_el, earth_az
