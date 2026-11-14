"""LOLA LDEM_75S_120M reader and polar-stereographic helpers (docs/SCIENCE.md section 3). Owner: Kien."""
import re
from pathlib import Path

import numpy as np
from pyproj import Proj

DATA = Path(__file__).resolve().parents[1] / "data"
LDEM_LABEL = DATA / "ldem_75s_120m_float.lbl"
STERE_SOUTH = "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
LABEL_KEYS = ["PRODUCT_ID", "LINES", "LINE_SAMPLES", "SAMPLE_TYPE", "SAMPLE_BITS", "UNIT", "SCALING_FACTOR",
              "OFFSET", "MAP_PROJECTION_TYPE", "CENTER_LATITUDE", "CENTER_LONGITUDE", "MAP_SCALE",
              "LINE_PROJECTION_OFFSET", "SAMPLE_PROJECTION_OFFSET", "POSITIVE_LONGITUDE_DIRECTION",
              "A_AXIS_RADIUS", "MINIMUM_LATITUDE", "MAXIMUM_LATITUDE"]


def read_label(path):
    """The label keys we rely on, as strings with units stripped."""
    text = Path(path).read_text()
    out = {}
    for key in LABEL_KEYS:
        m = re.search(rf"^\s*{key}\s*=\s*(.+?)\s*$", text, re.MULTILINE)
        if m is None:
            raise ValueError(f"{key} missing from {path}")
        out[key] = re.sub(r"\s*<.*>$", "", m.group(1)).strip("\"'")
    return out


class Dem:
    """Height grid in polar stereographic x/y (south pole at the centre, lon 0 up, lon 90 E right).

    Pixel centre of 0-based (row, col): x = (col - sample_offset) * scale_m, y = (line_offset - row) * scale_m
    (PDS: x = (SAMPLE - SAMPLE_PROJECTION_OFFSET - 1) * MAP_SCALE with 1-based SAMPLE; y likewise, lines go down).
    """

    def __init__(self, heights_m, scale_m, line_offset, sample_offset, name="synthetic"):
        self.h = heights_m
        self.scale_m = float(scale_m)
        self.line_offset = float(line_offset)
        self.sample_offset = float(sample_offset)
        self.name = name
        self.proj = Proj(STERE_SOUTH)

    @classmethod
    def from_label(cls, label=LDEM_LABEL, verbose=False):
        lab = read_label(label)
        if verbose:
            for k in LABEL_KEYS:
                print(f"  {k} = {lab[k]}")
        assert lab["SAMPLE_TYPE"] == "PC_REAL" and lab["SAMPLE_BITS"] == "32", "expected little-endian float32"
        assert lab["MAP_PROJECTION_TYPE"] == "POLAR STEREOGRAPHIC" and float(lab["CENTER_LATITUDE"]) == -90
        assert float(lab["CENTER_LONGITUDE"]) == 0 and lab["POSITIVE_LONGITUDE_DIRECTION"] == "EAST"
        assert float(lab["A_AXIS_RADIUS"]) == 1737.4 and float(lab["OFFSET"]) == 1737.4
        unit_m = {"KILOMETER": 1000.0, "METER": 1.0}[lab["UNIT"]]
        lines, samples = int(lab["LINES"]), int(lab["LINE_SAMPLES"])
        img = Path(label).with_suffix(".img")
        raw = np.fromfile(img, dtype="<f4")
        assert raw.size == lines * samples, f"{img.name}: {raw.size} values, label says {lines}x{samples}"
        h = raw.reshape(lines, samples) * np.float32(float(lab["SCALING_FACTOR"]) * unit_m)
        return cls(h, float(lab["MAP_SCALE"]), float(lab["LINE_PROJECTION_OFFSET"]),
                   float(lab["SAMPLE_PROJECTION_OFFSET"]), name=lab["PRODUCT_ID"])

    def xy(self, lat, lon):
        return self.proj(lon, lat)

    def latlon(self, x, y):
        lon, lat = self.proj(x, y, inverse=True)
        return lat, lon

    def height_at_xy(self, x, y):
        """Bilinear height in metres at stereographic x/y (m). NaN outside the grid."""
        fc = np.asarray(x, dtype=float) / self.scale_m + self.sample_offset
        fr = self.line_offset - np.asarray(y, dtype=float) / self.scale_m
        rows, cols = self.h.shape
        ok = (fc >= 0) & (fc <= cols - 1) & (fr >= 0) & (fr <= rows - 1)
        c0 = np.clip(np.floor(fc).astype(np.int64), 0, cols - 2)
        r0 = np.clip(np.floor(fr).astype(np.int64), 0, rows - 2)
        tc, tr = fc - c0, fr - r0
        h = self.h
        out = ((1 - tr) * ((1 - tc) * h[r0, c0] + tc * h[r0, c0 + 1])
               + tr * ((1 - tc) * h[r0 + 1, c0] + tc * h[r0 + 1, c0 + 1]))
        return np.where(ok, out, np.nan)

    def height_at(self, lat, lon):
        """Bilinear height in metres above the 1737.4 km sphere at latitude / east longitude (deg)."""
        x, y = self.xy(lat, lon)
        return self.height_at_xy(x, y)
