import { useSyncExternalStore } from "react";
import type { StoredPlay } from "./types";
import type { Playbook } from "./api";
import { pendingDeletes } from "./pendingDeletes";

/**
 * `cloudId` is the playbook's id on the account once it has been saved there
 * (see playbookSync.ts), and `cloudOwner` the account it was saved to.
 * `syncKey` (else the id) goes with the first save, so the account never makes
 * two rows for one playbook; a playbook brought back after a delete gets a new one.
 */
export type LocalPlaybook = Playbook & { playIds: string[]; cloudId?: string; cloudOwner?: string; syncKey?: string };

export type SheetColumn = {
  id: string;
  label: string;
  width: number;
  type: "number" | "text" | "choice" | "toggle";
};

export type SheetRow = {
  id: string;
  cells: Record<string, string>;
  colors: Record<string, string>;
  playId?: string | null;
};

export type SheetDoc = {
  id: string;
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  updatedAt: string;
  remoteId?: string | null;
};

type State = {
  plays: StoredPlay[];
  playbooks: LocalPlaybook[];
  sheets: SheetDoc[];
};

const KEY = "snapline.workspace.v1";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const removedBooks = new Set<(book: LocalPlaybook) => void>();
const removedSheets = new Set<(sheet: SheetDoc) => void>();

const empty: State = { plays: [], playbooks: [], sheets: [] };

function read(): State {
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as State) };
  } catch {
    return empty;
  }
}

let state: State = read();
const listeners = new Set<() => void>();

/*
 * When the browser refuses the write (storage full, or blocked in a private
 * window), the session still works in memory, but anything new is gone when
 * the tab closes. StorageWatch (App.tsx) tells the coach once.
 */
const storageListeners = new Set<() => void>();
let storageFailed = false;
export const onStorageFailed = (l: () => void) => {
  storageListeners.add(l);
  if (storageFailed) l();
  return () => {
    storageListeners.delete(l);
  };
};

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageFailed = false;
  } catch {
    if (!storageFailed) {
      storageFailed = true;
      storageListeners.forEach((l) => l());
    }
  }
  listeners.forEach((l) => l());
}

export const store = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  upsertPlay(play: StoredPlay) {
    const rest = state.plays.filter((p) => p.id !== play.id);
    commit({ ...state, plays: [play, ...rest] });
  },
  removePlay(id: string) {
    commit({
      ...state,
      plays: state.plays.filter((p) => p.id !== id),
      playbooks: state.playbooks.map((b) => ({ ...b, playIds: b.playIds.filter((p) => p !== id) })),
    });
  },
  mergeRemotePlays(plays: StoredPlay[]) {
    const byId = new Map(state.plays.map((p) => [p.id, p]));
    const deleted = pendingDeletes("play");
    for (const p of plays) {
      if (deleted.has(p.id)) continue;
      const local = byId.get(p.id);
      if (!local || new Date(p.updatedAt) >= new Date(local.updatedAt)) byId.set(p.id, p);
    }
    commit({ ...state, plays: [...byId.values()] });
  },
  /** A play saved to the account gets a new id; keep it in every playbook it was filed in. */
  replacePlayId(oldId: string, newId: string) {
    commit({
      ...state,
      plays: state.plays.filter((p) => p.id !== oldId),
      playbooks: state.playbooks.map((b) =>
        b.playIds.includes(oldId) ? { ...b, playIds: [...new Set(b.playIds.map((p) => (p === oldId ? newId : p)))] } : b,
      ),
    });
  },
  /** Change a playbook without marking it edited (used by sync, which is not the coach editing). */
  patchPlaybook(id: string, patch: Partial<LocalPlaybook>) {
    commit({ ...state, playbooks: state.playbooks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  },
  /**
   * Playbooks pulled from the account: new ones are added, and a cloud copy newer than the local one replaces it.
   * With `owner` (the account the list came from), a playbook this browser saved to that account and the
   * account no longer has was removed on another device, so it goes here too instead of being saved again.
   */
  mergeRemotePlaybooks(remote: LocalPlaybook[], owner?: string) {
    const books = [...state.playbooks];
    const deleted = pendingDeletes("playbook");
    for (const r of remote) {
      if (deleted.has(r.id)) continue;
      const at = books.findIndex((b) => b.cloudId === r.id || (!b.cloudId && (b.id === r.id || (!!r.clientId && (b.syncKey ?? b.id) === r.clientId))));
      const stamp = owner ? { cloudOwner: owner } : {};
      if (at < 0) {
        books.push({ ...r, cloudId: r.id, ...stamp });
        continue;
      }
      const local = books[at];
      if (new Date(r.updatedAt ?? 0) > new Date(local.updatedAt ?? 0)) {
        // Plays only in this browser (never saved to the account) stay filed where they were.
        const keep = local.playIds.filter((p) => !UUID.test(p) && !r.playIds.includes(p));
        books[at] = { ...local, name: r.name, description: r.description, color: r.color, isPublic: r.isPublic, updatedAt: r.updatedAt, playIds: [...r.playIds, ...keep], cloudId: r.id, ...stamp };
      } else {
        books[at] = { ...local, cloudId: r.id, ...stamp };
      }
    }
    const onAccount = new Set(remote.map((r) => r.id));
    const kept = owner ? books.filter((b) => !b.cloudId || onAccount.has(b.cloudId) || (b.cloudOwner && b.cloudOwner !== owner)) : books;
    commit({ ...state, playbooks: kept });
  },
  /** Take playbooks out of this browser only (the account already doesn't have them): no account delete is sent. */
  dropPlaybooks(ids: string[]) {
    const gone = new Set(ids);
    commit({ ...state, playbooks: state.playbooks.filter((b) => !gone.has(b.id)) });
  },
  upsertPlaybook(book: LocalPlaybook) {
    const had = state.playbooks.find((b) => b.id === book.id);
    const rest = state.playbooks.filter((b) => b.id !== book.id);
    // A copy of the playbook read before sync gave it its account id (a form, a long import) keeps that link, or the next
    // sync would save it to the account a second time and the first copy would come back as a duplicate.
    const link = had?.cloudId && !book.cloudId ? { cloudId: had.cloudId, cloudOwner: had.cloudOwner, syncKey: had.syncKey } : {};
    // Stamped here so a coach's edit always reads as newer than the cloud copy when sync compares them.
    commit({ ...state, playbooks: [{ ...book, ...link, updatedAt: new Date().toISOString() }, ...rest] });
  },
  /** Undo of a delete: the account's copy is gone (or going), so it goes up again as a new playbook. */
  restorePlaybook(book: LocalPlaybook) {
    const syncKey = `${book.id}.${Date.now().toString(36)}`;
    store.upsertPlaybook({ ...book, cloudId: undefined, cloudOwner: undefined, syncKey });
  },
  removePlaybook(id: string) {
    const gone = state.playbooks.find((b) => b.id === id);
    commit({ ...state, playbooks: state.playbooks.filter((b) => b.id !== id) });
    if (gone) removedBooks.forEach((cb) => cb(gone));
  },
  /** Called when the coach removes a playbook (not when the whole local workspace is cleared). */
  onPlaybookRemoved(cb: (book: LocalPlaybook) => void) {
    removedBooks.add(cb);
    return () => removedBooks.delete(cb);
  },
  upsertSheet(sheet: SheetDoc) {
    const rest = state.sheets.filter((s) => s.id !== sheet.id);
    commit({ ...state, sheets: [sheet, ...rest] });
  },
  /** Change a call sheet without marking it edited (used by sync, which is not the coach editing). */
  patchSheet(id: string, patch: Partial<SheetDoc>) {
    commit({ ...state, sheets: state.sheets.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },
  /** Call sheets pulled from the account: new ones are added, and a cloud copy newer than the local one replaces it. */
  mergeRemoteSheets(remote: SheetDoc[]) {
    const sheets = [...state.sheets];
    const deleted = pendingDeletes("sheet");
    for (const r of remote) {
      if (r.remoteId && deleted.has(r.remoteId)) continue;
      const at = sheets.findIndex((s) => s.remoteId === r.remoteId || s.id === r.remoteId);
      if (at < 0) {
        sheets.push(r);
        continue;
      }
      if (new Date(r.updatedAt) > new Date(sheets[at].updatedAt)) sheets[at] = { ...r, id: sheets[at].id };
    }
    commit({ ...state, sheets });
  },
  removeSheet(id: string) {
    const gone = state.sheets.find((s) => s.id === id);
    commit({ ...state, sheets: state.sheets.filter((s) => s.id !== id) });
    if (gone) removedSheets.forEach((cb) => cb(gone));
  },
  /** Called when the coach deletes a call sheet (not when the whole local workspace is cleared). */
  onSheetRemoved(cb: (sheet: SheetDoc) => void) {
    removedSheets.add(cb);
    return () => removedSheets.delete(cb);
  },
  reset() {
    commit(empty);
  },
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(empty),
  );
}

/** The saved play a typed name means, if exactly one matches (case and spacing ignored). */
export function playNamed(plays: StoredPlay[], name: string): StoredPlay | undefined {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return undefined;
  const hits = plays.filter((p) => p.name.trim().toLowerCase().replace(/\s+/g, " ") === key);
  return hits.length === 1 ? hits[0] : undefined;
}
