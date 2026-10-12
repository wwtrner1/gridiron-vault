import { useEffect, useState } from "react";
import { BRAND_COLORS, TEAM_COLORS, colorName, colorStore, normalizeHex, useColors } from "../lib/colors";

type Props = {
  /** What the color is for, e.g. "Fill" — used in every button label. */
  label: string;
  value: string;
  onChange: (hex: string) => void;
};

/**
 * The Designer color picker from the Grid1ron Design canvas: GridIronVault
 * colors, team colors (the canvas's twelve plus any the coach saved), recent
 * colors, any color by picker or hex, and "Save as team color".
 */
export function ColorPicker({ label, value, onChange }: Props) {
  const { saved, recent } = useColors();
  const current = normalizeHex(value) ?? "";
  const [hex, setHex] = useState(current.toUpperCase());

  // Keep the hex field in step when the selection changes elsewhere.
  useEffect(() => setHex(current.toUpperCase()), [current]);

  const pick = (h: string) => {
    const n = normalizeHex(h);
    if (!n) return;
    colorStore.use(n);
    onChange(n);
  };

  const swatch = (h: string, name: string, key: string) => (
    <button
      key={key}
      type="button"
      className={`cp-swatch${current === h ? " is-on" : ""}`}
      style={{ background: h }}
      title={name}
      aria-label={`${label} ${name}`}
      aria-pressed={current === h}
      onClick={() => pick(h)}
    />
  );

  const hexValid = normalizeHex(hex) !== null;

  return (
    <div className="cp">
      <span className="cp-group">GridIronVault</span>
      <div className="cp-row">{BRAND_COLORS.map((c) => swatch(c.hex, c.name, `b-${c.hex}`))}</div>

      <span className="cp-group">Team colors</span>
      <div className="cp-grid">{[...TEAM_COLORS, ...saved].map((c) => swatch(c.hex, c.name, `t-${c.hex}`))}</div>

      {recent.length > 0 && (
        <>
          <span className="cp-group">Recent</span>
          <div className="cp-row">{recent.map((h) => swatch(h, colorName(h), `r-${h}`))}</div>
        </>
      )}

      <div className="cp-custom">
        <input
          type="color"
          aria-label={`${label}: pick any color`}
          value={current || "#000000"}
          onChange={(e) => {
            // Live while dragging; remembered in Recent once the picker closes.
            const n = normalizeHex(e.target.value);
            if (n) onChange(n);
          }}
          onBlur={() => current && colorStore.use(current)}
        />
        <input
          type="text"
          className="cp-hex"
          aria-label={`${label}: hex color`}
          aria-invalid={!hexValid}
          value={hex}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => setHex(e.target.value.toUpperCase())}
          onBlur={() => (hexValid ? pick(hex) : setHex(current.toUpperCase()))}
          onKeyDown={(e) => e.key === "Enter" && hexValid && pick(hex)}
        />
        <button
          type="button"
          className="cp-save"
          disabled={!current}
          onClick={() => colorStore.saveTeamColor(current)}
        >
          + Save as team color
        </button>
      </div>
    </div>
  );
}
