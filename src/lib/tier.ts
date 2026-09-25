import { useSyncExternalStore } from "react";
import { tierFor, type Tier, type TierId } from "./plan";

/**
 * Which plan this browser is on. During beta every signed-in coach is a Beta
 * Coach; the value is swapped by billing later without touching call sites.
 */
const KEY = "nextplay.tier.v1";
const listeners = new Set<() => void>();

let current: TierId = read();

function read(): TierId {
  if (typeof localStorage === "undefined") return "beta";
  const raw = localStorage.getItem(KEY);
  return (raw as TierId) || "beta";
}

export const tierStore = {
  get: () => current,
  set(next: TierId) {
    current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private browsing — the tier just resets next visit */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useTier(): Tier {
  const id = useSyncExternalStore(tierStore.subscribe, tierStore.get, () => "beta" as TierId);
  return tierFor(id);
}
