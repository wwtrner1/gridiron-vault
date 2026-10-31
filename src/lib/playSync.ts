import { useEffect } from "react";
import { api, toStoredPlay } from "./api";
import { store } from "./store";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import { flushDeletes } from "./pendingDeletes";
import type { StoredPlay } from "./types";

/**
 * A save made while signed in but with no signal stays in this browser marked
 * `unsynced` (see the Builder's save). This sends those plays to the account
 * on sign-in and every time the browser comes back online, so a coach who
 * drew at the field finds them on every device later without saving again.
 */
let running = false;

/** Fired when a play sent here gets its account id, so an open Designer follows it instead of saving a second copy. */
export const PLAY_ID_EVENT = "grid1ronvault:play-id";
export type PlayIdChange = { from: string; to: string };

async function sendOne(play: StoredPlay): Promise<boolean> {
  const payload = {
    name: play.name,
    formation: play.formation,
    playType: play.playType,
    personnel: play.personnel,
    description: play.description,
    tags: play.tags,
    fieldView: play.fieldView,
    scene: play.scene,
    isPublic: play.isPublic,
  };
  const res = play.remote ? await api.updatePlay(play.id, payload) : await api.createPlay(payload);
  const stored = toStoredPlay(res.play);
  // Edited again while this was on its way: keep the newer copy, still unsynced, for the next round (as an account play now).
  const now = store.get().plays.find((p) => p.id === play.id);
  const newer = now && now.updatedAt !== play.updatedAt;
  store.upsertPlay(newer ? { ...now, id: stored.id, remote: true, unsynced: true } : stored);
  if (stored.id !== play.id) {
    store.replacePlayId(play.id, stored.id);
    window.dispatchEvent(new CustomEvent<PlayIdChange>(PLAY_ID_EVENT, { detail: { from: play.id, to: stored.id } }));
  }
  return !newer;
}

/** An account play changed in this browser whose update didn't reach the account: send it on the next round. */
export function markUnsynced(id: string) {
  const play = store.get().plays.find((p) => p.id === id);
  if (play?.remote && !play.unsynced) store.upsertPlay({ ...play, unsynced: true });
}

/**
 * Brings the account's plays into this browser, newer copy winning. Only the
 * Vault used to pull them, so on a new device Playbooks, Wristbands, the Call
 * Sheet and Practice showed empty playbooks until the Vault had been opened.
 */
export async function pullPlays(): Promise<void> {
  const { plays } = await api.listPlays({ scope: "mine" });
  if (plays.length) store.mergeRemotePlays(plays.map(toStoredPlay));
}

/** Sends every unsynced play; returns how many reached the account. */
export async function syncPlays(): Promise<number> {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    for (const play of store.get().plays.filter((p) => p.unsynced)) {
      try {
        if (await sendOne(play)) sent++;
      } catch {
        /* still no signal, or the account said no: it stays in this browser and the next round tries again */
      }
    }
  } finally {
    running = false;
  }
  return sent;
}

/** Mounted once, under the sign-in and toast providers. */
export function PlaySync() {
  const { account } = useAuth();
  const toast = useToast();
  const id = account?.id;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const run = () =>
      flushDeletes()
        .then(syncPlays)
        .then((n) => {
          if (alive && n) toast(n === 1 ? "Back online: 1 play went to your account." : `Back online: ${n} plays went to your account.`);
        });
    // Sign-in: this browser's unsynced work goes up first, then the account's plays come down.
    void run()
      .then(() => (alive ? pullPlays() : undefined))
      .catch(() => {
        /* no signal, or the account said no: the plays in this browser still work, and the Vault pulls again on open */
      });
    const online = () => void run();
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.removeEventListener("online", online);
    };
  }, [id, toast]);

  return null;
}
