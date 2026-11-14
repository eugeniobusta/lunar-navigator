// View state <-> URL query string, so any view can be shared as a link and survives a reload.
// view=simple|detailed comes first when it is given; links without it still open (urlSync.ts works the view out).
// ?site=mma01&compare=hw02&date=2027-03-14&days=30&tab=compare&preset=ice
// Where to land: preset=<key> for a preset; otherwise the ticked parameters as pick=sunlight,earth and any
// importances as imp=sunlight:high and turned-round directions as flip=temperature. Old links with exact weights,
// w=42,28,..., still open. The spot clicked on the map travels as spot=<lat>,<east lon>.
// date is UTC ISO-8601: "YYYY-MM-DD" at 00:00, else "YYYY-MM-DDTHH:MMZ" (Window Finder can pick any hour).

export interface UrlView {
  siteId: string;
  compareId: string;
  startIdx: number;
  windowDays: number;
  tab: string;
  /** Where to land: key of the chosen preset (the default one is left out of the URL). */
  preset?: string | null;
  /** Where to land: the ticked parameters, when no preset is chosen. */
  ticked?: string[] | null;
  /** Where to land: importance (low / high) of ticked parameters; normal is left out. */
  importance?: Record<string, string> | null;
  /** Where to land: exact weights from an old link, in the order of ctx.termKeys. */
  weights?: number[] | null;
  /** Landing map: ticked parameters whose preferred direction is turned round. */
  flipped?: string[] | null;
  /** Landing map: the clicked spot as [latitude, east longitude] in degrees. */
  spot?: [number, number] | null;
  /** Which of the two views of the site: "simple" or "detailed". */
  view?: string | null;
}

/** What a parsed value is checked against. */
export interface UrlContext {
  siteIds: readonly string[];
  tabs: readonly string[];
  startMs: number; // time of sample 0
  stepS: number; // sample spacing, seconds
  n: number; // number of samples
  /** The parameters that can be ticked, in the order of a w= list (eight layers, then the two zone terms). */
  termKeys?: readonly string[];
  /** Key of the default preset, which is not written to the URL. */
  defaultPreset?: string;
}

const MAX_DAYS = 3650;

/** Values found in the query string that are valid for this data; anything missing or invalid is left out. */
export function parseQuery(search: string, ctx: UrlContext): Partial<UrlView> {
  const q = new URLSearchParams(search);
  const out: Partial<UrlView> = {};

  const site = q.get("site");
  if (site && ctx.siteIds.includes(site)) out.siteId = site;
  const compare = q.get("compare");
  if (compare && ctx.siteIds.includes(compare)) out.compareId = compare;

  const view = q.get("view");
  if (view === "simple" || view === "detailed") out.view = view;

  const tab = q.get("tab");
  if (tab && ctx.tabs.includes(tab)) out.tab = tab;

  const days = q.get("days");
  if (days && /^\d+$/.test(days)) {
    const d = Number(days);
    if (d >= 1 && d <= MAX_DAYS) out.windowDays = d;
  }

  const date = q.get("date");
  if (date && /^\d{4}-\d{2}-\d{2}(T\d{2}(:\d{2})?Z?)?$/.test(date)) {
    // Always read as UTC: pad to YYYY-MM-DDTHH:MM, then add ":00Z".
    let s = date.replace(/Z$/, "");
    if (s.length === 10) s += "T00:00";
    else if (s.length === 13) s += ":00";
    const ms = Date.parse(`${s}:00Z`);
    if (!Number.isNaN(ms)) {
      const idx = Math.round((ms - ctx.startMs) / (ctx.stepS * 1000));
      if (idx >= 0 && idx < ctx.n) out.startIdx = idx;
    }
  }

  // The preset key is checked later against suitability/weights.json, which loads with the tab; here only its shape.
  const preset = q.get("preset");
  if (preset && /^[a-z]{1,20}$/.test(preset)) out.preset = preset;
  const w = q.get("w");
  if (w && /^\d{1,3}(,\d{1,3})*$/.test(w)) {
    const list = w.split(",").map(Number);
    if (list.length === (ctx.termKeys?.length ?? 10) && list.every((v) => v <= 100)) out.weights = list;
  }
  const pick = q.get("pick");
  if (pick !== null && ctx.termKeys) {
    const list = pick.split(",").filter((k) => ctx.termKeys!.includes(k));
    if (list.length === pick.split(",").filter(Boolean).length) out.ticked = [...new Set(list)];
    const imp: Record<string, string> = {};
    for (const part of (q.get("imp") ?? "").split(",")) {
      const [k, level] = part.split(":");
      if (list.includes(k) && (level === "low" || level === "high")) imp[k] = level;
    }
    if (out.ticked && Object.keys(imp).length) out.importance = imp;
    const flip = (q.get("flip") ?? "").split(",").filter((k) => list.includes(k));
    if (out.ticked && flip.length) out.flipped = [...new Set(flip)];
  }
  const spot = q.get("spot");
  if (spot && /^-?\d{1,2}(\.\d{1,6})?,-?\d{1,3}(\.\d{1,6})?$/.test(spot)) {
    const [lat, lon] = spot.split(",").map(Number);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) out.spot = [lat, lon];
  }
  return out;
}

/** Sample index -> URL date string. */
export function formatDate(startIdx: number, startMs: number, stepS: number): string {
  const iso = new Date(startMs + startIdx * stepS * 1000).toISOString();
  return iso.slice(11, 16) === "00:00" ? iso.slice(0, 10) : `${iso.slice(0, 16)}Z`;
}

/** Query string (with leading "?") for a view. */
export function buildQuery(v: UrlView, startMs: number, stepS: number, defaultPreset?: string): string {
  const q = new URLSearchParams();
  if (v.view) q.set("view", v.view);
  if (v.siteId) q.set("site", v.siteId);
  if (v.compareId) q.set("compare", v.compareId);
  q.set("date", formatDate(v.startIdx, startMs, stepS));
  q.set("days", String(v.windowDays));
  q.set("tab", v.tab);
  if (v.preset) { if (v.preset !== (defaultPreset ?? "everything")) q.set("preset", v.preset); }
  else if (v.weights) q.set("w", v.weights.join(","));
  else if (v.ticked) {
    q.set("pick", v.ticked.join(","));
    const imp = Object.entries(v.importance ?? {}).filter(([k, l]) => v.ticked!.includes(k) && l !== "normal");
    if (imp.length) q.set("imp", imp.map(([k, l]) => `${k}:${l}`).join(","));
    const flip = (v.flipped ?? []).filter((k) => v.ticked!.includes(k));
    if (flip.length) q.set("flip", flip.join(","));
  }
  if (v.spot) q.set("spot", `${v.spot[0]},${v.spot[1]}`);
  return `?${q.toString().replace(/%3A/g, ":").replace(/%2C/g, ",")}`;
}
