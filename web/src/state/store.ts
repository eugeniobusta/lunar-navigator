// App state (zustand). Data is loaded once; the selected window is [startIdx, startIdx + windowDays * 24).
import { create } from "zustand";
import type { Ephemeris, Horizon } from "../lib/analysis";
import { loadEphemeris, loadHorizon, loadSites, type Loaded, type Site } from "../lib/data";

export type Tab = "overview" | "land" | "windows" | "compare" | "grid" | "power" | "moon3d" | "data" | "method";

interface State {
  ready: boolean;
  sites: Site[];
  sitesMock: boolean;
  eph: Ephemeris | null;
  ephMock: boolean;
  horizons: Record<string, Loaded<Horizon>>;
  siteId: string;
  compareId: string;
  startIdx: number;
  windowDays: number;
  cursor: number; // sample offset within the window
  tab: Tab;
  /** A point picked in the Layers view of Where to land, passed on to the 3D view: [lat, east lon], or null. */
  spot: [number, number] | null;
  init: () => Promise<void>;
  ensureHorizon: (id: string) => Promise<void>;
  setSite: (id: string) => void;
  setCompare: (id: string) => void;
  setStartIdx: (i: number) => void;
  setWindowDays: (d: number) => void;
  setCursor: (c: number) => void;
  setTab: (t: Tab) => void;
  goTo3D: (siteId: string, spot: [number, number] | null) => void;
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  sites: [],
  sitesMock: false,
  eph: null,
  ephMock: false,
  horizons: {},
  siteId: "",
  compareId: "",
  startIdx: 0,
  windowDays: 30,
  cursor: 0,
  tab: "overview",
  spot: null,

  init: async () => {
    const [sites, eph] = await Promise.all([loadSites(), loadEphemeris()]);
    const first = sites.value.find((s) => s.id === "mma01") ?? sites.value[0];
    const second = sites.value.find((s) => s.id === "hw02" && s.id !== first?.id) ??
      sites.value.find((s) => s.id !== first?.id) ?? first;
    // Start the window at "now" if it is inside the data, else at the start of the data.
    const nowIdx = Math.floor((Date.now() - eph.value.startMs) / (eph.value.stepS * 1000));
    const startIdx = nowIdx >= 0 && nowIdx < eph.value.n ? nowIdx : 0;
    set({ sites: sites.value, sitesMock: sites.mock, eph: eph.value, ephMock: eph.mock,
      siteId: first?.id ?? "", compareId: second?.id ?? "", startIdx, ready: true });
    await Promise.all([get().ensureHorizon(first?.id ?? ""), get().ensureHorizon(second?.id ?? "")]);
  },

  ensureHorizon: async (id) => {
    if (!id || get().horizons[id]) return;
    const site = get().sites.find((s) => s.id === id);
    if (!site) return;
    const hz = await loadHorizon(site);
    set((st) => ({ horizons: { ...st.horizons, [id]: hz } }));
  },

  setSite: (id) => { set({ siteId: id, cursor: 0, spot: null }); void get().ensureHorizon(id); },
  setCompare: (id) => { set({ compareId: id }); void get().ensureHorizon(id); },
  setStartIdx: (i) => {
    const eph = get().eph;
    const max = eph ? Math.max(0, eph.n - 1) : 0;
    set({ startIdx: Math.max(0, Math.min(max, Math.round(i))), cursor: 0 });
  },
  setWindowDays: (d) => set({ windowDays: d, cursor: 0 }),
  setCursor: (c) => set({ cursor: Math.max(0, Math.round(c)) }),
  setTab: (t) => set({ tab: t }),
  goTo3D: (siteId, spot) => { set({ siteId, spot, cursor: 0, tab: "moon3d" }); void get().ensureHorizon(siteId); },
}));
