import type { Point, Scene, SceneNode } from "./types";

/**
 * Drawing from the defense's end, kept apart from `scene.ts` so the API
 * function (Griddy's bulk edits) can turn plays without loading the field's
 * React drawing. `scene.ts` re-exports these.
 *
 * Every field can be turned: the half, full and whiteboard fields, and the red
 * zone and flag fields (their end zone moves to the bottom with the offense's
 * attack, which is what `FieldBackground`'s `turned` prop draws).
 *
 * A turned play has `pov: "defense"`: the offense stands ABOVE the line of
 * scrimmage and attacks DOWN the card, the defense is BELOW it, and left and
 * right swap on screen. Nearly all of the app's play code (quick routes,
 * libraries, the Coverage check, the rules check) is written for the other
 * way up, so it runs on `upright(scene)` and turns its result back with
 * `inUpright` or `toFrame`.
 */

/**
 * The whole play seen from the other side: the canvas turns half a circle about
 * its centre (across the field and back to front), the line of scrimmage with
 * it, so the offense reads from the defense's end and the defense sits at the
 * bottom of the card. Doing it twice puts everything back exactly.
 *
 * Plays turned before 2026-11-22 turned about the ball and kept the line of
 * scrimmage where it was; they hold the same geometry relative to the line, so
 * they turn upright and back like any other.
 */
export function turnAround(scene: Scene): Scene {
  const cx = scene.width / 2;
  const cy = scene.height / 2;
  return {
    ...scene,
    losY: scene.height - scene.losY,
    pov: scene.pov === "defense" ? undefined : "defense",
    pivot: scene.pivot ? { x: 2 * cx - scene.pivot.x, y: 2 * cy - scene.pivot.y } : null,
    nodes: scene.nodes.map((n) => turnNode(n, cx, cy)),
  };
}

function turnNode(n: SceneNode, cx: number, cy: number): SceneNode {
  return { ...n, x: 2 * cx - n.x, y: 2 * cy - n.y, scaleX: -n.scaleX, scaleY: -n.scaleY };
}

/** True when the offense is drawn from the defense's end (the play is turned). */
export const isTurnedPlay = (scene: Pick<Scene, "pov">) => scene.pov === "defense";

/** The play with the offense below the line and attacking up the card: the frame the play code is written for. */
export const upright = (scene: Scene): Scene => (scene.pov === "defense" ? turnAround(scene) : scene);

/**
 * Runs an edit written for the offense-up frame on a play that may be turned,
 * and puts the result back in the play's own frame. `edit` sees `upright(scene)`
 * and returns an upright scene (a new `losY` or nodes are fine).
 */
export function inUpright(scene: Scene, edit: (upright: Scene) => Scene): Scene {
  if (scene.pov !== "defense") return edit(scene);
  const out = edit(turnAround(scene));
  return turnAround({ ...out, pov: undefined });
}

/** Nodes laid out in the offense-up frame, turned into the frame `scene` is drawn in (unchanged when it isn't turned). */
export function toFrame(scene: Scene, nodes: SceneNode[]): SceneNode[] {
  if (scene.pov !== "defense") return nodes;
  const cx = scene.width / 2;
  const cy = scene.height / 2;
  return nodes.map((n) => turnNode(n, cx, cy));
}

/** A point in the offense-up frame, put in the frame `scene` is drawn in. The mapping is its own inverse. */
export function framePoint(scene: Pick<Scene, "pov" | "width" | "height">, p: Point): Point {
  return scene.pov === "defense" ? { x: scene.width - p.x, y: scene.height - p.y } : p;
}

/** The sign of "downfield" on screen: -1 when the offense attacks up the card, +1 when it attacks down (turned). */
export const downfield = (scene: Pick<Scene, "pov">): 1 | -1 => (scene.pov === "defense" ? 1 : -1);
