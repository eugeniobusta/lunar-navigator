// One site, two views: which view a link opens, and which page of a view holds a page of the other.
import { describe, expect, it } from "vitest";
import type { Tab } from "./store";
import { chooseView, tabForView, viewOfTab } from "./view";

describe("which view a link opens", () => {
  it("the link's own view= wins", () => {
    expect(chooseView("detailed", "explore", "simple")).toBe("detailed");
    expect(chooseView("simple", "windows", "detailed")).toBe("simple");
  });
  it("links from before there were two views open the page they always did", () => {
    for (const t of ["overview", "map", "windows", "compare", "power"] as Tab[]) expect(chooseView(null, t, "simple")).toBe("detailed");
    for (const t of ["explore", "plan"] as Tab[]) expect(chooseView(undefined, t, "detailed")).toBe("simple");
  });
  it("otherwise what this browser used last, and Simple for a first visit", () => {
    expect(chooseView(null, "data", "detailed")).toBe("detailed");
    expect(chooseView(null, null, null)).toBe("simple");
    expect(chooseView("nonsense", "home", null)).toBe("simple");
  });
});

describe("switching view keeps the place", () => {
  it("Simple holds the Detailed pages in two", () => {
    expect((["overview", "compare"] as Tab[]).map((t) => tabForView(t, "simple"))).toEqual(["explore", "explore"]);
    expect((["map", "windows", "power", "grid"] as Tab[]).map((t) => tabForView(t, "simple"))).toEqual(["plan", "plan", "plan", "plan"]);
  });
  it("Detailed opens the first page of each", () => {
    expect(tabForView("explore", "detailed")).toBe("overview");
    expect(tabForView("plan", "detailed")).toBe("map");
  });
  it("pages both views have stay put", () => {
    for (const t of ["home", "moon3d", "data", "method"] as Tab[]) {
      expect(tabForView(t, "simple")).toBe(t);
      expect(tabForView(t, "detailed")).toBe(t);
      expect(viewOfTab(t)).toBeNull();
    }
  });
});
