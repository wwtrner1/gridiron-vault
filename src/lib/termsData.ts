/**
 * The pure half of Playbook language: the term types, the starter glossaries
 * and `cleanTerms`, which the browser and the API function both run, so a
 * coach's terms reach the account in the same shape they leave the browser.
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
  /** A Vault play the coach picked to show what the term looks like. */
  exampleId?: string;
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

/** Every starter term, by id: what each one said before a coach made it their own. */
export const STARTER_BY_ID = new Map([...STARTER_GLOSSARY, ...GAP_GLOSSARY].map((t) => [t.id, t]));

export type TermsState = {
  terms: Term[];
  /** Suggested words the coach said no to (lower case). */
  ignored: string[];
  /** Starter ids already offered, so one the coach deleted stays deleted. */
  seeded?: string[];
  /** When this browser last changed the list; the newer copy wins between devices. */
  updatedAt?: string;
};

export const TERM_LIMITS = { terms: 400, term: 60, means: 300, ignored: 400 } as const;

const TYPES: TermType[] = ["concept", "formation", "tag", "gap"];
const SCOPES: TermScope[] = ["you", "staff", "shared"];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** One term as it may be stored, or null when it has no name. */
export function cleanTerm(raw: unknown): Term | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const term = text(r.term, TERM_LIMITS.term);
  const id = text(r.id, 80);
  if (!term || !id) return null;
  const out: Term = {
    id,
    term,
    means: text(r.means, TERM_LIMITS.means),
    type: TYPES.includes(r.type as TermType) ? (r.type as TermType) : "concept",
    source: text(r.source, 40) || "You added",
    added: /^\d{4}-\d{2}-\d{2}$/.test(String(r.added)) ? String(r.added) : "2026-09-01",
    scope: SCOPES.includes(r.scope as TermScope) ? (r.scope as TermScope) : "you",
  };
  const example = text(r.exampleId, 80);
  if (example) out.exampleId = example;
  return out;
}

/** A whole term list from the browser or the account, held to its limits; duplicate ids keep the first. */
export function cleanTerms(raw: unknown): TermsState {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const terms = (Array.isArray(r.terms) ? r.terms : [])
    .map(cleanTerm)
    .filter((t): t is Term => !!t && !seen.has(t.id) && (seen.add(t.id), true))
    .slice(0, TERM_LIMITS.terms);
  const words = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : []).map((w) => text(w, 80).toLowerCase()).filter(Boolean).slice(0, max);
  const out: TermsState = { terms, ignored: words(r.ignored, TERM_LIMITS.ignored) };
  if (Array.isArray(r.seeded)) out.seeded = words(r.seeded, 200);
  const at = text(r.updatedAt, 40);
  if (at && !Number.isNaN(Date.parse(at))) out.updatedAt = at;
  return out;
}
