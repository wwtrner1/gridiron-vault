import { useEffect, useState, useSyncExternalStore } from "react";
import { api, type RemoteSheet } from "./api";
import { store, type SheetDoc } from "./store";
import { useAuth } from "./auth";
import { deleteFromAccount } from "./pendingDeletes";
import { canon } from "./live";
import { isStockSheetName, isUntouchedSheet } from "./sheet";

/**
 * Call Sheets live in the browser first and are copied to the account whenever
 * the coach is signed in, the way playbooks are (see playbookSync.ts). Sign-in
 * pulls the account's sheets, and every change pushes a moment after the last
 * one. What keeps one sheet from becoming many:
 *
 * - Pulls and pushes run one at a time, and nothing is sent before the account's
 *   own list has been read, so a fresh browser never sends a blank sheet over
 *   the coach's real ones.
 * - A first save carries the browser's id for the sheet (`clientId`), and the
 *   account answers with the row that id already made, so a retry, a lost
 *   answer or a second tab or device never makes a second row.
 * - A sheet the account no longer has was deleted on another device: it is
 *   taken off this browser too, not saved again as new.
 * - The blank "Call Sheet" the page lays out for a coach with none is never
 *   sent on its own (the coach's own "Save sheet" does send it).
 */
const PUSH_DELAY_MS = 1500;
/** How long the Call Sheet page waits for the account before laying a first sheet out anyway (a hung request). */
const READY_WAIT_MS = 6000;

/** What the account has for each sheet (by local id), so an unchanged one isn't sent again. */
const sent = new Map<string, string>();
/** Why each sheet's last push failed, for the Call Sheet's own "Save sheet" button. */
const failed = new Map<string, unknown>();
/** Sheets the coach pressed "Save sheet" on: sent even while they are still the blank starter sheet. */
const wanted = new Set<string>();
/** Sheets a push found deleted on another device (and took off this browser), for the Save button's words. */
const removed = new Set<string>();

/** Key order isn't kept by the database, so equal sheets are compared by sorted JSON. */
const fingerprint = (s: Pick<SheetDoc, "name" | "columns" | "rows">) => canon([s.name, s.columns, s.rows]);

const current = (id: string) => store.get().sheets.find((s) => s.id === id);

const fromRemote = (r: RemoteSheet): SheetDoc => ({
  id: r.id,
  name: r.name,
  columns: Array.isArray(r.columns) ? (r.columns as SheetDoc["columns"]) : [],
  rows: Array.isArray(r.rows) ? (r.rows as SheetDoc["rows"]) : [],
  updatedAt: r.updatedAt,
  remoteId: r.id,
  syncKey: r.clientId ?? undefined,
});

/* ----------------------------------------------- has the account been read? --- */

/** The account whose sheets this page has read (or failed to read), so the Call Sheet page knows when it may lay a first sheet out. */
let settledFor: string | null = null;
let pulledFor: string | null = null;
const settleListeners = new Set<() => void>();
const settle = (account: string | null, pulled: boolean) => {
  settledFor = account;
  pulledFor = pulled ? account : null;
  settleListeners.forEach((l) => l());
};

/**
 * True once the Call Sheet page may lay out a first sheet: signed out, or signed in and the account's sheets have
 * arrived (or couldn't be reached: no signal, or a slow answer). Laying one out sooner is how every new browser
 * used to add one more blank "Call Sheet" to the account.
 */
export function useSheetsReady(): boolean {
  const { account, status } = useAuth();
  const settled = useSyncExternalStore(
    (l) => {
      settleListeners.add(l);
      return () => settleListeners.delete(l);
    },
    () => settledFor,
    () => null,
  );
  const [waited, setWaited] = useState(false);
  const ready = status === "ready" && (!account || settled === account.id);
  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setWaited(true), READY_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [ready]);
  return ready || waited;
}

/* ------------------------------------------------------------ pull and push --- */

/*
 * Pulls and pushes run one at a time, in order. A push that had read the list before another push gave a sheet its
 * account id created it a second time, and a pull that answered after a create could miss the new row. Each step
 * reads the sheet as the store has it at that moment.
 */
let queue: Promise<unknown> = Promise.resolve();
let pushWaiting = false;
const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

async function pull(account: string) {
  const { sheets, owner } = await api.listSheets();
  const remote = sheets.map(fromRemote);
  // Only a list that says whose it is can take a sheet out of this browser.
  store.mergeRemoteSheets(remote, owner && owner === account ? owner : undefined);
  for (const r of remote) {
    const local = store.get().sheets.find((s) => s.remoteId === r.remoteId);
    // What the account holds, so a local copy that is newer is sent and an equal one isn't.
    if (local) sent.set(local.id, fingerprint(r));
  }
  settle(account, true);
}

/** Reads the account's sheets once per page visit before anything is sent; a failed read (no signal) sends nothing. */
async function ensurePulled(account: string) {
  if (pulledFor === account) return;
  try {
    await pull(account);
  } catch (e) {
    settle(account, false);
    throw e;
  }
}

async function pushNow(account: string) {
  try {
    await ensurePulled(account);
  } catch (e) {
    for (const s of store.get().sheets) if (!sent.has(s.id) || fingerprint(s) !== sent.get(s.id)) failed.set(s.id, e);
    return;
  }
  for (const { id } of store.get().sheets) {
    const sheet = current(id);
    if (!sheet) continue;
    const print = fingerprint(sheet);
    if (sheet.remoteId && sent.get(id) === print) continue;
    const payload = { name: sheet.name, columns: sheet.columns, rows: sheet.rows };
    if (!sheet.remoteId) {
      // The page's own starter sheet stays in this browser until the coach does something with it.
      if (isUntouchedSheet(sheet) && isStockSheetName(sheet.name) && !wanted.has(id)) continue;
      try {
        // The browser's id goes along, so a create the account already has comes back as that row, not a copy.
        const { sheet: row } = await api.createSheet({ ...payload, clientId: sheet.syncKey ?? sheet.id });
        if (!current(id)) {
          // Deleted while it was being saved: the account's copy goes too, or the next pull would bring it back.
          await deleteFromAccount("sheet", row.id);
          continue;
        }
        store.patchSheet(id, { remoteId: row.id, remoteOwner: account, updatedAt: row.updatedAt });
        failed.delete(id);
        wanted.delete(id);
        if (fingerprint(fromRemote(row)) === print) sent.set(id, print);
        else {
          // The account already had a row for this browser id, from an earlier copy of the sheet: bring it up to date.
          const res = await api.updateSheet(row.id, payload);
          store.patchSheet(id, { updatedAt: res.sheet.updatedAt });
          sent.set(id, print);
        }
      } catch (e) {
        failed.set(id, e); // still saved in this browser (a plan limit lands here too); the next change or the signal coming back tries again
      }
      continue;
    }
    try {
      const res = await api.updateSheet(sheet.remoteId, payload);
      store.patchSheet(id, { updatedAt: res.sheet.updatedAt, remoteOwner: account });
      sent.set(id, print);
      failed.delete(id);
    } catch (e) {
      failed.set(id, e);
      if (!(e instanceof Error && /isn't in your account/.test(e.message))) continue;
      sent.delete(id);
      if (sheet.remoteOwner && sheet.remoteOwner !== account) {
        // Another account's copy in this browser: save it to this account as new.
        store.patchSheet(id, { remoteId: null, remoteOwner: undefined });
      } else {
        // Not on this account any more: it was deleted on another device, so it stays deleted here too.
        // (Reading the list again says the same and also takes it off this browser.)
        try {
          await pull(account);
        } catch {
          /* no signal: the next pull decides */
        }
        if (!current(id)) removed.add(id);
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

export type PushResult = { ok: true } | { ok: false; error: unknown; removed?: boolean };

/**
 * Sends this sheet now (the Call Sheet's "Save sheet"), through the same push as the automatic sync so the two never
 * both create it. Resolves to the error when it didn't reach the account, or `removed` when the account had deleted
 * it on another device.
 */
export async function pushSheetNow(id: string, account: string): Promise<PushResult> {
  wanted.add(id);
  removed.delete(id);
  await push(account);
  if (removed.has(id)) {
    removed.delete(id);
    wanted.delete(id);
    return { ok: false, error: undefined, removed: true };
  }
  const sheet = current(id);
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
    settle(null, false);
    const unsubscribe = store.subscribe(() => {
      if (!alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void push(id), PUSH_DELAY_MS);
    });
    // A deleted sheet leaves the account too, or the next sign-in would bring it back.
    const offRemoved = store.onSheetRemoved((sheet) => {
      sent.delete(sheet.id);
      wanted.delete(sheet.id);
      if (sheet.remoteId) void deleteFromAccount("sheet", sheet.remoteId);
    });
    // Pull first, so a fresh browser never pushes a blank sheet over the account's.
    void inTurn(() => ensurePulled(id))
      .catch(() => {
        /* offline: the sheets in this browser still work */
      })
      .finally(() => {
        if (alive) void push(id);
      });
    // Edits made with no signal go up as soon as it comes back, not only on the next edit (after reading the account again).
    const online = () => void inTurn(() => ensurePulled(id)).catch(() => undefined).finally(() => void push(id));
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
