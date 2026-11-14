// Links into the 3D / VR view at /xr/ (built by the VR team).

/** Link to the 3D / VR view for a site at a time. */
export function xrUrl(siteId: string, ms: number, embed = false, spot: [number, number] | null = null): string {
  const t = new Date(ms).toISOString().slice(0, 19) + "Z";
  const at = spot ? `&lat=${spot[0].toFixed(5)}&lon=${spot[1].toFixed(5)}` : "";
  return `/xr/?site=${encodeURIComponent(siteId)}&t=${encodeURIComponent(t)}${at}${embed ? "&embed=1" : ""}`;
}
