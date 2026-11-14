// View state <-> URL query string, so any view can be shared as a link and survives a reload.
// ?site=mma01&compare=hw02&date=2027-03-14&days=30&tab=compare&preset=ice
// preset is the "Your priorities" preset of Where to land; custom slider values travel as w=42,28,... instead.
// date is UTC ISO-8601: "YYYY-MM-DD" at 00:00, else "YYYY-MM-DDTHH:MMZ" (Window Finder can pick any hour).

export interface UrlView {
  siteId: string;
  compareId: string;
  startIdx: number;
  windowDays: number;
  tab: string;
  /** Where to land: key of the chosen priorities preset ("balanced" is the default and is left out of the URL). */
  preset?: string;
  /** Where to land: custom weights in the order of the sliders, when no preset matches. */
  weights?: number[] | null;
}

/** What a parsed value is checked against. */
export interface UrlContext {
  siteIds: readonly string[];
  tabs: readonly string[];
  startMs: number; // time of sample 0
  stepS: number; // sample spacing, seconds
  n: number; // number of samples
  /** Number of priority weights a custom w= list must have (10: eight layers and two zone terms). */
  weightCount?: number;
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
    if (list.length === (ctx.weightCount ?? 10) && list.every((v) => v <= 100)) out.weights = list;
  }
  return out;
}

/** Sample index -> URL date string. */
export function formatDate(startIdx: number, startMs: number, stepS: number): string {
  const iso = new Date(startMs + startIdx * stepS * 1000).toISOString();
  return iso.slice(11, 16) === "00:00" ? iso.slice(0, 10) : `${iso.slice(0, 16)}Z`;
}

/** Query string (with leading "?") for a view. */
export function buildQuery(v: UrlView, startMs: number, stepS: number): string {
  const q = new URLSearchParams();
  if (v.siteId) q.set("site", v.siteId);
  if (v.compareId) q.set("compare", v.compareId);
  q.set("date", formatDate(v.startIdx, startMs, stepS));
  q.set("days", String(v.windowDays));
  q.set("tab", v.tab);
  if (v.weights) q.set("w", v.weights.join(","));
  else if (v.preset && v.preset !== "balanced") q.set("preset", v.preset);
  return `?${q.toString().replace(/%3A/g, ":").replace(/%2C/g, ",")}`;
}
