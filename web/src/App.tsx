// App shell (owner: Rahan). Placeholder until prompt R1: proves the mock data loads.
import sites from "./mocks/sites.json";

export default function App() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Lunar Landing Site Navigator</h1>
      <p>Skeleton build. {sites.sites.length} mock sites loaded.</p>
      <ul>
        {sites.sites.map((s) => (
          <li key={s.id}>{s.name} ({s.lat.toFixed(2)}, {s.lon.toFixed(2)})</li>
        ))}
      </ul>
    </main>
  );
}
