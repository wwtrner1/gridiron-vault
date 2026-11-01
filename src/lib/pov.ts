import type { Scene } from "./types";

/**
 * Drawing from the defense's end, kept apart from `scene.ts` so the API
 * function (Griddy's bulk edits) can turn plays without loading the field's
 * React drawing. `scene.ts` re-exports both.
 */

/** Fields with no fixed side: the red zone and flag end zones only read one way. */
export const canTurnAround = (view: Scene["view"]) => view === "half" || view === "full" || view === "blank";

/**
 * The whole play seen from the other side: every element turns half a circle
 * about the ball (across the field and back to front), so the offense reads
 * from the defense's end. Doing it twice puts everything back.
 */
export function turnAround(scene: Scene): Scene {
  const cx = scene.width / 2;
  const cy = scene.losY;
  return {
    ...scene,
    pov: scene.pov === "defense" ? undefined : "defense",
    pivot: scene.pivot ? { x: 2 * cx - scene.pivot.x, y: 2 * cy - scene.pivot.y } : null,
    nodes: scene.nodes.map((n) => ({ ...n, x: 2 * cx - n.x, y: 2 * cy - n.y, scaleX: -n.scaleX, scaleY: -n.scaleY })),
  };
}
