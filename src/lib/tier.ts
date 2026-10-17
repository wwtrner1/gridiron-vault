import { useSyncExternalStore } from "react";
import { api } from "./api";
import { TIERS, tierFor, type Tier, type TierId } from "./plan";

/**
 * Which plan this browser shows. Signed in, the account's plan on the server
 * is the one that counts (the API enforces its limits) and this copy follows
 * it; signed out, the browser's own choice stands.
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

/** Set once this browser has handed its plan choice to the account. */
const SYNCED = "nextplay.tier.synced.v1";

/**
 * After sign-in: follow the account's plan. The first time, a plan picked in
 * this browser before the server kept plans is handed up, so nobody drops to
 * the default limits when the server starts enforcing them.
 */
export async function syncPlan(serverPlan: string | undefined) {
  if (!serverPlan || !(serverPlan in TIERS)) return;
  let synced = false;
  try {
    synced = localStorage.getItem(SYNCED) === "1";
    localStorage.setItem(SYNCED, "1");
  } catch {
    /* storage blocked — the account's plan still wins below */
  }
  if (!synced && serverPlan === "beta" && current !== "beta") {
    try {
      await api.setPlan(current);
      return;
    } catch {
      /* self-serve is closed; take the account's plan */
    }
  }
  if (serverPlan !== current) tierStore.set(serverPlan as TierId);
}

/** The Account and Pricing plan pickers: the account first when signed in, so the server's limits match. */
export async function choosePlan(id: TierId, signedIn: boolean) {
  if (signedIn) await api.setPlan(id);
  tierStore.set(id);
}
