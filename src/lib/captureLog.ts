import { useEffect } from "react";
import { deviceId } from "./device";
import type { ActivityKind } from "./activity";

/**
 * Capture signals for the owner's audit (Admin → Activity): screenshot keys, browser prints and copies, sent in small
 * batches to /api/activity while a coach is signed in. Exports are logged by the server from the play_exported event.
 *
 * Be straight about the limits: a web page cannot see an operating-system screenshot. Windows' Print Screen key usually
 * reaches the page, and the Snipping Tool shortcut (Win+Shift+S) and Mac's Cmd+Shift+3/4/5 sometimes do; a phone's
 * screenshot buttons, the Snipping Tool opened from the Start menu, screen recorders and a camera pointed at the screen
 * never do. So this is a signal, never proof, and never a lock.
 */
type Signal = { kind: Exclude<ActivityKind, "sign_in" | "open">; detail: Record<string, string | number | boolean> };

let queue: Signal[] = [];
let timer = 0;
/** The last time each kind was queued, so holding a key or copying ten things in a row is one row. */
const last = new Map<string, number>();
const QUIET_MS = 20_000;

function flush() {
  window.clearTimeout(timer);
  timer = 0;
  if (!queue.length) return;
  const body = JSON.stringify(queue.slice(0, 20));
  queue = [];
  void fetch("/api/activity", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json", "X-Device": deviceId() },
    body,
  }).catch(() => undefined);
}

function note(kind: Signal["kind"], detail: Signal["detail"] = {}) {
  const key = `${kind}|${detail.how ?? ""}`;
  const now = Date.now();
  if (now - (last.get(key) ?? 0) < QUIET_MS) return;
  last.set(key, now);
  queue.push({ kind, detail: { page: location.pathname.slice(0, 80), ...detail } });
  if (!timer) timer = window.setTimeout(flush, 4000);
}

/** Mounted once in App; listens only while someone is signed in. */
export function useCaptureLog(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "printscreen") note("screenshot_key", { how: "Print Screen" });
      else if (e.shiftKey && e.metaKey && key === "s") note("screenshot_key", { how: "Snipping shortcut" });
      else if (e.shiftKey && e.metaKey && ["3", "4", "5", "#", "$", "%"].includes(key)) note("screenshot_key", { how: "Mac screenshot shortcut" });
    };
    const onPrint = () => note("print");
    const onCopy = () => {
      const target = document.activeElement;
      // Typing in a box and copying your own words isn't interesting; copying from a play or a page is.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const text = String(window.getSelection() ?? "");
      note("copy", { how: text ? "text" : "drawing", chars: text.length });
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    // Print Screen fires keyup only on some systems, so listen to both (the quiet window keeps it to one row).
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("beforeprint", onPrint);
    document.addEventListener("copy", onCopy);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("beforeprint", onPrint);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [signedIn]);
}

