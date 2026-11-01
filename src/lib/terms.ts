import { useSyncExternalStore } from "react";
import { uid } from "./types";
import type { StoredPlay } from "./types";

/**
 * Playbook language, from the Grid1ron Design canvas: the coach's own words
 * for concepts, formations and tags. Griddy (formerly the Play assistant)
 * reads these with every message, and new ones are suggested from the words
 * already used in the Vault.
 */
export type TermType = "concept" | "formation" | "tag" | "gap";
export type TermScope = "you" | "staff" | "shared";

export type Term = {
  id: string;
  term: string;
  means: string;
  type: TermType;
  /** Where it came from, e.g. "Starter glossary" or "You added". */
  source: string;
  added: string;
  scope: TermScope;
};

const seed = (term: string, means: string, type: TermType): Term => ({
  id: `glossary-${term.toLowerCase().replace(/\s+/g, "-")}`,
  term,
  means,
  type,
  source: "Starter glossary",
  added: "2026-09-01",
  scope: "shared",
});

/** Football staples every coach starts with; editable like any other term. */
export const STARTER_GLOSSARY: Term[] = [
  seed("Flood", "Three levels to one side: corner, out, flat", "concept"),
  seed("Mesh", "Two shallow crossers passing at about four yards", "concept"),
  seed("Smash", "Hitch underneath, corner over the top", "concept"),
  seed("Scissors", "Outside post, inside corner — the routes cross", "concept"),
  seed("Dagger", "Clear out with a go, then a dig behind the linebacker", "concept"),
  seed("Levels", "Two in-breaking routes at different depths", "concept"),
  seed("Trips Right", "X left · H, Y, Z right", "formation"),
  seed("Bunch", "Three receivers tight together for natural rubs", "formation"),
  seed("Stack", "Two receivers aligned front-to-back", "formation"),
  seed("Twins", "Two receivers to the same side", "formation"),
  seed("Bubble", "Named receiver takes a bubble screen", "tag"),
  seed("Motion", "Player moves before the snap; dashed line on the diagram", "tag"),
];

/** Gaps, line techniques and defensive jobs (after the standard letter-and-number system; staffs differ on the tight-end techniques). */
export const GAP_GLOSSARY: Term[] = [
  seed("A gap", "Between the center and a guard, each side", "gap"),
  seed("B gap", "Between a guard and a tackle, each side", "gap"),
  seed("C gap", "Between the tackle and the tight end; with no tight end, just outside the tackle", "gap"),
  seed("D gap", "Outside the tight end", "gap"),
  seed("E gap", "Outside a wing or second tight end, if your staff uses it", "gap"),
  seed("0 technique", "Head up on the center; often covers both A gaps", "gap"),
  seed("1 technique", "Shaded on the center's shoulder, A gap", "gap"),
  seed("2i technique", "Inside shoulder of the guard, A gap", "gap"),
  seed("2 technique", "Head up on the guard", "gap"),
  seed("3 technique", "Outside shoulder of the guard, B gap", "gap"),
  seed("4i technique", "Inside shoulder of the tackle, B gap", "gap"),
  seed("4 technique", "Head up on the tackle", "gap"),
  seed("5 technique", "Outside shoulder of the tackle, C gap", "gap"),
  seed("6 technique", "Head up on the tight end", "gap"),
  seed("7 technique", "Inside shoulder of the tight end, C gap in many systems", "gap"),
  seed("9 technique", "Outside shoulder of the tight end, D gap", "gap"),
  seed("One-gap", "The defender owns one gap and attacks it", "gap"),
  seed("Two-gap", "The defender reads the blocker and owns either gap beside him", "gap"),
  seed("Contain", "Keep the ball carrier from getting outside you", "gap"),
  seed("Spill", "Force the ball carrier to bounce wide of the gap you fill", "gap"),
  seed("Hole numbers", "Offense's names for the gaps: even on the right (A 2, B 4, C 6, outside 8), odd on the left; some staffs flip it", "gap"),
];

export const TYPE_LABEL: Record<TermType, string> = { concept: "Concept", formation: "Formation", tag: "Tag", gap: "Gap & technique" };
export const SCOPE_LABEL: Record<TermScope, string> = { you: "Just you", staff: "You + staff", shared: "Shared glossary" };

const KEY = "grid1ronvault.terms.v1";
type State = { terms: Term[]; ignored: string[]; seeded?: string[] };

function read(): State {
  const all = [...STARTER_GLOSSARY, ...GAP_GLOSSARY];
  const fallback: State = { terms: all, ignored: [], seeded: all.map((t) => t.id) };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as State;
    const stored = { ...fallback, ...parsed };
    // A coach who saved terms before the gap glossary existed gets it once; one they delete stays deleted.
    const seen = new Set(parsed.seeded ?? STARTER_GLOSSARY.map((t) => t.id));
    const fresh = all.filter((t) => !seen.has(t.id));
    return { ...stored, terms: [...stored.terms, ...fresh], seeded: all.map((t) => t.id) };
  } catch {
    return fallback;
  }
}

let state = read();
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — terms still work this session */
  }
  listeners.forEach((l) => l());
}

const norm = (s: string) => s.trim().toLowerCase();

/** Today as YYYY-MM-DD in the coach's own time zone. */
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const termStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  save(t: Omit<Term, "id" | "added" | "source"> & Partial<Pick<Term, "id" | "source">>) {
    const existing = t.id ? state.terms.find((x) => x.id === t.id) : undefined;
    const next: Term = existing
      ? { ...existing, ...t, term: t.term.trim(), means: t.means.trim() }
      : {
          ...t,
          id: uid("term"),
          term: t.term.trim(),
          means: t.means.trim(),
          source: t.source ?? "You added",
          added: localDate(),
        };
    commit({
      ...state,
      terms: existing ? state.terms.map((x) => (x.id === next.id ? next : x)) : [next, ...state.terms],
      ignored: state.ignored.filter((w) => w !== norm(next.term)),
    });
  },
  remove(id: string) {
    commit({ ...state, terms: state.terms.filter((t) => t.id !== id) });
  },
  ignore(word: string) {
    commit({ ...state, ignored: [...state.ignored, norm(word)] });
  },
  exists: (word: string) => state.terms.some((t) => norm(t.term) === norm(word)),
};

export function useTerms(): State {
  return useSyncExternalStore(termStore.subscribe, termStore.get, termStore.get);
}

/** How many Vault plays use a term in their name, formation or labels. */
export function usesOf(term: string, plays: StoredPlay[]): number {
  const t = norm(term);
  const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
  return plays.filter((p) => re.test([p.name, p.formation, ...p.tags].join(" · ").toLowerCase())).length;
}

const STOP = new Set(["starter", "base", "install", "quick", "run", "pass", "the", "and", "right", "left", "copy", "play", "untitled"]);

/**
 * Words the coach keeps using that are not terms yet: play-name concepts
 * ("Trips — Dagger" → Dagger) and labels, seen in at least two plays.
 */
export function suggestTerms(plays: StoredPlay[], known: Term[], ignored: string[]): { word: string; count: number; type: TermType }[] {
  const counts = new Map<string, { word: string; count: number; type: TermType }>();
  const bump = (word: string, type: TermType) => {
    const w = word.trim();
    const k = norm(w);
    if (k.length < 3 || STOP.has(k) || /^\d/.test(k)) return;
    const cur = counts.get(k) ?? { word: w.replace(/^./, (c) => c.toUpperCase()), count: 0, type };
    cur.count += 1;
    counts.set(k, cur);
  };
  for (const p of plays) {
    // Each word counts once per play, whether it is in the name, the labels or both.
    const words = new Map<string, { word: string; type: TermType }>();
    for (const tag of p.tags) words.set(norm(tag), { word: tag, type: "tag" });
    const concept = p.name.split(/\s[—–-]\s/)[1]?.replace(/\(copy\)/i, "").trim();
    if (concept) words.set(norm(concept), { word: concept, type: "concept" });
    for (const { word, type } of words.values()) bump(word, type);
  }
  const knownSet = new Set(known.map((t) => norm(t.term)));
  return [...counts.entries()]
    .filter(([k, v]) => v.count >= 2 && !knownSet.has(k) && !ignored.includes(k))
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count);
}
