import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { FormationPreview } from "./FormationLibrary";
import { personnelGroups } from "../lib/personnel";
import { FORMATION_NAMES } from "../lib/formations";
import { FIELD_VIEWS } from "../lib/field";
import { defaultFormation, defaultView, NEW_BOOK, planFor, setSetupWanted, setupPlayers, setupWanted, type SetupChoice } from "../lib/playSetup";
import type { TokenPreset } from "../lib/presets";
import type { FieldView } from "../lib/types";

type Props = {
  initial: SetupChoice;
  books: { id: string; name: string }[];
  tokens: TokenPreset[];
  onStart: (choice: SetupChoice) => void;
  /** Close without setting anything up: a blank field. */
  onSkip: () => void;
};

/**
 * New Play setup: name, personnel, formation, field and playbook, then the
 * field opens with that personnel already lined up. Everything starts on the
 * coach's last picks, so a repeat play is a name and Enter.
 */
export function PlaySetup({ initial, books, tokens, onStart, onSkip }: Props) {
  const [c, setC] = useState(initial);
  const [skipNext, setSkipNext] = useState(() => !setupWanted());
  const set = (patch: Partial<SetupChoice>) => setC((now) => ({ ...now, ...patch }));
  const plan = planFor(c.personnel);
  const placed = useMemo(() => setupPlayers(c.personnel, c.formation), [c.personnel, c.formation]);

  const pickPersonnel = (personnel: string) =>
    set({ personnel, formation: defaultFormation(personnel), view: defaultView(personnel, c.view) });

  const finish = (start: boolean) => {
    setSetupWanted(!skipNext);
    if (start) onStart(c.book === NEW_BOOK && !c.newBook.trim() ? { ...c, book: "" } : c);
    else onSkip();
  };

  return (
    <Modal
      title="New play"
      onClose={() => finish(false)}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={() => finish(false)}>
            Blank field
          </button>
          <button type="submit" form="play-setup" className="btn btn-primary">
            Open the field
          </button>
        </>
      }
    >
      <form
        id="play-setup"
        className="ps"
        onSubmit={(e) => {
          e.preventDefault();
          finish(true);
        }}
        onKeyDown={(e) => {
          // Enter from any box or list opens the field, so a repeat setup is one keystroke.
          const el = e.target as HTMLElement;
          if (e.key === "Enter" && el.tagName === "SELECT") {
            e.preventDefault();
            finish(true);
          }
        }}
      >
        <label className="field">
          <span>Play name</span>
          <input
            className="input"
            value={c.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Trips Right Smash"
            autoFocus
          />
          <small className="hint">Optional now. You name it for good when you save.</small>
        </label>

        <div className="ps-row">
          <label className="field">
            <span>Personnel</span>
            <select className="select" value={c.personnel} onChange={(e) => pickPersonnel(e.target.value)}>
              {personnelGroups("pass").map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {plan.side === "offense" && (
            <label className="field">
              <span>Formation</span>
              <select className="select" value={c.formation} onChange={(e) => set({ formation: e.target.value })}>
                {FORMATION_NAMES.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {plan.side === "offense" && placed.length > 0 && (
          <FormationPreview placed={placed} tokens={tokens} label={`${c.formation}, ${c.personnel}`} />
        )}
        <p className="hint ps-note">
          {plan.side === "offense"
            ? `${placed.length} players line up in ${c.formation}. Move any of them once the field opens.`
            : plan.side === "defense"
              ? plan.front
                ? plan.exact
                  ? `Your ${c.personnel} lines up against a scout offense.`
                  : `The closest front we draw (${plan.front}) lines up against a scout offense. Adjust it to match.`
                : "A scout offense goes on the field so you can line your defenders up against it."
              : "Opens an empty field. Drop your unit from the player trays."}
        </p>

        <div className="ps-row">
          <label className="field">
            <span>Field</span>
            <select className="select" value={c.view} onChange={(e) => set({ view: e.target.value as FieldView })}>
              {FIELD_VIEWS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Playbook</span>
            <select className="select" value={c.book} onChange={(e) => set({ book: e.target.value })}>
              <option value="">Just the Vault</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value={NEW_BOOK}>New playbook…</option>
            </select>
          </label>
        </div>
        {c.book === NEW_BOOK && (
          <label className="field">
            <span>New playbook name</span>
            <input className="input" value={c.newBook} onChange={(e) => set({ newBook: e.target.value })} placeholder="Varsity Offense 2026" />
          </label>
        )}
        {c.book && <p className="hint ps-note">The play goes in this playbook the first time you save it.</p>}

        <label className="switch ps-skip">
          <input type="checkbox" checked={skipNext} onChange={(e) => setSkipNext(e.target.checked)} />
          <span>Skip this next time and open a blank field (turn it back on from More in the Designer)</span>
        </label>
      </form>
    </Modal>
  );
}
