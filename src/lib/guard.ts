import { useEffect } from "react";

/**
 * Deterrents against grabbing paid diagrams with a screenshot or a drag-save.
 *
 * Be straight about the limits: a browser cannot stop an operating-system
 * screen capture. What this does is make the cheap routes annoying and make
 * anything that does escape traceable — the real protection is the watermark
 * plus the resolution cap in plan.ts.
 */
export function useCaptureGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const stop = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // Browser print, save-page and the Windows snipping shortcut.
      if ((e.ctrlKey || e.metaKey) && (key === "p" || key === "s")) {
        e.preventDefault();
        document.body.dataset.guard = "print";
        window.setTimeout(() => delete document.body.dataset.guard, 1600);
      }
      if (key === "printscreen" || (e.shiftKey && (e.metaKey || e.ctrlKey) && key === "s")) {
        document.body.dataset.guard = "capture";
        window.setTimeout(() => delete document.body.dataset.guard, 1600);
      }
    };

    document.addEventListener("contextmenu", stop);
    document.addEventListener("dragstart", stop);
    document.addEventListener("copy", stop);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", stop);
      document.removeEventListener("dragstart", stop);
      document.removeEventListener("copy", stop);
      window.removeEventListener("keydown", onKey);
      delete document.body.dataset.guard;
    };
  }, [active]);
}

/**
 * Free-plan browser prints: sets `data-free-print` on <html> so the print
 * stylesheet (global.css) blurs and fades every diagram and tiles a watermark
 * across the page. Like the capture guard this is a deterrent, not a lock; the
 * export dialog's watermark and DPI cap are the real limits.
 */
export function useFreePrint(active: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (active) root.dataset.freePrint = "on";
    else delete root.dataset.freePrint;
    return () => {
      delete root.dataset.freePrint;
    };
  }, [active]);
}
