// Power API. Contract: docs/INTERFACES.md section 6. Model: docs/SCIENCE.md section 5.
import type { Series } from "../analysis";

export type PanelMode = "vertical_tracking" | "vertical_fixed" | "horizontal";

export interface PowerConfig {
  mode: PanelMode; panelAzDeg: number; areaM2: number;
  efficiency: number; batteryWh: number; loadW: number; initialSocPct: number;
}

export interface PowerResult {
  genW: Float64Array; socWh: Float64Array; minSocPct: number;
  survived: boolean; hoursBelowZero: number; batteryNeededWh: number; energyGenWh: number;
}

export const SOLAR_CONSTANT = 1361; // W/m^2
const D2R = Math.PI / 180;

export function incidence(mode: PanelMode, sunElDeg: number, sunAzDeg: number, panelAzDeg: number): number {
  const el = sunElDeg * D2R;
  switch (mode) {
    case "vertical_tracking": return Math.max(0, Math.cos(el));
    case "vertical_fixed": return Math.max(0, Math.cos(el) * Math.cos((sunAzDeg - panelAzDeg) * D2R));
    case "horizontal": return Math.max(0, Math.sin(el));
  }
}

export function simulatePower(s: Series, cfg: PowerConfig, stepS: number): PowerResult {
  const n = s.sunEl.length;
  const dtH = stepS / 3600;
  const genW = new Float64Array(n), socWh = new Float64Array(n);
  let soc = (cfg.batteryWh * cfg.initialSocPct) / 100;
  let minSoc = soc, emptyH = 0, energy = 0;
  // Largest cumulative deficit = biggest drop of the unbounded energy balance below its running peak.
  let balance = 0, peak = 0, worstDeficit = 0;
  for (let i = 0; i < n; i++) {
    const g = SOLAR_CONSTANT * cfg.areaM2 * cfg.efficiency * s.sunFrac[i] *
      incidence(cfg.mode, s.sunEl[i], s.sunAz[i], cfg.panelAzDeg);
    genW[i] = g;
    energy += g * dtH;
    const net = (g - cfg.loadW) * dtH;
    balance += net;
    if (balance > peak) peak = balance;
    if (peak - balance > worstDeficit) worstDeficit = peak - balance;
    // An hour counts as "below zero" only if the battery could not cover the load during it.
    if (soc + net < -1e-9) emptyH += dtH;
    soc = Math.min(cfg.batteryWh, Math.max(0, soc + net));
    if (soc < minSoc) minSoc = soc;
    socWh[i] = soc;
  }
  return {
    genW, socWh,
    minSocPct: cfg.batteryWh > 0 ? (100 * minSoc) / cfg.batteryWh : 0,
    survived: emptyH === 0,
    hoursBelowZero: emptyH,
    batteryNeededWh: worstDeficit,
    energyGenWh: energy,
  };
}
