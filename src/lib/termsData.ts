/**
 * The pure half of Playbook language: the term types, the starter glossaries
 * and `cleanTerms`, which the browser and the API function both run, so a
 * coach's terms reach the account in the same shape they leave the browser.
 */
export type TermType = "concept" | "formation" | "tag" | "gap" | "block" | "defense";
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

/**
 * Blocking, after Wes's blocks and schemes (the Designer's one-click blocks and
 * block schemes draw every one of these; each term's diagram is drawn by that
 * same code, see `termExamplesBlocking.ts`).
 */
export const BLOCK_GLOSSARY: Term[] = [
  seed("Base block", "Block the defender lined up over you: stay square, get your hands inside and keep your body between him and the play", "block"),
  seed("Reach block", "Step to the play side and get your head outside the defender over you, so he can't squeeze the run back inside. The block behind outside zone", "block"),
  seed("Down block", "Block the defender on your inside gap instead of the man over you. It seals the inside of the hole while someone else, often a pulling guard, takes the man outside", "block"),
  seed("Combo block", "Two linemen team up on one defender, then one comes off to climb to a backer while the other finishes the job. Built for a covered lineman beside an uncovered one", "block"),
  seed("Climb", "Leave the line of scrimmage and block a linebacker: an uncovered lineman climbs, or a lineman climbs once a neighbor takes the defender he was on", "block"),
  seed("Pull and kick out", "A lineman pulls behind the line and turns up to knock the end man on the line outside, so the run can go inside him. The backside guard's job on power", "block"),
  seed("Pull and lead", "A lineman pulls behind the line and goes through the hole ahead of the ball carrier to block the first linebacker he meets", "block"),
  seed("Trap", "A guard pulls across the formation and blocks a down lineman who was left unblocked, usually the 3 technique just past the center: he gets upfield, then gets hit from the side", "block"),
  seed("Scoop", "Step inside and block the defender lined up over your inside neighbor, so that neighbor can go on to a linebacker. A way to pass a defender along the line", "block"),
  seed("Hinge", "A backside lineman steps back and across rather than up, walling off the backside so nobody chases the play from behind", "block"),
  seed("Covered and uncovered", "Covered: a defender is lined up over you, so you block him. Uncovered: nobody is, so you help a covered neighbor, then climb to a linebacker. It gives every lineman his job on a run", "block"),
  seed("Inside zone", "The line steps to the play side together: covered linemen take the man over them, uncovered linemen double with a neighbor and climb, and the back reads the blocks and cuts up the best crease", "block"),
  seed("Outside zone", "Every lineman reaches to the play side and gets his head outside his man, stretching the defense wide; the back runs toward the edge and cuts up the first crease. Also called the stretch", "block"),
  seed("Power", "A run to one side: the play side blocks down, the backside guard pulls and kicks out the end man on the line, and the ball carrier follows his block", "block"),
  seed("Counter", "Looks like power, but the back steps the other way first. The play side blocks down while two linemen pull: the first kicks out the end, the second leads through to a linebacker", "block"),
];

/**
 * Defensive calls, after Wes's man-pressure sheets and Shark set (the Designer's
 * pressures draw every one; "to" and "away" are measured from the side the 3
 * technique lines up on). Gold is the rover's job behind the call.
 */
export const DEFENSE_GLOSSARY: Term[] = [
  seed("SOB", "Five-man pressure: the backer away from the 3 technique blitzes his B gap, the down linemen rush, and everyone else covers a man", "defense"),
  seed("Go", "Five-man pressure: the backer on the 3 technique's side blitzes the A gap, the down linemen rush, and everyone else covers a man", "defense"),
  seed("Mob", "Five-man pressure: the backer on the 3 technique's side blitzes the B gap while the 3 technique slants inside into the A gap", "defense"),
  seed("Pinch Mow", "Five-man pressure: the ends pinch down inside while the backer away from the 3 technique comes off the edge on a read", "defense"),
  seed("Missile", "Six-man pressure: both backers blitz through the A gaps while the nose slants out", "defense"),
  seed("Boom", "Six-man pressure: both backers blitz the B gaps while the 3 technique slants into the A gap", "defense"),
  seed("Extra", "Six-man pressure: the backers cross, each blitzing the A gap on the other's side", "defense"),
  seed("Backer", "Six-man pressure: both backers blitz straight through the gaps they line up in, and the ends peel to the back if he releases", "defense"),
  seed("Sextra", "Six-man pressure: both backers go, one of them hitting the gap he reads, and the ends peel to the back if he releases", "defense"),
  seed("Swing", "Five-man pressure: the backer away from the 3 technique rushes the B gap while the nickel swaps into his drop, with the rover free behind it", "defense"),
  seed("Twist", "The 3 technique slants into the A gap and the nose loops around him into the B gap, while a backer reads the hole and the rover plays free", "defense"),
  seed("Peel", "A rusher's second job: if the back releases into a route, he quits rushing and covers him. Drawn as a rush line with a PEEL tag", "defense"),
  seed("Hit", "A read rush: the defender reads the blocker in front of him, then fills the gap the blocker gives up. Drawn as a zigzag line", "defense"),
  seed("Gold Back", "The rover's job behind a pressure: he covers the back man-to-man", "defense"),
  seed("Gold Free", "The rover's job behind a pressure: he covers no one and stays free, deep in the middle, as the last line of defense", "defense"),
  seed("Man pressure", "A family of blitzes (SOB, Go, Mob, Pinch Mow, Missile, Boom, Extra) that send five or six and cover everyone else man-to-man: the deepest leftover defender plays free and the next one reads the hole", "defense"),
  seed("4-2-5", "The base defense with four down linemen (W, N, T, B), two backers (M, S) and five defensive backs: two corners, a nickel ($), a free safety (F) and a rover (R)", "defense"),
];

export const TYPE_LABEL: Record<TermType, string> = { concept: "Concept", formation: "Formation", tag: "Tag", gap: "Gap & technique", block: "Blocking", defense: "Defensive call" };
export const SCOPE_LABEL: Record<TermScope, string> = { you: "Just you", staff: "You + staff", shared: "Shared glossary" };

/** Every starter term, by id: what each one said before a coach made it their own. */
export const STARTER_BY_ID = new Map([...STARTER_GLOSSARY, ...GAP_GLOSSARY, ...BLOCK_GLOSSARY, ...DEFENSE_GLOSSARY].map((t) => [t.id, t]));

export type TermsState = {
  terms: Term[];
  /** Suggested words the coach said no to (lower case). */
  ignored: string[];
  /** Starter ids already offered, so one the coach deleted stays deleted. */
  seeded?: string[];
  /** When this browser last changed the list; the newer copy wins between devices. */
  updatedAt?: string;
  /** A Front Office director's list goes to their staff (read-only) unless this is false. */
  shareWithStaff?: boolean;
};

/** The head coach's list as a staff coach sees it: read-only, from the Front Office they joined. */
export type StaffTerms = { org: string; from: string; terms: Term[] };

/** What a director shares: every term but the ones marked "Just you". */
export const sharedWithStaff = (s: TermsState): Term[] => (s.shareWithStaff === false ? [] : s.terms.filter((t) => t.scope !== "you"));

export const TERM_LIMITS = { terms: 400, term: 60, means: 300, ignored: 400 } as const;

const TYPES: TermType[] = ["concept", "formation", "tag", "gap", "block", "defense"];
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
  if (typeof r.shareWithStaff === "boolean") out.shareWithStaff = r.shareWithStaff;
  return out;
}
