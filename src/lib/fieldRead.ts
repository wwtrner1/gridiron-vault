import { blocksOnTap } from "./quickRoutes";
import { CANVAS_W } from "./types";
import type { PlayerNode, Point, Scene } from "./types";

/**
 * A read of the players on the field for the one-click blocks, the block
 * schemes, the defender assignments and the pressures. It works on an upright
 * scene (offense below the line of scrimmage, upfield is up the screen), so
 * a play drawn from the defense's end is turned round first (`upright`).
 *
 * Near the line everything is measured in canvas units against the line's
 * spacing, never in yards: a blocker is 50 units from the next one on every
 * field, but a yard is 14 units on the half field and 5 on the red zone.
 */

/** Gap between linemen, the Formation library's spacing. */
export const GAP = 50;
/** A defender this close to the line is on it (the front's down men; deeper than `OFF_LINE` is off the line). */
export const FIRST_LEVEL = 52;
/** Past the first level and inside this are the second level: linebackers and walked-up backs (the box). */
export const SECOND_LEVEL = 110;
/** A first-level defender this close across is over a blocker: head up or shaded, half a gap each way. */
export const OVER = GAP * 0.6;
/** A technique this close to a blocker's middle is head up. */
export const HEAD_UP = 8;

export type Field = {
  losY: number;
  /** Across the field, where the ball is (the center, else the quarterback, else the middle). */
  ball: number;
  /** Linemen and, in 11-man, the center: left to right. */
  ol: PlayerNode[];
  center: PlayerNode | null;
  /** Tight ends and wings on the line outside the tackles: left to right. */
  tes: PlayerNode[];
  qb: PlayerNode | null;
  /** Players in the backfield beside or behind the quarterback, the one nearest the line first. */
  backs: PlayerNode[];
  /** Eligible players that are not on the line or in the backfield. */
  wide: PlayerNode[];
  /** Everyone eligible: tight ends, backs and wide receivers. */
  eligible: PlayerNode[];
  /** Every defender, left to right. */
  defense: PlayerNode[];
};

export const isQuarterback = (p: PlayerNode) => p.label.toUpperCase() === "Q" || /quarterback/i.test(p.name);

const live = (scene: Scene, side: PlayerNode["side"]) =>
  scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf && n.side === side);

/** How far outside the last lineman a man can stand and still be a tight end or wing. */
const TE_REACH = 110;

export function readField(scene: Scene): Field {
  const offense = live(scene, "offense");
  const losY = scene.losY;
  const ol = offense.filter((p) => blocksOnTap(scene, p)).sort((a, b) => a.x - b.x);
  const qb = offense.find(isQuarterback) ?? null;
  const center = ol.find((p) => p.label.toUpperCase() === "C") ?? null;
  const ball = center?.x ?? qb?.x ?? CANVAS_W / 2;
  const hasLine = ol.length > 0;
  const outerL = Math.min(ball, ...ol.map((p) => p.x));
  const outerR = Math.max(ball, ...ol.map((p) => p.x));
  const rest = offense.filter((p) => p !== qb && !ol.includes(p));
  const tes: PlayerNode[] = [];
  const backs: PlayerNode[] = [];
  const wide: PlayerNode[] = [];
  for (const p of rest) {
    const dy = p.y - losY;
    if (dy >= 40 && Math.abs(p.x - ball) <= TE_REACH) backs.push(p);
    else if (hasLine && dy < 40 && ((p.x > outerR && p.x - outerR <= TE_REACH) || (p.x < outerL && outerL - p.x <= TE_REACH))) tes.push(p);
    else wide.push(p);
  }
  const byX = (a: PlayerNode, b: PlayerNode) => a.x - b.x;
  return {
    losY,
    ball,
    ol,
    center,
    tes: tes.sort(byX),
    qb,
    backs: backs.sort((a, b) => a.y - b.y),
    wide: wide.sort(byX),
    eligible: rest.sort(byX),
    defense: live(scene, "defense").sort(byX),
  };
}

/** How far off the line a defender stands, in canvas units (positive is the defense's side). */
export const depthOf = (f: Field, d: PlayerNode) => f.losY - d.y;
export const onLine = (f: Field, d: PlayerNode) => depthOf(f, d) <= FIRST_LEVEL;
/** The defense's down men: on the line. */
export const firstLevel = (f: Field) => f.defense.filter((d) => onLine(f, d));
/** Backers and walked-up backs: off the line but inside the box. */
export const secondLevel = (f: Field) => f.defense.filter((d) => depthOf(f, d) > FIRST_LEVEL && depthOf(f, d) <= SECOND_LEVEL);
/** Everyone deeper. */
export const thirdLevel = (f: Field) => f.defense.filter((d) => depthOf(f, d) > SECOND_LEVEL);

/**
 * Which first-level defender is over each lineman: each defender goes to the
 * nearest lineman within half a gap and a defender covers only one, so a lineman
 * with nobody over him is uncovered. Index matches `f.ol`.
 */
export function coveredBy(f: Field, blockers: PlayerNode[] = f.ol): (PlayerNode | null)[] {
  const taken = new Set<string>();
  const out: (PlayerNode | null)[] = blockers.map(() => null);
  const pairs: { i: number; d: PlayerNode; gap: number }[] = [];
  for (const d of firstLevel(f)) {
    blockers.forEach((b, i) => {
      const gap = Math.abs(d.x - b.x);
      if (gap <= OVER) pairs.push({ i, d, gap });
    });
  }
  // Closest first, so a defender head up on a guard isn't taken by the center beside him.
  for (const { i, d } of pairs.sort((a, b) => a.gap - b.gap)) {
    if (out[i] || taken.has(d.id)) continue;
    out[i] = d;
    taken.add(d.id);
  }
  return out;
}

/** The nearest defender to a spot that passes `ok`, or null. */
export function nearestDefender(f: Field, x: number, y: number, ok: (d: PlayerNode) => boolean = () => true, within = Infinity): PlayerNode | null {
  let best: PlayerNode | null = null;
  let bestD = within;
  for (const d of f.defense) {
    if (!ok(d)) continue;
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/** +1 when the play goes right, -1 when it goes left, by the side a player stands on (the center and the middle go right). */
export const sideOf = (x: number, ball: number): 1 | -1 => (x < ball - 4 ? -1 : 1);

/** Where a line aimed at `d` ends: stopping short of him (a block's T or a man line's arrow), by a share of his token. */
export function stopShort(from: Point, d: { x: number; y: number; size?: number }, factor = 0.7): Point {
  const dx = d.x - from.x;
  const dy = d.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const stop = Math.max(0, len - (d.size ?? 30) * factor);
  return { x: from.x + (dx / len) * stop, y: from.y + (dy / len) * stop };
}
