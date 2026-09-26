import { useSyncExternalStore } from "react";
import type { AiKind } from "./plan";

/**
 * AI calls this browser has made this month, for the plan limits in plan.ts.
 * The server keeps its own daily count per coach; this one only drives the
 * "you've used your N this month" message.
 */
const KEY = "grid1ronvault.aiUsage.v1";
type State = { month: string; assistant: number; photo: number };

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function read(): State {
  const fresh = { month: thisMonth(), assistant: 0, photo: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as State) : fresh;
    return s.month === fresh.month ? { ...fresh, ...s } : fresh;
  } catch {
    return fresh;
  }
}

let state = read();
const listeners = new Set<() => void>();

export const aiUsage = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  used: (kind: AiKind) => (state.month === thisMonth() ? state[kind] : 0),
  add(kind: AiKind) {
    const base = state.month === thisMonth() ? state : { month: thisMonth(), assistant: 0, photo: 0 };
    state = { ...base, [kind]: base[kind] + 1 };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage blocked — the count still holds this session */
    }
    listeners.forEach((l) => l());
  },
};

export const useAiUsage = () => useSyncExternalStore(aiUsage.subscribe, aiUsage.get, aiUsage.get);
