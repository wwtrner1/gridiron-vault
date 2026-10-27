import { useState } from "react";
import { COVERAGES, FLAG_LOOKS, FRONTS, type Coverage, type Front } from "../lib/defense";
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
};

/**
 * Opponent front: what defense this play is drawn against. A stock front and
 * coverage, or one of the coach's saved defenses, laid faded under the play
 * (the Vs defense overlay). It never prints or saves into the play, and the
 * Rules check reads its rushers too.
 */
export function OpponentFront({ value, showing, defenses, rest, onPick, flag }: Props) {
  const look = parseLook(value);
  const [front, setFront] = useState<Front>(look?.kind === "front" ? look.front : "4-3");
  const [coverage, setCoverage] = useState<Coverage>(look?.kind === "front" ? look.coverage : "Cover 3");
  const saved = value && !look ? value : "";
  const pickFront = (f: Front, c: Coverage) => (setFront(f), setCoverage(c), onPick(lookValue({ kind: "front", front: f, coverage: c })));

  return (
    <div className="of">
      {flag ? (
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
        <span>Or one of your defenses</span>
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
        <p className="hint">{flag ? "Pick a look" : "Pick a front and coverage"} to see the play against it. The Rules check reads its rushers too.</p>
      )}
    </div>
  );
}
