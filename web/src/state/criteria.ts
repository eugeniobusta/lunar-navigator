// The landing criteria table and the criteria values at each site, loaded once and shared.
import { useEffect, useState } from "react";
import type { CriterionRow } from "../lib/analysis/explain";
import { EVERYTHING, countedTerms, presetSelection, type Preset, type TermKey } from "../lib/analysis/suitability";
import { parseCsv } from "../lib/data/csv";
import { useStore } from "./store";

type Row = Record<string, string>;
export interface CriteriaTables { criteria: CriterionRow[]; siteValues: Row[]; presets: Preset[]; defaultPreset: string }

const BASE = `${import.meta.env.BASE_URL}data/`;
let cache: Promise<CriteriaTables> | null = null;

function load(): Promise<CriteriaTables> {
  const text = (p: string) => fetch(BASE + p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p))));
  cache ??= Promise.all([text("criteria.csv"), text("suitability/site_values.csv"), text("suitability/weights.json")])
    .then(([c, s, w]) => {
      const config = JSON.parse(w) as { presets: Preset[]; default: string };
      return { criteria: parseCsv(c) as unknown as CriterionRow[], siteValues: parseCsv(s), presets: config.presets, defaultPreset: config.default };
    });
  return cache;
}

/** null while loading, or if the tables are missing (the "Why here?" box then simply does not show). */
export function useCriteriaTables(): CriteriaTables | null {
  const [tables, setTables] = useState<CriteriaTables | null>(null);
  useEffect(() => {
    let live = true;
    load().then((t) => { if (live) setTables(t); }).catch(() => { cache = null; });
    return () => { live = false; };
  }, []);
  return tables;
}

/** The parameters ticked in "Where to land" (a preset or hand-set ticks), for views outside that tab. */
export function useTickedTerms(tables: CriteriaTables | null): TermKey[] {
  const landPreset = useStore((s) => s.landPreset);
  const landSelection = useStore((s) => s.landSelection);
  if (landSelection) return countedTerms(landSelection);
  const preset = tables?.presets.find((p) => p.key === landPreset) ?? tables?.presets.find((p) => p.key === tables.defaultPreset);
  return countedTerms(preset ? presetSelection(preset) : EVERYTHING);
}
