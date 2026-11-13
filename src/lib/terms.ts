import { useEffect, useRef, useSyncExternalStore } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { uid } from "./types";
import type { StoredPlay } from "./types";
import { cleanTerm, cleanTerms, GAP_GLOSSARY, STARTER_BY_ID, STARTER_GLOSSARY, type StaffTerms, type Term, type TermsState, type TermType } from "./termsData";

export * from "./termsData";

/**
 * Playbook language, from the Grid1ron Design canvas: the coach's own words
 * for concepts, formations and tags. Griddy (formerly the Play assistant)
 * reads these with every message, and new ones are suggested from the words
 * already used in the Vault. Starter terms are the coach's to rename, reword
 * or delete like any other; `TermSync` carries the list to the account, so
 * every device speaks the same language.
 */
const KEY = "grid1ronvault.terms.v1";
type State = TermsState;
const ALL = [...STARTER_GLOSSARY, ...GAP_GLOSSARY];

/** Starter terms this list has never been offered get added once; one the coach deleted stays deleted. */
function withSeeds(s: State): State {
  const seen = new Set(s.seeded ?? STARTER_GLOSSARY.map((t) => t.id));
  const fresh = ALL.filter((t) => !seen.has(t.id) && !s.terms.some((x) => x.id === t.id));
  return { ...s, terms: [...s.terms, ...fresh], seeded: [...new Set([...(s.seeded ?? []), ...ALL.map((t) => t.id)])] };
}

function read(): State {
  const fallback: State = { terms: ALL, ignored: [], seeded: ALL.map((t) => t.id) };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as State;
    return withSeeds({ ...cleanTerms(parsed), seeded: parsed.seeded });
  } catch {
    return fallback;
  }
}

let state = read();
const listeners = new Set<(from: "local" | "account") => void>();

function write(next: State, from: "local" | "account") {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — terms still work this session */
  }
  listeners.forEach((l) => l(from));
}

/** A change made here: stamped now, so it wins over older copies on other devices. */
const commit = (next: State) => write({ ...next, updatedAt: new Date().toISOString() }, "local");

const norm = (s: string) => s.trim().toLowerCase();

/** Today as YYYY-MM-DD in the coach's own time zone. */
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The starter wording a term began with, when it is a starter term the coach has changed. */
export function starterOriginal(t: Term): Term | null {
  const seed = STARTER_BY_ID.get(t.id);
  if (!seed) return null;
  return seed.term !== t.term || seed.means !== t.means || seed.type !== t.type ? seed : null;
}

export const termStore = {
  get: () => state,
  subscribe(listener: (from: "local" | "account") => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
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
    if (!next.exampleId) delete next.exampleId;
    commit({
      ...state,
      terms: existing ? state.terms.map((x) => (x.id === next.id ? next : x)) : [next, ...state.terms],
      ignored: state.ignored.filter((w) => w !== norm(next.term)),
    });
  },
  /** Pick (or with null, let go of) the Vault play that shows what a term looks like. */
  setExample(id: string, playId: string | null) {
    commit({
      ...state,
      terms: state.terms.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t };
        if (playId) next.exampleId = playId;
        else delete next.exampleId;
        return next;
      }),
    });
  },
  /** A starter term back to the glossary's words (its example play stays). */
  resetToStarter(id: string) {
    const seed = STARTER_BY_ID.get(id);
    if (!seed) return;
    commit({ ...state, terms: state.terms.map((t) => (t.id === id ? { ...t, term: seed.term, means: seed.means, type: seed.type } : t)) });
  },
  remove(id: string) {
    commit({ ...state, terms: state.terms.filter((t) => t.id !== id) });
  },
  /** Undo for a delete: the term goes back where it was. */
  restore(term: Term, at: number) {
    if (state.terms.some((t) => t.id === term.id)) return;
    const terms = [...state.terms];
    terms.splice(Math.min(Math.max(at, 0), terms.length), 0, term);
    commit({ ...state, terms });
  },
  /** Starter terms the coach deleted (or whose name another term now uses, which are skipped). */
  missingStarters: (s: State = state) => ALL.filter((g) => !s.terms.some((t) => t.id === g.id || norm(t.term) === norm(g.term))),
  bringBackStarters() {
    const back = termStore.missingStarters();
    if (back.length) commit({ ...state, terms: [...state.terms, ...back] });
    return back.length;
  },
  /** A director's choice: the staff reads this list (default) or not. */
  setShare(on: boolean) {
    commit({ ...state, shareWithStaff: on });
  },
  ignore(word: string) {
    commit({ ...state, ignored: [...state.ignored, norm(word)] });
  },
  exists: (word: string) => state.terms.some((t) => norm(t.term) === norm(word)),
};

export function useTerms(): State {
  return useSyncExternalStore(termStore.subscribe, termStore.get, termStore.get);
}

/**
 * The head coach's shared list for a coach on a Front Office staff, plus
 * whether this coach runs a Front Office. Kept in this browser too, so
 * Griddy still speaks the staff's language with no signal.
 */
type StaffState = { staff: StaffTerms | null; director: boolean };
const STAFF_KEY = "grid1ronvault.staffTerms.v1";

function readStaff(): StaffState {
  try {
    const raw = JSON.parse(localStorage.getItem(STAFF_KEY) ?? "null") as StaffState | null;
    if (!raw) return { staff: null, director: false };
    const terms = (raw.staff?.terms ?? []).map(cleanTerm).filter((t): t is Term => !!t);
    return { staff: raw.staff && terms.length ? { org: String(raw.staff.org ?? ""), from: String(raw.staff.from ?? ""), terms } : null, director: !!raw.director };
  } catch {
    return { staff: null, director: false };
  }
}

let staffState = typeof localStorage === "undefined" ? { staff: null, director: false } : readStaff();
const staffListeners = new Set<() => void>();

function setStaff(next: StaffState) {
  staffState = next;
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  staffListeners.forEach((l) => l());
}

const staffStore = {
  get: () => staffState,
  subscribe(l: () => void) {
    staffListeners.add(l);
    return () => void staffListeners.delete(l);
  },
};

export const useStaffTerms = (): StaffState => useSyncExternalStore(staffStore.subscribe, staffStore.get, staffStore.get);

/**
 * The words Griddy reads: the head coach's shared list first, so the whole
 * staff speaks one language, then this coach's own terms the staff list
 * doesn't name.
 */
export function spokenTerms(own: Term[], staff: StaffTerms | null): Term[] {
  if (!staff) return own;
  const named = new Set(staff.terms.map((t) => norm(t.term)));
  return [...staff.terms, ...own.filter((t) => !named.has(norm(t.term)))];
}

/** What the account holds, so an unchanged list isn't sent again. */
let sentAt = "";
const PUSH_DELAY_MS = 1500;

async function pushTerms() {
  const s = termStore.get();
  // A browser that never changed the starter list has nothing to send (and must not overwrite the account's).
  if (!s.updatedAt || s.updatedAt === sentAt) return;
  try {
    const res = await api.saveTerms(s);
    sentAt = res.terms?.updatedAt ?? s.updatedAt;
  } catch {
    /* still saved in this browser; the next change tries again */
  }
}

/**
 * Mounted once, under the sign-in provider, like BrandSync. Signing in pulls
 * the account's terms and keeps whichever list is newer; every change here
 * pushes a moment later, and a change made with no signal goes up on `online`.
 */
export function TermSync() {
  const { account } = useAuth();
  const id = account?.id;

  const was = useRef(id);
  useEffect(() => {
    // Signing out leaves no staff list here (a page still loading the sign-in keeps the cached one).
    if (was.current && !id) setStaff({ staff: null, director: false });
    was.current = id;
    if (!id) return;
    let alive = true;
    let timer: number | undefined;
    const off = termStore.subscribe((from) => {
      if (from !== "local" || !alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pushTerms(), PUSH_DELAY_MS);
    });
    api
      .terms()
      .then(({ terms: raw, staff, director }) => {
        if (!alive) return;
        setStaff({ staff: staff ?? null, director: !!director });
        if (!raw) return;
        const remote = cleanTerms(raw);
        const local = termStore.get();
        if ((remote.updatedAt ?? "") > (local.updatedAt ?? "")) {
          write(withSeeds({ ...remote, seeded: remote.seeded }), "account");
          sentAt = remote.updatedAt ?? "";
        } else if (remote.updatedAt && remote.updatedAt === local.updatedAt) sentAt = remote.updatedAt;
      })
      .catch(() => {
        /* offline: the terms in this browser still work */
      })
      .finally(() => {
        if (alive) void pushTerms();
      });
    const online = () => void pushTerms();
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      off();
    };
  }, [id]);

  return null;
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
