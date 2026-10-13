import { useSyncExternalStore } from "react";

/**
 * Coach tips: the Designer watches for input that keeps not doing anything
 * (taps on the empty field, presses on a locked player, the same step undone
 * again and again) and offers one short bubble saying why and what to do
 * instead. Each tip shows at most twice, and a coach can turn tips off.
 * Nothing leaves the browser.
 */

export type TipId =
  | "emptyTaps"
  | "locked"
  | "oneFingerPan"
  | "finishLine"
  | "undoLoop"
  | "arcPoints"
  | "pinch"
  /** First time a tool is picked: what it does. */
  | `tool-${string}`;

export type Tip = {
  id: TipId;
  title: string;
  text: string;
  /** Optional button that takes the coach to the fix. */
  action?: { label: string; run: () => void };
  /** How many times this tip may ever show (default 2). */
  max?: number;
};

const KEY = "grid1ronvault.tips.v1";
const MAX_SHOWS = 2;

type Saved = { off: boolean; shown: Partial<Record<TipId, number>> };

let saved: Saved = (() => {
  try {
    return { off: false, shown: {}, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { off: false, shown: {} };
  }
})();
let current: Tip | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage blocked — tips still work this session */
  }
};

/* Recent input, kept in memory only. */
let taps: number[] = [];
let lockedPresses: number[] = [];
let emptyBoxes: number[] = [];
let undone: { label: string; at: number }[] = [];

export const coachTips = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => current,
  enabled: () => !saved.off,

  /** Shows a tip unless tips are off or this one has had its showings. */
  show(tip: Tip) {
    if (saved.off) return;
    const n = saved.shown[tip.id] ?? 0;
    if (n >= (tip.max ?? MAX_SHOWS) || current?.id === tip.id) return;
    saved = { ...saved, shown: { ...saved.shown, [tip.id]: n + 1 } };
    persist();
    current = tip;
    emit();
  },
  dismiss() {
    current = null;
    emit();
  },
  setEnabled(on: boolean) {
    saved = { ...saved, off: !on, ...(on ? { shown: {} } : {}) };
    persist();
    if (!on) current = null;
    emit();
  },

  /**
   * A tap on the empty field with the Select tool. Three in a few seconds
   * means the coach expects something to happen there.
   */
  emptyTap(tip: Tip) {
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < 4000), now];
    if (taps.length >= 3) {
      taps = [];
      coachTips.show(tip);
    }
  },
  /** Anything that did do something resets the empty-tap count. */
  acted() {
    taps = [];
  },

  lockedPress(tip: Tip) {
    const now = Date.now();
    lockedPresses = [...lockedPresses.filter((t) => now - t < 6000), now];
    if (lockedPresses.length >= 2) {
      lockedPresses = [];
      coachTips.show(tip);
    }
  },

  /** A one-finger box on a touch screen that caught nothing: likely a scroll attempt. */
  emptyBox(tip: Tip) {
    const now = Date.now();
    emptyBoxes = [...emptyBoxes.filter((t) => now - t < 10000), now];
    if (emptyBoxes.length >= 2) {
      emptyBoxes = [];
      coachTips.show(tip);
    }
  },

  /** The same step undone three times in a row: it isn't doing what the coach wants. */
  undid(label: string | undefined, tipFor: (label: string) => Tip | null) {
    if (!label) return;
    const now = Date.now();
    undone = [...undone.filter((u) => now - u.at < 45000 && u.label === label), { label, at: now }];
    if (undone.length >= 3) {
      undone = [];
      const tip = tipFor(label);
      if (tip) coachTips.show(tip);
    }
  },
};

export function useCoachTip() {
  return useSyncExternalStore(coachTips.subscribe, coachTips.get, coachTips.get);
}

export function useTipsEnabled() {
  return useSyncExternalStore(coachTips.subscribe, coachTips.enabled, coachTips.enabled);
}
