// The layer panel of the landing map: presets, the four groups (each opens to its parameters), and for every
// parameter a tick box, one plain line, the direction where it can be turned round, its importance, and how it is
// drawn (alone on the map, opacity). Ticks, directions and importance change the score; opacity never does.
import { useState } from "react";
import { DIRECTION_WORDS, GROUPS, groupState, prefers, toggleGroup } from "../../lib/analysis/rag";
import {
  FLIPPABLE, LAYER_KEYS, countedTerms, flippedTerms, parameter, presetSelection, sameSelection, setImportance, toggleFlip,
  toggleTerm, type Importance, type LayerKey, type Preset, type Selection, type TermKey,
} from "../../lib/analysis/suitability";
import { Chevron } from "./icons";

const LEVELS: [Importance, string][] = [["low", "Low"], ["normal", "Normal"], ["high", "High"]];
const isLayer = (k: TermKey): k is LayerKey => (LAYER_KEYS as readonly string[]).includes(k);

interface Props {
  presets: Preset[];
  selection: Selection;
  /** Set a hand-made selection (it becomes a preset again if it equals one). */
  choose: (next: Selection) => void;
  choosePreset: (key: string) => void;
  labelOf: (k: TermKey) => string;
  /** The parameter shown alone on the map, or null for what the ticks give. */
  solo: LayerKey | null;
  setSolo: (k: LayerKey | null) => void;
  /** Opacity 0..1 by layer key, plus "combined" and "limits". */
  opacity: Record<string, number>;
  setOpacity: (key: string, value: number) => void;
  /** What the map shows now: a parameter by itself, or "combined", or "limits". */
  showing: string;
}

function Opacity({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="opacity">
      <span>{label}</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} aria-label={`${id} opacity`}
        onChange={(e) => onChange(+e.target.value / 100)} />
      <output>{Math.round(value * 100)}%</output>
    </label>
  );
}

export function LayerPanel(p: Props) {
  const counted = countedTerms(p.selection), flips = flippedTerms(p.selection);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.key, groupState(p.selection, g) === "some"])));
  const exact = !!p.selection.weights;

  return (
    <div className="layers">
      <div className="preset-row" role="group" aria-label="Presets">
        <span className="row-label">Presets</span>
        {p.presets.map((ps) => {
          const on = sameSelection(presetSelection(ps), p.selection);
          return <button key={ps.key} className={on ? "preset on" : "preset"} aria-pressed={on} onClick={() => p.choosePreset(ps.key)}>{ps.label}</button>;
        })}
      </div>

      <div className="limits-row">
        <label className="tick locked">
          <input type="checkbox" checked disabled />
          <span><b>NASA safety limits</b> <span className="meaning">Slope under 10°, within 6° of the pole, and the rest of NASA's Artemis III limits. Always on: ground that fails one is hatched red.</span></span>
        </label>
        <Opacity id="NASA safety limits" label="Opacity" value={p.opacity.limits ?? 1} onChange={(v) => p.setOpacity("limits", v)} />
      </div>

      <ul className="groups">
        {GROUPS.map((g) => {
          const state = groupState(p.selection, g), isOpen = !!open[g.key];
          const n = g.terms.filter((k) => counted.includes(k)).length;
          return (
            <li key={g.key} className="group">
              <div className="group-head">
                <label className="tick">
                  <input type="checkbox" checked={state === "all"} aria-label={g.label}
                    ref={(el) => { if (el) el.indeterminate = state === "some"; }} onChange={() => p.choose(toggleGroup(p.selection, g))} />
                  <b>{g.label}</b>
                </label>
                <span className="count">{n} of {g.terms.length}</span>
                <button className="chevron" aria-expanded={isOpen} aria-controls={`group-${g.key}`} aria-label={`${isOpen ? "Hide" : "Show"} the parameters of ${g.label}`}
                  onClick={() => setOpen({ ...open, [g.key]: !isOpen })}><Chevron open={isOpen} /></button>
              </div>
              {isOpen && (
                <ul className="params" id={`group-${g.key}`}>
                  {g.terms.map((k) => {
                    const on = counted.includes(k), info = parameter(k), flipped = flips.includes(k), words = DIRECTION_WORDS[k];
                    const layer = isLayer(k), alone = p.showing === k;
                    return (
                      <li key={k} className={on ? "param on" : "param"}>
                        <label className="tick">
                          <input type="checkbox" checked={on} onChange={() => p.choose(toggleTerm(p.selection, k))} />
                          <span><b>{p.labelOf(k)}</b> <span className="meaning">{info.explain}</span></span>
                        </label>
                        {on && (
                          <div className="param-controls">
                            {FLIPPABLE.includes(k) && words && (
                              <fieldset className="seg">
                                <legend>Prefer</legend>
                                {(["less", "more"] as const).map((dir, i) => (
                                  <label key={dir}>
                                    <input type="radio" name={`prefer-${k}`} checked={prefers(k, flipped) === dir} aria-label={`${p.labelOf(k)}: prefer ${dir} (${words[i]})`}
                                      onChange={() => { if (prefers(k, flipped) !== dir) p.choose(toggleFlip(p.selection, k)); }} />
                                    <span>{words[i]}</span>
                                  </label>
                                ))}
                              </fieldset>
                            )}
                            {!exact && (
                              <fieldset className="seg">
                                <legend>Importance</legend>
                                {LEVELS.map(([level, name]) => (
                                  <label key={level}>
                                    <input type="radio" name={`importance-${k}`} checked={(p.selection.importance?.[k] ?? "normal") === level}
                                      aria-label={`${p.labelOf(k)}: ${name.toLowerCase()} importance`} onChange={() => p.choose(setImportance(p.selection, k, level))} />
                                    <span>{name}</span>
                                  </label>
                                ))}
                              </fieldset>
                            )}
                            {layer ? (
                              <div className="draw">
                                <button className="plain" aria-pressed={p.solo === k} onClick={() => p.setSolo(p.solo === k ? null : (k as LayerKey))}>
                                  {p.solo === k ? "Back to the combined map" : "Show alone on the map"}
                                </button>
                                {alone && <Opacity id={p.labelOf(k)} label="Opacity" value={p.opacity[k] ?? 1} onChange={(v) => p.setOpacity(k, v)} />}
                              </div>
                            ) : (
                              <p className="meaning">From our hour-by-hour model, so it is known at the zones, not at every point: it re-ranks the zones.</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {p.showing === "combined" && <Opacity id="Combined score" label="Combined score opacity" value={p.opacity.combined ?? 1} onChange={(v) => p.setOpacity("combined", v)} />}
      {exact && (
        <p className="meaning">
          {sameSelection(p.selection, presetSelection(p.presets.find((x) => x.key === "balanced") ?? p.presets[0]))
            ? "NASA-style balance uses its own fixed weights (docs/criteria.md): it is the ranking of the published files."
            : "This link carries its own exact weights."}{" "}
          Tick or untick anything to set importance yourself.
        </p>
      )}
      <p className="meaning">Opacity only changes how the map looks. It never changes a score.</p>
    </div>
  );
}
