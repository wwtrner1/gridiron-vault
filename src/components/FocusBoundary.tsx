import { useRef, type RefObject, type HTMLAttributes } from "react";
import { useDialogFocus } from "../lib/dialogFocus";

/** Mount with an open drawer or popover to contain focus and restore its opener. */
export function FocusBoundary({ panel, onClose }: { panel: RefObject<HTMLElement | null>; onClose: () => void }) {
  useDialogFocus(panel, onClose);
  return null;
}

/** Own the DOM ref so it is committed before the focus effect runs. */
export function FocusPopover({ onClose, children, ...props }: HTMLAttributes<HTMLDivElement> & { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel, onClose);
  return <div {...props} ref={panel} tabIndex={-1}>{children}</div>;
}
