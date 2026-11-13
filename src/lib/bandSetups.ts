import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { cleanSetupsDoc, EMPTY_SETUPS, mergeSetups, sameSetups, type SetupsDoc } from "./bandSetupsData";

export * from "./bandSetupsData";

/**
 * Saved wristband setups in the browser, and `BandSetupSync`, which keeps
 * them on the account while signed in: signing in pulls the account's list
 * and merges it with this browser's, and every change goes up a moment later
 * (and again when the signal comes back). Signed out, the setups wait in this
 * browser and join the account at the next sign-in.
 */
export const BAND_SETUPS_KEY = "grid1ronvault.wristbandSetups.v1";

function read(): SetupsDoc {
  try {
    return cleanSetupsDoc(JSON.parse(localStorage.getItem(BAND_SETUPS_KEY) ?? "null"));
  } catch {
    return EMPTY_SETUPS;
  }
}

let state = read();
const listeners = new Set<(from: "local" | "account") => void>();

/** False when the browser refused to keep it (a private window or a full disk); it still works for this visit. */
function write(next: SetupsDoc, from: "local" | "account"): boolean {
  let kept = true;
  try {
    localStorage.setItem(BAND_SETUPS_KEY, JSON.stringify(next));
  } catch {
    kept = false;
  }
  state = next;
  listeners.forEach((l) => l(from));
  return kept;
}

export const setupsStore = {
  get: () => state,
  subscribe(l: (from: "local" | "account") => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  /** A change made on this device; the account copy follows a moment later when signed in. */
  set: (next: SetupsDoc) => write(next, "local"),
};

export const useBandSetups = () => useSyncExternalStore(setupsStore.subscribe, setupsStore.get, setupsStore.get);

/** What the account last answered, so an unchanged list isn't sent again. */
let sent: SetupsDoc | null = null;
const PUSH_DELAY_MS = 800;

async function pushSetups() {
  const local = setupsStore.get();
  if (sent && sameSetups(local, sent)) return;
  try {
    const res = await api.saveBandSetups(local);
    const merged = cleanSetupsDoc(res.setups);
    sent = merged;
    // The account merges with what it held, so another device's setups come back too.
    if (!sameSetups(merged, setupsStore.get())) write(mergeSetups(setupsStore.get(), merged), "account");
  } catch {
    /* still saved in this browser; the next change or sign-in tries again */
  }
}

/** Mounted once in App, like BrandSync. */
export function BandSetupSync() {
  const { account } = useAuth();
  const id = account?.id;

  useEffect(() => {
    if (!id) {
      sent = null;
      return;
    }
    let alive = true;
    let timer: number | undefined;
    const off = setupsStore.subscribe((from) => {
      if (from !== "local" || !alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pushSetups(), PUSH_DELAY_MS);
    });
    api
      .bandSetups()
      .then(({ setups }) => {
        if (!alive || !setups) return;
        const remote = cleanSetupsDoc(setups);
        sent = remote;
        const merged = mergeSetups(setupsStore.get(), remote);
        if (!sameSetups(merged, setupsStore.get())) write(merged, "account");
      })
      .catch(() => {
        /* no signal: this browser's setups still work */
      })
      .finally(() => {
        if (alive) void pushSetups();
      });
    const online = () => void pushSetups();
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      off();
    };
  }, [id]);

  return null;
}
