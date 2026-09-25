import { baseNode, uid } from "./types";
import type { PathNode, Point, Scene, SceneNode, ShapeNode, TextNode } from "./types";
import { localBox, toWorld, worldBox, unionBox } from "./geometry";
import type { ToolId } from "./tools";

export const nextZ = (scene: Scene) =>
  scene.nodes.reduce((m, n) => Math.max(m, n.z), 0) + 1;

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
  dashed: { style: "dashed", endCap: "arrow" },
  block: { style: "solid", endCap: "tee" },
  motion: { style: "motion", endCap: "arrow" },
  free: { style: "solid", endCap: "none", curve: "spline" },
  connect: { style: "solid", endCap: "arrow" },
  pen: { style: "solid", endCap: "arrow", curve: "bezier" },
  zone: { style: "dashed", endCap: "none", curve: "spline", closed: true, fill: "#2E7DBE", fillOpacity: 0.16 },
  polygon: { style: "solid", endCap: "none", closed: true, fill: "#DB5A33", fillOpacity: 0.14 },
};

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
