// "Why here?": turns a point's values into plain sentences, one per criterion: the value, a verdict
// (good / acceptable / rejected) and the reason from docs/criteria.csv.
// Pure TypeScript, no React and no DOM, so the web app and the VR view can both import it.
// Bounds: docs/criteria.csv and suitability/weights.json (a test keeps this file in step with both).

import type { TermKey } from "./suitability";

export type Verdict = "good" | "acceptable" | "rejected";

/** The values of one point. Leave out what you do not have: only the criteria you give are explained. */
export interface PointValues {
  /** Latitude in degrees (south is negative). */
  latDeg?: number;
  /** Slope across 120 m at the point, degrees. */
  landingSlopeDeg?: number;
  /** Share of the ground within 2 km with a slope under 20 degrees, percent. */
  walkablePct?: number;
  /** NASA PGDA long-run average sunlight, percent of time. */
  sunPct?: number;
  /** NASA PGDA long-run average Earth visibility, percent of time. */
  earthPct?: number;
  /** Distance to the nearest permanent shadow of 1 km2 or more, km (20.4 means "more than 20"). */
  shadowKm?: number;
  /** Yearly mean ground temperature, kelvin. */
  tempK?: number;
  /** Longest run of hours without the Sun (our model). */
  longestDarkH?: number;
  /** Longest run of hours without Earth (our model). */
  longestNoEarthH?: number;
  /** Depth at which water ice is stable, metres (Diviner); Infinity = none within 2.87 m. */
  iceDepthM?: number;
  /** How far the spot sits below the mean ground within 2 km, metres (negative = above its surroundings). */
  hollowDepthM?: number;
}

/** One row of criteria.csv (only the columns used here). */
export interface CriterionRow { parameter: string; kind: string; reason: string }

export interface Explanation {
  key: keyof PointValues;
  /** Short name of the criterion, e.g. "Landing slope". */
  label: string;
  /** The value as people read it, e.g. "3.4 degrees". */
  value: string;
  verdict: Verdict;
  /** True if "rejected" here rules the point out (a NASA hard limit); false if it only scores zero. */
  hardLimit: boolean;
  /** True for the criteria that carry no weight in the balanced score (they count only if you weigh them). */
  optional: boolean;
  /** The range the value falls in and why the criterion matters (the sentence after the verdict). */
  detail: string;
  /** The whole sentence: label, value, verdict, then `detail`. */
  sentence: string;
}

interface Rule {
  key: keyof PointValues;
  label: string;
  /** Name in criteria.csv whose reason is quoted (the soft row where there is one). */
  parameter: string;
  /** Value at or beyond which the criterion is ideal, and value at or beyond which it is rejected. */
  ideal: number; reject: number;
  /** True if a rejected value breaks a NASA Artemis III hard limit. */
  hard: boolean;
  /** Rounding step of the published value. A hard limit is tested half a step in the value's favour, so a zone
   *  published as "10.0 degrees" (9.96 before rounding, which passes) is not called rejected. */
  step?: number;
  format: (v: number) => string;
  /** What the ranges are, in words. */
  good: string; ok: string; bad: string;
  /** Carries no weight in the balanced score. */
  optional?: boolean;
}

const OPTIONAL_NOTE = " It counts only when you tick it.";
const days = (h: number) => (h < 48 ? `${Math.round(h)} hours` : `${(h / 24).toFixed(1)} days`);
const one = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** The criteria, in the order they are explained. Bounds are those of docs/criteria.csv. */
export const RULES: Rule[] = [
  { key: "latDeg", label: "Distance from the pole", parameter: "Distance from the pole", ideal: 6, reject: 6, hard: true,
    format: (lat) => `${one(Math.round((90 - Math.abs(lat)) * 10) / 10)} degrees`,
    good: "Within 6 degrees of the pole (NASA Artemis III limit)", ok: "", bad: "More than 6 degrees from the pole (NASA Artemis III limit)" },
  { key: "landingSlopeDeg", label: "Landing slope", parameter: "Landing slope", ideal: 5, reject: 10, hard: true, step: 0.1,
    format: (v) => `${one(v)} degrees`,
    good: "5 degrees or less is ideal, and the NASA Artemis III limit is 10", ok: "Under the NASA Artemis III limit of 10 degrees, but over the ideal 5",
    bad: "10 degrees or more breaks the NASA Artemis III limit" },
  { key: "walkablePct", label: "Walkable ground within 2 km", parameter: "Walkable ground within 2 km", ideal: 95, reject: 50, hard: true, step: 1,
    format: (v) => `${Math.round(v)}%`,
    good: "95% or more is ideal", ok: "Over the 50% we require, under the ideal 95%",
    bad: "Under 50%: too little ground a suited astronaut can walk (slopes over NASA's 20 degree limit)" },
  { key: "sunPct", label: "Sunlight", parameter: "Sunlight, long-run", ideal: 70, reject: 25, hard: true, step: 0.1,
    format: (v) => `${Math.round(v)}% of the time`,
    good: "70% or more is ideal", ok: "Over the 25% needed for a fully lit stay, under the ideal 70%",
    bad: "Under 25%: too little for a stay that is lit from start to finish (NASA Artemis III requirement)" },
  { key: "earthPct", label: "Earth in view", parameter: "Earth in view, long-run", ideal: 70, reject: 25, hard: true, step: 0.1,
    format: (v) => `${Math.round(v)}% of the time`,
    good: "70% or more is ideal", ok: "Over NASA's 25% cut-off, under the ideal 70%",
    bad: "Under NASA's 25% cut-off for a direct radio link" },
  { key: "shadowKm", label: "Nearest permanent shadow", parameter: "Distance to permanent shadow", ideal: 2, reject: 20, hard: false,
    format: (v) => (v >= 20.4 ? "more than 20 km away" : `${one(Math.round(v * 10) / 10)} km away`),
    good: "Within the 2 km an astronaut can walk", ok: "Too far to walk (over 2 km), within a rover's 20 km",
    bad: "More than 20 km: out of reach even for a rover" },
  { key: "tempK", label: "Mean ground temperature", parameter: "Mean ground temperature", ideal: 150, reject: 110, hard: false,
    format: (v) => `${Math.round(v)} K (${Math.round(v - 273.15)} °C)`,
    good: "150 K or more is ideal", ok: "Between 110 K and the ideal 150 K",
    bad: "Under 110 K: cold enough to trap ice, so the spot is nearly always dark" },
  { key: "longestDarkH", label: "Longest darkness", parameter: "Longest darkness, 2026 to 2029", ideal: 85, reject: 354, hard: false,
    format: days,
    good: "85 hours or less: a night a lander can sit out on batteries", ok: "Longer than the ideal 85 hours, shorter than the 354-hour night away from the poles",
    bad: "354 hours or more: no better than the two-week night away from the poles" },
  { key: "longestNoEarthH", label: "Longest time without Earth", parameter: "Longest time without Earth, 2026 to 2029", ideal: 0, reject: 336, hard: false,
    format: (h) => (h <= 0 ? "0 hours" : days(h)),
    good: "Earth never drops below the skyline", ok: "Earth sets at times, for less than two weeks",
    bad: "Two weeks or more out of contact" },
  { key: "iceDepthM", label: "Depth of stable ice", parameter: "Depth of stable ice", ideal: 0, reject: 1, hard: false, optional: true,
    format: (v) => (Number.isFinite(v) ? `${v.toFixed(2)} m` : "none within 2.9 m"),
    good: "Ice can be stable right at the surface", ok: "Within the reach of a 1 m drill",
    bad: "Deeper than a 1 m drill reaches, or no stable ice at all" },
  { key: "hollowDepthM", label: "Depth of the hollow", parameter: "Depth of the hollow", ideal: 0, reject: 70, hard: false, optional: true,
    format: (v) => (v <= 0 ? `${Math.round(-v)} m above its surroundings` : `${Math.round(v)} m below its surroundings`),
    good: "Level with or above the ground within 2 km", ok: "In a dip of less than 70 m",
    bad: "In a hollow 70 m deep or more: a 2 degree wall all round" },
];

/** Verdict of one value against a rule. Works whether more is better or less is better. */
export function verdictOf(rule: Rule, value: number): Verdict {
  if (rule.key === "latDeg") return 90 - Math.abs(value) <= rule.reject ? "good" : "rejected";
  const moreIsBetter = rule.ideal > rule.reject;
  if (moreIsBetter ? value >= rule.ideal : value <= rule.ideal) return "good";
  const slack = (rule.step ?? 0) / 2;
  if (moreIsBetter ? value < rule.reject - slack : value >= rule.reject + slack) return "rejected";
  return "acceptable";
}

/**
 * One sentence per criterion for which `values` has a number, e.g.
 * "Landing slope 3.4 degrees: good. 5 degrees or less is ideal, and the NASA Artemis III limit is 10. Flatter ground
 * leaves a margin for boulders and small craters the map cannot see."
 * `criteria` are the rows of criteria.csv; the reason of the matching row ends the sentence.
 */
export function explain(values: PointValues, criteria: CriterionRow[] = []): Explanation[] {
  const out: Explanation[] = [];
  for (const rule of RULES) {
    const v = values[rule.key];
    if (v === undefined || v === null || Number.isNaN(v)) continue;
    const verdict = verdictOf(rule, v);
    const range = verdict === "good" ? rule.good : verdict === "acceptable" ? rule.ok : rule.bad;
    const rows = criteria.filter((c) => c.parameter === rule.parameter);
    const reason = (rows.find((c) => c.kind === "soft") ?? rows[0])?.reason ?? "";
    const value = rule.format(v);
    const softNote = (verdict === "rejected" && !rule.hard ? " This scores zero but does not rule the spot out." : "")
      + (rule.optional ? OPTIONAL_NOTE : "");
    const detail = `${range}.${softNote}${reason ? ` ${reason}` : ""}`;
    out.push({ key: rule.key, label: rule.label, value, verdict, hardLimit: rule.hard, optional: !!rule.optional, detail,
      sentence: `${rule.label} ${value}: ${verdict}. ${detail}` });
  }
  return out;
}

/** Which scoring parameter (suitability.ts) each explained value belongs to; latitude is a NASA limit only. */
export const TERM_OF: Record<keyof PointValues, TermKey | null> = {
  latDeg: null, landingSlopeDeg: "landing_slope", walkablePct: "walkable", sunPct: "sunlight", earthPct: "earth",
  shadowKm: "shadow", tempK: "temperature", longestDarkH: "darkness", longestNoEarthH: "no_earth", iceDepthM: "ice",
  hollowDepthM: "hollow",
};

/**
 * "Why here?" for a selection: the sentences for the ticked parameters, plus every NASA hard limit (they always
 * apply, ticked or not). Unticked soft criteria are left out.
 */
export function explainFor(values: PointValues, criteria: CriterionRow[], counted: readonly TermKey[]): Explanation[] {
  return explain(values, criteria)
    .filter((e) => e.hardLimit || (TERM_OF[e.key] !== null && counted.includes(TERM_OF[e.key]!)))
    .map((e) => (e.optional ? { ...e, optional: false, detail: e.detail.replace(OPTIONAL_NOTE, ""), sentence: e.sentence.replace(OPTIONAL_NOTE, "") } : e));
}

/** The values of a row of zones.csv or suitability/site_values.csv (same column names). */
export function valuesFromRow(row: Record<string, string>): PointValues {
  const n = (k: string) => (row[k] === undefined || row[k] === "" ? undefined : Number(row[k]));
  // An empty ice depth means "no stable ice", which is an answer; a missing column means we were not told.
  const ice = row.ice_depth_m === undefined ? undefined : row.ice_depth_m === "" ? Infinity : Number(row.ice_depth_m);
  return { latDeg: n("lat"), landingSlopeDeg: n("landing_slope_deg"), walkablePct: n("eva_walkable_pct"), sunPct: n("sun_pct"),
    earthPct: n("earth_pct"), shadowKm: n("psr_distance_km"), tempK: n("temp_avg_k"), longestDarkH: n("longest_dark_h"),
    longestNoEarthH: n("longest_no_earth_h"), iceDepthM: ice, hollowDepthM: n("hollow_depth_m") };
}

/** One line that sums the verdicts up: what rules the spot out, or how many criteria are good. */
export function summarise(list: Explanation[]): string {
  const blockers = list.filter((e) => e.verdict === "rejected" && e.hardLimit);
  if (blockers.length) return `Ruled out by ${blockers.map((e) => e.label.toLowerCase()).join(" and ")}.`;
  const scored = list.filter((e) => !e.optional);
  const good = scored.filter((e) => e.verdict === "good").length;
  const zero = scored.filter((e) => e.verdict === "rejected").length;
  return `Passes every hard limit: ${good} of ${scored.length} criteria are good${zero ? `, ${zero} ${zero === 1 ? "scores" : "score"} zero` : ""}.`;
}
