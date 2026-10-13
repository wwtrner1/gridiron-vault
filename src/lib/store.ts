import { useSyncExternalStore } from "react";
import type { StoredPlay } from "./types";
import type { Playbook } from "./api";

export type LocalPlaybook = Playbook & { playIds: string[] };

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

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — the session still works in memory */
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
    for (const p of plays) {
      const local = byId.get(p.id);
      if (!local || new Date(p.updatedAt) >= new Date(local.updatedAt)) byId.set(p.id, p);
    }
    commit({ ...state, plays: [...byId.values()] });
  },
  upsertPlaybook(book: LocalPlaybook) {
    const rest = state.playbooks.filter((b) => b.id !== book.id);
    commit({ ...state, playbooks: [book, ...rest] });
  },
  removePlaybook(id: string) {
    commit({ ...state, playbooks: state.playbooks.filter((b) => b.id !== id) });
  },
  upsertSheet(sheet: SheetDoc) {
    const rest = state.sheets.filter((s) => s.id !== sheet.id);
    commit({ ...state, sheets: [sheet, ...rest] });
  },
  removeSheet(id: string) {
    commit({ ...state, sheets: state.sheets.filter((s) => s.id !== id) });
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
