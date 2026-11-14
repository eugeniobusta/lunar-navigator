// How it works, where the data comes from, and what it does not model.
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
