import type { ReactNode } from "react";
import { Modal } from "./Modal";

type Props = {
  title: string;
  /** What happens and what it means for others, in a sentence or two. */
  children: ReactNode;
  /** The confirming button's label, e.g. "Delete for everyone". */
  action: string;
  /** A red confirming button for a step that takes something away. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * An in-app "are you sure?" for a step that can't be undone and has no Undo
 * toast (it reaches other people at once). Focus starts on the dialog's close
 * button, never the confirming one, so a stray Enter never confirms. Prefer an Undo toast wherever the step can be
 * put back; never use the browser's confirm().
 */
export function Confirm({ title, children, action, danger = false, busy = false, onConfirm, onClose }: Props) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : action}
          </button>
        </>
      }
    >
      <p>{children}</p>
    </Modal>
  );
}
