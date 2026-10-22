import { baseNode, uid } from "./types";
import type { PathNode, PlayerNode, Point, Scene, SceneNode, ShapeNode, TextNode } from "./types";
import { dist, localBox, straighten, toLocal, toWorld, worldBox, unionBox } from "./geometry";
import { fieldInset } from "./field";
import { CANVAS_H, CANVAS_W } from "./types";
import type { ToolId } from "./tools";

export const nextZ = (scene: Scene) =>
  scene.nodes.reduce((m, n) => Math.max(m, n.z), 0) + 1;

/** Puts `ids` under everything else, keeping their order among themselves. */
export function sendToBack(scene: Scene, ids: string[]): Scene {
  const rest = scene.nodes.filter((n) => !ids.includes(n.id));
  const floor = rest.reduce((m, n) => Math.min(m, n.z), Infinity);
  const base = (Number.isFinite(floor) ? floor : 0) - ids.length;
  return { ...scene, nodes: scene.nodes.map((n) => (ids.includes(n.id) ? { ...n, z: base + ids.indexOf(n.id) } : n)) };
}

/** Expand a click target to its whole group unless click-through is on. */
export function resolveSelection(scene: Scene, id: string, clickThrough: boolean): string[] {
  const node = scene.nodes.find((n) => n.id === id);
  if (!node) return [];
  if (clickThrough || !node.groupId) return [id];
  return scene.nodes.filter((n) => n.groupId === node.groupId).map((n) => n.id);
}

export function selectionBox(scene: Scene, ids: string[]) {
  const boxes = scene.nodes.filter((n) => ids.includes(n.id)).map(worldBox);
  return unionBox(boxes);
}

export function cloneNodes(nodes: SceneNode[], dx = 0, dy = 0): SceneNode[] {
  const groupMap = new Map<string, string>();
  return nodes.map((n) => {
    let groupId = n.groupId;
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid("grp"));
      groupId = groupMap.get(groupId)!;
    }
    return { ...n, id: uid(), groupId, x: n.x + dx, y: n.y + dy };
  });
}

/** Keep auto-connect lines glued to the tokens they were drawn between. */
export function reconcileConnections(scene: Scene): Scene {
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  let changed = false;
  const nodes = scene.nodes.map((n) => {
    if (n.kind !== "path" || (!n.fromId && !n.toId)) return n;
    const from = n.fromId ? byId.get(n.fromId) : null;
    const to = n.toId ? byId.get(n.toId) : null;
    if (!from || !to) return n;
    const a = { x: from.x, y: from.y };
    const b = { x: to.x, y: to.y };
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const padA = from.kind === "player" ? from.size / 2 + 3 : 0;
    const padB = to.kind === "player" ? to.size / 2 + 6 : 0;
    const p0 = { x: a.x + ((b.x - a.x) / len) * padA, y: a.y + ((b.y - a.y) / len) * padA };
    const p1 = { x: b.x - ((b.x - a.x) / len) * padB, y: b.y - ((b.y - a.y) / len) * padB };
    if (n.x === p0.x && n.y === p0.y && n.points[1]?.x === p1.x - p0.x) return n;
    changed = true;
    return { ...n, x: p0.x, y: p0.y, rotation: 0, scaleX: 1, scaleY: 1, points: [{ x: 0, y: 0 }, { x: p1.x - p0.x, y: p1.y - p0.y }] };
  });
  return changed ? { ...scene, nodes } : scene;
}

const LINE_DEFAULTS: Record<string, Partial<PathNode>> = {
  line: { style: "solid", endCap: "arrow" },
  arc: { style: "solid", endCap: "arrow", curve: "spline" },
  dashed: { style: "dashed", endCap: "arrow" },
  block: { style: "solid", endCap: "tee" },
  motion: { style: "motion", endCap: "arrow" },
  free: { style: "solid", endCap: "none", curve: "spline" },
  connect: { style: "solid", endCap: "arrow" },
  pen: { style: "solid", endCap: "arrow", curve: "bezier" },
  zone: { style: "dashed", endCap: "none", curve: "spline", closed: true, fill: "#2E7DBE", fillOpacity: 0.16 },
  polygon: { style: "solid", endCap: "none", closed: true, fill: "#DB5A33", fillOpacity: 0.14 },
};

/** How a line looks apart from its ink and weight: dash, curve and end. */
export type LineLook = Partial<Pick<PathNode, "style" | "curve" | "endCap">>;

/** The look a line tool gives a new line; anything that isn't a line tool reads as the route arrow. */
export function toolLook(tool: ToolId): Required<LineLook> {
  const d = { style: "solid", curve: "straight", endCap: "none", ...(LINE_DEFAULTS[tool] ?? LINE_DEFAULTS.line) } as PathNode;
  return { style: d.style, curve: d.curve, endCap: d.endCap };
}

export function makePath(tool: ToolId, origin: Point, points: Point[], color: string, width: number, z: number): PathNode {
  return {
    ...baseNode({ x: origin.x, y: origin.y, z, name: LABELS[tool] ?? "Line" }),
    kind: "path",
    points,
    handles: {},
    style: "solid",
    curve: "straight",
    startCap: "none",
    endCap: "none",
    stroke: color,
    width,
    closed: false,
    fill: "none",
    fillOpacity: 0.16,
    fromId: null,
    toId: null,
    ...LINE_DEFAULTS[tool],
  } as PathNode;
}

export function makeShape(kind: "rect" | "ellipse", origin: Point, w: number, h: number, color: string, z: number): ShapeNode {
  return {
    ...baseNode({ x: origin.x, y: origin.y, z, name: kind === "rect" ? "Rectangle" : "Ellipse" }),
    kind: "shape",
    shapeType: kind,
    w,
    h,
    sides: 5,
    fill: "#FFFFFF",
    fillOpacity: 0.5,
    stroke: color,
    width: 2.4,
    dash: "solid",
    radius: 6,
  };
}

export function makeText(origin: Point, text: string, color: string, z: number): TextNode {
  return {
    ...baseNode({ x: origin.x, y: origin.y, z, name: "Text" }),
    kind: "text",
    text,
    fontSize: 20,
    color,
    weight: 700,
    align: "middle",
    boxed: false,
  };
}

const LABELS: Record<string, string> = {
  line: "Route",
  arc: "Route",
  dashed: "Pass / coverage",
  block: "Block",
  motion: "Motion",
  free: "Freehand",
  connect: "Connector",
  pen: "Curve",
  zone: "Coverage zone",
  polygon: "Polygon",
};

export function describe(node: SceneNode): string {
  if (node.name) return node.name;
  if (node.kind === "player") return node.label || "Player";
  if (node.kind === "text") return node.text.slice(0, 22) || "Text";
  return node.kind;
}

/** Nudge, align and distribute helpers used by the Arrange panel. */
export function alignNodes(scene: Scene, ids: string[], edge: string): Scene {
  const box = selectionBox(scene, ids);
  if (!box || ids.length < 2) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((n) => {
      if (!ids.includes(n.id)) return n;
      const b = worldBox(n);
      switch (edge) {
        case "left":
          return { ...n, x: n.x + (box.x - b.x) };
        case "right":
          return { ...n, x: n.x + (box.x + box.w - (b.x + b.w)) };
        case "centerX":
          return { ...n, x: n.x + (box.x + box.w / 2 - (b.x + b.w / 2)) };
        case "top":
          return { ...n, y: n.y + (box.y - b.y) };
        case "bottom":
          return { ...n, y: n.y + (box.y + box.h - (b.y + b.h)) };
        default:
          return { ...n, y: n.y + (box.y + box.h / 2 - (b.y + b.h / 2)) };
      }
    }),
  };
}

export function distributeNodes(scene: Scene, ids: string[], axis: "x" | "y"): Scene {
  if (ids.length < 3) return scene;
  const picked = scene.nodes.filter((n) => ids.includes(n.id)).sort((a, b) => a[axis] - b[axis]);
  const first = picked[0][axis];
  const last = picked[picked.length - 1][axis];
  const step = (last - first) / (picked.length - 1);
  const target = new Map(picked.map((n, i) => [n.id, first + step * i]));
  return {
    ...scene,
    nodes: scene.nodes.map((n) => (target.has(n.id) ? { ...n, [axis]: target.get(n.id)! } : n)),
  };
}

export function flipNodes(scene: Scene, ids: string[], axis: "x" | "y"): Scene {
  const box = selectionBox(scene, ids);
  if (!box) return scene;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    ...scene,
    nodes: scene.nodes.map((n) => {
      if (!ids.includes(n.id)) return n;
      if (axis === "x") return { ...n, x: cx - (n.x - cx), scaleX: -n.scaleX, rotation: -n.rotation };
      return { ...n, y: cy - (n.y - cy), scaleY: -n.scaleY, rotation: -n.rotation };
    }),
  };
}

export function anchorPoint(node: SceneNode, ax: number, ay: number): Point {
  const b = localBox(node);
  return toWorld(node, { x: b.x + b.w * ax, y: b.y + b.h * ay });
}

/* ------------------------------------------------------ right-click route ops */

/** How far (field px) a route's start may be from a player and still snap to him. */
const SNAP_REACH = 140;

/**
 * Moves each loose route so it starts on the nearest player and glues it to
 * him (`fromId`), so it follows when he moves. Routes already on a player,
 * and ones with no player in reach, are left alone.
 */
export function snapPathsToPlayers(scene: Scene, ids: string[]): { scene: Scene; snapped: string[] } {
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden);
  const snapped: string[] = [];
  const nodes = scene.nodes.map((n) => {
    if (n.kind !== "path" || !ids.includes(n.id) || n.closed || n.toId || n.assignOf || !n.points.length) return n;
    const start = toWorld(n, n.points[0]);
    let best: PlayerNode | null = null;
    for (const p of players) if (dist(p, start) < SNAP_REACH && (!best || dist(p, start) < dist(best, start))) best = p;
    if (!best || (n.fromId === best.id && dist(best, start) < 1)) return n;
    snapped.push(best.label || best.name || "player");
    return { ...n, x: n.x + best.x - start.x, y: n.y + best.y - start.y, fromId: best.id };
  });
  return { scene: snapped.length ? { ...scene, nodes } : scene, snapped };
}

/** Line tool kinds that are clean-up candidates: open lines, not auto-connects or zones. */
const reshapeable = (n: SceneNode, ids: string[]): n is PathNode =>
  n.kind === "path" && ids.includes(n.id) && !n.closed && !n.toId && n.points.length > 2;

/**
 * Turns shaky hand-drawn lines into one smooth curve: wobble is dropped and
 * the remaining points are joined with a spline.
 */
export function smoothPaths(scene: Scene, ids: string[]): Scene {
  return {
    ...scene,
    nodes: scene.nodes.map((n) => (reshapeable(n, ids) ? { ...n, points: straighten(n.points, 5), curve: "spline", handles: {} } : n)),
  };
}

/** Turns a hand-drawn line into its real cuts, joined with straight legs. */
export function straightenPaths(scene: Scene, ids: string[]): Scene {
  return {
    ...scene,
    nodes: scene.nodes.map((n) => (reshapeable(n, ids) ? { ...n, points: straighten(n.points, 12), curve: "straight", handles: {} } : n)),
  };
}

/**
 * One click to tidy every hand-drawn line in the play, each the way it was
 * meant: curved lines (freehand, arcs) are smoothed, straight routes get clean
 * cuts. Lines shaped by hand with the bezier pen are left alone.
 */
export function cleanUpPaths(scene: Scene): { scene: Scene; count: number } {
  const ids = scene.nodes.map((n) => n.id);
  let count = 0;
  const nodes = scene.nodes.map((n) => {
    if (!reshapeable(n, ids) || (n.curve === "bezier" && Object.keys(n.handles ?? {}).length)) return n;
    const smooth = n.curve !== "straight";
    const points = straighten(n.points, smooth ? 5 : 12);
    if (points.length === n.points.length) return n;
    count++;
    return { ...n, points, curve: smooth ? "spline" : "straight", handles: {} } as PathNode;
  });
  return { scene: count ? { ...scene, nodes } : scene, count };
}

/** Every line `cleanUpPaths` could tidy, smoothed (`"smooth"`) or straightened. */
export function reshapeAll(scene: Scene, how: "smooth" | "straight"): Scene {
  const ids = scene.nodes.map((n) => n.id);
  return how === "smooth" ? smoothPaths(scene, ids) : straightenPaths(scene, ids);
}

/* ------------------------------------------------------ pre-snap ghosts */

/** How far (field px) a new ghost starts from its player, toward the middle of the field. */
const GHOST_STEP = 110;

/**
 * Adds a faded copy of a player where he lines up before the snap, joined to
 * him by a thin dotted auto-connect line, so motion or a shift reads at a
 * glance. Both are real nodes: they move, flip, print and undo like the rest.
 * Returns the ghost's id so the coach can drag it straight to the spot.
 */
export function addGhost(scene: Scene, playerId: string): { scene: Scene; ghostId: string | null } {
  const p = scene.nodes.find((n): n is PlayerNode => n.kind === "player" && n.id === playerId && !n.ghostOf);
  if (!p || scene.nodes.some((n) => n.kind === "player" && n.ghostOf === p.id)) return { scene, ghostId: null };
  const z = nextZ(scene);
  const toward = p.x > CANVAS_W / 2 ? -1 : 1;
  const ghost: PlayerNode = { ...p, ...baseNode({ x: p.x + toward * GHOST_STEP, y: p.y, z, name: `${p.label || "Player"} pre-snap` }), ghostOf: p.id, note: undefined, shade: undefined, groupId: null };
  const link: PathNode = {
    ...makePath("connect", { x: ghost.x, y: ghost.y }, [{ x: 0, y: 0 }, { x: 1, y: 0 }], "#8A9BA8", 2, z - 0.5),
    style: "dotted",
    endCap: "none",
    name: "Pre-snap link",
    fromId: ghost.id,
    toId: p.id,
  };
  return { scene: reconcileConnections({ ...scene, nodes: [...scene.nodes, link, ghost] }), ghostId: ghost.id };
}

/** Takes a player's ghost, and the dotted line to it, back off the field. */
export function removeGhost(scene: Scene, playerId: string): Scene {
  const ghosts = new Set(scene.nodes.filter((n) => n.kind === "player" && n.ghostOf === playerId).map((n) => n.id));
  if (!ghosts.size) return scene;
  return {
    ...scene,
    nodes: scene.nodes.filter((n) => !ghosts.has(n.id) && !(n.kind === "path" && n.fromId && ghosts.has(n.fromId) && n.toId === playerId)),
  };
}

/* ------------------------------------------------------------ line snaps */

/** Open lines among `ids` that can be re-pointed (not auto-connects or zones). */
const snappable = (n: SceneNode, ids: string[]): n is PathNode =>
  n.kind === "path" && ids.includes(n.id) && !n.closed && !n.toId && n.points.length >= 2;

/** Rewrites a line from world-space points, keeping its own transform. */
const fromWorld = (n: PathNode, world: Point[]): PathNode => ({ ...n, points: world.map((p) => toLocal(n, p)), handles: {} });

/**
 * Runs each line's last leg on, in the direction it's already going, until it
 * meets the sideline (or the top or bottom of the field first). A leg running
 * straight up or down the field has no sideline to meet and is left alone.
 */
export function extendToSideline(scene: Scene, ids: string[]): { scene: Scene; count: number } {
  const inset = fieldInset(scene.view) + 6;
  let count = 0;
  const nodes = scene.nodes.map((n) => {
    if (!snappable(n, ids)) return n;
    const world = n.points.map((p) => toWorld(n, p));
    const end = world[world.length - 1];
    const prev = world[world.length - 2];
    const dx = end.x - prev.x;
    const dy = end.y - prev.y;
    if (Math.abs(dx) < 0.5 * Math.abs(dy) || Math.abs(dx) < 1) return n;
    const tx = ((dx > 0 ? CANVAS_W - inset : inset) - end.x) / dx;
    const ty = dy === 0 ? Infinity : ((dy > 0 ? CANVAS_H - 8 : 8) - end.y) / dy;
    const t = Math.min(tx, ty);
    if (!(t > 0.01)) return n;
    count++;
    return fromWorld(n, [...world.slice(0, -1), { x: end.x + dx * t, y: end.y + dy * t }]);
  });
  return { scene: count ? { ...scene, nodes } : scene, count };
}

/** Cuts each line where it first crosses the line of scrimmage: a block or a rush that stops at the line. */
export function stopAtLos(scene: Scene, ids: string[]): { scene: Scene; count: number } {
  const los = scene.losY;
  let count = 0;
  const nodes = scene.nodes.map((n) => {
    if (!snappable(n, ids)) return n;
    const world = n.points.map((p) => toWorld(n, p));
    for (let i = 0; i < world.length - 1; i++) {
      const a = world[i];
      const b = world[i + 1];
      if ((a.y - los) * (b.y - los) >= 0) continue;
      const t = (los - a.y) / (b.y - a.y);
      count++;
      return fromWorld(n, [...world.slice(0, i + 1), { x: a.x + (b.x - a.x) * t, y: los }]);
    }
    return n;
  });
  return { scene: count ? { ...scene, nodes } : scene, count };
}

/**
 * Bends each line around any player it runs through (other than the one it
 * starts from or ends on) by adding a turn just outside his token.
 */
export function bendAroundPlayers(scene: Scene, ids: string[]): { scene: Scene; count: number } {
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf);
  let count = 0;
  const nodes = scene.nodes.map((n) => {
    if (!snappable(n, ids)) return n;
    const world = n.points.map((p) => toWorld(n, p));
    const start = world[0];
    const finish = world[world.length - 1];
    const out: Point[] = [world[0]];
    let bent = false;
    for (let i = 0; i < world.length - 1; i++) {
      const a = world[i];
      const b = world[i + 1];
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      let hit: { p: PlayerNode; t: number; d: number } | null = null;
      for (const p of players) {
        const r = p.size / 2 + 8;
        if (p.id === n.fromId || dist(p, start) <= r || dist(p, finish) <= r) continue;
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2;
        if (t <= 0.02 || t >= 0.98) continue;
        const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const d = dist(p, c);
        if (d < r && (!hit || t < hit.t)) hit = { p, t, d };
      }
      if (hit) {
        const { p, t } = hit;
        const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const len = Math.sqrt(len2);
        // Push out on the side the line already passes, or to its left when it runs dead centre.
        let nx = c.x - p.x;
        let ny = c.y - p.y;
        if (Math.hypot(nx, ny) < 0.5) {
          nx = -(b.y - a.y) / len;
          ny = (b.x - a.x) / len;
        }
        const k = (p.size / 2 + 14) / (Math.hypot(nx, ny) || 1);
        out.push({ x: p.x + nx * k, y: p.y + ny * k });
        bent = true;
      }
      out.push(b);
    }
    if (!bent) return n;
    count++;
    return fromWorld(n, out);
  });
  return { scene: count ? { ...scene, nodes } : scene, count };
}

/** True when any of `ids` is a line `smoothPaths`/`straightenPaths` can reshape. */
export const canReshape = (scene: Scene, ids: string[]) => scene.nodes.some((n) => reshapeable(n, ids));
