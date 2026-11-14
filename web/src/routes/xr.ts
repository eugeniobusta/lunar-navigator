// Links into the 3D / VR view at /xr/ (built by the VR team).

/** Link to the 3D / VR view for a site at a time. */
export function xrUrl(siteId: string, ms: number, embed = false): string {
  const t = new Date(ms).toISOString().slice(0, 19) + "Z";
  return `/xr/?site=${encodeURIComponent(siteId)}&t=${encodeURIComponent(t)}${embed ? "&embed=1" : ""}`;
}
