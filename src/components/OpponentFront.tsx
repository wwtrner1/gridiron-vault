import { useState } from "react";
import { COVERAGES, FLAG_LOOKS, FRONTS, type Coverage, type Front } from "../lib/defense";
import { FORMATION_NAMES, GAME_TYPES, type GameType } from "../lib/formations";
import { lookValue, parseLook } from "../lib/overlay";

export type OpponentChoices = {
  /** The overlay value now under the play: a saved play id, a stock look, or null. */
  value: string | null;
  /** Name of what's showing, for the read-out. */
  showing: string | null;
  defenses: { id: string; name: string }[];
  rest: { id: string; name: string }[];
  onPick: (value: string) => void;
};

type Props = OpponentChoices & {
  /** Flag rule sets get 5-on-5 looks; everything else gets 11-man fronts. */
  flag: boolean;
  /** The play is marked as a defense, so the first question starts on Defense. */
  defensePlay?: boolean;
};

/**
 * Opponent front: what defense this play is drawn against. A stock front and
 * coverage, or one of the coach's saved defenses, laid faded under the play
 * (the Vs defense overlay). It never prints or saves into the play, and the
 * Rules check reads its rushers too.
 */
export function OpponentFront({ value, showing, defenses, rest, onPick, flag, defensePlay }: Props) {
  const look = parseLook(value);
  // Asked first (Wes, 2026-11-21): whose play is this? An offense is shown a defense; a defense is shown an offense.
  const [side, setSide] = useState<"offense" | "defense">(look?.kind === "offense" || (!look && defensePlay) ? "defense" : "offense");
  const [game, setGame] = useState<GameType>(look?.kind === "offense" ? look.game : flag ? "5v5" : "11");
  const [formation, setFormation] = useState(look?.kind === "offense" ? look.formation : "Doubles");
  const pickOffense = (g: GameType, f: string) => (setGame(g), setFormation(f), onPick(lookValue({ kind: "offense", game: g, formation: f })));
  const [front, setFront] = useState<Front>(look?.kind === "front" ? look.front : "4-3");
  const [coverage, setCoverage] = useState<Coverage>(look?.kind === "front" ? look.coverage : "Cover 3");
  const saved = value && !look ? value : "";
  const pickFront = (f: Front, c: Coverage) => (setFront(f), setCoverage(c), onPick(lookValue({ kind: "front", front: f, coverage: c })));

  return (
    <div className="of">
      <div className="seg seg-sm of-side" role="group" aria-label="This play is">
        {(["offense", "defense"] as const).map((s) => (
          <button key={s} type="button" className={side === s ? "is-on" : ""} aria-pressed={side === s} onClick={() => setSide(s)}>
            {s === "offense" ? "My offense" : "My defense"}
          </button>
        ))}
      </div>
      {side === "defense" ? (
        <div style={{ display: "flex", gap: 8 }}>
          <label className="field" style={{ flex: 1, marginBottom: 0 }}>
            <span>Their game</span>
            <select className="select" value={game} onChange={(e) => pickOffense(e.target.value as GameType, formation)}>
              {GAME_TYPES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, marginBottom: 0 }}>
            <span>Their formation</span>
            <select className="select" value={formation} onChange={(e) => pickOffense(game, e.target.value)}>
              {FORMATION_NAMES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          {look?.kind !== "offense" && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-end" }} onClick={() => pickOffense(game, formation)}>
              Show it
            </button>
          )}
        </div>
      ) : flag ? (
        <div className="chip-row" role="group" aria-label="Flag defense looks">
          {FLAG_LOOKS.map((l) => {
            const on = look?.kind === "flag" && look.look === l;
            return (
              <button key={l} type="button" className={`chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => onPick(on ? "" : lookValue({ kind: "flag", look: l }))}>
                {l}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <label className="field" style={{ flex: 1, marginBottom: 0 }}>
            <span>Front</span>
            <select className="select" value={front} onChange={(e) => pickFront(e.target.value as Front, coverage)}>
              {FRONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, marginBottom: 0 }}>
            <span>Coverage</span>
            <select className="select" value={coverage} onChange={(e) => pickFront(front, e.target.value as Coverage)}>
              {COVERAGES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {look?.kind !== "front" && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-end" }} onClick={() => pickFront(front, coverage)}>
              Show it
            </button>
          )}
        </div>
      )}

      <label className="field" style={{ marginTop: 10 }}>
        <span>{side === "defense" ? "Or one of your saved plays" : "Or one of your defenses"}</span>
        <select className="select" value={saved} onChange={(e) => onPick(e.target.value)}>
          <option value="">{defenses.length || rest.length ? "Pick a saved play" : "No saved plays yet"}</option>
          {defenses.length > 0 && (
            <optgroup label="Defenses">
              {defenses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {rest.length > 0 && (
            <optgroup label="Other plays">
              {rest.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {showing ? (
        <p className="hint">
          Showing <b>{showing}</b> faded under the play. It's only a guide: it won't print or save into the play.{" "}
          <button type="button" className="rc-show" onClick={() => onPick("")}>
            Take it off
          </button>
        </p>
      ) : (
        <p className="hint">
          {side === "defense"
            ? "Pick the offense you're defending to see your play against it."
            : `${flag ? "Pick a look" : "Pick a front and coverage"} to see the play against it. The Rules check reads its rushers too.`}
        </p>
      )}
    </div>
  );
}
