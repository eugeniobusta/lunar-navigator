"""Horizon masks by great-circle ray marching (docs/SCIENCE.md section 3). Owner: Kien."""
import numpy as np

R_M = 1737400.0


def march_distances(pixel_m=120.0, near_m=5000.0, growth=0.015, max_m=150000.0):
    """1-pixel steps out to near_m, then each step grows by `growth` (1.5 %) out to max_m. Metres."""
    near = np.arange(pixel_m, near_m + 1e-9, pixel_m)
    k = int(np.ceil(np.log(max_m / near[-1]) / np.log1p(growth)))
    far = near[-1] * (1 + growth) ** np.arange(1, k + 1)
    return np.concatenate([near, np.minimum(far, max_m)])


def obstruction_angle(h_t, h_o, d_m):
    """Elevation angle (deg) of terrain at height h_t, great-circle distance d_m, seen from height h_o (all m)."""
    delta = np.asarray(d_m) / R_M
    return np.degrees(np.arctan2((R_M + h_t) * np.cos(delta) - (R_M + h_o), (R_M + h_t) * np.sin(delta)))


def horizon(dem, lat, lon, observer_h_m=2.0, az_step_deg=0.5, max_range_km=150.0, growth=0.015):
    """Returns (elev_deg at az = i * az_step_deg, surface_elev_m) for an observer at lat / east lon (deg)."""
    surface = float(dem.height_at(lat, lon))
    h_o = surface + observer_h_m
    az = np.radians(np.arange(0.0, 360.0, az_step_deg))[:, None]
    d = march_distances(dem.scale_m, growth=growth, max_m=max_range_km * 1000.0)[None, :]
    delta = d / R_M
    phi, lam = np.radians(lat), np.radians(lon)
    sin_lat2 = np.sin(phi) * np.cos(delta) + np.cos(phi) * np.sin(delta) * np.cos(az)
    lat2 = np.arcsin(np.clip(sin_lat2, -1.0, 1.0))
    lon2 = lam + np.arctan2(np.sin(az) * np.sin(delta) * np.cos(phi), np.cos(delta) - np.sin(phi) * sin_lat2)
    h_t = dem.height_at(np.degrees(lat2), np.degrees(lon2))
    theta = obstruction_angle(h_t, h_o, d)
    return np.nanmax(theta, axis=1), surface
