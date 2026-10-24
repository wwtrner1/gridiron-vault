import type { PathNode, Point, SceneNode, ShapeNode } from "./types";

export type Box = { x: number; y: number; w: number; h: number };

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Rotate a local point into world space for a node's transform. */
export function toWorld(node: SceneNode, p: Point): Point {
  const sx = p.x * node.scaleX;
  const sy = p.y * node.scaleY;
  const r = rad(node.rotation);
  return {
    x: node.x + sx * Math.cos(r) - sy * Math.sin(r),
    y: node.y + sx * Math.sin(r) + sy * Math.cos(r),
  };
}

/** Inverse of toWorld — world point into a node's local space. */
export function toLocal(node: SceneNode, p: Point): Point {
  const dx = p.x - node.x;
  const dy = p.y - node.y;
  const r = rad(-node.rotation);
  const rx = dx * Math.cos(r) - dy * Math.sin(r);
  const ry = dx * Math.sin(r) + dy * Math.cos(r);
  return { x: rx / (node.scaleX || 1), y: ry / (node.scaleY || 1) };
}

/** Axis-aligned bounds in the node's own local coordinates. */
export function localBox(node: SceneNode): Box {
  switch (node.kind) {
    case "player": {
      const r = node.size / 2;
      return { x: -r, y: -r, w: node.size, h: node.size };
    }
    case "shape":
      return { x: -node.w / 2, y: -node.h / 2, w: node.w, h: node.h };
    case "text": {
      const w = Math.max(40, node.text.length * node.fontSize * 0.56);
      return { x: -w / 2, y: -node.fontSize * 0.7, w, h: node.fontSize * 1.4 };
    }
    case "path": {
      if (!node.points.length) return { x: 0, y: 0, w: 0, h: 0 };
      // A curve stays inside its control points, so they bound it; the points alone cut off a bulge.
      const hull = curveHull(node);
      const xs = hull.map((p) => p.x);
      const ys = hull.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
    }
  }
}

/** Axis-aligned world bounds, accounting for rotation and scale. */
export function worldBox(node: SceneNode): Box {
  const b = localBox(node);
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ].map((p) => toWorld(node, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bt = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bt - y };
}

export const boxesOverlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Catmull-Rom through the points, emitted as a cubic bezier path. */
export function smoothPath(pts: Point[], closed = false): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M ${p[1].x} ${p[1].y}`;
  for (let i = 1; i < p.length - 2; i++) {
    const c1 = { x: p[i].x + (p[i + 1].x - p[i - 1].x) / 6, y: p[i].y + (p[i + 1].y - p[i - 1].y) / 6 };
    const c2 = { x: p[i + 1].x - (p[i + 2].x - p[i].x) / 6, y: p[i + 1].y - (p[i + 2].y - p[i].y) / 6 };
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p[i + 1].x} ${p[i + 1].y}`;
  }
  return closed ? `${d} Z` : d;
}

export function straightPath(pts: Point[], closed = false): string {
  if (!pts.length) return "";
  const d = pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  return closed ? `${d} Z` : d;
}

/** The points a path's curve can reach: its own points plus every bezier control point it draws with. */
export function curveHull(node: PathNode): Point[] {
  const pts = node.points;
  if (pts.length < 2 || node.curve === "straight" || (node.curve === "spline" && pts.length < 3)) return pts;
  const out = [...pts];
  if (node.curve === "bezier") {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ha = node.handles[i] ?? { x: (b.x - a.x) / 3, y: (b.y - a.y) / 3 };
      const hb = node.handles[i + 1] ?? { x: (a.x - b.x) / 3, y: (a.y - b.y) / 3 };
      out.push({ x: a.x + ha.x, y: a.y + ha.y }, { x: b.x + hb.x, y: b.y + hb.y });
    }
    return out;
  }
  // Same control points smoothPath draws through.
  const p = node.closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    out.push(
      { x: p[i].x + (p[i + 1].x - p[i - 1].x) / 6, y: p[i].y + (p[i + 1].y - p[i - 1].y) / 6 },
      { x: p[i + 1].x - (p[i + 2].x - p[i].x) / 6, y: p[i + 1].y - (p[i + 2].y - p[i].y) / 6 },
    );
  }
  return out;
}

/** Cubic path using per-point control handles (the bezier node tool). */
export function bezierPath(node: PathNode): string {
  const { points, handles } = node;
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ha = handles[i] ?? { x: (b.x - a.x) / 3, y: (b.y - a.y) / 3 };
    const hb = handles[i + 1] ?? { x: (a.x - b.x) / 3, y: (a.y - b.y) / 3 };
    d += ` C ${a.x + ha.x} ${a.y + ha.y} ${b.x + hb.x} ${b.y + hb.y} ${b.x} ${b.y}`;
  }
  return node.closed ? `${d} Z` : d;
}

export function pathData(node: PathNode): string {
  if (node.curve === "bezier") return bezierPath(node);
  if (node.curve === "spline") return smoothPath(node.points, node.closed);
  return straightPath(node.points, node.closed);
}

export function polygonPoints(node: ShapeNode): string {
  const pts: string[] = [];
  const rx = node.w / 2;
  const ry = node.h / 2;
  for (let i = 0; i < node.sides; i++) {
    const a = (i / node.sides) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(rx * Math.cos(a)).toFixed(2)},${(ry * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

export const dashFor = (style: string, width: number) => {
  if (style === "dashed") return `${width * 3} ${width * 2.2}`;
  if (style === "dotted") return `${width * 0.1} ${width * 2}`;
  return undefined;
};

/** Reduce a freehand stroke to its meaningful vertices. */
export function simplify(points: Point[], tolerance = 2.2): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0]];
  for (const p of points.slice(1)) {
    if (dist(p, out[out.length - 1]) > tolerance) out.push(p);
  }
  const last = points[points.length - 1];
  if (dist(last, out[out.length - 1]) > 0.1) out.push(last);
  return out;
}

/**
 * Turns a hand-drawn path into its corners (Ramer–Douglas–Peucker): any point
 * closer than `epsilon` to the straight line between its neighbours is wobble
 * and goes; the real cuts of a route stay.
 */
export function straighten(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const a = points[0];
  const b = points[points.length - 1];
  const len = dist(a, b) || 1;
  let far = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    // Distance from p to the line a–b.
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (d > far) {
      far = d;
      at = i;
    }
  }
  if (far <= epsilon) return [a, b];
  return [...straighten(points.slice(0, at + 1), epsilon).slice(0, -1), ...straighten(points.slice(at), epsilon)];
}

/** Wavy "motion" line, drawn as a sine wave that follows the segment. */
export function motionPath(pts: Point[], amp = 5, step = 11): string {
  if (pts.length < 2) return "";
  let d = "";
  let phase = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = dist(a, b);
    const ux = (b.x - a.x) / (len || 1);
    const uy = (b.y - a.y) / (len || 1);
    const nx = -uy;
    const ny = ux;
    for (let t = 0; t < len; t += step) {
      const o = Math.sin(phase) * amp;
      const px = a.x + ux * t + nx * o;
      const py = a.y + uy * t + ny * o;
      d += `${d ? " L" : "M"} ${px.toFixed(2)} ${py.toFixed(2)}`;
      phase += Math.PI / 2;
    }
  }
  const end = pts[pts.length - 1];
  return `${d} L ${end.x} ${end.y}`;
}

export const snap = (value: number, grid: number) =>
  grid > 0 ? Math.round(value / grid) * grid : value;
