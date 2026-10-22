import { useSyncExternalStore } from "react";

/**
 * "Vs defense": a saved play shown faded under the one being drawn, so a coach
 * can check routes against the coverage. Remembered per play in this browser;
 * it is a drawing aid only and never prints or saves into the play.
 */
const KEY = "grid1ronvault.overlay.v1";

type Map_ = Record<string, string>;

function read(): Map_ {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Map_) : {};
  } catch {
    return {};
  }
}

let state: Map_ = read();
const listeners = new Set<() => void>();

export const overlayStore = {
  set(playId: string, overlayId: string | null) {
    const next = { ...state };
    if (overlayId) next[playId] = overlayId;
    else delete next[playId];
    state = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage blocked — the choice still holds this visit */
    }
    listeners.forEach((l) => l());
  },
};

/** The play shown under `playId` ("draft" for a play not saved yet), or null. */
export function useOverlay(playId: string): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state[playId] ?? null,
  );
}
