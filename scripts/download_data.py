"""Downloads the raw data listed in docs/DATA.md into data/. Safe to re-run: skips finished files.

Run once on the fastest connection: uv run python scripts/download_data.py
"""
import time
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
    # LRO Diviner Polar Resource Product: yearly mean temperature for the landing criteria (605 MB).
    "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab",
    "https://raw.githubusercontent.com/brettonw/YaleBrightStarCatalog/master/bsc5-short.json",  # stars for the VR sky
]
KERNELS = ["de421.bsp", "moon_pa_de421_1900-2050.bpc", "moon_080317.tf", "pck00008.tpc"]


def fetch(url: str, tries: int = 8) -> None:
    """Download with retries; a broken connection resumes from the .part file (HTTP Range)."""
    out = DATA / url.rsplit("/", 1)[1]
    tmp = out.with_suffix(out.suffix + ".part")
    if out.exists() and out.stat().st_size > 0:
        print("ok  ", out.name)
        return
    last = None
    for attempt in range(tries):
        done = tmp.stat().st_size if tmp.exists() else 0
        try:
            headers = {"Range": f"bytes={done}-"} if done else {}
            with requests.get(url, stream=True, timeout=60, headers=headers) as r:
                if r.status_code == 416:  # the .part file is already complete
                    break
                r.raise_for_status()
                if done and r.status_code != 206:  # server ignored the Range header: start again
                    done = 0
                size = done + int(r.headers.get("content-length", 0))
                with open(tmp, "ab" if done else "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                        done += len(chunk)
                        if size:
                            print(f"\r{out.name}: {done / size:6.1%}", end="", flush=True)
                if size and done < size:
                    raise requests.ConnectionError(f"short read {done}/{size}")
            break
        except requests.RequestException as e:
            last = e
            print(f"\nretry {attempt + 1}/{tries} {out.name}: {e}")
            time.sleep(3)
    else:
        raise requests.ConnectionError(f"gave up after {tries} tries: {last}")
    tmp.rename(out)
    print(f"\rdone {out.name} ({out.stat().st_size / 1e6:.1f} MB)")


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
