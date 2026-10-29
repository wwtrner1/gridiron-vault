import { api, isOffline } from "./api";

/**
 * A play, playbook or call sheet deleted with no signal is gone from this
 * browser but still on the account, so the next pull used to bring it back.
 * Its account id waits here (per browser) until the delete gets through; the
 * store's merges skip anything listed, so it never reappears in between.
 */
export type DeleteKind = "play" | "playbook" | "sheet";
type Pending = { kind: DeleteKind; id: string };

const KEY = "grid1ronvault.deletes.v1";

function read(): Pending[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && typeof p.kind === "string") : [];
  } catch {
    return [];
  }
}

function write(list: Pending[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: the delete is retried only while this tab is open */
  }
}

/** Account ids of one kind still waiting to be deleted. */
export const pendingDeletes = (kind: DeleteKind) => new Set(read().filter((p) => p.kind === kind).map((p) => p.id));

const send = (p: Pending) =>
  p.kind === "play" ? api.deletePlay(p.id) : p.kind === "playbook" ? api.deletePlaybook(p.id) : api.deleteSheet(p.id);

/** Deletes it from the account now, or as soon as the signal is back. */
export async function deleteFromAccount(kind: DeleteKind, id: string) {
  try {
    await send({ kind, id });
  } catch (e) {
    if (isOffline(e) && !read().some((p) => p.kind === kind && p.id === id)) write([...read(), { kind, id }]);
  }
}

let flushing = false;

/** Sends every waiting delete. One the account answers (done, or already gone) leaves the list; no signal keeps it. */
export async function flushDeletes() {
  if (flushing) return;
  flushing = true;
  try {
    for (const p of read()) {
      try {
        await send(p);
      } catch (e) {
        if (isOffline(e)) break;
      }
      write(read().filter((x) => !(x.kind === p.kind && x.id === p.id)));
    }
  } finally {
    flushing = false;
  }
}
