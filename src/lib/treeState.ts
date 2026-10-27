import { useSyncExternalStore } from "react";

/**
 * Which folders are open in the playbook tree (side menu and the Designer's
 * Plays tab share it), remembered in this browser. Keys are local playbook
 * ids, plus "unfiled" for plays in no playbook.
 */
const KEY = "grid1ronvault.tree.v1";
let open: ReadonlySet<string> = (() => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set<string>();
  }
})();
const listeners = new Set<() => void>();

function commit(next: Set<string>) {
  open = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...open]));
  } catch {
    /* storage blocked — the folders still stay open this session */
  }
  listeners.forEach((l) => l());
}

export const treeState = {
  get: () => open,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(key: string, on: boolean) {
    if (open.has(key) === on) return;
    const next = new Set(open);
    if (on) next.add(key);
    else next.delete(key);
    commit(next);
  },
  toggle(key: string) {
    treeState.set(key, !open.has(key));
  },
  setAll(keys: string[], on: boolean) {
    const next = new Set(open);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    commit(next);
  },
};

export const useTreeOpen = () => useSyncExternalStore(treeState.subscribe, treeState.get, treeState.get);
