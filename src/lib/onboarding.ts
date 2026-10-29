import { useSyncExternalStore } from "react";

/**
 * Getting started: the five moves that make a new coach a regular (draw a
 * play, make a playbook, print a wristband, ask Griddy, run a Coverage
 * check). Plays and playbooks are read from the store; the other three are
 * marked here when they happen. Per browser, like the other prefs.
 */

export type StartStep = "play" | "playbook" | "wristband" | "griddy" | "coverage";
type Saved = { done: Partial<Record<StartStep, number>>; hidden: boolean };

const KEY = "grid1ronvault.onboarding.v1";
let saved: Saved = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { done: typeof v.done === "object" && v.done ? v.done : {}, hidden: v.hidden === true };
  } catch {
    return { done: {}, hidden: false };
  }
})();
const listeners = new Set<() => void>();
const write = (next: Saved) => {
  saved = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage blocked: the list resets next visit */
  }
  listeners.forEach((l) => l());
};

export const onboarding = {
  /** Marks a step done (once; later calls do nothing). */
  mark(step: StartStep) {
    if (!saved.done[step]) write({ ...saved, done: { ...saved.done, [step]: Date.now() } });
  },
  hide(hidden = true) {
    write({ ...saved, hidden });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => saved,
};

export const useOnboarding = () => useSyncExternalStore(onboarding.subscribe, onboarding.get, onboarding.get);
