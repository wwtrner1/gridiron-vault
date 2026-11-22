import { depthOf, FIRST_LEVEL, firstLevel, GAP, inBox, readField, secondLevel, type Field } from "./fieldRead";
import { clearDefender, gapAt, giveAssignment, hasDefense, type JobOpts } from "./quickDefense";
import type { PlayerNode, Scene } from "./types";

/**
 * Pressures (Wes, 2026-11-22): his blitz packages from the Shark set and the
 * man-pressure sheets, applied to whatever defense is on the field. Each
 * package names its players by what they are (the 3 technique, the nose, the
 * ends, the backer to or away from the 3 technique, the nickel), so it applies
 * to any front with at least three down linemen. The counts in the sheets are
 * for a four-man line: against a 5-2 the whole line rushes and against a 3-4 or
 * 3-3 one fewer does, and a role the front lacks is skipped and named in a note.
 * The players it doesn't send cover man behind it, with the leftover deepest
 * man free and the next one the hole player.
 *
 * "Gold" is the rover's job behind it: Gold Back, the rover takes the back;
 * Gold Free, he is free. Those words, the nickel ($) and the PEEL, HIT, SWAP and
 * READ HOLE tags are Wes's. One package of his is called by a crude name in his
 * deck: the app calls it Twist.
 *
 * Pure, on an upright scene (defense above the line of scrimmage).
 */
export type Gold = "back" | "free";

export type Pressure = {
  id: string;
  label: string;
  /** Rushers, counting the line, against a four-man line. */
  count: number;
  /** One line under the name: who goes where. */
  hint: string;
  /** What it is, in the coach's words. */
  talk: string;
  /** The rover's job behind it in the sheet this package came from. */
  gold: Gold;
  /** Where it comes from: Wes's man-pressure sheet or the Shark set. */
  from: "Man pressure" | "Shark set";
  icon: string;
};

/** Each package's little drawing: the four down linemen rush straight, and what is different is who else comes. */
const LINE = "M10 8 L10 36 M22 8 L22 36 M34 8 L34 36 M46 8 L46 36";
const I = {
  sob: `${LINE} M42 22 L28 38`,
  go: `${LINE} M14 22 L26 38`,
  mob: "M10 8 L10 36 M22 8 L22 36 M34 8 L24 36 M46 8 L46 36 M42 22 L32 38",
  pinch: "M10 8 L18 36 M22 8 L22 36 M34 8 L34 36 M46 8 L38 36 M44 22 L50 38",
  missile: `${LINE} M18 22 L24 38 M38 22 L32 38`,
  boom: `${LINE} M14 22 L20 38 M42 22 L36 38`,
  extra: `${LINE} M16 22 L36 38 M40 22 L20 38`,
  backer: `${LINE} M16 24 L16 38 M40 24 L40 38`,
  sextra: `${LINE} M14 22 L20 38 M42 22 L36 38 M6 12 Q10 24 4 38`,
  swing: `${LINE} M42 22 L28 38 M14 36 Q8 28 14 22`,
};

export const PRESSURES: Pressure[] = [
  { id: "sob", label: "SOB", count: 5, hint: "Backer away hits the B gap", talk: "the backer away from the 3 technique hits his B gap; the line rushes and everyone else is man.", gold: "back", from: "Man pressure", icon: I.sob },
  { id: "go", label: "Go", count: 5, hint: "Backer to the 3 hits the A gap", talk: "the backer to the 3 technique hits the A gap; the line rushes and everyone else is man.", gold: "back", from: "Man pressure", icon: I.go },
  { id: "mob", label: "Mob", count: 5, hint: "Backer B, 3 technique slants to A", talk: "the backer to the 3 technique hits the B gap while the 3 technique slants into the A gap.", gold: "back", from: "Man pressure", icon: I.mob },
  { id: "pinch-mow", label: "Pinch Mow", count: 5, hint: "Ends pinch, backer off the edge", talk: "the ends pinch down inside and the backer away from the 3 technique comes off the edge on a read.", gold: "back", from: "Man pressure", icon: I.pinch },
  { id: "missile", label: "Missile", count: 6, hint: "Backers through the A gaps", talk: "both backers go through the A gaps while the nose slants out.", gold: "back", from: "Man pressure", icon: I.missile },
  { id: "boom", label: "Boom", count: 6, hint: "Backers through the B gaps", talk: "both backers go through the B gaps while the 3 technique slants into the A gap.", gold: "back", from: "Man pressure", icon: I.boom },
  { id: "extra", label: "Extra", count: 6, hint: "Backers cross through the A gaps", talk: "the backers cross: each goes through the A gap on the other side.", gold: "back", from: "Man pressure", icon: I.extra },
  { id: "backer", label: "Backer", count: 6, hint: "Both backers straight through", talk: "both backers rush straight through the gaps they line up in, and the ends peel to the back if he releases.", gold: "back", from: "Shark set", icon: I.backer },
  { id: "sextra", label: "Sextra", count: 6, hint: "Backers, a hit, ends peel", talk: "both backers go, one hitting the gap he reads, and the ends peel to the back if he releases.", gold: "back", from: "Shark set", icon: I.sextra },
  { id: "swing", label: "Swing", count: 5, hint: "Backer and nickel swap", talk: "the backer away from the 3 technique rushes the B gap while the nickel swaps into his drop.", gold: "free", from: "Shark set", icon: I.swing },
  { id: "twist", label: "Twist", count: 4, hint: "3 technique and nose loop", talk: "the 3 technique slants to the A gap and the nose loops around him into the B gap, while a backer reads the hole.", gold: "free", from: "Shark set", icon: "M12 8 Q30 16 22 24 L22 36 M30 8 Q12 16 20 26 L34 36 M44 8 L44 36" },
];

export const pressure = (id: string): Pressure | undefined => PRESSURES.find((p) => p.id === id);

/* ------------------------------------------------------------------ who is who */

export type Roles = {
  f: Field;
  /** The side the 3 technique lines up on: +1 right, -1 left. "To" and "away" are measured from it. */
  dir: 1 | -1;
  down: PlayerNode[];
  three: PlayerNode | null;
  nose: PlayerNode | null;
  endStrong: PlayerNode | null;
  endWeak: PlayerNode | null;
  backerTo: PlayerNode | null;
  backerAway: PlayerNode | null;
  nickel: PlayerNode | null;
  rover: PlayerNode | null;
};

const label = (p: PlayerNode) => p.label.trim().toUpperCase();

/** Reads the defense the way Wes names it, from where the players stand rather than from their letters. */
export function rolesOf(scene: Scene): Roles {
  const f = readField(scene);
  // The box: from one gap outside the widest blocker. A corner pressed on a receiver is first level too, but he is no lineman, and the nickel and rover are not backers.
  const down = firstLevel(f).filter((d) => inBox(f, d));
  const backers = secondLevel(f).filter((d) => inBox(f, d) && !["$", "R", "F"].includes(label(d)));
  const guards = [-1, 1]
    .map((s) => f.ol.filter((p) => s * (p.x - f.ball) > 4).sort((a, b) => Math.abs(a.x - f.ball) - Math.abs(b.x - f.ball))[0])
    .filter(Boolean);
  // The 3 technique: the down man on a guard's outside shoulder.
  let three: PlayerNode | null = null;
  let best = Infinity;
  for (const g of guards) {
    const s = g.x < f.ball ? -1 : 1;
    for (const d of down) {
      const off = s * (d.x - g.x);
      if (off < 4 || off > 36) continue;
      const miss = Math.abs(off - 16);
      if (miss < best) {
        best = miss;
        three = d;
      }
    }
  }
  const dir: 1 | -1 = three ? (three.x < f.ball ? -1 : 1) : 1;
  if (!three && down.length) {
    // No one on a shoulder (a 3-4 or a stack): the interior man nearest where the strong guard's shoulder would be.
    const g = guards.find((p) => p.x > f.ball);
    const spot = (g?.x ?? f.ball + GAP) + 16;
    three = down.reduce((b, d) => (Math.abs(d.x - spot) < Math.abs(b.x - spot) ? d : b));
  }
  const rest = down.filter((d) => d !== three);
  const nose = rest.length ? rest.reduce((b, d) => (Math.abs(d.x - f.ball) < Math.abs(b.x - f.ball) ? d : b)) : null;
  const edges = rest.filter((d) => d !== nose);
  const strong = edges.filter((d) => dir * (d.x - f.ball) > 0).sort((a, b) => dir * (b.x - a.x));
  const weak = edges.filter((d) => dir * (d.x - f.ball) <= 0).sort((a, b) => dir * (a.x - b.x));
  const toSide = backers.filter((p) => dir * (p.x - f.ball) > 0);
  const awaySide = backers.filter((p) => dir * (p.x - f.ball) <= 0);
  const closest = (list: PlayerNode[], x: number) => list.reduce<PlayerNode | null>((b, p) => (!b || Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b), null);
  const backerTo = closest(toSide.length ? toSide : backers, three?.x ?? f.ball + dir * GAP);
  const backerAway = closest(awaySide.length ? awaySide : backers.filter((p) => p !== backerTo), f.ball - dir * GAP * 1.5);
  const named = (l: string) => f.defense.find((p) => label(p) === l) ?? null;
  return {
    f,
    dir,
    down,
    three,
    nose,
    endStrong: strong[0] ?? null,
    endWeak: weak[0] ?? null,
    backerTo,
    backerAway: backerAway === backerTo ? null : backerAway,
    nickel: named("$"),
    rover: named("R"),
  };
}

/* ------------------------------------------------------------------ the packages */

type Send = {
  who: PlayerNode | null | undefined;
  job: string;
  o?: Partial<JobOpts>;
  /** What the package needs here, for the note when the front doesn't have him ("a backer"). */
  need?: string;
};

/** The rushers of a package: who, which job, and any words Wes puts on the line. */
function sends(id: string, r: Roles): Send[] {
  const { dir } = r;
  const toSide = dir;
  const awaySide = (-dir) as 1 | -1;
  const line = (except: (PlayerNode | null)[] = []): Send[] => r.down.filter((d) => !except.includes(d)).map((who) => ({ who, job: "rush" }));
  const backerTo = (job: string, o?: Partial<JobOpts>): Send => ({ who: r.backerTo, job, o, need: "a backer" });
  const backerAway = (job: string, o?: Partial<JobOpts>): Send => ({ who: r.backerAway, job, o, need: "a second backer" });
  const end = (e: PlayerNode | null, job: string, o?: Partial<JobOpts>): Send => ({ who: e, job, o, need: "an end" });
  switch (id) {
    case "sob":
      return [...line(), backerAway("b-gap", { side: awaySide })];
    case "go":
      return [...line(), backerTo("a-gap", { side: toSide })];
    case "mob":
      return [...line([r.three]), { who: r.three, job: "slant", o: { inside: true }, need: "a 3 technique" }, backerTo("b-gap", { side: toSide })];
    case "pinch-mow":
      return [...line([r.endStrong, r.endWeak]), end(r.endStrong, "slant", { inside: true }), end(r.endWeak, "slant", { inside: true }), backerAway("contain", { side: awaySide, pathTag: "READ" })];
    case "missile":
      return [...line([r.nose]), { who: r.nose, job: "slant", o: { inside: false }, need: "a nose" }, backerTo("a-gap", { side: toSide }), backerAway("a-gap", { side: awaySide })];
    case "boom":
      return [...line([r.three]), { who: r.three, job: "slant", o: { inside: true }, need: "a 3 technique" }, backerTo("b-gap", { side: toSide }), backerAway("b-gap", { side: awaySide })];
    case "extra":
      return [...line(), backerTo("a-gap", { side: awaySide }), backerAway("a-gap", { side: toSide })];
    case "backer":
      return [...line([r.endStrong, r.endWeak]), end(r.endStrong, "peel"), end(r.endWeak, "peel"), backerTo("rush"), backerAway("rush")];
    case "sextra":
      return [...line([r.endStrong, r.endWeak]), end(r.endStrong, "peel"), end(r.endWeak, "peel"), backerTo("hit"), backerAway("b-gap", { side: awaySide })];
    case "swing":
      return [...line(), backerAway("b-gap", { side: awaySide, pathTag: "SWAP" })];
    case "twist":
      return [
        ...line([r.three, r.nose]),
        { who: r.three, job: "slant", o: { inside: true }, need: "a 3 technique" },
        { who: r.nose, job: "loop", o: { side: toSide, to: gapAt(r.f, "B", toSide).x, pathTag: "SWAP" }, need: "a nose" },
      ];
    default:
      return [];
  }
}

/** A rusher stood off the line is a blitzer, not a lineman: the same words the Defense library uses. */
const blitzTag = (f: Field, d: PlayerNode, tag: string) => (tag === "Rush" && depthOf(f, d) > FIRST_LEVEL ? "Blitz" : tag);

export type Assigned = { defender: PlayerNode; job: string; rush: boolean };

/** The coverage behind a package: the sent players aside, every defender is man on a receiver, outside in, the leftover deepest is free and the next the hole. */
function coverage(r: Roles, sent: Set<string>, gold: Gold, extra: Send[]): Send[] {
  const { f } = r;
  const out: Send[] = [];
  const left = new Set(f.defense.filter((d) => !sent.has(d.id)).map((d) => d.id));
  const used = new Set(extra.map((s) => s.who?.id));
  for (const id of used) if (id) left.delete(id);
  const recs = [...f.eligible].sort((a, b) => Math.abs(b.x - f.ball) - Math.abs(a.x - f.ball));
  const by = (id: string) => f.defense.find((d) => d.id === id)!;
  const man = (d: PlayerNode, target: PlayerNode) => out.push({ who: d, job: "man", o: { target } });
  const rover = r.rover && left.has(r.rover.id) ? r.rover : null;
  let free: PlayerNode | null = null;
  if (gold === "back" && rover && f.backs[0]) {
    man(rover, f.backs[0]);
    left.delete(rover.id);
    recs.splice(recs.indexOf(f.backs[0]), 1);
  } else if (gold === "free" && rover) {
    free = rover;
    left.delete(rover.id);
  }
  for (const rec of recs) {
    let best: PlayerNode | null = null;
    for (const id of left) {
      const d = by(id);
      if (!best || Math.hypot(d.x - rec.x, d.y - rec.y) < Math.hypot(best.x - rec.x, best.y - rec.y)) best = d;
    }
    if (!best) break;
    left.delete(best.id);
    man(best, rec);
  }
  const rest = [...left].map(by).sort((a, b) => a.y - b.y);
  const deepest = free ?? rest.shift() ?? null;
  if (deepest) out.push({ who: deepest, job: "deep-middle" });
  const hole = rest.find((d) => depthOf(f, d) <= 110) ?? rest[0];
  if (hole) {
    rest.splice(rest.indexOf(hole), 1);
    out.push({ who: hole, job: "hole" });
  }
  for (const d of rest) out.push({ who: d, job: "hook" });
  return out;
}

export type PressureResult = { scene: Scene; rushers: PlayerNode[]; assigned: number; notes: string[] } | { error: string };

/**
 * Puts a pressure on the defense on the field: every defender gets his job
 * and his line, replacing what he had. Players the package needs that the
 * front doesn't have (no nose in a 5-2, say) are skipped and named.
 */
export function applyPressure(scene: Scene, id: string, o: { gold?: Gold; width: number; z: number }): PressureResult {
  const pkg = pressure(id);
  if (!pkg) return { error: "That pressure isn't in the library." };
  if (!hasDefense(scene)) return { error: "There's no defense on the field. Drop one from the Defense library first." };
  const roles = rolesOf(scene);
  if (roles.down.length < 3) return { error: `${pkg.label} needs a front of at least three down linemen. Pick a front from the Defense library.` };
  const notes: string[] = [];
  // The sheets' counts are for a line of four (a 5-2's whole line rushes, a 3-4's three do), so the count on the field can differ, and the note says why.
  if (roles.down.length !== 4) notes.push(`This front has ${roles.down.length} down linemen and ${pkg.label} is written for four, so its rush count is not ${pkg.count}.`);
  const plan = sends(id, roles).filter((s) => {
    if (s.who) return true;
    notes.push(`${pkg.label} needs ${s.need ?? "a player"} this front doesn't have, so that part is skipped.`);
    return false;
  });
  // A player named twice keeps the last job the package gave him (the line's plain rush gives way to his own).
  const final = new Map<string, Send>();
  for (const s of plan) final.set(s.who!.id, s);
  const sentList = [...final.values()];
  if (sentList.length < Math.min(pkg.count, 3)) return { error: `This front doesn't have the players ${pkg.label} calls for.` };
  const sent = new Set(sentList.map((s) => s.who!.id));
  const gold = o.gold ?? pkg.gold;
  const extra: Send[] = [];
  // Swing: the nickel swaps into the backer's drop.
  if (id === "swing" && roles.nickel && !sent.has(roles.nickel.id)) extra.push({ who: roles.nickel, job: "hook", o: { pathTag: "SWAP" } });
  // Twist and Swing read the hole with a backer who is free.
  if (id === "twist" && roles.backerAway && !sent.has(roles.backerAway.id)) extra.push({ who: roles.backerAway, job: "hole", o: { pathTag: "READ HOLE" } });
  const behind = [...extra, ...coverage(roles, sent, gold, extra)];

  // Everyone starts clean: a pressure replaces the defense's coverage, it doesn't sit on top of it.
  let next = scene;
  for (const d of roles.f.defense) next = clearDefender(next, d);
  let z = o.z;
  const rushers: PlayerNode[] = [];
  let assigned = 0;
  const run = (s: Send, rush: boolean) => {
    const d = next.nodes.find((n): n is PlayerNode => n.kind === "player" && n.id === s.who!.id);
    if (!d) return;
    const made = giveAssignment(next, d, s.job, { dir: roles.dir, ...s.o, width: o.width, z: z++, jobTag: s.o?.jobTag });
    if (!made) {
      notes.push(`${d.label || "A defender"} couldn't take ${s.job}.`);
      return;
    }
    next = made.scene;
    // Rushers that stand off the line are blitzers: same words as the Defense library.
    const tag = blitzTag(roles.f, d, made.job.tag);
    if (tag !== made.job.tag) next = { ...next, nodes: next.nodes.map((n) => (n.kind === "player" && n.id === d.id ? { ...n, job: tag } : n)) };
    assigned++;
    if (rush) rushers.push(d);
  };
  for (const s of sentList) run(s, true);
  for (const s of behind) run(s, false);
  return { scene: next, rushers, assigned, notes };
}
