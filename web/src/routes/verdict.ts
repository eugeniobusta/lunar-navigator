// One plain sentence that says what a window's numbers mean for a lander.
import type { Metrics } from "../lib/analysis";
import { fmtHours } from "../state/derived";

export function verdict(m: Metrics): string {
  const sun = Math.round(m.sunPct), earth = Math.round(m.earthPct);
  const sunPart = sun >= 100 ? "Sunlight the whole time" : sun <= 0 ? "No sunlight at all" : `Sunlight ${sun}% of the time`;
  const earthPart = earth >= 100 ? "Earth always in view" : earth <= 0 ? "Earth never in view" : `Earth in view ${earth}% of the time`;
  let meaning: string;
  if (earth <= 0) meaning = "there is no direct radio link from here, so a lander needs a relay satellite";
  else if (sun <= 0) meaning = "a lander here gets no solar power in this window";
  else if (sun >= 95 && earth >= 95) meaning = "power and the radio link both hold for this mission";
  else if (sun <= earth - 15) meaning = "power is the problem here, not the radio link";
  else if (earth <= sun - 15) meaning = "the radio link is the problem here, not power";
  else meaning = "power and the radio link are both part-time here";
  const night = m.longestDarkH >= 48 && sun > 0 ? ` The longest night lasts ${fmtHours(m.longestDarkH)}.` : "";
  return `${sunPart}, ${earthPart.charAt(0).toLowerCase()}${earthPart.slice(1)}: ${meaning}.${night}`
    .replace(", earth", ", Earth");
}
