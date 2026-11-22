import { ownLines } from "./quickRoutes";
import { turnAround } from "./scene";
import { baseNode } from "./types";
import type { EndCap, LineCurve, LineStyle, PathNode, PlayerNode, Point, Scene } from "./types";

/**
 * One line a one-click block, assignment, scheme or pressure draws for a
 * player. Points are in canvas units from the player (the first is 0,0), the
 * same way a one-click route's are, so the line is glued to him by `assignOf`,
 * follows him when he's dragged and replaces his earlier line.
 *
 * What each end means to the readers (explain, the Rules check, the Coverage
 * check, depth) is decided here and nowhere else:
 *  - a block ends in a T, always: every reader tells a block from a route by
 *    `endCap === "tee"` alone;
 *  - a defender's rush is a solid arrow, man coverage a dashed arrow and a
 *    zone drop a dashed line with a dot, as the Defense library draws them
 *    (the Rules check counts a solid defender line that reaches the line as a
 *    rusher, so a man line must never be solid);
 *  - a read is a zigzag, which is a flag on an otherwise solid line.
 */
export type LineSpec = {
  name: string;
  points: Point[];
  style?: LineStyle;
  curve?: LineCurve;
  endCap?: EndCap;
  zigzag?: boolean;
  tag?: string;
};

export type Ink = { ink: string; width: number; z: number };

/** The line as a path node glued to its owner. */
export function lineFor(owner: PlayerNode, spec: LineSpec, o: Ink): PathNode {
  return {
    ...baseNode({ x: owner.x, y: owner.y, z: o.z, name: spec.name }),
    kind: "path",
    points: spec.points,
    handles: {},
    style: spec.style ?? "solid",
    curve: spec.curve ?? "straight",
    startCap: "none",
    endCap: spec.endCap ?? "arrow",
    stroke: o.ink,
    width: o.width,
    closed: false,
    fill: "none",
    fillOpacity: 0,
    fromId: null,
    toId: null,
    assignOf: owner.id,
    ...(spec.zigzag ? { zigzag: true } : {}),
    ...(spec.tag ? { tag: spec.tag } : {}),
  };
}

/** Absolute canvas points → points from the owner, starting at his own spot. */
export function fromOwner(owner: Point, abs: Point[]): Point[] {
  return [{ x: 0, y: 0 }, ...abs.map((p) => ({ x: p.x - owner.x, y: p.y - owner.y }))];
}

/** The scene with this owner's earlier routes, blocks and assignments swapped for the new lines (his motion is kept). */
export function replaceLines(scene: Scene, owner: PlayerNode, paths: PathNode[]): Scene {
  const gone = new Set(ownLines(scene, owner).map((n) => n.id));
  return { ...scene, nodes: [...scene.nodes.filter((n) => !gone.has(n.id)), ...paths] };
}

/** The scene with this owner's lines taken off. */
export const clearLines = (scene: Scene, owner: PlayerNode): Scene => replaceLines(scene, owner, []);

/** A path's length, for tests and for checking a line isn't a dot. */
export const lineLength = (points: Point[]): number => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);

/**
 * Runs a library call on the upright field. The libraries read the offense
 * below the line of scrimmage; a play drawn from the defense's end (`pov`) is
 * turned round first, the call is made, and the answer is turned back. "Right"
 * is the coach's right, so the direction flips with the field.
 */
export function onUpright<R extends { scene: Scene }>(scene: Scene, dir: 1 | -1, run: (flat: Scene, dir: 1 | -1) => R | null): R | null {
  if (scene.pov !== "defense") return run(scene, dir);
  const done = run(turnAround(scene), (-dir) as 1 | -1);
  return done ? { ...done, scene: turnAround(done.scene) } : null;
}
