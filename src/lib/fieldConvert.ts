import { fieldInset, unitsPerYard } from "./fieldUnits";
import { toWorld } from "./geometry";
import type { FieldView, Point, Scene, SceneNode } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";

/**
 * Moves a play to another field and keeps its routes true to the yard: a
 * 10-yard out on the half field is still a 10-yard out on the red zone. Depth
 * is rescaled from the line of scrimmage by the two fields' yard spacing;
 * across, players keep their place between the sidelines (split to the
 * numbers stays split to the numbers). If the play then runs off the canvas
 * it slides back on, line of scrimmage and all.
 *
 * The whiteboard has no yards, so a move to or from it only changes the field.
 */
export type FieldMove = { scene: Scene; moved: boolean; slidYards: number; clipped: boolean };

const MARGIN = 18;

export function convertField(scene: Scene, view: FieldView): FieldMove {
  const from = unitsPerYard(scene.view);
  const to = unitsPerYard(view);
  if (!from || !to || scene.view === view) return { scene: { ...scene, view }, moved: false, slidYards: 0, clipped: false };
  const sy = to / from;
  const inA = fieldInset(scene.view);
  const inB = fieldInset(view);
  const sx = (CANVAS_W - inB * 2) / (CANVAS_W - inA * 2);
  const los = scene.losY;
  const map = (p: Point): Point => ({ x: inB + (p.x - inA) * sx, y: los + (p.y - los) * sy });

  const nodes = scene.nodes.map((n): SceneNode => {
    if (n.kind !== "path") {
      const at = map(n);
      return n.kind === "shape" ? { ...n, ...at, w: n.w * sx, h: n.h * sy } : { ...n, ...at };
    }
    // Lines: bake the node's own move/turn/stretch into the points, then map them.
    const world = n.points.map((p) => toWorld(n, p));
    const handles: Record<number, Point> = {};
    for (const [k, h] of Object.entries(n.handles)) {
      const i = Number(k);
      const base = world[i];
      if (!base) continue;
      const end = toWorld(n, { x: n.points[i].x + h.x, y: n.points[i].y + h.y });
      handles[i] = { x: (end.x - base.x) * sx, y: (end.y - base.y) * sy };
    }
    return { ...n, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, points: world.map(map), handles };
  });

  // Slide back onto the canvas if the deeper spacing pushed the play off it.
  const ys = nodes.flatMap((n) => (n.kind === "path" ? n.points.map((p) => p.y) : [n.y]));
  const top = Math.min(los, ...ys);
  const bottom = Math.max(los, ...ys);
  let dy = 0;
  if (bottom - top <= CANVAS_H - MARGIN * 2) {
    if (top < MARGIN) dy = MARGIN - top;
    else if (bottom > CANVAS_H - MARGIN) dy = CANVAS_H - MARGIN - bottom;
  }
  const losY = Math.round(Math.min(600, Math.max(90, los + dy)));
  dy = losY - los;
  const slid = dy
    ? nodes.map((n): SceneNode => (n.kind === "path" ? { ...n, points: n.points.map((p) => ({ x: p.x, y: p.y + dy })) } : { ...n, y: n.y + dy }))
    : nodes;
  const after = slid.flatMap((n) => (n.kind === "path" ? n.points.map((p) => p.y) : [n.y]));
  return {
    scene: { ...scene, view, losY, nodes: slid, pivot: scene.pivot ? { ...map(scene.pivot), y: map(scene.pivot).y + dy } : null },
    moved: true,
    slidYards: Math.round(dy / to),
    clipped: after.some((y) => y < 0 || y > CANVAS_H),
  };
}
