import type { Box } from "./geometry";
import { unionBox, worldBox } from "./geometry";
import type { Scene, SceneNode } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";

/**
 * How a diagram is framed and weighted for print. The Designer draws at
 * full-page weight; a 1-inch wristband cell needs the play cropped tight and
 * every line, token and letter made heavier, or it prints as hairlines.
 */
export type PrintFit = "field" | "play";
export type PrintField = "full" | "lite" | "none";
export type PrintLook = {
  /** Whole field, or cropped to the players and routes. */
  fit: PrintFit;
  /** Multiplier for line, token and text sizes. "auto" picks one from the printed size. */
  weight: number | "auto";
  /** Field markings: everything, line of scrimmage only, or nothing. */
  field: PrintField;
  /** Zoom on top of the framing: below 1 shows more field, above 1 crops tighter. Default 1. */
  zoom?: number;
  /** Player icon size on top of the weight (small 0.8, medium 1, large 1.3). Default 1. */
  icons?: number;
  /** Route line thickness on top of the weight (thin 0.7, medium 1, thick 1.5). Default 1. */
  lines?: number;
  /** Solid colored dots with no letters, like most printed wristbands. */
  dots?: boolean;
};

export const FULL_LOOK: PrintLook = { fit: "field", weight: 1, field: "full" };
export const CARD_LOOK: PrintLook = { fit: "play", weight: "auto", field: "lite" };

/** Playmaker-style fine tuning, shown as chips on the Wristbands page. */
export const ZOOM_STEPS = [0.75, 1, 1.25, 1.5];
export const ICON_STEPS: { value: number; label: string }[] = [
  { value: 0.8, label: "Small" },
  { value: 1, label: "Medium" },
  { value: 1.3, label: "Large" },
];
export const LINE_STEPS: { value: number; label: string }[] = [
  { value: 0.7, label: "Thin" },
  { value: 1, label: "Medium" },
  { value: 1.5, label: "Thick" },
];

export const WEIGHT_STEPS: (number | "auto")[] = ["auto", 1, 1.5, 2, 2.5, 3];

export const FIT_OPTIONS: { id: PrintFit; label: string; hint: string }[] = [
  { id: "play", label: "Zoom to the play", hint: "Crops to the players and routes so the play fills the box." },
  { id: "field", label: "Whole field", hint: "Prints the field exactly as drawn in the Designer." },
];

export const FIELD_OPTIONS: { id: PrintField; label: string }[] = [
  { id: "lite", label: "Line of scrimmage only" },
  { id: "full", label: "Full field markings" },
  { id: "none", label: "No field" },
];

/** Smallest stroke and token we let reach paper, in points and inches. */
const MIN_ROUTE_PT = 1.6;
const MIN_TOKEN_IN = 0.17;
const BASE_ROUTE = 2.6;
const BASE_TOKEN = 36;
const MAX_AUTO = 4;
/** Never zoom tighter than this many canvas units across. */
const MIN_FRAME_W = 300;
const PAD = 26;

/**
 * How far tokens can grow before the closest pair runs together. A centre and
 * the quarterback under him may overlap a little; a spread set never does.
 */
function tokenRoom(scene: Scene): number {
  const players = scene.nodes.filter((n) => n.kind === "player" && !n.hidden) as Extract<SceneNode, { kind: "player" }>[];
  if (players.length < 2) return Infinity;
  let closest = Infinity;
  for (const a of players)
    for (const b of players) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, (a.size + b.size) / 2));
  return Math.max(1, closest * 1.3);
}

/**
 * Scale every line by `line` and tokens by `token`; with `fit`, tokens only
 * grow as far as the room between players allows. Labels follow the tokens.
 * Positions don't move.
 */
export function boostScene(scene: Scene, line: number, token = line, fit = false, dots = false): Scene {
  if (line === 1 && token === 1 && !dots) return scene;
  const tokenK = fit ? Math.min(token, tokenRoom(scene)) : token;
  const nodes = scene.nodes.map((n): SceneNode => {
    if (n.kind === "player") return { ...n, size: n.size * tokenK, label: dots ? "" : n.label };
    if (n.kind === "path") return { ...n, width: n.width * line };
    if (n.kind === "shape") return { ...n, width: n.width * line };
    return { ...n, fontSize: n.fontSize * Math.min(tokenK, 1.6) };
  });
  return { ...scene, nodes };
}

/** Bounds of everything visible in the play, or null for an empty scene. */
export function playBox(scene: Scene): Box | null {
  return unionBox(scene.nodes.filter((n) => !n.hidden).map(worldBox));
}

/** Grow a box about its centre until it has the given width / height ratio. */
function toAspect(b: Box, aspect: number): Box {
  let { w, h } = b;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/** Line and token weights that keep a play readable when `unitsAcross` prints `inches` wide. */
export function autoWeight(unitsAcross: number, inches: number): { line: number; token: number } {
  const ptPerUnit = (inches * 72) / unitsAcross;
  const clamp = (v: number) => Math.min(MAX_AUTO, Math.max(1, v));
  return {
    line: clamp(MIN_ROUTE_PT / (BASE_ROUTE * ptPerUnit)),
    token: clamp((MIN_TOKEN_IN * 72) / (BASE_TOKEN * ptPerUnit)),
  };
}

/**
 * Auto weights keep tokens apart (bigger icons included); a weight the coach
 * picks is applied as asked. Icon size and line thickness scale on top.
 */
function weightsFor(look: PrintLook, unitsAcross: number, inches: number) {
  const base = look.weight === "auto" ? { ...autoWeight(unitsAcross, inches), fit: true } : { line: look.weight, token: look.weight, fit: false };
  return { line: base.line * (look.lines ?? 1), token: base.token * (look.icons ?? 1), fit: base.fit };
}

/** Shrink (zoom in) or grow (zoom out) a box about its centre. */
function zoomBox(b: Box, zoom = 1): Box {
  if (zoom === 1) return b;
  const w = b.w / zoom;
  const h = b.h / zoom;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

export type Framed = { scene: Scene; box: Box; weight: number };

/**
 * The scene and view box to print for an output of `wIn` × `hIn` inches.
 * The box always matches the output's shape, so nothing is squashed.
 */
export function frameScene(scene: Scene, look: PrintLook, wIn: number, hIn: number): Framed {
  const aspect = wIn / hIn;
  const whole = toAspect({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }, aspect);
  if (look.fit === "field") {
    const w = weightsFor(look, whole.w, wIn);
    return { scene: boostScene(scene, w.line, w.token, w.fit, look.dots), box: zoomBox(whole, look.zoom), weight: w.line };
  }
  const raw = playBox(scene);
  if (!raw) return { scene: boostScene(scene, 1, 1, false, look.dots), box: whole, weight: 1 };
  // Weight depends on the zoom and the zoom on the (heavier) tokens, so settle it in two passes.
  let box = toAspect(pad(raw, PAD), aspect);
  const w = weightsFor(look, Math.max(box.w, MIN_FRAME_W), wIn);
  const boosted = boostScene(scene, w.line, w.token, w.fit, look.dots);
  box = toAspect(pad(playBox(boosted) ?? raw, PAD * Math.min(w.line, 2)), aspect);
  if (box.w < MIN_FRAME_W) box = toAspect({ ...box, x: box.x + box.w / 2 - MIN_FRAME_W / 2, w: MIN_FRAME_W }, aspect);
  return { scene: boosted, box: zoomBox(box, look.zoom), weight: w.line };
}

const pad = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, w: b.w + p * 2, h: b.h + p * 2 });
