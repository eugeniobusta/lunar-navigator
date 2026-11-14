// One site, two views (Chinh's two designs). Simple: the homepage, "Explore a site" and "Plan a landing".
// Detailed: the homepage and one page per tool. 3D Moon and Data & Method are in both.
// The view is in the link (view=simple|detailed), remembered per browser, and Simple for a first visit.
import type { Tab } from "./store";

export type View = "simple" | "detailed";
const SIMPLE_ONLY: Tab[] = ["explore", "plan"];
const DETAILED_ONLY: Tab[] = ["overview", "map", "windows", "compare", "grid", "power"];

/** The page of `view` that holds what page `t` shows: Explore = Overview + Compare; Plan = Site Finder + Window
 *  Finder + Battery. A page that both views have stays as it is. */
export function tabForView(t: Tab, view: View): Tab {
  if (view === "simple") {
    if (t === "overview" || t === "compare") return "explore";
    if (t === "map" || t === "windows" || t === "power" || t === "grid") return "plan";
  } else {
    if (t === "explore") return "overview";
    if (t === "plan") return "map";
  }
  return t;
}
/** The view a page belongs to, or null if both have it. */
export function viewOfTab(t: Tab): View | null {
  return SIMPLE_ONLY.includes(t) ? "simple" : DETAILED_ONLY.includes(t) ? "detailed" : null;
}

const VIEW_KEY = "plan.view";
/** The view this browser used last, if it may be read. */
export function rememberedView(): View | null {
  try { const v = window.localStorage.getItem(VIEW_KEY); return v === "simple" || v === "detailed" ? v : null; } catch { return null; }
}
export function rememberView(v: View): void {
  try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* private mode: the link still carries the view */ }
}

/**
 * Which view a link opens. In order: what the link says (view=); the view of the page it names, so links from
 * before there were two views open the page they always did; what this browser used last; Simple.
 */
export function chooseView(asked: string | null | undefined, tab: Tab | null, remembered: View | null): View {
  if (asked === "simple" || asked === "detailed") return asked;
  return (tab && viewOfTab(tab)) ?? remembered ?? "simple";
}

/** The view for the address the page was opened with, known before any data has loaded. */
export function initialView(): View {
  if (typeof window === "undefined") return "simple";
  const q = new URLSearchParams(window.location.search), t = q.get("tab");
  return chooseView(q.get("view"), (t === "land" ? "map" : t) as Tab | null, rememberedView());
}
