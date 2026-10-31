import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Everything a keyboard can land on inside a dialog. */
export const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Keyboard focus for a dialog: on open, focus moves inside (to `initial`, else
 * the first focusable element, unless something inside already has it — an
 * `autoFocus` box keeps it); Tab cycles inside instead of escaping to the page;
 * Escape closes it and nothing behind it sees that key; on close, focus goes back
 * to whatever had it when the dialog first rendered, if that is still on the page.
 *
 * The opener is read during the first render, before any `autoFocus` inside the
 * dialog commits, so a dialog with an autofocused box still hands focus back to
 * the button that opened it. `onClose` is read through a ref, so a new function
 * on every render of the parent never re-runs the focus move (which used to pull
 * focus out of a box after every keystroke).
 */
export function useDialogFocus(panel: RefObject<HTMLElement | null>, onClose: () => void, initial?: RefObject<HTMLElement | null>) {
  const [opener] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const close = useRef(onClose);
  close.current = onClose;

  // A layout effect, so the dialog answers Escape and Tab from the first frame it is on screen (a passive
  // effect lands after paint, which on a slow device left a beat where an autofocused box had focus but Escape did nothing).
  useLayoutEffect(() => {
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) {
      const first = initial?.current ?? el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      const box = panel.current;
      if (e.key !== "Tab" || !box) return;
      const stops = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((s) => s.offsetParent !== null || s === document.activeElement);
      if (stops.length === 0) {
        e.preventDefault();
        box.focus();
        return;
      }
      const edge = e.shiftKey ? stops[0] : stops[stops.length - 1];
      if (document.activeElement === edge || !box.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (opener?.isConnected) opener.focus?.();
    };
    // Runs once per opening: the panel, the opener and the first stop are fixed for the dialog's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
