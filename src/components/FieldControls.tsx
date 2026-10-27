import { useEffect, useRef } from "react";
import { CONTRASTS, GRID_SIZES, HASHES, SNAP_RADII, fieldPrefsStore, useFieldPrefs } from "../lib/fieldPrefs";
import { clampRule, RULE_LIMITS, RULE_PRESETS, type RuleLines } from "../lib/rules";
import { Icon } from "./Icon";

type Props = {
  rules: RuleLines;
  onRules: (next: RuleLines) => void;
  /** Snap lines to players (the drawing bar's Snap, S). */
  snapPlayers: boolean;
  onSnapPlayers: () => void;
  onClose: () => void;
};

/** One row of choices: a label and chips, one of them on. */
function Choice<T extends string | number>({ label, value, options, onPick }: { label: string; value: T; options: { value: T; label: string; hint?: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="fc-row" role="radiogroup" aria-label={label}>
      <span className="fc-label">{label}</span>
      <div className="chip-row">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={`chip${o.value === value ? " is-on" : ""}`}
            title={o.hint}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Field Controls: every setting for how the field looks and how drawing snaps,
 * in one panel above the field. Remembered in this browser; the field markings
 * and rule lines print the same way they show here.
 */
export function FieldControls({ rules, onRules, snapPlayers, onSnapPlayers, onClose }: Props) {
  const prefs = useFieldPrefs();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      back?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div className="stage-menu-scrim" onPointerDown={onClose} aria-hidden="true" />
      <div className="fc-panel" id="field-controls" role="dialog" aria-labelledby="fc-title" ref={panel}>
        <div className="fc-head">
          <h2 id="fc-title">Field controls</h2>
          <button type="button" className="fc-close" onClick={onClose} aria-label="Close field controls">
            <Icon name="close" size={14} />
          </button>
        </div>

        <p className="fc-section">Drawing</p>
        <Choice label="Snap to grid" value={prefs.grid} options={GRID_SIZES} onPick={(grid) => fieldPrefsStore.set({ grid })} />
        <label className="switch fc-switch">
          <input type="checkbox" checked={snapPlayers} onChange={onSnapPlayers} />
          Snap lines to players
        </label>
        {snapPlayers && (
          <Choice label="Snap radius" value={prefs.snapRadius} options={SNAP_RADII} onPick={(snapRadius) => fieldPrefsStore.set({ snapRadius })} />
        )}

        <p className="fc-section">Field markings</p>
        <Choice
          label="Hash marks"
          value={prefs.hashes}
          options={HASHES.map((h) => ({ value: h.id, label: h.label, hint: h.hint }))}
          onPick={(hashes) => fieldPrefsStore.set({ hashes })}
        />
        <Choice
          label="Yard lines"
          value={prefs.contrast}
          options={CONTRASTS.map((c) => ({ value: c.id, label: c.label, hint: c.hint }))}
          onPick={(contrast) => fieldPrefsStore.set({ contrast })}
        />

        <p className="fc-section">Flag overlays</p>
        <label className="switch fc-switch">
          <input type="checkbox" checked={rules.on} onChange={(e) => onRules({ ...rules, on: e.target.checked })} />
          Show the rush line and no-run zone
        </label>
        <div className="chip-row fc-presets">
          {RULE_PRESETS.map((r) => (
            <button
              key={r.id}
              type="button"
              title={r.note}
              className={`chip${rules.set === r.id ? " is-on" : ""}`}
              onClick={() => onRules({ on: true, rush: r.rush, noRun: r.noRun, set: r.id })}
            >
              {r.name}
            </button>
          ))}
        </div>
        <div className="fc-nums">
          <label>
            <span>Rush line (yds)</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={RULE_LIMITS.rush.min}
              max={RULE_LIMITS.rush.max}
              value={rules.rush}
              onChange={(e) => onRules({ ...rules, rush: clampRule(Number(e.target.value), "rush") })}
            />
          </label>
          <label>
            <span>No-run zone (yds)</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={RULE_LIMITS.noRun.min}
              max={RULE_LIMITS.noRun.max}
              value={rules.noRun}
              onChange={(e) => onRules({ ...rules, noRun: clampRule(Number(e.target.value), "noRun") })}
            />
          </label>
        </div>
        <p className="hint">
          Leagues differ, so set your own distances. The no-run zone shows on the Red zone and Flag 30×70 views, counted back from the goal line.
        </p>
        <p className="fc-foot">
          Saved in this browser. Hash marks and yard lines print the way you see them, and Export starts with the rule lines on while they show here. The grid
          never prints.
        </p>
      </div>
    </>
  );
}
