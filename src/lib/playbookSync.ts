import { useEffect } from "react";
import { api } from "./api";
import { store, UUID, type LocalPlaybook } from "./store";
import { useAuth } from "./auth";

/**
 * Playbooks live in the browser first, like plays, and are copied to the
 * account whenever the coach is signed in. Plays always came back from the
 * account on sign-in; playbooks used to stay in the one browser, so a cleared
 * browser, a second device or the new web address showed the plays with no
 * playbooks. Now: sign in pulls the account's playbooks, every change pushes
 * (a moment after the last one), and removing a playbook removes it from the
 * account straight away.
 */
const PUSH_DELAY_MS = 1500;

/** What the account has for each playbook (by cloud id), so an unchanged one isn't sent again. */
const sent = new Map<string, string>();
/** Playbooks whose first save to the account is under way. */
const creating = new Set<string>();

const fingerprint = (b: LocalPlaybook) =>
  JSON.stringify([b.name, b.description, b.color, b.isPublic, b.playIds.filter((p) => UUID.test(p))]);

async function pull() {
  const { playbooks, members } = await api.listPlaybooks();
  const byBook = new Map<string, string[]>();
  for (const m of [...members].sort((a, b) => a.sortOrder - b.sortOrder)) {
    byBook.set(m.playbookId, [...(byBook.get(m.playbookId) ?? []), m.playId]);
  }
  const remote: LocalPlaybook[] = playbooks.map((b) => ({ ...b, playIds: byBook.get(b.id) ?? [] }));
  store.mergeRemotePlaybooks(remote);
  for (const r of remote) sent.set(r.id, fingerprint(r));
}

async function push() {
  for (const book of store.get().playbooks) {
    if (!book.cloudId) {
      if (creating.has(book.id)) continue;
      creating.add(book.id);
      try {
        const { playbook } = await api.createPlaybook({ name: book.name, description: book.description, color: book.color, isPublic: book.isPublic });
        store.patchPlaybook(book.id, { cloudId: playbook.id });
        await api.updatePlaybook(playbook.id, { playIds: book.playIds.filter((p) => UUID.test(p)) });
        sent.set(playbook.id, fingerprint(book));
      } catch {
        /* still saved in this browser; the next change tries again */
      } finally {
        creating.delete(book.id);
      }
      continue;
    }
    const print = fingerprint(book);
    if (sent.get(book.cloudId) === print) continue;
    try {
      await api.updatePlaybook(book.cloudId, {
        name: book.name,
        description: book.description,
        color: book.color,
        isPublic: book.isPublic,
        playIds: book.playIds.filter((p) => UUID.test(p)),
      });
      sent.set(book.cloudId, print);
    } catch (e) {
      // The account no longer has it (removed on another device, or a different account's copy): save it again as new.
      if (e instanceof Error && /isn't in your account/.test(e.message)) store.patchPlaybook(book.id, { cloudId: undefined });
    }
  }
}

/** Mounted once, under the sign-in provider. */
export function PlaybookSync() {
  const { account } = useAuth();
  const id = account?.id;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: number | undefined;
    const unsubscribe = store.subscribe(() => {
      if (!alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void push(), PUSH_DELAY_MS);
    });
    // Removing a playbook removes it from the account too. Clearing the local workspace does not.
    const unwatch = store.onPlaybookRemoved((book) => {
      if (!book.cloudId) return;
      sent.delete(book.cloudId);
      void api.deletePlaybook(book.cloudId).catch(() => {});
    });

    // Pull first, so a fresh browser never pushes an empty list over the account's playbooks.
    pull()
      .catch(() => {
        /* offline: the playbooks in this browser still work */
      })
      .finally(() => {
        if (alive) void push();
      });

    return () => {
      alive = false;
      window.clearTimeout(timer);
      unsubscribe();
      unwatch();
    };
  }, [id]);

  return null;
}
