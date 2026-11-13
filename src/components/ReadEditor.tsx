import { useState } from "react";
import { Icon } from "./Icon";
import { BLOCK_IDS, ROUTE_IDS } from "../lib/assistant";
import { COVERAGES } from "../lib/defense";
import { addPlayer, removePlayer, setAssignment, setLetter, setPlayer } from "../lib/photo";
import type { PhotoRead } from "../lib/photo";

/** The offense letters GridIronVault draws, in the order a coach reads a formation. */
const LETTERS = ["Q", "C", "X", "Y", "Z", "H", "S"] as const;
const LETTER_NAME: Record<string, string> = { Q: "Quarterback", C: "Center", X: "Split end", Y: "Tight end / slot", Z: "Flanker", H: "Running back", S: "Slot / 2nd back" };
/** Defender jobs offered as suggestions; the coach can type their own. */
export const DEFENSE_JOBS = ["Deep 1/3", "Deep 1/2", "Deep 1/4", "Flat", "Hook", "Curl", "Curl/Flat", "Robber", "Man", "Rush", "Blitz", "Spy", "Contain"];
const words = (id: string) => id.replace(/_/g, " ");

/** "route:post", "block:drive", "motion" or "" for the select. */
const jobValue = (a?: { kind: string; action: string }) => (!a ? "" : a.kind === "motion" ? "motion" : `${a.kind}:${a.action}`);

/**
 * Every part of a read the coach can correct after a scan or photo (Wes,
 * 2026-11-13): who each player is, his route, block or motion and which way
 * it breaks, players the reader missed or made up, and for a defense, each
 * defender's job and the coverage. Changes go straight back through
 * `onChange`, so the rebuilt field above follows every pick.
 */
export function ReadEditor({ read, onChange }: { read: PhotoRead; onChange: (read: PhotoRead) => void }) {
  const [adding, setAdding] = useState("");
  const offense = read.players.map((p, i) => ({ p, i })).filter(({ p }) => p.side === "offense");
  const defense = read.players.map((p, i) => ({ p, i })).filter(({ p }) => p.side === "defense");
  const isDefense = read.playType === "defense";

  const changeJob = (letter: string, value: string) => {
    const old = read.assignments.find((a) => a.player.toUpperCase() === letter.toUpperCase());
    if (!value) return onChange(setAssignment(read, letter, null));
    if (value === "motion") return onChange(setAssignment(read, letter, { kind: "motion", action: "motion", breaks: old?.breaks }));
    const [kind, action] = value.split(":") as ["route" | "block", string];
    onChange(setAssignment(read, letter, { kind, action, breaks: kind === "route" ? old?.breaks : undefined }));
  };
  const changeBreak = (letter: string, breaks: string) => {
    const old = read.assignments.find((a) => a.player.toUpperCase() === letter.toUpperCase());
    if (!old) return;
    onChange(setAssignment(read, letter, { kind: old.kind, action: old.action, breaks: breaks === "left" || breaks === "right" ? breaks : undefined }));
  };

  return (
    <section className="card re" aria-labelledby="re-title">
      <div className="re-head">
        <h3 id="re-title">Fix the read</h3>
        <div className="re-type" role="radiogroup" aria-label="What the diagram is">
          {(["offense", "defense"] as const).map((t) => (
            <label key={t} className={`chip${(read.playType ?? "offense") === t ? " is-on" : ""}`}>
              <input type="radio" name="re-type" checked={(read.playType ?? "offense") === t} onChange={() => onChange({ ...read, playType: t })} />
              {t === "offense" ? "Offense" : "Defense"}
            </label>
          ))}
        </div>
      </div>
      <p className="pr-note">
        Change who a player is, his route, block or motion, or drop a player the read made up. The field above follows each change.
        To redraw a line by hand, save the play and open it in the Designer.
      </p>

      {offense.length > 0 && (
        <div className="re-table" role="table" aria-label="Offense">
          <div className="re-row re-th" role="row">
            <span role="columnheader">Board</span>
            <span role="columnheader">Player</span>
            <span role="columnheader">Job</span>
            <span role="columnheader">Breaks</span>
            <span role="columnheader">
              <span className="sr-only">Remove</span>
            </span>
          </div>
          {offense.map(({ p, i }) => {
            const L = p.vault.toUpperCase();
            const a = read.assignments.find((x) => x.player.toUpperCase() === L);
            const known = (LETTERS as readonly string[]).includes(L);
            return (
              <div key={i} className="re-row" role="row">
                <span role="cell" className="mono re-board">
                  {p.board}
                </span>
                <span role="cell">
                  <select className="select" aria-label={`Who the board's ${p.board} is`} value={L} onChange={(e) => onChange(setLetter(read, i, e.target.value))}>
                    {!known && <option value={L}>{L}</option>}
                    {LETTERS.map((l) => (
                      <option key={l} value={l}>
                        {l} · {LETTER_NAME[l]}
                      </option>
                    ))}
                  </select>
                </span>
                <span role="cell">
                  <select className="select" aria-label={`${L}'s job`} value={jobValue(a)} onChange={(e) => changeJob(L, e.target.value)}>
                    <option value="">{L === "Q" ? "Takes the snap and throws" : "No line"}</option>
                    <optgroup label="Routes">
                      {ROUTE_IDS.map((r) => (
                        <option key={r} value={`route:${r}`}>
                          {words(r)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Blocks">
                      {BLOCK_IDS.map((b) => (
                        <option key={b} value={`block:${b}`}>
                          {words(b)}
                        </option>
                      ))}
                    </optgroup>
                    <option value="motion">Motion</option>
                  </select>
                </span>
                <span role="cell">
                  <select
                    className="select"
                    aria-label={`Which way ${L}'s route breaks`}
                    value={a?.breaks ?? ""}
                    disabled={!a || a.kind === "block"}
                    onChange={(e) => changeBreak(L, e.target.value)}
                  >
                    <option value="">As the route goes</option>
                    <option value="left">To the left</option>
                    <option value="right">To the right</option>
                  </select>
                </span>
                <span role="cell">
                  <button type="button" className="btn btn-quiet btn-sm re-x" aria-label={`Remove ${L} (board ${p.board})`} onClick={() => onChange(removePlayer(read, i))}>
                    <Icon name="close" size={14} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {(defense.length > 0 || isDefense) && (
        <div className="re-table re-def" role="table" aria-label="Defense">
          <div className="re-row re-th" role="row">
            <span role="columnheader">Board</span>
            <span role="columnheader">Defender</span>
            <span role="columnheader">Responsibility</span>
            <span role="columnheader">
              <span className="sr-only">Remove</span>
            </span>
          </div>
          {defense.map(({ p, i }) => (
            <div key={i} className="re-row" role="row">
              <span role="cell" className="mono re-board">
                {p.board}
              </span>
              <span role="cell">
                <input
                  className="input"
                  aria-label={`Letters for the board's ${p.board}`}
                  value={p.vault}
                  maxLength={3}
                  onChange={(e) => onChange(setPlayer(read, i, { vault: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) }))}
                />
              </span>
              <span role="cell">
                <input
                  className="input"
                  list="re-jobs"
                  aria-label={`${p.vault || p.board}'s responsibility`}
                  placeholder="Deep 1/3, Flat, Man…"
                  value={p.job ?? ""}
                  maxLength={24}
                  onChange={(e) => onChange(setPlayer(read, i, { job: e.target.value || undefined }))}
                />
              </span>
              <span role="cell">
                <button type="button" className="btn btn-quiet btn-sm re-x" aria-label={`Remove defender ${p.vault || p.board}`} onClick={() => onChange(removePlayer(read, i))}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            </div>
          ))}
          <datalist id="re-jobs">
            {DEFENSE_JOBS.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
        </div>
      )}

      {isDefense && (
        <label className="up-field re-cov">
          <span>Coverage</span>
          <input
            className="input"
            list="re-covs"
            value={read.coverage ?? ""}
            maxLength={40}
            placeholder="Cover 2, Cover 3, Man…"
            onChange={(e) => onChange({ ...read, coverage: e.target.value || undefined })}
          />
          <datalist id="re-covs">
            {[...COVERAGES, "Cover 0", "Cover 6", "Quarters"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      )}

      <div className="re-add">
        <select className="select" aria-label="Add a player the read missed" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Add a player the read missed…</option>
          {LETTERS.filter((l) => !offense.some(({ p }) => p.vault.toUpperCase() === l)).map((l) => (
            <option key={l} value={`o:${l}`}>
              Offense · {l} ({LETTER_NAME[l]})
            </option>
          ))}
          <option value="d:D">Defense · a defender</option>
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!adding}
          onClick={() => {
            const [side, letter] = adding.split(":");
            onChange(addPlayer(read, side === "d" ? "defense" : "offense", letter));
            setAdding("");
          }}
        >
          <Icon name="plus" size={14} /> Add
        </button>
      </div>
    </section>
  );
}
