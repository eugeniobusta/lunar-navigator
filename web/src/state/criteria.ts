// The landing criteria table and the criteria values at each site, loaded once and shared.
import { useEffect, useState } from "react";
import type { CriterionRow } from "../lib/analysis/explain";
import { parseCsv } from "../lib/data/csv";

type Row = Record<string, string>;
export interface CriteriaTables { criteria: CriterionRow[]; siteValues: Row[] }

const BASE = `${import.meta.env.BASE_URL}data/`;
let cache: Promise<CriteriaTables> | null = null;

function load(): Promise<CriteriaTables> {
  const text = (p: string) => fetch(BASE + p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p))));
  cache ??= Promise.all([text("criteria.csv"), text("suitability/site_values.csv")])
    .then(([c, s]) => ({ criteria: parseCsv(c) as unknown as CriterionRow[], siteValues: parseCsv(s) }));
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
