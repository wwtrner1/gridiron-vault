import { useSyncExternalStore } from "react";
import { BLOCKS, ROUTES, type Seg } from "./routes";
import { letterColor } from "./colors";
import { baseNode, CANVAS_W, FIRST_READ, STROKE_WEIGHTS, uid } from "./types";
import type { PathNode, PlayerNode, Scene } from "./types";
import { nextZ } from "./scene";

/**
 * Player presets from the Grid1ron Design canvas (Designer → Player presets):
 * build a player once — letter, shape, colors, lines and assignment — then
 * drop it on any play or apply it to the players you have selected.
 */
export type PlayerPreset = {
  id: string;
  name: string;
  label: string;
  shape: "circle" | "square" | "triangle" | "cross";
  fill: string;
  outline: string;
  outlineStyle: "solid" | "dash" | "none";
  shade: string;
  /** 1, 2 or 3 — the canvas's line weights. */
  lineWeight: 1 | 2 | 3;
  lineEnd: "arrow" | "tee" | "none";
  lineStyle: "solid" | "dashed" | "dotted" | "motion";
  lineColor: string;
  assignment: "route" | "block";
  route: string;
  block: string;
  firstRead: boolean;
  side: PlayerNode["side"];
};

const base: Omit<PlayerPreset, "id" | "name" | "label" | "fill" | "outline"> = {
  shape: "circle",
  outlineStyle: "solid",
  shade: "transparent",
  lineWeight: 2,
  lineEnd: "arrow",
  lineStyle: "solid",
  lineColor: "#0b1524",
  assignment: "route",
  route: "flat",
  block: "base",
  firstRead: false,
  side: "offense",
};

/**
 * Starter presets: one for every offensive position (in the default position
 * colors), the 11-man linemen, and a rusher. They are examples, not a limit —
 * "+ New preset" makes any player. H is the running back (GridIronVault naming).
 */
export const SEED_PRESETS: PlayerPreset[] = [
  { ...base, id: "seed-qb-drop", name: "QB Q · drop", label: "Q", fill: "#111111", outline: "#111111", route: "drop", lineEnd: "none", lineStyle: "dashed" },
  { ...base, id: "seed-x-go", name: "X · go", label: "X", fill: "#1e4fd8", outline: "#1e4fd8", route: "go" },
  { ...base, id: "seed-z-post", name: "Z · post", label: "Z", fill: "#1d7a50", outline: "#1d7a50", route: "post" },
  { ...base, id: "seed-s-out", name: "Slot S · out", label: "S", fill: "#c9b8f5", outline: "#c9b8f5", route: "out" },
  { ...base, id: "seed-h-flat", name: "Back H · flat", label: "H", fill: "#f28c28", outline: "#f28c28", route: "flat", firstRead: true },
  {
    ...base,
    id: "seed-center-block",
    name: "Center · block",
    label: "C",
    shape: "square",
    fill: "#16c8e8",
    outline: "#16c8e8",
    assignment: "block",
    block: "base",
    lineEnd: "tee",
  },
  { ...base, id: "seed-te-y-seam", name: "TE Y · seam", label: "Y", fill: "#d24b3e", outline: "#d24b3e", route: "seam" },
  {
    ...base,
    id: "seed-tackle-base",
    name: "Tackle T · base",
    label: "T",
    fill: "#ffffff",
    outline: "#0b1524",
    assignment: "block",
    block: "base",
    lineEnd: "tee",
  },
  {
    ...base,
    id: "seed-guard-pull",
    name: "Guard G · pull",
    label: "G",
    fill: "#ffffff",
    outline: "#0b1524",
    assignment: "block",
    block: "pull",
    lineEnd: "tee",
  },
  {
    ...base,
    id: "seed-nose-rush",
    name: "Nose N · rush",
    label: "N",
    shape: "cross",
    fill: "none",
    outline: "#9e3428",
    route: "rush",
    lineColor: "#9e3428",
    side: "defense",
  },
];

export const blankPreset = (): PlayerPreset => ({
  ...base,
  id: uid("pre"),
  name: "New preset",
  label: "X",
  fill: "#1e4fd8",
  outline: "#1e4fd8",
});

/* ---- Store (this browser) ---- */

const KEY = "grid1ronvault.playerPresets.v1";

function read(): PlayerPreset[] {
  if (typeof localStorage === "undefined") return SEED_PRESETS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PlayerPreset[]) : SEED_PRESETS;
  } catch {
    return SEED_PRESETS;
  }
}

let presets = read();
const listeners = new Set<() => void>();

function commit(next: PlayerPreset[]) {
  presets = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {
    /* storage blocked — presets still work this session */
  }
  listeners.forEach((l) => l());
}

export const presetStore = {
  get: () => presets,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  save(p: PlayerPreset) {
    const exists = presets.some((x) => x.id === p.id);
    commit(exists ? presets.map((x) => (x.id === p.id ? p : x)) : [...presets, p]);
  },
  remove(id: string) {
    commit(presets.filter((p) => p.id !== id));
  },
  /** Starters this coach doesn't have (new ones, or ones they deleted). */
  missingSeeds: () => SEED_PRESETS.filter((s) => !presets.some((p) => p.id === s.id)),
  addMissingSeeds() {
    commit([...presets, ...presetStore.missingSeeds()]);
  },
};

export function usePlayerPresets(): PlayerPreset[] {
  return useSyncExternalStore(presetStore.subscribe, presetStore.get, presetStore.get);
}

/* ---- Applying a preset to the field ---- */

/** Player look from a preset (letter, shape, colors, outline, shade). */
function playerLook(p: PlayerPreset): Partial<PlayerNode> {
  return {
    label: p.label,
    shape: p.shape,
    fill: p.shape === "cross" ? "none" : p.fill,
    stroke: p.outline,
    textColor: p.shape === "cross" ? p.outline : letterColor(p.fill),
    outlineStyle: p.outlineStyle,
    shade: p.shade === "transparent" ? undefined : p.shade,
    side: p.side,
  };
}

/** The route or block a preset draws from this player. */
function assignmentPath(player: PlayerNode, p: PlayerPreset, z: number): PathNode {
  const segs: Seg[] = (p.assignment === "block" ? BLOCKS[p.block] : ROUTES[p.route]) ?? ROUTES.go;
  // Break toward the near sideline, as the starter plays do.
  const mirror = player.x < CANVAS_W / 2;
  const points = [{ x: 0, y: 0 }];
  let cx = 0;
  let cy = 0;
  for (const [dx, dy] of segs) {
    cx += mirror ? -dx : dx;
    cy += dy;
    points.push({ x: cx, y: cy });
  }
  const chipRelease = p.assignment === "block" && p.block === "chip";
  const isRoute = p.assignment === "route";
  return {
    ...baseNode({ x: player.x, y: player.y, z, name: isRoute ? "Route" : "Block" }),
    kind: "path",
    points,
    handles: {},
    style: p.lineStyle,
    curve: isRoute && (p.route === "wheel" || p.route === "bubble") ? "spline" : "straight",
    startCap: "none",
    endCap: chipRelease ? "arrow" : p.lineEnd,
    stroke: p.lineColor,
    width: STROKE_WEIGHTS[p.lineWeight - 1],
    closed: false,
    fill: "none",
    fillOpacity: 0.16,
    fromId: null,
    toId: null,
    firstRead: isRoute && p.firstRead,
    assignOf: player.id,
  };
}

/**
 * Restyle the selected players with a preset and redraw their assignment.
 * A player's earlier preset route is replaced; if the preset marks the first
 * read, any other first read in the play is cleared.
 */
export function applyPreset(scene: Scene, ids: string[], p: PlayerPreset): Scene {
  const targets = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && ids.includes(n.id));
  if (!targets.length) return scene;
  const targetIds = new Set(targets.map((t) => t.id));
  let z = nextZ(scene);
  const clearReads = p.assignment === "route" && p.firstRead;
  const kept = scene.nodes
    .filter((n) => !(n.kind === "path" && n.assignOf && targetIds.has(n.assignOf)))
    .map((n) => {
      if (n.kind === "player" && targetIds.has(n.id)) return { ...n, ...playerLook(p) } as PlayerNode;
      if (clearReads && n.kind === "path" && n.firstRead) return { ...n, firstRead: false };
      return n;
    });
  const restyled = kept.filter((n): n is PlayerNode => n.kind === "player" && targetIds.has(n.id));
  // With several players selected, only the first can be the first read.
  const paths = restyled.map((pl, i) => ({ ...assignmentPath(pl, p, z++), firstRead: clearReads && i === 0 }));
  return { ...scene, nodes: [...kept, ...paths] };
}

/** Drop a new player built from a preset, with its assignment. */
export function dropPreset(scene: Scene, p: PlayerPreset, at: { x: number; y: number }, makeBase: () => PlayerNode) {
  const player: PlayerNode = { ...makeBase(), ...playerLook(p), x: at.x, y: at.y, z: nextZ(scene), name: p.name };
  const withPlayer = { ...scene, nodes: [...scene.nodes, player] };
  return { scene: applyPreset(withPlayer, [player.id], p), playerId: player.id };
}

/** CSS color for the preview of a preset's line. */
export const presetLineColor = (p: PlayerPreset) => (p.assignment === "route" && p.firstRead ? FIRST_READ : p.lineColor);
