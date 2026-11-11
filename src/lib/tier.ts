import { useSyncExternalStore } from "react";
import { api, ApiError } from "./api";

export const SIGN_IN_FOR_PLAN = "Sign in first. Plans live on your account, so a plan past Sideline opens once you're signed in.";
import { TIERS, tierFor, type Tier, type TierId } from "./plan";

/**
 * Which plan this browser shows. Signed in, the account's plan on the server
 * is the one that counts (the API enforces its limits) and this copy follows
 * it; signed out, the browser's own choice stands.
 */
const KEY = "nextplay.tier.v1";
const listeners = new Set<() => void>();

let current: TierId = read();

/** A browser that has never been told a plan is on Sideline: everything past it comes with an account. */
function read(): TierId {
  if (typeof localStorage === "undefined") return "free";
  const raw = localStorage.getItem(KEY);
  return raw && raw in TIERS ? (raw as TierId) : "free";
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
  useSyncExternalStore(tierStore.subscribe, tierStore.get, () => "free" as TierId);
  return trialEnds === null ? null : Math.max(0, Math.ceil((trialEnds - Date.now()) / 86_400_000));
}

export function useTier(): Tier {
  const id = useSyncExternalStore(tierStore.subscribe, tierStore.get, () => "free" as TierId);
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

/** Stripe couldn't take the last payment: the coach is on Sideline until the card is fixed. */
let paymentFailed = false;
const failedListeners = new Set<() => void>();
export const usePaymentFailed = () =>
  useSyncExternalStore(
    (l) => (failedListeners.add(l), () => failedListeners.delete(l)),
    () => paymentFailed,
    () => false,
  );
export function setPaymentFailed(on: boolean) {
  if (on === paymentFailed) return;
  paymentFailed = on;
  failedListeners.forEach((l) => l());
}

/** The owner switched this account off: the server refuses its calls and the Shell says why. */
let suspended = false;
const suspendedListeners = new Set<() => void>();
export const useSuspended = () =>
  useSyncExternalStore(
    (l) => (suspendedListeners.add(l), () => suspendedListeners.delete(l)),
    () => suspended,
    () => false,
  );
export function setSuspended(on: boolean) {
  if (on === suspended) return;
  suspended = on;
  suspendedListeners.forEach((l) => l());
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
  // Signed out, only Sideline: a plan with more in it belongs to an account the server can check.
  if (!signedIn && id !== "free") throw new ApiError(SIGN_IN_FOR_PLAN, 401);
  if (signedIn) await api.setPlan(id);
  tierStore.set(id);
}
