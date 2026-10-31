import { useId, useRef } from "react";
import { useDialogFocus } from "../lib/dialogFocus";
import { Icon } from "./Icon";

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
};

export function Modal({ title, onClose, children, footer, wide }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Focus moves in on open, Tab stays inside, Escape closes, and focus goes back to the opener on close.
  useDialogFocus(panel, onClose);

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        className="modal"
        style={wide ? { maxWidth: 860 } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose} aria-label={`Close ${title}`}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
