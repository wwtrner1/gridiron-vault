import { useMemo, useState } from "react";
import {
  describeFormation,
  FORMATION_NAMES,
  GAME_TYPES,
  layoutFormation,
  LIBRARY,
  PERSONNEL,
  personnelLabel,
  tokenFor,
} from "../lib/formations";
import type { GameType, Placed } from "../lib/formations";
import type { TokenPreset } from "../lib/presets";

const KEY = "grid1ronvault.formationLib.v1";
type Choice = { game: GameType; personnel: string; formation: string };
const DEFAULT: Choice = { game: "5v5", personnel: "11", formation: "Trips Right" };

function readChoice(): Choice {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Choice>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Preview at the canvas's scale: a 240×150 card drawn 4⅓× larger, line of scrimmage at 80. */
const LOS = 347;
const R = 24;

export function FormationPreview({ placed, tokens, label }: { placed: Placed[]; tokens: TokenPreset[]; label: string }) {
  return (
    <svg viewBox="0 0 1040 650" className="fl-preview" role="img" aria-label={label}>
      {[0, 260, 520].map((y) => (
        <rect key={y} x="0" y={y} width="1040" height="130" fill="#f5f8fa" />
      ))}
      <line x1="0" y1={LOS} x2="1040" y2={LOS} stroke="#0b1524" strokeWidth="4" strokeDasharray="17 13" />
      {placed.map((p, i) => {
        const t = tokenFor(p, tokens);
        const x = 520 + p.dx;
        const y = LOS + p.dy + R;
        const square = t.shape === "square";
        const outlined = t.fill.toUpperCase() === "#FFFFFF";
        return (
          <g key={i}>
            {square ? (
              <rect x={x - 22} y={y - 22} width="44" height="44" rx="6" fill={t.fill} stroke={outlined ? t.stroke : "none"} strokeWidth="5" />
            ) : (
              <circle cx={x} cy={y} r={R} fill={t.fill} stroke={outlined ? t.stroke : t.fill} strokeWidth="5" />
            )}
            {t.label && (
              <text x={x} y={y + 11} textAnchor="middle" fontFamily="Saira Condensed, sans-serif" fontWeight="700" fontSize="30" fill={t.textColor}>
                {t.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Formation library panel, from the Grid1ron Design canvas. The coach picks
 * a game type, personnel and formation, sees it, and drops it on the field.
 */
export function FormationLibrary({
  tokens,
  onDrop,
}: {
  tokens: TokenPreset[];
  onDrop: (set: { name: string; note: string; placed: Placed[] }) => void;
}) {
  const [choice, setChoice] = useState<Choice>(readChoice);
  const update = (patch: Partial<Choice>) =>
    setChoice((c) => {
      const next = { ...c, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage blocked — the choice still holds this session */
      }
      return next;
    });

  const placed = useMemo(() => layoutFormation(choice.game, choice.personnel, choice.formation), [choice]);
  const note = LIBRARY.find((f) => f.name === choice.formation)?.note ?? "";
  const label = describeFormation(choice.game, choice.personnel, choice.formation);

  return (
    <div className="fl" id="dz-list-tray">
      <span className="fl-label" id="fl-game">
        Game type
      </span>
      <div className="seg" role="group" aria-labelledby="fl-game">
        {GAME_TYPES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={choice.game === g.id ? "is-on" : ""}
            aria-pressed={choice.game === g.id}
            onClick={() => update({ game: g.id })}
          >
            {g.label}
          </button>
        ))}
      </div>
      <label className="fl-field">
        <span className="fl-label">Personnel</span>
        <select
          className="select"
          value={choice.personnel}
          disabled={choice.game !== "11"}
          onChange={(e) => update({ personnel: e.target.value })}
        >
          {PERSONNEL.map((p) => (
            <option key={p.code} value={p.code}>
              {personnelLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="fl-field">
        <span className="fl-label">Formation</span>
        <select className="select" value={choice.formation} onChange={(e) => update({ formation: e.target.value })}>
          {FORMATION_NAMES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <FormationPreview placed={placed} tokens={tokens} label={label} />
      <p className="dz-note">
        {choice.game === "11"
          ? "11-man adds the offensive line. Personnel sets the RB and TE count."
          : choice.game === "7v7"
            ? "7v7 drops the line and the back: Q, C and five receivers."
            : "5v5 flag: Q, C and three. Personnel applies to 11-man."}
      </p>
      <button type="button" className="dz-btn is-on" onClick={() => onDrop({ name: choice.formation, note, placed })}>
        Drop {choice.formation}
      </button>
    </div>
  );
}
