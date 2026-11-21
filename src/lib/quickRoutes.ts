import { linesOf } from "./assignments";
import { fieldInset, unitsPerYard } from "./fieldUnits";
import { isLineman } from "./formations";
import { baseNode, CANVAS_W } from "./types";
import type { FieldView, PathNode, PlayerNode, Point, Scene } from "./types";

/** Canvas units per yard across and up the field (the Coverage check's `yardScale`, kept here so the Designer's first download stays small). */
function yardScale(view: FieldView): { x: number; y: number } {
  const v = view === "blank" ? "half" : view;
  const wide = v === "flag" ? 30 : 160 / 3;
  return { x: (CANVAS_W - fieldInset(v) * 2) / wide, y: unitsPerYard(v) };
}

/** 11-man when there's a line or nine or more on offense (the Coverage check's `formatOf`). */
function elevenMan(scene: Scene): boolean {
  const offense = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf && n.side === "offense");
  return offense.length >= 9 || offense.some(isLineman);
}

/**
 * One-click routes (Wes, 2026-11-21): a coach clicks a player, then a tile,
 * and the route is drawn in the player's color with its break side and end
 * already set. Depths are in yards from the line of scrimmage (Wes's chart),
 * so they read true on every field. Shapes are for a receiver on the right:
 * positive x breaks toward his sideline, negative x toward the middle. A
 * player left of the ball gets the shape mirrored, and Flip break mirrors it
 * again.
 */
export type QuickRoute = {
  id: string;
  label: string;
  /** What the tile says under the name. */
  depth: string;
  /** [across, depth] in yards. Depth is from the line of scrimmage, except for `fromPlayer` routes. */
  legs: [number, number][];
  curve?: boolean;
  /** Legs measured from where the player stands (the bubble). */
  fromPlayer?: boolean;
  /** The tile's little drawing in a 56×44 box, receiver at (28, 40). */
  icon: string;
};

export const QUICK_ROUTES: QuickRoute[] = [
  { id: "flat", label: "Flat", depth: "3 yds", legs: [[1.5, 2], [9, 3]], icon: "M28 40 L31 34 L52 31" },
  { id: "slant", label: "Slant", depth: "3 yds", legs: [[0, 3], [-8, 9]], icon: "M28 40 L28 32 L8 12" },
  { id: "hitch", label: "Hitch", depth: "3 yds", legs: [[0, 4], [-1, 3]], icon: "M28 40 L28 22 L24 28" },
  { id: "bubble", label: "Bubble", depth: "3-5 yds", legs: [[1.5, -1], [4.5, -0.5]], curve: true, fromPlayer: true, icon: "M28 40 Q36 46 50 40" },
  { id: "drag", label: "Drag", depth: "4-6 yds", legs: [[-2, 4], [-18, 5]], icon: "M28 40 L24 32 L4 28" },
  { id: "wheel", label: "Wheel", depth: "3-4 then up", legs: [[3, 2], [5, 4], [5.5, 15]], curve: true, icon: "M28 40 Q44 38 48 26 L50 4" },
  { id: "out", label: "Out", depth: "5 yds", legs: [[0, 5], [9, 5]], icon: "M28 40 L28 26 L52 26" },
  { id: "deepout", label: "Deep out", depth: "10-12 yds", legs: [[0, 11], [9, 11]], icon: "M28 40 L28 14 L52 14" },
  { id: "dig", label: "Dig", depth: "10 yds", legs: [[0, 10], [-12, 10]], icon: "M28 40 L28 16 L4 16" },
  { id: "curl", label: "Curl", depth: "12 back to 10", legs: [[0, 12], [-1.5, 10]], icon: "M28 40 L28 10 L22 16" },
  { id: "comeback", label: "Comeback", depth: "12 back to 10", legs: [[0, 12], [3, 10]], icon: "M28 40 L28 10 L38 16" },
  { id: "corner", label: "Corner", depth: "12 yds", legs: [[0, 12], [8, 19]], icon: "M28 40 L28 20 L50 4" },
  { id: "post", label: "Post", depth: "12 yds", legs: [[0, 12], [-8, 19]], icon: "M28 40 L28 20 L8 4" },
  { id: "go", label: "Go", depth: "12-15+ yds", legs: [[0, 15]], icon: "M28 40 L28 4" },
];

/** The ends a coach cycles through on the quick bar. */
export const QUICK_ENDS: { cap: PathNode["endCap"]; label: string }[] = [
  { cap: "arrow", label: "Arrow" },
  { cap: "tee", label: "T-block" },
  { cap: "dot", label: "Dot" },
  { cap: "none", label: "None" },
];

/**
 * A player who blocks instead of running a route: a lineman, and in an
 * 11-man layout the center. In 5-on-5 and 7-on-7 the center is a receiver.
 */
export function blocksOnTap(scene: Scene, p: PlayerNode): boolean {
  if (p.side !== "offense") return false;
  if (isLineman(p)) return true;
  if (/^(T|G|LT|LG|RT|RG|OL)$/i.test(p.label)) return true;
  return p.label.toUpperCase() === "C" && elevenMan(scene);
}

/** The color a quick route is drawn in: the player's, unless his fill is too light to read on the field. */
export function routeInk(p: PlayerNode, fallback: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(p.fill ?? "")?.[1];
  if (!hex) return fallback;
  const n = parseInt(hex, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.85 ? fallback : `#${hex.toUpperCase()}`;
}

/** Which way a player's routes break by default: mirrored when he's left of the ball. */
export const leftSide = (p: Point) => p.x < CANVAS_W / 2;

/** The route's points from the player, in canvas units. */
export function quickPoints(scene: Scene, route: QuickRoute, from: Point, mirror: boolean): Point[] {
  const u = yardScale(scene.view ?? "half");
  const sx = mirror ? -1 : 1;
  const points: Point[] = [{ x: 0, y: 0 }];
  for (const [ax, dy] of route.legs) {
    const x = ax * u.x * sx;
    const y = route.fromPlayer ? -dy * u.y : scene.losY - dy * u.y - from.y;
    // Routes stop at the sideline rather than running off the field.
    const p = { x: Math.min(CANVAS_W - 16 - from.x, Math.max(16 - from.x, x)), y };
    const prev = points[points.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) >= 6) points.push(p);
  }
  if (points.length < 2) points.push({ x: 0, y: -u.y * 5 });
  return points;
}

/** The route as a line glued to its player. `id` keeps an existing line's id (Flip break redraws it in place). */
export function quickPath(scene: Scene, route: QuickRoute, p: PlayerNode, opts: { mirror: boolean; ink: string; width: number; z: number; endCap?: PathNode["endCap"]; id?: string }): PathNode {
  const node: PathNode = {
    ...baseNode({ x: p.x, y: p.y, z: opts.z, name: `${p.label || "Player"} ${route.label}` }),
    kind: "path",
    points: quickPoints(scene, route, p, opts.mirror),
    handles: {},
    style: "solid",
    curve: route.curve ? "spline" : "straight",
    startCap: "none",
    endCap: opts.endCap ?? "arrow",
    stroke: opts.ink,
    width: opts.width,
    closed: false,
    fill: "none",
    fillOpacity: 0,
    fromId: null,
    toId: null,
    assignOf: p.id,
  };
  return opts.id ? { ...node, id: opts.id } : node;
}

/** Gives a player this route, replacing any route he already had from a tile or a preset. */
export function giveQuickRoute(scene: Scene, route: QuickRoute, p: PlayerNode, opts: { mirror: boolean; ink: string; width: number; z: number }): { scene: Scene; path: PathNode } {
  const path = quickPath(scene, route, p, opts);
  const gone = new Set(ownLines(scene, p).map((n) => n.id));
  const kept = scene.nodes.filter((n) => !gone.has(n.id));
  return { scene: { ...scene, nodes: [...kept, path] }, path };
}

/**
 * A player's own routes and blocks: glued to him, drawn by a tile or a preset,
 * or starting where he stands (a starter's or a hand-drawn line). His motion
 * is kept, since it happens before the snap.
 */
export const ownLines = (scene: Scene, p: PlayerNode) => linesOf(scene, p).filter((n) => n.style !== "motion");

/** The player's own route lines, by his id. */
export const routesOf = (scene: Scene, playerId: string) => {
  const p = scene.nodes.find((n): n is PlayerNode => n.kind === "player" && n.id === playerId);
  return p ? ownLines(scene, p) : [];
};

/**
 * A lineman's block on one defender: a line from the blocker that stops just
 * short of the defender, ending in a T. It replaces the blocker's earlier
 * block, and it follows him when he's dragged.
 */
export function blockLine(scene: Scene, blocker: PlayerNode, defender: PlayerNode, opts: { ink: string; width: number; z: number }): { scene: Scene; path: PathNode } {
  const dx = defender.x - blocker.x;
  const dy = defender.y - blocker.y;
  const len = Math.hypot(dx, dy) || 1;
  const stop = Math.max(0, len - (defender.size ?? 36) * 0.7);
  const path: PathNode = {
    ...baseNode({ x: blocker.x, y: blocker.y, z: opts.z, name: `${blocker.label || "Lineman"} blocks ${defender.label || "defender"}` }),
    kind: "path",
    points: [{ x: 0, y: 0 }, { x: (dx / len) * stop, y: (dy / len) * stop }],
    handles: {},
    style: "solid",
    curve: "straight",
    startCap: "none",
    endCap: "tee",
    stroke: opts.ink,
    width: opts.width,
    closed: false,
    fill: "none",
    fillOpacity: 0,
    fromId: null,
    toId: null,
    assignOf: blocker.id,
  };
  const gone = new Set(ownLines(scene, blocker).map((n) => n.id));
  const kept = scene.nodes.filter((n) => !gone.has(n.id));
  return { scene: { ...scene, nodes: [...kept, path] }, path };
}
