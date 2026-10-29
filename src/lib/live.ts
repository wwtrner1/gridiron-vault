import type { Scene, SceneNode } from "./types";

/**
 * Drawing a play together (Staff plan). Pure, so the browser and the API
 * function share it. The unit of change is a node: a coach's edits are sent as
 * the nodes they changed and the ids they removed, and the server applies them
 * to its copy. Two coaches moving different players both land; the same node
 * edited twice at once keeps the later one.
 */

export const LIVE_LIMITS = { plays: 20, nodes: 400, bytes: 400_000, name: 80, poll: 2500, pollHidden: 8000, here: 15_000 };

/** The plans whose organisations may draw together (the director's plan decides; joining is free). */
export const LIVE_PLANS = ["crew", "program", "beta", "master"];

export type LivePatch = {
  /** Nodes added or changed, whole. */
  set: SceneNode[];
  /** Ids of nodes taken off the field. */
  remove: string[];
  /** Field, line of scrimmage and the rest, only when changed. */
  frame?: Partial<Pick<Scene, "view" | "width" | "height" | "losY" | "pivot">>;
};

export type LivePlay = { id: string; orgId: string; name: string; rev: number; updatedAt: string; updatedBy: string };

const FRAME = ["view", "width", "height", "losY", "pivot"] as const;

/** JSON with sorted keys: the database does not keep key order, so equal nodes must compare equal anyway. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

export const isEmptyPatch = (p: LivePatch) => !p.set.length && !p.remove.length && !p.frame;

/** What a coach changed: `to` against `from`. */
export function diffScene(from: Scene, to: Scene): LivePatch {
  const before = new Map(from.nodes.map((n) => [n.id, canon(n)]));
  const set = to.nodes.filter((n) => before.get(n.id) !== canon(n));
  const have = new Set(to.nodes.map((n) => n.id));
  const remove = from.nodes.filter((n) => !have.has(n.id)).map((n) => n.id);
  const frame: NonNullable<LivePatch["frame"]> = {};
  for (const k of FRAME) if (canon(from[k]) !== canon(to[k])) Object.assign(frame, { [k]: to[k] });
  return { set, remove, ...(Object.keys(frame).length ? { frame } : {}) };
}

/** `patch` laid over `scene`: changed nodes replace theirs in place (new ones go on top), removed ids go. */
export function applyPatch(scene: Scene, patch: LivePatch): Scene {
  const gone = new Set(patch.remove);
  const next = new Map(patch.set.map((n) => [n.id, n]));
  const used = new Set<string>();
  const nodes = scene.nodes
    .filter((n) => !gone.has(n.id))
    .map((n) => {
      const swap = next.get(n.id);
      if (swap) used.add(n.id);
      return swap ?? n;
    });
  for (const n of patch.set) if (!used.has(n.id) && !gone.has(n.id)) nodes.push(n);
  return { ...scene, ...(patch.frame ?? {}), nodes };
}

/** The same scene to the eye: nothing for the browser to redraw. */
export const sameScene = (a: Scene, b: Scene) => canon(a) === canon(b);

const TYPES = new Set(["player", "path", "shape", "text"]);

/** Server-side check of a patch from the browser; a string is the coach-facing reason it was refused. */
export function cleanPatch(raw: unknown): LivePatch | string {
  const p = raw as Partial<LivePatch> | null;
  if (!p || typeof p !== "object" || !Array.isArray(p.set) || !Array.isArray(p.remove)) return "That change couldn't be read. Reload the play and try again.";
  if (p.set.length > LIVE_LIMITS.nodes || p.remove.length > LIVE_LIMITS.nodes) return "That's too much to change at once.";
  for (const n of p.set) {
    const node = n as { id?: unknown; type?: unknown };
    if (!node || typeof node.id !== "string" || !node.id || node.id.length > 80 || typeof node.type !== "string" || !TYPES.has(node.type)) return "One of the shapes couldn't be read. Reload the play and try again.";
  }
  const remove = p.remove.filter((id): id is string => typeof id === "string" && id.length <= 80);
  const frame: NonNullable<LivePatch["frame"]> = {};
  if (p.frame && typeof p.frame === "object") {
    const f = p.frame as Record<string, unknown>;
    if (typeof f.view === "string") frame.view = f.view as Scene["view"];
    for (const k of ["width", "height", "losY"] as const) if (typeof f[k] === "number" && Number.isFinite(f[k])) frame[k] = f[k] as number;
    if (f.pivot === null || (f.pivot && typeof f.pivot === "object")) frame.pivot = f.pivot as Scene["pivot"];
  }
  return { set: p.set as SceneNode[], remove, ...(Object.keys(frame).length ? { frame } : {}) };
}
