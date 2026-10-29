import { useEffect } from "react";
import { api, type RemoteSheet } from "./api";
import { store, type SheetDoc } from "./store";
import { useAuth } from "./auth";
import { deleteFromAccount } from "./pendingDeletes";

/**
 * Call Sheets live in the browser first and are copied to the account whenever
 * the coach is signed in, the way playbooks are (see playbookSync.ts). They
 * used to reach the account only through a "Save to account" click and were
 * never read back, so a cleared browser, a second device or the new web
 * address showed no sheets. Now: sign-in pulls the account's sheets, and every
 * change pushes a moment after the last one.
 */
const PUSH_DELAY_MS = 1500;

/** What the account has for each sheet (by local id), so an unchanged one isn't sent again. */
const sent = new Map<string, string>();
/** Sheets whose first save to the account is under way, so a second push waits for it instead of making a copy. */
const creating = new Map<string, Promise<unknown>>();
/** Why each sheet's last push failed, for the Call Sheet's own "Save to account" button. */
const failed = new Map<string, unknown>();

const fingerprint = (s: SheetDoc) => JSON.stringify([s.name, s.columns, s.rows]);

const fromRemote = (r: RemoteSheet): SheetDoc => ({
  id: r.id,
  name: r.name,
  columns: Array.isArray(r.columns) ? (r.columns as SheetDoc["columns"]) : [],
  rows: Array.isArray(r.rows) ? (r.rows as SheetDoc["rows"]) : [],
  updatedAt: r.updatedAt,
  remoteId: r.id,
});

async function pull() {
  const { sheets } = await api.listSheets();
  const remote = sheets.map(fromRemote);
  store.mergeRemoteSheets(remote);
  for (const r of remote) {
    const local = store.get().sheets.find((s) => s.remoteId === r.id);
    if (local) sent.set(local.id, fingerprint(local));
  }
}

async function push() {
  for (const sheet of store.get().sheets) {
    const print = fingerprint(sheet);
    if (sent.get(sheet.id) === print) continue;
    const payload = { name: sheet.name, columns: sheet.columns, rows: sheet.rows };
    if (!sheet.remoteId) {
      const under = creating.get(sheet.id);
      if (under) {
        await under;
        continue;
      }
      const job = api.createSheet(payload);
      creating.set(sheet.id, job.catch(() => undefined));
      try {
        const res = await job;
        store.patchSheet(sheet.id, { remoteId: res.sheet.id, updatedAt: res.sheet.updatedAt });
        sent.set(sheet.id, print);
        failed.delete(sheet.id);
      } catch (e) {
        failed.set(sheet.id, e); // still saved in this browser (a plan limit lands here too); the next change or the signal coming back tries again
      } finally {
        creating.delete(sheet.id);
      }
      continue;
    }
    try {
      const res = await api.updateSheet(sheet.remoteId, payload);
      store.patchSheet(sheet.id, { updatedAt: res.sheet.updatedAt });
      sent.set(sheet.id, print);
      failed.delete(sheet.id);
    } catch (e) {
      failed.set(sheet.id, e);
      // The account doesn't have it (a different account's copy, or removed elsewhere): save it again as new.
      if (e instanceof Error && /isn't in your account/.test(e.message)) store.patchSheet(sheet.id, { remoteId: null });
    }
  }
}

/**
 * Sends this sheet now (the Call Sheet's "Save to account"), through the same
 * push as the automatic sync so the two never both create it. Resolves to the
 * error when it didn't reach the account.
 */
export async function pushSheetNow(id: string): Promise<{ ok: true } | { ok: false; error: unknown }> {
  await push();
  const sheet = store.get().sheets.find((s) => s.id === id);
  if (sheet && sheet.remoteId && sent.get(id) === fingerprint(sheet)) return { ok: true };
  return { ok: false, error: failed.get(id) };
}

/** Mounted once, under the sign-in provider. */
export function SheetSync() {
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
    // A deleted sheet leaves the account too, or the next sign-in would bring it back.
    const offRemoved = store.onSheetRemoved((sheet) => {
      sent.delete(sheet.id);
      if (sheet.remoteId) void deleteFromAccount("sheet", sheet.remoteId);
    });
    // Pull first, so a fresh browser never pushes a blank sheet over the account's.
    pull()
      .catch(() => {
        /* offline: the sheets in this browser still work */
      })
      .finally(() => {
        if (alive) void push();
      });
    // Edits made with no signal go up as soon as it comes back, not only on the next edit.
    const online = () => void push();
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      unsubscribe();
      offRemoved();
    };
  }, [id]);

  return null;
}
