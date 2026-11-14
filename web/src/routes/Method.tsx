// How it works, where the data comes from, and what it does not model.

// Measured numbers from docs/VALIDATION.md tables 1 and 4 (scripts/fetch_horizons_fixtures.py, scripts/validate_pgda.py).
const JPL = [
  ["Malapert Massif", "0.0007° / 0.0000°", "0.0000° / 0.0000°"],
  ["Haworth", "0.0007° / 0.0000°", "0.0000° / 0.0000°"],
  ["Apollo 11", "0.0007° / 0.0001°", "0.0000° / 0.0001°"],
];
const PGDA = [
  ["Peak near Cabeus B", "51.5", "49.3", "+2.2", "71.8", "70.3", "+1.5"],
  ["Haworth", "46.9", "46.8", "+0.1", "57.6", "59.3", "-1.7"],
  ["Malapert Massif", "45.5", "45.1", "+0.4", "100.0", "100.0", "0.0"],
  ["Mons Mouton Plateau", "12.6", "14.1", "-1.5", "49.2", "52.9", "-3.8"],
  ["Mons Mouton", "70.9", "69.7", "+1.2", "58.5", "56.2", "+2.3"],
  ["Nobile Rim 1", "52.9", "49.8", "+3.1", "57.5", "60.1", "-2.6"],
  ["Nobile Rim 2", "30.8", "30.6", "+0.2", "52.8", "55.0", "-2.2"],
  ["de Gerlache Rim 2", "56.7", "56.8", "-0.2", "54.3", "55.8", "-1.5"],
  ["Slater Plain", "49.3", "52.8", "-3.5", "42.3", "46.6", "-4.3"],
];
export function Method() {
  return (
    <section className="panel prose">
      <h2>How the answers are made</h2>
      <p>
        Near the lunar south pole the Sun never rises more than a few degrees. A ridge tens of kilometres away
        decides whether a lander is in sunlight, and whether Earth is above the skyline for a direct radio link.
        This tool computes both from real terrain, for every hour from November 2026 to December 2029.
      </p>
      <h3>Positions of the Sun and Earth</h3>
      <p>
        Computed with Skyfield from the JPL DE421 ephemeris in the Moon's mean-Earth frame. For each site we take the
        local east, north and up directions and turn the Sun's direction and the Earth's position into elevation and
        azimuth. Earth's parallax is included; for the Sun it is under 0.001°.
      </p>
      <h3>The skyline</h3>
      <p>
        From NASA's LOLA elevation map of the south pole at 120 m per pixel. From each site we walk outward along
        720 directions, up to 150 km, and keep the highest angle the terrain reaches, allowing for the curvature of the Moon.
        Sites outside the map (Apollo 11, Chang'e-4) use a flat horizon and say so.
      </p>
      <h3>Checked against NASA and JPL</h3>
      <p>
        Positions are compared with JPL Horizons observer tables for the same sites and times. Long-run sunlight and
        Earth-visibility percentages are compared with NASA's published illumination maps. The differences and their
        causes are listed in the project's validation notes.
      </p>
      <div className="table-scroll"><table className="compare">
        <caption className="note">Position of the Sun and Earth in the sky: largest error against JPL Horizons, 20 times across 2027-2028.</caption>
        <thead>
          <tr><th>Site</th><th>Sun elevation / azimuth</th><th>Earth elevation / azimuth</th></tr>
        </thead>
        <tbody>
          {JPL.map(([site, sun, earth]) => (
            <tr key={site}><th>{site}</th><td>{sun}</td><td>{earth}</td></tr>
          ))}
        </tbody>
      </table></div>
      <div className="table-scroll"><table className="compare">
        <caption className="note">Share of time sunlit and with Earth in view, 2009-2028: ours, NASA's map, and the difference in percentage points.</caption>
        <thead>
          <tr><th>Site</th><th>Sunlit: ours</th><th>NASA</th><th>Diff</th><th>Earth: ours</th><th>NASA</th><th>Diff</th></tr>
        </thead>
        <tbody>
          {PGDA.map(([site, sun, nasaSun, dSun, earth, nasaEarth, dEarth]) => (
            <tr key={site}>
              <th>{site}</th><td>{sun}%</td><td>{nasaSun}%</td><td>{dSun}</td>
              <td>{earth}%</td><td>{nasaEarth}%</td><td>{dEarth}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="note">
        We count the centre of the Sun or Earth above the skyline, seen from 2 m above the ground. NASA's maps are for
        the ground itself and count Earth when any part of it shows, which explains most of the differences.
      </p>
      <h3>What it does not model</h3>
      <ul>
        <li>Line of sight only: no radio link budget or ground-station scheduling, no thermal model.</li>
        <li>Terrain features smaller than about 120 m, such as boulders and small craters.</li>
        <li>"Sunlit" means the centre of the Sun is above the skyline; power uses the visible part of its disc.</li>
      </ul>
      <h3>Data</h3>
      <ul>
        <li>LOLA LDEM_75S_120M, PDS Geosciences Node.</li>
        <li>NASA Goddard PGDA south-pole illumination maps (product 69).</li>
        <li>JPL DE421 ephemeris and lunar orientation kernels, via Skyfield.</li>
        <li>Artemis candidate points from Wueller et al. 2026, JGR Planets.</li>
      </ul>
    </section>
  );
}
