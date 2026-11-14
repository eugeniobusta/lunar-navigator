// Power API (owner: Ahmed). Contract: docs/INTERFACES.md section 6.
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

export function simulatePower(_s: Series, _cfg: PowerConfig, _stepS: number): PowerResult {
  throw new Error("not implemented");
}
