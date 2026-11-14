import { useEffect } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { DRILLS_KEY, loadDrills } from "./drills";
import { PRACTICE_KEY, PRACTICE_LOCAL_EVENT, PRACTICE_SYNCED_EVENT } from "./practice";
import { cleanScript, cleanVault, mergeVault, sameVault, type PracticeVault } from "./practiceVaultData";

/**
 * `PracticeSync` keeps the coach's own drills, starred drills and practice
 * script on the account while signed in, like `BandSetupSync`: signing in
 * pulls the account's copy and merges it with this browser's, every change
 * goes up a moment later (and again when the signal comes back). Signed out,
 * everything waits in this browser (`grid1ronvault.drills.v1`,
 * `grid1ronvault.practice.v1`) and joins the account at the next sign-in.
 */

/** This browser's copy as one vault. A script never saved counts as none, so the account's wins on a new device. */
export function localVault(): PracticeVault {
  const saved = loadDrills();
  let script = null;
  let scriptAt = "";
  try {
    const raw = JSON.parse(localStorage.getItem(PRACTICE_KEY) ?? "null") as { updatedAt?: string } | null;
    script = cleanScript(raw);
    // A script saved before the account kept them has no time: the oldest possible, so any account copy wins.
    scriptAt = script ? raw?.updatedAt || new Date(0).toISOString() : "";
  } catch {
    /* nothing saved */
  }
  return cleanVault({ drills: saved.custom, deleted: saved.deleted, favorites: saved.favorites, favoritesAt: saved.favoritesAt, script, scriptAt });
}

/** Writes a merged vault into this browser and tells open pages; never announced as a local change. */
function writeLocal(v: PracticeVault) {
  try {
    localStorage.setItem(DRILLS_KEY, JSON.stringify({ custom: v.drills, favorites: v.favorites, deleted: v.deleted, favoritesAt: v.favoritesAt }));
    if (v.script) localStorage.setItem(PRACTICE_KEY, JSON.stringify({ ...v.script, updatedAt: v.scriptAt }));
  } catch {
    /* storage blocked: the account still holds it */
  }
  window.dispatchEvent(new Event(PRACTICE_SYNCED_EVENT));
}

/** What the account last answered, so an unchanged vault isn't sent again. */
let sent: PracticeVault | null = null;
const PUSH_DELAY_MS = 800;

async function pushVault() {
  const local = localVault();
  if (sent && sameVault(local, sent)) return;
  try {
    const res = await api.savePracticeVault(local);
    const merged = cleanVault(res.vault);
    sent = merged;
    // The account merges with what it held, so another device's drills come back too.
    const now = localVault();
    const both = mergeVault(now, merged);
    if (!sameVault(both, now)) writeLocal(both);
  } catch {
    /* still saved in this browser; the next change or sign-in tries again */
  }
}

/** Mounted once in App, like BandSetupSync. */
export function PracticeSync() {
  const { account } = useAuth();
  const id = account?.id;

  useEffect(() => {
    if (!id) {
      sent = null;
      return;
    }
    let alive = true;
    let timer: number | undefined;
    const changed = () => {
      if (!alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pushVault(), PUSH_DELAY_MS);
    };
    window.addEventListener(PRACTICE_LOCAL_EVENT, changed);
    api
      .practiceVault()
      .then(({ vault }) => {
        if (!alive || !vault) return;
        const remote = cleanVault(vault);
        sent = remote;
        const now = localVault();
        const merged = mergeVault(now, remote);
        if (!sameVault(merged, now)) writeLocal(merged);
      })
      .catch(() => {
        /* no signal: this browser's drills and script still work */
      })
      .finally(() => {
        if (alive) void pushVault();
      });
    const online = () => void pushVault();
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      window.removeEventListener(PRACTICE_LOCAL_EVENT, changed);
    };
  }, [id]);

  return null;
}
