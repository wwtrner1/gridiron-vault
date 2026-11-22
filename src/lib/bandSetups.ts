import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { SIGNED_OUT_EVENT, useAuth } from "./auth";
import {
  BAND_PREFS_EVENT,
  BAND_PREFS_KEY,
  cleanSetupsDoc,
  EMPTY_SETUPS,
  mergeSetups,
  sameSetups,
  sameValue,
  withCurrent,
  withSetup,
  type CurrentSettings,
  type SetupsDoc,
} from "./bandSetupsData";

export * from "./bandSetupsData";

/**
 * Saved wristband setups in the browser, and `BandSetupSync`, which keeps
 * them on the account while signed in: signing in pulls the account's list
 * and merges it with this browser's, and every change goes up a moment later
 * (and again when the signal comes back). Signed out, the setups wait in this
 * browser and join the account at the next sign-in.
 *
 * The page's live settings ride along as `current` (newer change wins), so a
 * new device opens on the settings the coach left on the last one. They belong
 * to the account that made them: another account signing in on this browser
 * starts from the default look and never sees or sends them, and signing out
 * puts the default look back (the same hand-over rule as the team brand). A
 * session that merely ran out (no signal at the field) keeps them: only a sign-out
 * the coach chose clears them, so the card is still there at game time.
 */
export const BAND_SETUPS_KEY = "grid1ronvault.wristbandSetups.v1";
const OWNER_KEY = "grid1ronvault.wristbandSetups.owner.v1";

function ownerOf(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function setOwner(id: string | null) {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    /* the setups still follow the account; only the hand-over check is lost */
  }
}

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
  /** The page's settings after a change the coach made, stamped now so the newest copy wins on every device. */
  setCurrent: (prefs: Record<string, unknown>) => write(withCurrent(state, prefs), "local"),
};

/** The account's settings are newer: put them where the page reads them and tell an open page to read again. */
function adoptCurrent(c: CurrentSettings) {
  try {
    localStorage.setItem(BAND_PREFS_KEY, JSON.stringify(c.prefs));
  } catch {
    /* a private window: the settings still apply for this visit through the event */
  }
  window.dispatchEvent(new CustomEvent(BAND_PREFS_EVENT, { detail: { account: true } }));
}

/** Another coach's (or nobody's) setups and settings: back to an empty list and the default look. */
function resetLocal() {
  write(EMPTY_SETUPS, "account");
  try {
    localStorage.removeItem(BAND_PREFS_KEY);
  } catch {
    /* nothing to remove */
  }
  window.dispatchEvent(new CustomEvent(BAND_PREFS_EVENT, { detail: { account: true } }));
}

export const useBandSetups = () => useSyncExternalStore(setupsStore.subscribe, setupsStore.get, setupsStore.get);

/**
 * Settings this browser holds from before they followed the account have no
 * time on them, so they would lose to any newer copy and be written over
 * unseen. When the account has none, they become the account's (the next device
 * opens on them); when it already has newer ones from another device, they are
 * kept as a saved setup instead of being replaced silently.
 */
async function keepOwnSettings(local: SetupsDoc, remote: SetupsDoc): Promise<SetupsDoc> {
  if (local.current) return local;
  try {
    if (!localStorage.getItem(BAND_PREFS_KEY)) return local;
  } catch {
    return local;
  }
  let mine: Record<string, unknown> | null = null;
  try {
    mine = (await import("./bandPrefs")).ownSettings(remote.current?.prefs) as Record<string, unknown> | null;
  } catch {
    return local; // the page's code isn't here (no signal): the next sign-in tries again
  }
  const now = setupsStore.get(); // the coach may have changed something while that loaded
  if (!mine || now.current) return now;
  if (!remote.current) return withCurrent(now, mine);
  const taken = new Set([...now.setups, ...remote.setups].map((x) => x.name.toLowerCase()));
  let name = "Saved from this browser";
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `Saved from this browser ${n}`;
  return withSetup(now, name, mine) ?? now;
}

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
    // The account merges with what it held, so another device's setups (and newer settings) come back too.
    const now = setupsStore.get();
    if (!sameSetups(merged, now)) {
      const base = await keepOwnSettings(now, merged);
      // The account cuts back a time that is ahead of its own clock. When it did that to these very settings, take its
      // time, so a device with the wrong clock can't keep them on top of changes made elsewhere.
      const kept =
        base.current && merged.current && merged.current.at < base.current.at && sameValue(merged.current.prefs, base.current.prefs)
          ? { ...base, current: merged.current }
          : base;
      const next = mergeSetups(kept, merged);
      write(next, "account");
      if (next.current && next.current.at !== kept.current?.at) adoptCurrent(next.current);
      if (base !== now) void pushSetups(); // what was kept from this browser still has to go up
    }
  } catch {
    /* still saved in this browser; the next change or sign-in tries again */
  }
}

/** Mounted once in App, like BrandSync. */
export function BandSetupSync() {
  const { account, status } = useAuth();
  const id = account?.id;

  // The coach signed out on purpose: an account's setups and settings don't stay on the screen for whoever uses this browser next.
  useEffect(() => {
    const out = () => {
      sent = null;
      if (ownerOf()) {
        resetLocal();
        setOwner(null);
      }
    };
    window.addEventListener(SIGNED_OUT_EVENT, out);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, out);
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const owner = ownerOf();
    if (!id) {
      sent = null; // a session that ran out keeps this browser's copy (and who it belongs to), so the card still prints with no signal
      return;
    }
    // Another coach's setups are in this browser: start from nothing, so they are never shown here or sent up.
    if (owner && owner !== id) {
      resetLocal();
      sent = null;
    }
    // Setups made signed out in this browser are this coach's own work, so they go to this account.
    setOwner(id);
    let alive = true;
    let timer: number | undefined;
    const off = setupsStore.subscribe((from) => {
      if (from !== "local" || !alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pushSetups(), PUSH_DELAY_MS);
    });
    api
      .bandSetups()
      .then(async ({ setups }) => {
        if (!alive || !setups) return;
        const remote = cleanSetupsDoc(setups);
        sent = remote;
        const local = setupsStore.get();
        const base = await keepOwnSettings(local, remote);
        if (!alive) return;
        const merged = mergeSetups(base, remote);
        if (!sameSetups(merged, local)) write(merged, "account");
        // A newer copy of the live settings on the account (set on another device) becomes this device's.
        if (merged.current && merged.current.at !== base.current?.at) adoptCurrent(merged.current);
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
  }, [id, status]);

  return null;
}
