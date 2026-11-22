/**
 * One-click fix for "this box will print with something cut off" (Wes,
 * 2026-11-22: auto adjust the error or let the coach make a quick adjustment).
 *
 * A wristband prints only the field, so a play is cut off when a player, route,
 * zone or label was dragged past the edge of the canvas in the Designer. The
 * fix pulls those pieces back onto the field, nothing else:
 *
 * - a player or label slides in (a player's routes ride along, as in the Designer);
 * - a route that still runs off the edge is shortened from its far end, keeping
 *   its start on the player and its shape;
 * - a zone or shape slides in, and shrinks only if it is bigger than the field.
 *
 * Pure: hands back a new scene and says whether the print check is now clean,
 * so the page can show what it did and offer Undo.
 */
import { toWorld, worldBox } from "./geometry";
import { cutOffs, type PrintLook } from "./printLook";
import { moveNodes, reconcileConnections } from "./scene";
import { CANVAS_H, CANVAS_W, type PathNode, type Scene, type SceneNode } from "./types";

/** How far inside the canvas edge a piece is brought, in canvas units. The second try leaves more room for tags and thick lines. */
const MARGINS = [14, 40];

export type CutFix = {
  scene: Scene;
  /** Pieces that were moved or shortened. */
  changed: number;
  /** The print check finds nothing cut off any more. */
  clean: boolean;
  /** What is still cut off, in the check's words. */
  remaining: string[];
};

const outside = (n: SceneNode, m: number) => {
  const b = worldBox(n);
  return b.x < m || b.y < m || b.x + b.w > CANVAS_W - m || b.y + b.h > CANVAS_H - m;
};

/** The slide that puts a box inside [m, size - m] on one axis (zero when it already is, or when it can't fit). */
const slide = (lo: number, len: number, size: number, m: number) => {
  if (len > size - m * 2) return m - lo;
  if (lo < m) return m - lo;
  if (lo + len > size - m) return size - m - (lo + len);
  return 0;
};

/** The route shortened about its start until its box is inside the margin (the start itself must already be inside). */
function shorten(n: PathNode, m: number): PathNode {
  let cur = n;
  for (let i = 0; i < 6 && outside(cur, m); i++) {
    const s = toWorld(cur, cur.points[0] ?? { x: 0, y: 0 });
    const b = worldBox(cur);
    // The largest share of the route that keeps every edge inside, measured from the start.
    const k = (edge: number, start: number, limit: number) => (edge === start ? 1 : Math.max(0, (limit - start) / (edge - start)));
    const share = Math.min(
      b.x < m ? k(b.x, s.x, m) : 1,
      b.x + b.w > CANVAS_W - m ? k(b.x + b.w, s.x, CANVAS_W - m) : 1,
      b.y < m ? k(b.y, s.y, m) : 1,
      b.y + b.h > CANVAS_H - m ? k(b.y + b.h, s.y, CANVAS_H - m) : 1,
    );
    const f = Math.max(0.2, Math.min(0.98, share * 0.98));
    const o = cur.points[0] ?? { x: 0, y: 0 };
    cur = {
      ...cur,
      points: cur.points.map((p, j) => (j === 0 ? p : { x: o.x + (p.x - o.x) * f, y: o.y + (p.y - o.y) * f })),
      handles: Object.fromEntries(Object.entries(cur.handles ?? {}).map(([j, h]) => [j, { x: h.x * f, y: h.y * f }])),
    };
  }
  return cur;
}

function fixWith(scene: Scene, m: number): { scene: Scene; changed: number } {
  let next = scene;
  const touched = new Set<string>();
  const mark = (id: string) => touched.add(id);

  // 1. Players, labels and shapes slide in. A player takes his routes along.
  for (const n of scene.nodes) {
    if (n.hidden || n.kind === "path" || !outside(n, m)) continue;
    const b = worldBox(n);
    const dx = slide(b.x, b.w, CANVAS_W, m);
    const dy = slide(b.y, b.h, CANVAS_H, m);
    if (!dx && !dy) continue;
    next = moveNodes(next, [n.id], dx, dy, true);
    mark(n.id);
  }

  // 2. Routes and zones: slide a loose one in, or keep a player's route on him and shorten it.
  const nodes = next.nodes.map((n) => {
    if (n.kind !== "path" || n.hidden || !outside(n, m)) return n;
    // A line joining two players is glued to them; it follows once they are in.
    if (n.fromId && n.toId) return n;
    const attached = !!(n.fromId || n.assignOf) && !n.closed;
    let out: SceneNode = n;
    if (!attached) {
      const b = worldBox(n);
      const dx = slide(b.x, b.w, CANVAS_W, m);
      const dy = slide(b.y, b.h, CANVAS_H, m);
      out = { ...n, x: n.x + dx, y: n.y + dy };
    }
    if (out.kind === "path" && outside(out, m)) {
      // Start inside first (a route that begins off the field comes in with its start), then shorten.
      const s = toWorld(out, out.points[0] ?? { x: 0, y: 0 });
      const sx = slide(s.x, 0, CANVAS_W, m);
      const sy = slide(s.y, 0, CANVAS_H, m);
      if (sx || sy) out = { ...out, x: out.x + sx, y: out.y + sy };
      out = shorten(out as PathNode, m);
    }
    if (out !== n) mark(n.id);
    return out;
  });
  next = reconcileConnections({ ...next, nodes });
  return { scene: next, changed: touched.size };
}

/**
 * Pull everything the print check flags back onto the field. Tries a snug
 * margin first and a roomier one if something is still flagged; returns the
 * best result and what, if anything, is still cut off.
 */
export function fixCutOffs(scene: Scene, look: PrintLook, wIn: number, hIn: number): CutFix {
  if (!cutOffs(scene, look, wIn, hIn).length) return { scene, changed: 0, clean: true, remaining: [] };
  let best: CutFix = { scene, changed: 0, clean: false, remaining: cutOffs(scene, look, wIn, hIn) };
  for (const m of MARGINS) {
    const tried = fixWith(scene, m);
    const remaining = cutOffs(tried.scene, look, wIn, hIn);
    if (!best.changed || remaining.length < best.remaining.length) best = { scene: tried.scene, changed: tried.changed, clean: remaining.length === 0, remaining };
    if (!remaining.length) break;
  }
  return best;
}
