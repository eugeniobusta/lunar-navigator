// Site Map tab (demo): the factor map, wired to the store so "Go to 3D" opens the 3D tab at the picked point.
import { SiteMap } from "../components/ui/SiteMap";
import { useStore } from "../state/store";

export function SiteMapTab() {
  const sites = useStore((s) => s.sites);
  const goTo3D = useStore((s) => s.goTo3D);
  return <SiteMap sites={sites} onGoTo3D={(id, lat, lon) => goTo3D(id, [lat, lon])} />;
}
