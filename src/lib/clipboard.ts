import { cloneNodes, nextZ, selectionBox } from "./scene";
import type { Point, Scene, SceneNode } from "./types";

/**
 * The Designer's copy/paste clipboard. It lives in localStorage so a route
 * concept copied on one play pastes onto another (even in another tab); if
 * storage is blocked it still works for this visit.
 */
const KEY = "grid1ronvault.clipboard.v1";
let memory: SceneNode[] | null = null;
/** Pastes in a row step down and right, so copies don't stack exactly. */
let pasteCount = 0;

export function copyNodes(nodes: SceneNode[]) {
  memory = nodes;
  pasteCount = 0;
  try {
    localStorage.setItem(KEY, JSON.stringify(nodes));
  } catch {
    /* storage blocked or full — the in-memory copy still pastes this visit */
  }
}

export function clipboardNodes(): SceneNode[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const nodes = JSON.parse(raw);
      if (Array.isArray(nodes)) return nodes as SceneNode[];
    }
  } catch {
    /* fall back to this visit's copy */
  }
  return memory ?? [];
}

export const hasClipboard = () => clipboardNodes().length > 0;

/**
 * Adds fresh copies of the clipboard to the scene, centred on `at` when
 * given. Routes keep following a player copied with them; a link to a player
 * left behind is dropped, so the copy doesn't jump back to the original.
 */
export function pasteNodes(scene: Scene, at?: Point): { scene: Scene; ids: string[] } | null {
  const source = clipboardNodes();
  if (!source.length) return null;
  const box = selectionBox({ ...scene, nodes: source }, source.map((n) => n.id));
  let dx: number;
  let dy: number;
  if (at && box) {
    dx = at.x - (box.x + box.w / 2);
    dy = at.y - (box.y + box.h / 2);
  } else {
    pasteCount += 1;
    dx = dy = 26 * pasteCount;
  }
  const copies = cloneNodes(source, dx, dy);
  const ids = new Map(source.map((n, i) => [n.id, copies[i].id]));
  const z = nextZ(scene);
  const nodes = copies.map((n, i) => {
    const out = { ...n, z: z + i, locked: false, hidden: false } as SceneNode;
    if (out.kind === "path") {
      const relink = (id: string | null | undefined) => (id ? (ids.get(id) ?? null) : null);
      out.fromId = relink(out.fromId);
      out.toId = relink(out.toId);
      const owner = relink(out.assignOf);
      if (owner) out.assignOf = owner;
      else delete out.assignOf;
      // An auto-connect line whose two tokens didn't come along has nothing to follow.
      if (!out.fromId || !out.toId) out.toId = null;
    }
    return out;
  });
  return { scene: { ...scene, nodes: [...scene.nodes, ...nodes] }, ids: nodes.map((n) => n.id) };
}
