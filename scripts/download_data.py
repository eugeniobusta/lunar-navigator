"""Downloads the raw data listed in docs/DATA.md into data/. Safe to re-run: skips finished files.

Run once on the fastest connection: uv run python scripts/download_data.py
"""
from pathlib import Path

import requests
from skyfield.api import Loader

DATA = Path(__file__).resolve().parents[1] / "data"
LOLA = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/"
PGDA = "https://pgda.gsfc.nasa.gov/data/MoonIllumination/"
FILES = [
    LOLA + "ldem_75s_120m_float.lbl",
    LOLA + "ldem_75s_120m_float.xml",
    LOLA + "ldem_75s_120m_float.img",  # 232 MB
    PGDA + "AVGVISIB_75S_120M_201608.TIF",
    PGDA + "AVGVISIB_75S_120M_201608_EARTH.TIF",
]
KERNELS = ["de421.bsp", "moon_pa_de421_1900-2050.bpc", "moon_080317.tf", "pck00008.tpc"]


def fetch(url: str) -> None:
    out = DATA / url.rsplit("/", 1)[1]
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        size = int(r.headers.get("content-length", 0))
        if out.exists() and size and out.stat().st_size == size:
            print("ok  ", out.name)
            return
        tmp = out.with_suffix(out.suffix + ".part")
        done = 0
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                done += len(chunk)
                if size:
                    print(f"\r{out.name}: {done / size:6.1%}", end="", flush=True)
        tmp.rename(out)
        print(f"\rdone {out.name} ({done / 1e6:.1f} MB)")


if __name__ == "__main__":
    DATA.mkdir(exist_ok=True)
    for url in FILES:
        try:
            fetch(url)
        except requests.RequestException as e:
            print("FAILED", url, e)
    (DATA / "kernels").mkdir(exist_ok=True)
    load = Loader(str(DATA / "kernels"))  # prompt K1 expects the kernels in data/kernels/
    for k in KERNELS:
        try:
            load(k)
            print("ok  ", k)
        except Exception as e:  # skyfield raises several types for missing URLs
            print("FAILED", k, e)
