import { cloneNodes, nextZ, selectionBox } from "./scene";
import type { Point, Scene, SceneNode } from "./types";

/**
 * The Designer's copy/paste clipboard. It lives in localStorage so a route
 * concept copied on one play pastes onto another (even in another tab); if
 * storage is blocked it still works for this visit.
 */
const KEY = "grid1ronvault.clipboard.v1";
/** Which end the copied play was drawn from: the defense's, the offense's, or unknown (a copy kept before this was recorded). */
type CopiedFrom = "defense" | "offense" | "unknown";
type Clip = { from: CopiedFrom; nodes: SceneNode[] };
let memory: Clip | null = null;
/** Pastes in a row step down and right, so copies don't stack exactly. */
let pasteCount = 0;

export function copyNodes(nodes: SceneNode[], pov?: Scene["pov"]) {
  const clip: Clip = { from: pov === "defense" ? "defense" : "offense", nodes };
  memory = clip;
  pasteCount = 0;
  try {
    localStorage.setItem(KEY, JSON.stringify(clip));
  } catch {
    /* storage blocked or full — the in-memory copy still pastes this visit */
  }
}

function readClip(): Clip | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Older copies are a bare list of elements with no record of the end they came from.
      if (Array.isArray(saved)) return { from: "unknown", nodes: saved as SceneNode[] };
      if (saved && Array.isArray(saved.nodes)) return { from: saved.from === "defense" || saved.from === "offense" ? saved.from : "unknown", nodes: saved.nodes as SceneNode[] };
    }
  } catch {
    /* fall back to this visit's copy */
  }
  return memory;
}

export function clipboardNodes(): SceneNode[] {
  return readClip()?.nodes ?? [];
}

export const hasClipboard = () => clipboardNodes().length > 0;

/**
 * A play drawn from the defense's end holds every element turned half a circle.
 * Copies taken from the other end are turned about their own centre before they
 * land, so a route concept copied from an upright play still runs toward the
 * defense on a flipped play, and the reverse. The end is recorded when the copy
 * is taken (the elements' own scales can't say: a line drawn by hand on a turned
 * play is stored unscaled), and a copy with no record is pasted as it is.
 */
function sameWayUp(scene: Scene, clip: Clip): SceneNode[] {
  const { nodes } = clip;
  if (clip.from === "unknown" || (clip.from === "defense") === (scene.pov === "defense")) return nodes;
  const box = selectionBox({ ...scene, nodes }, nodes.map((n) => n.id));
  if (!box) return nodes;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return nodes.map((n) => ({ ...n, x: 2 * cx - n.x, y: 2 * cy - n.y, scaleX: -n.scaleX, scaleY: -n.scaleY }));
}

/**
 * Adds fresh copies of the clipboard to the scene, centred on `at` when
 * given. Routes keep following a player copied with them; a link to a player
 * left behind is dropped, so the copy doesn't jump back to the original.
 */
export function pasteNodes(scene: Scene, at?: Point): { scene: Scene; ids: string[] } | null {
  const clip = readClip();
  if (!clip || !clip.nodes.length) return null;
  const source = sameWayUp(scene, clip);
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
