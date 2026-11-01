import { isQb, layoutSeven } from "./coverage";
import { layoutDefense, layoutFlagDefense, mirrorDefense } from "./defense";
import type { Coverage, DefenseLayout, FlagLook, Front, LineSet } from "./defense";
import { isLineman } from "./formations";
import { CANVAS_W } from "./types";
import type { PlayerNode, Scene } from "./types";

/**
 * "Turn this offense into a defense": read the offense on the field (format,
 * personnel, strength), pick a front and coverage that fit it, and line the
 * defense up on the real blockers with the strength called to the side the
 * offense loaded. Pure, so the Designer and anything else can share it.
 */

export type Format = "5v5" | "7v7" | "11";
type Offset = { dx: number; dy: number };

export type OffenseRead = {
  format: Format;
  /** The ball across the field: the center, else the quarterback, else the middle. */
  ball: number;
  /** Which way the strength is called: 1 right, -1 left (as the coach looks at the field). */
  strength: 1 | -1;
  /** Why it was called that way, in coach words. */
  strengthWhy: string;
  backs: number;
  tes: number;
  wrs: number;
  /** Eligibles (receivers and tight ends, not backs) left and right of the ball. */
  left: number;
  right: number;
  /** Every eligible player but the quarterback (backs included), as offsets from the ball. */
  receivers: Offset[];
  /** Linemen's offsets across the field, and the tight ends'. */
  line: LineSet;
};

/** Units outside the last tackle a man can stand and still be a tight end or wing. */
const TE_REACH = 110;
/** A back stands at least this far behind the line and inside this far across. */
const BACK_DEPTH = 40;
const BACK_WIDTH = 110;

const sideOf = (dx: number) => (dx > 8 ? 1 : dx < -8 ? -1 : 0);

export function readOffense(scene: Scene): OffenseRead | null {
  const offense = scene.nodes.filter(
    (n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf && n.side === "offense",
  );
  if (!offense.length) return null;
  const linemen = offense.filter(isLineman);
  const hasLine = linemen.length > 0;
  const center = offense.find((p) => p.label.toUpperCase() === "C" || /\bcenter\b/i.test(p.name));
  const qb = offense.find(isQb);
  const ball = center?.x ?? qb?.x ?? CANVAS_W / 2;
  const losY = scene.losY;
  const at = (p: PlayerNode): Offset => ({ dx: p.x - ball, dy: p.y - losY });

  const format: Format = offense.length >= 9 || hasLine ? "11" : offense.length >= 6 ? "7v7" : "5v5";
  // With a line, the center is a blocker; in flag and 7v7 he is a receiver.
  const blockers = hasLine ? [...linemen, ...(center && !linemen.includes(center) ? [center] : [])] : [];
  const eligible = offense.filter((p) => p !== qb && !blockers.includes(p) && !isQb(p));
  const ol = blockers.map((p) => at(p).dx);
  const outerL = Math.min(0, ...ol);
  const outerR = Math.max(0, ...ol);

  const backs: Offset[] = [];
  const tes: number[] = [];
  const wide: Offset[] = [];
  for (const p of eligible) {
    const o = at(p);
    if (o.dy >= BACK_DEPTH && Math.abs(o.dx) <= BACK_WIDTH) backs.push(o);
    else if (hasLine && o.dy < 50 && ((o.dx > outerR && o.dx - outerR <= TE_REACH) || (o.dx < outerL && outerL - o.dx <= TE_REACH)))
      tes.push(o.dx);
    else wide.push(o);
  }
  const eligibleOut = [...tes, ...wide.map((w) => w.dx)];
  const right = eligibleOut.filter((dx) => sideOf(dx) === 1).length;
  const left = eligibleOut.filter((dx) => sideOf(dx) === -1).length;
  const teRight = tes.filter((dx) => dx > 0).length;
  const teLeft = tes.filter((dx) => dx < 0).length;

  let strength: 1 | -1 = 1;
  let strengthWhy: string;
  if (right !== left) {
    strength = right > left ? 1 : -1;
    strengthWhy = `${Math.max(left, right)} receivers to the ${strength === 1 ? "right" : "left"}`;
  } else if (teRight !== teLeft) {
    strength = teRight > teLeft ? 1 : -1;
    strengthWhy = `balanced, so the strength goes to the tight end on the ${strength === 1 ? "right" : "left"}`;
  } else {
    strengthWhy = "balanced, so the strength is called right (flip it if the ball sits on the right hash)";
  }

  return {
    format,
    ball,
    strength,
    strengthWhy,
    backs: backs.length,
    tes: tes.length,
    wrs: wide.length,
    left,
    right,
    receivers: eligible.map(at),
    line: { ol, tes },
  };
}

export type DefensePick = {
  /** "3-3 Cover 3", "1 rush · Cover 2". */
  name: string;
  /** One coaching sentence on why this call fits the set. */
  why: string;
  layout: DefenseLayout;
  read: OffenseRead;
  front?: Front;
  coverage?: Coverage;
};

/** The 11-man call for a set, with the reason a coach would give. */
export function callFor(read: OffenseRead): { front: Front; coverage: Coverage; why: string } {
  const trips = Math.max(read.left, read.right) >= 3;
  if (read.backs === 0)
    return { front: "3-3", coverage: "Cover 1", why: "Empty: match all five receivers man to man, with a robber underneath and one safety over the top." };
  if (read.wrs <= 1 && read.tes + read.backs >= 3)
    return { front: "5-2", coverage: "Cover 1", why: "Heavy set: five down and two backers so every gap has a man, with man coverage behind it." };
  if (read.backs >= 2)
    return { front: "4-4", coverage: "Cover 3", why: "Two backs: eight in the box to stop the run, three deep so nothing gets behind you." };
  if (trips)
    return { front: "3-3", coverage: "Cover 3", why: "Trips: nickel with three deep, and the strong safety rolls down to the trips side." };
  if (read.wrs >= 3)
    return { front: "3-3", coverage: "Cover 4", why: "Spread 2x2: nickel and quarters, so each safety reads the #2 receiver on his side." };
  return { front: "4-3", coverage: "Cover 3", why: "Base personnel: a 4-3 over front with the 3 technique to the strength, and three deep." };
}

const mirrorAll = (xs: Offset[]) => xs.map((r) => ({ ...r, dx: -r.dx }));

/** Corners take outside leverage on the widest receiver on their side. */
function leverCorners(layout: DefenseLayout, receivers: Offset[]): DefenseLayout {
  const defenders = layout.defenders.map((d) => {
    if (d.label !== "C") return d;
    const side = Math.sign(d.dx);
    const mine = receivers.filter((r) => Math.sign(r.dx) === side);
    if (!mine.length) return d;
    const widest = mine.reduce((a, b) => (Math.abs(b.dx) > Math.abs(a.dx) ? b : a));
    return { ...d, dx: widest.dx + side * 14 };
  });
  return { ...layout, defenders };
}

/**
 * The defense for a read: 11-man fronts lined up on the real blockers by
 * technique (mirrored when the strength is left), the 5-on-5 flag looks with
 * the rusher on the league's rush line, and 7-on-7's coverage-only looks.
 */
export function pickDefense(read: OffenseRead, rushUnits: number): DefensePick {
  const side = read.strength === 1 ? "right" : "left";
  if (read.format === "5v5") {
    const trips = Math.max(read.left, read.right) >= 3;
    const look: FlagLook = trips ? "1 rush · Cover 3" : "1 rush · Cover 2";
    return {
      name: look,
      why: trips
        ? "Three to one side: three deep keeps everything in front, the middle backer walls the inside route."
        : "Two-by-one or balanced: corners sit in the flats, two safeties split the deep halves.",
      layout: leverCorners(layoutFlagDefense(look, rushUnits, read.receivers), read.receivers),
      read,
    };
  }
  if (read.format === "7v7") {
    const trips = Math.max(read.left, read.right) >= 3;
    const kind = trips ? "Cover 3" : "Cover 2";
    return {
      name: kind,
      why: trips
        ? "Three to one side: three deep, four underneath walling the trips side."
        : "Balanced: two deep halves and five underneath take away the quick game.",
      layout: leverCorners(layoutSeven(kind, read.receivers), read.receivers),
      read,
    };
  }
  const call = callFor(read);
  const right = read.strength === 1;
  const line: LineSet = right ? read.line : { ol: read.line.ol.map((x) => -x), tes: read.line.tes.map((x) => -x) };
  const receivers = right ? read.receivers : mirrorAll(read.receivers);
  const base = layoutDefense(call.front, call.coverage, receivers, line);
  const layout = leverCorners(right ? base : mirrorDefense(base), read.receivers);
  return { name: `${call.front} ${call.coverage}`, why: `${call.why} Strength ${side}: ${read.strengthWhy}.`, layout, read, front: call.front, coverage: call.coverage };
}

/** Drops every defender on the field, and anything grouped with one (their drops, zones and rush lines). */
export function withoutDefense(scene: Scene): { scene: Scene; removed: number } {
  const defenders = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side === "defense" && !n.ghostOf);
  if (!defenders.length) return { scene, removed: 0 };
  const groups = new Set(defenders.map((d) => d.groupId).filter((g): g is string => !!g));
  const ids = new Set(defenders.map((d) => d.id));
  const nodes = scene.nodes.filter((n) => !ids.has(n.id) && !(n.groupId && groups.has(n.groupId)));
  return { scene: { ...scene, nodes }, removed: defenders.length };
}
