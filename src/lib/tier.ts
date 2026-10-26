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

/** When the Head Coach trial ends (from the server), or null off a trial. Display only; the server enforces it. */
let trialEnds: number | null = null;

/** Whole days left on the trial, rounded up; null when not on one. */
export function useTrialDays(): number | null {
  useSyncExternalStore(tierStore.subscribe, tierStore.get, () => "beta" as TierId);
  return trialEnds === null ? null : Math.max(0, Math.ceil((trialEnds - Date.now()) / 86_400_000));
}

export function useTier(): Tier {
  const id = useSyncExternalStore(tierStore.subscribe, tierStore.get, () => "beta" as TierId);
  return tierFor(id);
}

/** Whether the server can take payments yet (Stripe set up). Until it can, plan buttons keep their beta behaviour. */
let billingOpen = false;
const billingListeners = new Set<() => void>();
export const useBilling = () =>
  useSyncExternalStore(
    (l) => (billingListeners.add(l), () => billingListeners.delete(l)),
    () => billingOpen,
    () => false,
  );
export function setBilling(on: boolean) {
  if (on === billingOpen) return;
  billingOpen = on;
  billingListeners.forEach((l) => l());
}

/** Off to Stripe's page for an offer ("solo_month", "season", …), or Stripe's portal when none is named. */
export async function goToBilling(offer?: string) {
  const { url } = offer ? await api.checkout(offer) : await api.billingPortal();
  window.location.assign(url);
}

/** Set once this browser has handed its plan choice to the account. */
const SYNCED = "nextplay.tier.synced.v1";

/**
 * After sign-in: follow the account's plan. The first time, a plan picked in
 * this browser before the server kept plans is handed up, so nobody drops to
 * the default limits when the server starts enforcing them.
 */
export async function syncPlan(serverPlan: string | undefined, trialEndsAt?: string) {
  if (!serverPlan || !(serverPlan in TIERS)) return;
  trialEnds = serverPlan === "trial" && trialEndsAt ? Date.parse(trialEndsAt) : null;
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
  else tierStore.set(current); // same plan: still tell the screen the trial days changed
}

/** The Account and Pricing plan pickers: the account first when signed in, so the server's limits match. */
export async function choosePlan(id: TierId, signedIn: boolean) {
  if (signedIn) await api.setPlan(id);
  tierStore.set(id);
}
