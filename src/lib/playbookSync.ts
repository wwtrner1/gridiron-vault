import { useEffect } from "react";
import { api } from "./api";
import { store, UUID, type LocalPlaybook } from "./store";
import { useAuth } from "./auth";
import { deleteFromAccount } from "./pendingDeletes";

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

const fingerprint = (b: LocalPlaybook) =>
  JSON.stringify([b.name, b.description, b.color, b.isPublic, b.playIds.filter((p) => UUID.test(p))]);

const current = (id: string) => store.get().playbooks.find((b) => b.id === id);

/*
 * Pulls and pushes run one at a time, in order. They used to overlap: a push
 * that had read the list before another push gave a playbook its cloud id
 * created it a second time, and a pull that answered after a create could
 * miss the new row. Each step now reads the playbook as the store has it at
 * that moment.
 */
let queue: Promise<unknown> = Promise.resolve();
let pushWaiting = false;
const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

async function pull(account: string) {
  const { playbooks, members, owner } = await api.listPlaybooks();
  const byBook = new Map<string, string[]>();
  for (const m of [...members].sort((a, b) => a.sortOrder - b.sortOrder)) {
    byBook.set(m.playbookId, [...(byBook.get(m.playbookId) ?? []), m.playId]);
  }
  const remote: LocalPlaybook[] = playbooks.map((b) => ({ ...b, playIds: byBook.get(b.id) ?? [] }));
  // Only a list that says whose it is can take a playbook out of this browser.
  store.mergeRemotePlaybooks(remote, owner && owner === account ? owner : undefined);
  for (const r of remote) sent.set(r.id, fingerprint(r));
}

async function pushNow(account: string) {
  for (const { id } of store.get().playbooks) {
    const book = current(id);
    if (!book) continue;
    if (!book.cloudId) {
      try {
        // The browser's id goes along, so a create the account already has comes back as that row, not a copy.
        const { playbook } = await api.createPlaybook({ name: book.name, description: book.description, color: book.color, isPublic: book.isPublic, clientId: book.syncKey ?? book.id });
        const now = current(id);
        if (!now) {
          // Deleted while it was being saved: the account's copy goes too, or the next pull would bring it back.
          await deleteFromAccount("playbook", playbook.id);
          continue;
        }
        store.patchPlaybook(id, { cloudId: playbook.id, cloudOwner: account });
        await api.updatePlaybook(playbook.id, { playIds: now.playIds.filter((p) => UUID.test(p)) });
        sent.set(playbook.id, fingerprint(now));
      } catch {
        /* still saved in this browser; the next change tries again */
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
      if (!(e instanceof Error && /isn't in your account/.test(e.message))) continue;
      sent.delete(book.cloudId);
      if (book.cloudOwner && book.cloudOwner !== account) {
        // Another account's copy in this browser: save it to this account as new.
        store.patchPlaybook(id, { cloudId: undefined, cloudOwner: undefined });
      } else {
        // Removed from this account on another device: it stays removed here too.
        store.dropPlaybooks([id]);
      }
    }
  }
}

/** One push at a time; changes made during a push are sent by one more push after it. */
function push(account: string) {
  if (pushWaiting) return queue;
  pushWaiting = true;
  return inTurn(() => {
    pushWaiting = false;
    return pushNow(account);
  });
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
      timer = window.setTimeout(() => void push(id), PUSH_DELAY_MS);
    });
    // Removing a playbook removes it from the account too. Clearing the local workspace does not.
    const unwatch = store.onPlaybookRemoved((book) => {
      if (!book.cloudId) return;
      sent.delete(book.cloudId);
      void deleteFromAccount("playbook", book.cloudId);
    });

    // Pull first, so a fresh browser never pushes an empty list over the account's playbooks.
    void inTurn(() => pull(id))
      .catch(() => {
        /* offline: the playbooks in this browser still work */
      })
      .finally(() => {
        if (alive) void push(id);
      });

    // Changes made with no signal go up as soon as it comes back, not only on the next edit.
    const online = () => void push(id);
    window.addEventListener("online", online);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      unsubscribe();
      unwatch();
    };
  }, [id]);

  return null;
}
