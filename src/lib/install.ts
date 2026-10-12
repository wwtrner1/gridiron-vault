import { useSyncExternalStore } from "react";

/**
 * "Install the app": Chrome, Edge and Android offer an install prompt the
 * page can trigger; iPhone and iPad use Share → Add to Home Screen.
 */
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export type InstallState = "installed" | "prompt" | "ios" | "manual";

function state(): InstallState {
  if (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) return "installed";
  if (deferred) return "prompt";
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "manual";
}

export const useInstall = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    state,
    () => "manual" as InstallState,
  );

export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  notify();
}
