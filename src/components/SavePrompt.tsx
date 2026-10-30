import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

type Props = {
  /** True when the coach is on the way out (a tab, a link, Back); false when they pressed Save on a play with no name. */
  leaving: boolean;
  name: string;
  saving: boolean;
  onSave: (name: string) => void;
  /** Only while leaving: go without saving. */
  onLeave: () => void;
  /** Stay in the Designer (Cancel). */
  onStay: () => void;
};

/**
 * Unsaved changes in the Designer: name the play right here and save, leave
 * without saving, or stay. Leaving is always one click away, so a play with
 * no name can never trap a coach on the field.
 */
export function SavePrompt({ leaving, name: start, saving, onSave, onLeave, onStay }: Props) {
  const [name, setName] = useState(start);
  const ready = name.trim().length > 0;
  const box = useRef<HTMLInputElement>(null);
  // The Modal focuses its first button when it opens; the name box is where the coach starts.
  useEffect(() => {
    const t = requestAnimationFrame(() => box.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <Modal
      title={leaving ? "Save this play before you go?" : "Name this play"}
      onClose={onStay}
      footer={
        <>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onStay} disabled={saving}>
            {leaving ? "Stay" : "Cancel"}
          </button>
          {leaving && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onLeave} disabled={saving} data-testid="leave-unsaved">
              Leave without saving
            </button>
          )}
          <button type="submit" form="save-prompt" className="btn btn-primary btn-sm" disabled={!ready || saving}>
            {saving ? "Saving…" : leaving ? "Save and leave" : "Save play"}
          </button>
        </>
      }
    >
      <form
        id="save-prompt"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !saving) onSave(name.trim());
        }}
      >
        <p>{leaving ? "This play has changes you haven't saved." : "Give the play a name to save it."} The name is what you'll search for later.</p>
        <label className="field">
          <span>Play name</span>
          <input
            ref={box}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Trips Right Y Corner"
            maxLength={120}
            disabled={saving}
          />
        </label>
      </form>
    </Modal>
  );
}
