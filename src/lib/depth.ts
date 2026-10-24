import { unitsPerYard } from "./field";
import { toWorld } from "./geometry";
import type { PathNode, PlayerNode, Point, Scene } from "./types";

/**
 * Route depths: where each offensive route breaks, and how many yards past
 * the line of scrimmage that is. Read off the drawing, so dragging a route
 * changes its number. Pure, so the Designer, previews and prints agree.
 */

export type DepthMark = {
  pathId: string;
  /** The break, in field coordinates. */
  at: Point;
  yards: number;
  /** Unit vector pointing to the outside of the turn, where the number sits. */
  out: Point;
};

/** A turn sharper than this (degrees) counts as a break; gentler bends don't. */
const BREAK_DEG = 25;
/** Legs shorter than this (canvas units) are wobble, not a cut. */
const MIN_LEG = 8;
/** A line that starts this close to a player belongs to him. */
const OWN_RADIUS = 30;

/** The player whose line this is: glued or assigned to him, else the one it starts on. */
function owner(path: PathNode, players: PlayerNode[]): PlayerNode | undefined {
  const id = path.assignOf ?? path.fromId;
  if (id) return players.find((p) => p.id === id);
  const start = toWorld(path, path.points[0]);
  return players.find((p) => Math.hypot(p.x - start.x, p.y - start.y) < OWN_RADIUS);
}

const unit = (a: Point, b: Point): Point | null => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return len < MIN_LEG ? null : { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
};

/** Lines that are routes: an offensive player's open line, not motion, a block, a handoff or a zone. */
function isRoute(path: PathNode, who: PlayerNode | undefined): who is PlayerNode {
  if (path.hidden || path.closed || path.points.length < 3) return false;
  if (path.style === "motion" || path.endCap === "tee" || path.toId) return false;
  // A tag the coach typed with a number in it ("12 yds") already says the depth.
  if (path.tag && /\d/.test(path.tag)) return false;
  return !!who && who.side === "offense" && !who.ghostOf;
}

export function routeDepths(scene: Scene): DepthMark[] {
  const perYard = unitsPerYard(scene.view);
  if (!perYard) return [];
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden);
  const marks: DepthMark[] = [];
  for (const n of scene.nodes) {
    if (n.kind !== "path") continue;
    const who = owner(n, players);
    if (!isRoute(n, who)) continue;
    // Downfield is away from the line of scrimmage on the offense's side.
    const sign = who.y >= scene.losY ? 1 : -1;
    const pts = n.points.map((p) => toWorld(n, p));
    let last: number | null = null;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = unit(pts[i - 1], pts[i]);
      const b = unit(pts[i], pts[i + 1]);
      if (!a || !b) continue;
      const turn = (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180) / Math.PI;
      if (turn < BREAK_DEG) continue;
      const yards = Math.round((sign * (scene.losY - pts[i].y)) / perYard);
      // Breaks behind the line or at it (a flat, a swing) have no depth to call.
      if (yards < 1 || yards === last) continue;
      last = yards;
      const ox = a.x - b.x;
      const oy = a.y - b.y;
      const len = Math.hypot(ox, oy) || 1;
      marks.push({ pathId: n.id, at: pts[i], yards, out: { x: ox / len, y: oy / len } });
    }
  }
  return marks;
}

/** Depth number type size, in canvas units, before any print boost. */
export const DEPTH_SIZE = 12;

/** Where a mark's number sits and how big its pill is, at `scale` × DEPTH_SIZE. */
export function depthLabel(m: DepthMark, scale = 1) {
  const size = DEPTH_SIZE * scale;
  const halfW = (String(m.yards).length * size * 0.6) / 2 + 4 * scale;
  const halfH = size * 0.68;
  const gap = 7 * scale + halfW * Math.abs(m.out.x) + halfH * Math.abs(m.out.y);
  return { x: m.at.x + m.out.x * gap, y: m.at.y + m.out.y * gap, halfW, halfH, size };
}
