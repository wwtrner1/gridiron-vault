import type { SceneNode } from "./types";

/**
 * Copy style / paste style: the look of one element (colors, line weight,
 * size) put onto others of the same kind, without moving them or touching
 * what they are (labels, routes' points, first read, tags).
 */
const FIELDS = {
  player: ["fill", "stroke", "textColor", "size", "shape", "outlineStyle", "shade"],
  path: ["stroke", "width", "style", "curve", "startCap", "endCap", "fill", "fillOpacity"],
  shape: ["fill", "fillOpacity", "stroke", "width", "dash", "radius"],
  text: ["fontSize", "color", "weight", "align", "boxed"],
} as const;

export type StyleClip = { kind: SceneNode["kind"]; values: Record<string, unknown> };

const KEY = "grid1ronvault.styleclip.v1";
let memory: StyleClip | null = null;

export function copyStyle(node: SceneNode): StyleClip {
  const values: Record<string, unknown> = {};
  for (const f of FIELDS[node.kind]) values[f] = (node as unknown as Record<string, unknown>)[f];
  memory = { kind: node.kind, values };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* storage blocked: the copied style still pastes this visit */
  }
  return memory;
}

export function styleClip(): StyleClip | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as StyleClip | null;
    if (raw && raw.kind in FIELDS && raw.values) return raw;
  } catch {
    /* fall back to this visit's copy */
  }
  return memory;
}

/** The nodes with the copied style put on every one of the same kind; the rest are left alone. */
export function pasteStyle(nodes: SceneNode[], ids: string[], clip: StyleClip): { nodes: SceneNode[]; changed: number } {
  let changed = 0;
  const out = nodes.map((n) => {
    if (!ids.includes(n.id) || n.kind !== clip.kind || n.locked) return n;
    changed++;
    return { ...n, ...clip.values } as SceneNode;
  });
  return { nodes: out, changed };
}
