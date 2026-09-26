import { useState } from "react";
import { ColorPicker } from "./ColorPicker";
import { TokenGlyph } from "./TokenGlyph";
import { positionKey, positionLegend, positionStore, usePositionTokens } from "../lib/positions";

/**
 * The "Player presets" panel from the Grid1ron Design canvas (Designer,
 * right panel). This part is the default position colors key and its
 * "Edit defaults" editor.
 */
export function PlayerPresets() {
  return (
    <div className="pp">
      <p className="pp-lede">Build a player once — letter, shape, colors, lines and assignment — then drop it on any play.</p>
      <PositionKey />
    </div>
  );
}

function PositionKey() {
  const tokens = usePositionTokens();
  const key = positionKey(tokens);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(key[0]?.label ?? "Q");
  const current = key.find((t) => t.label === active) ?? key[0];

  return (
    <div className="pp-key">
      <div className="pp-key-head">
        <span>Default position colors</span>
        <button type="button" className="pp-link" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          {editing ? "Done" : "Edit defaults"}
        </button>
      </div>

      <div className="pp-key-tokens" role={editing ? "radiogroup" : undefined} aria-label={editing ? "Position to edit" : undefined}>
        {key.map((t) =>
          editing ? (
            <button
              key={t.code}
              type="button"
              role="radio"
              aria-checked={t.label === current.label}
              aria-label={`${t.title} (${t.label})`}
              className={`pp-key-token${t.label === current.label ? " is-on" : ""}`}
              onClick={() => setActive(t.label)}
            >
              <TokenGlyph preset={t} size={24} />
            </button>
          ) : (
            <span key={t.code} className="pp-key-token" title={t.title}>
              <TokenGlyph preset={t} size={24} />
            </span>
          ),
        )}
      </div>
      <p className="pp-legend">{positionLegend(tokens)}</p>

      {editing && current && (
        <div className="pp-edit">
          <p className="pp-edit-title">
            {current.title} · {current.label}
          </p>
          <span className="pp-sub">Shape</span>
          <div className="seg">
            {(["circle", "square"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={current.shape === s ? "is-on" : ""}
                aria-pressed={current.shape === s}
                onClick={() => positionStore.set(current.label, { shape: s })}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="pp-sub">Color</span>
          <ColorPicker
            label={`${current.label} color`}
            value={current.fill}
            onChange={(c) => positionStore.set(current.label, { fill: c })}
          />
          <p className="pp-note">New players you drop in the Designer use these colors. Plays you already drew keep theirs.</p>
          <button type="button" className="pp-reset" onClick={() => positionStore.reset()}>
            Reset to the Grid1ronVault defaults
          </button>
        </div>
      )}
    </div>
  );
}
