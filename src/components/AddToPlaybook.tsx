import { useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "./Modal";
import { useStore } from "../lib/store";
import { useTier } from "../lib/tier";
import { useToast } from "../lib/toast";
import { bookNamed, filedMessage, filePlays, newBookGate, type Filed } from "../lib/filePlays";

type Props = {
  /** How many plays are going in (for the button wording). */
  count: number;
  /** The play ids to file, worked out when the coach picks (Starters copies first). null stops without filing. */
  plays: () => string[] | null;
  /** Opened from an "Add to new playbook" button: the title says so and the name box is ready to type in. */
  newFirst?: boolean;
  /** A name to start the box with. */
  suggest?: string;
  onClose: () => void;
  onDone?: (filed: Filed) => void;
};

/**
 * The one "Add to playbook" dialog: name a new playbook and file the plays in
 * it in one step, or pick one the coach already has. Used by the Vault (bar
 * and cards), the Designer, Starter plays and Playbooks.
 */
export function AddToPlaybook({ count, plays, newFirst, suggest = "", onClose, onDone }: Props) {
  const toast = useToast();
  const tier = useTier();
  const books = useStore((s) => s.playbooks);
  const [name, setName] = useState(suggest);
  const what = `${count} ${count === 1 ? "play" : "plays"}`;
  const gate = newBookGate(tier, name);
  const twin = name.trim() ? bookNamed(name) : undefined;

  const file = (target: { id: string } | { name: string }) => {
    const ids = plays();
    if (!ids) return;
    const filed = filePlays(ids, target);
    if (!filed) return;
    toast(filedMessage(filed));
    onDone?.(filed);
    onClose();
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast("Give the new playbook a name first.", true);
      return;
    }
    if (!gate.ok) {
      toast(gate.reason, true);
      return;
    }
    file({ name });
  };

  return (
    <Modal title={newFirst ? "Add to a new playbook" : "Add to a playbook"} onClose={onClose}>
      <form className="atp-new" onSubmit={create}>
        <label className="field">
          <span>New playbook</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Red zone packages"
            maxLength={80}
            autoFocus={newFirst || books.length === 0}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || !gate.ok}>
          {twin ? `Add ${what} to it` : `Create and add ${what}`}
        </button>
      </form>
      {twin && (
        <p className="hint atp-note">You already have {twin.name}, so the plays go in that one.</p>
      )}
      {!gate.ok && (
        <p className="hint atp-note" role="note">
          {gate.reason} <Link to="/pricing" onClick={onClose}>{gate.cta}</Link>
        </p>
      )}

      {books.length > 0 && (
        <>
          <p className="atp-head">Or add to one you have</p>
          <div className="size-list">
            {books.map((b) => (
              <button key={b.id} type="button" className="size-opt" onClick={() => file({ id: b.id })}>
                <span className="radio-dot" />
                <span>
                  <strong>{b.name}</strong>
                  <small>
                    {b.playIds.length} {b.playIds.length === 1 ? "play" : "plays"}
                  </small>
                </span>
                <span className="dim">Add {count}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
