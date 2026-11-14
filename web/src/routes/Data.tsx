// Open data: what we use, what we publish, and how to rebuild it.
import { useEffect, useState } from "react";

const REPO = "https://github.com/eugeniobusta/lunar-navigator";
const BASE = `${import.meta.env.BASE_URL}data/`;

interface Source { name: string; what: string; use: string; url: string; terms: string; termsUrl: string }

// Terms as stated on each provider's own page, read on 14 Nov 2026. Where a page states no licence, we say so.
const SOURCES: Source[] = [
  {
    name: "LOLA LDEM_75S_120M",
    what: "Elevation map of the lunar south pole (75°S to 90°S) at 120 m per pixel, from the Lunar Orbiter Laser Altimeter on NASA's Lunar Reconnaissance Orbiter. Data set LRO-L-LOLA-4-GDR-V1.0, PDS Geosciences Node.",
    use: "The skyline around every landing site, and the 3D terrain.",
    url: "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/",
    terms: "NASA Planetary Data System archive. The PDS pages we read state no licence and no restrictions; PDS asks users to cite the data they use.",
    termsUrl: "https://pds.nasa.gov/datastandards/citing/",
  },
  {
    name: "NASA Goddard PGDA lunar polar illumination maps (product 69)",
    what: "Average sunlight and average Earth visibility at the south pole, AVGVISIB_75S_120M_201608, modelled by the LOLA team from the same terrain.",
    use: "An independent check of our sunlight and Earth-visibility percentages, and the colour layers of the 3D terrain.",
    url: "https://pgda.gsfc.nasa.gov/products/69",
    terms: "No licence stated. The product page asks users to cite Mazarico et al. (2011), Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030.",
    termsUrl: "https://pgda.gsfc.nasa.gov/products/69",
  },
  {
    name: "JPL Horizons API",
    what: "NASA/JPL's on-line ephemeris service: where the Sun and Earth appear in the sky from a given point on the Moon.",
    use: "An independent check of our Sun and Earth positions (3 sites, 20 times each).",
    url: "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
    terms: "No licence stated. JPL Solar System Dynamics asks for the citation \"NASA/JPL Solar System Dynamics. Data retrieved on 2026-11-14. Horizons API. https://ssd.jpl.nasa.gov\".",
    termsUrl: "https://ssd.jpl.nasa.gov/about/",
  },
  {
    name: "JPL DE421 ephemeris and NAIF lunar kernels",
    what: "de421.bsp (positions of the Sun, Earth and Moon), moon_pa_de421_1900-2050.bpc (lunar orientation), moon_080317.tf (lunar frames) and pck00008.tpc (constants), read with the Skyfield library.",
    use: "The hourly Sun direction and Earth position in the Moon's mean-Earth frame.",
    url: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/",
    terms: "NAIF rules: kernels on the NAIF server may be downloaded and used by anyone, and redistributed if unmodified; acknowledgement is encouraged. Skyfield is MIT-licensed.",
    termsUrl: "https://naif.jpl.nasa.gov/naif/rules.html",
  },
  {
    name: "Artemis candidate points, Wueller et al. 2026",
    what: "Representative points in the Artemis candidate landing regions, from a paper in JGR Planets (doi:10.1029/2025JE009434).",
    use: "The coordinates of the nine Artemis sites. Two are flagged as under review.",
    url: "https://doi.org/10.1029/2025JE009434",
    terms: "CC BY 4.0, according to the licence the publisher registered with Crossref.",
    termsUrl: "https://api.crossref.org/works/10.1029/2025JE009434",
  },
];

interface FileEntry { path: string; bytes: number; format: string; description: string }

const fmtBytes = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(2)} MB` : `${(b / 1e3).toFixed(1)} kB`);

export function Data() {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`${BASE}index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { files: FileEntry[] }) => setFiles(d.files))
      .catch(() => setFailed(true));
  }, []);
  const total = files?.reduce((a, f) => a + f.bytes, 0) ?? 0;

  return (
    <section className="panel">
      <div className="prose">
        <h2>Open data</h2>
        <p>
          Everything here is built from open NASA and JPL data, and everything we compute from it is published
          for anyone to download, check and reuse.
        </p>
        <h3>Open data we use</h3>
      </div>
      <div className="table-scroll">
        <table className="compare">
          <thead>
            <tr><th>Dataset</th><th>What it is</th><th>What we use it for</th><th>Licence or usage terms</th></tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name}>
                <th><a href={s.url}>{s.name}</a></th>
                <td>{s.what}</td>
                <td>{s.use}</td>
                <td>{s.terms} <a href={s.termsUrl}>Terms page</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="prose">
        <h3>Open data we publish</h3>
        <p>
          Our derived data is licensed <a href={`${REPO}/blob/main/DATA_LICENSE.md`}>CC BY 4.0</a>; the code
          is <a href={`${REPO}/blob/main/LICENSE`}>MIT</a>. Every field is described in
          the <a href={`${REPO}/blob/main/docs/DATA_DICTIONARY.md`}>data dictionary</a>. The checks against JPL and
          NASA are downloadable too: <a href={`${BASE}validation/jpl.csv`}>jpl.csv</a> and <a href={`${BASE}validation/pgda.csv`}>pgda.csv</a>.
        </p>
      </div>
      {failed && <p className="note">The file list could not be loaded. The files are in web/public/data/ in the repository.</p>}
      {!files && !failed && <p className="note">Loading the file list…</p>}
      {files && (
        <div className="table-scroll">
          <table className="compare">
            <caption className="note">{files.length} files, {fmtBytes(total)} in total.</caption>
            <thead>
              <tr><th>File</th><th>Size</th><th>Format</th><th>What it holds</th></tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.path}>
                  <th><a href={BASE + f.path} download>{f.path}</a></th>
                  <td>{fmtBytes(f.bytes)}</td>
                  <td>{f.format}</td>
                  <td>{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="prose">
        <h3>Rebuild it yourself</h3>
        <p>Three commands turn the raw NASA files into every file above. You need git, Python 3.11 or later and uv.</p>
        <pre>{`git clone ${REPO}.git && cd lunar-navigator
make download
make data`}</pre>
        <p className="note">
          Measured on our laptop (Apple-silicon Mac): the download is about 380 MB and took about 3 minutes;
          make data took about 7 seconds and reproduces the published files byte for byte.
        </p>
      </div>
    </section>
  );
}
