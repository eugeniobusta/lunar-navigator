"""Visibility series and metrics; the Python twin of web/src/lib/analysis (docs/SCIENCE.md section 4). Owner: Kien."""
import numpy as np

from engine import topo


def horizon_at(elev_deg, az, az_step_deg=0.5):
    """Horizon elevation at azimuth az (deg): linear interpolation between bins, wrapping at 360."""
    elev = np.asarray(elev_deg, dtype=float)
    x = (np.asarray(az) % 360.0) / az_step_deg
    i0 = np.floor(x).astype(int) % elev.size
    t = x - np.floor(x)
    return elev[i0] * (1 - t) + elev[(i0 + 1) % elev.size] * t


def series(hz, sun_dir, earth_km):
    """hz: a horizons/<id>.json dict. Returns dict of sunEl, sunAz, sunMargin, earthEl, earthAz, earthMargin."""
    height_km = topo.MOON_R_KM + (hz["surface_elev_m"] + hz["observer_h_m"]) / 1000.0
    se, sa, ee, ea = topo.altaz(hz["lat"], hz["lon"], height_km, sun_dir, earth_km)
    return {"sunEl": se, "sunAz": sa, "sunMargin": se - horizon_at(hz["elev_deg"], sa, hz["az_step_deg"]),
            "earthEl": ee, "earthAz": ea, "earthMargin": ee - horizon_at(hz["elev_deg"], ea, hz["az_step_deg"])}


def longest_run(mask):
    """Longest run of True in a boolean array, in samples."""
    m = np.concatenate([[0], np.asarray(mask, dtype=np.int8), [0]])
    edges = np.flatnonzero(np.diff(m))
    return int((edges[1::2] - edges[::2]).max()) if edges.size else 0


def metrics(s, step_h=1.0):
    """% sunlit, % Earth visible (disc CENTRE above the horizon) and longest darkness / no-Earth in hours."""
    lit, earth = s["sunMargin"] > 0, s["earthMargin"] > 0
    return {"sunPct": 100.0 * lit.mean(), "earthPct": 100.0 * earth.mean(), "bothPct": 100.0 * (lit & earth).mean(),
            "longestDarkH": longest_run(~lit) * step_h, "longestNoEarthH": longest_run(~earth) * step_h,
            "maxSunEl": float(s["sunEl"].max())}
