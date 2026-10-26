import type { Box } from "./geometry";
import { toWorld, unionBox, worldBox } from "./geometry";
import type { Scene, SceneNode } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";
import { TAG_SIZE, tagLayout } from "./render";

/**
 * How a diagram is framed and weighted for print. The Designer draws at
 * full-page weight; a 1-inch wristband cell needs the play cropped tight and
 * every line, token and letter made heavier, or it prints as hairlines.
 */
export type PrintFit = "field" | "play";
export type PrintField = "full" | "yards" | "lite" | "none";
export type PrintLook = {
  /** Whole field, or cropped to the players and routes. */
  fit: PrintFit;
  /** Multiplier for line, token and text sizes. "auto" picks one from the printed size. */
  weight: number | "auto";
  /** Field markings: everything, yard lines with distances, line of scrimmage only, or nothing. */
  field: PrintField;
  /** Zoom on top of the framing: below 1 shows more field, above 1 crops tighter. Default 1. */
  zoom?: number;
  /** Player icon size on top of the weight (small 0.8, medium 1, large 1.3). Default 1. */
  icons?: number;
  /** Route line thickness on top of the weight (thin 0.7, medium 1, thick 1.5). Default 1. */
  lines?: number;
  /** Solid colored dots with no letters, like most printed wristbands. */
  dots?: boolean;
  /** Yards past the line of scrimmage at each route break. Default off. */
  depths?: boolean;
  /** The coach's league rule lines (rush line, no-run zone) from Rules in the Designer. Default off. */
  rules?: boolean;
};

export const FULL_LOOK: PrintLook = { fit: "field", weight: "auto", field: "full" };
export const CARD_LOOK: PrintLook = { fit: "play", weight: "auto", field: "yards" };

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
  { id: "yards", label: "Yard lines with distances" },
  { id: "lite", label: "Line of scrimmage only" },
  { id: "full", label: "Full field markings" },
  { id: "none", label: "No field" },
];

/** Smallest stroke and token we let reach paper, in points and inches. */
const MIN_ROUTE_PT = 1.6;
const MIN_TOKEN_IN = 0.17;
/**
 * A box only so tall can only carry so big a token or line: tokens take at most
 * this share of the diagram's height, and routes this share in points, so a short
 * wristband box scales the whole drawing down together instead of printing
 * full-size tokens over a squashed field.
 */
const TOKEN_SHARE_OF_HEIGHT = 0.2;
const FLOOR_SHARE_OF_HEIGHT = 0.16;
/** Smallest token, and smallest crowded-set token, a very short box scales down to, in inches. */
const SHORT_TOKEN_IN = 0.07;
const SHORT_FLOOR_IN = 0.06;
const ROUTE_SHARE_OF_HEIGHT = 0.045;
/** Thinnest a route may be drawn, however short the box. */
const THIN_ROUTE_PT = 1.1;
/** Tokens never shrink below this multiple of their drawn size, so they stay shapes you can tell apart. */
const MIN_TOKEN_SHRINK = 0.4;
/** Crowded sets (bunch, stack) may print smaller than MIN_TOKEN_IN, but never below this. */
const FLOOR_TOKEN_IN = 0.09;
/** Below this a token's letter can't be read, so an auto-weighted token prints as a plain colored dot. */
const LETTER_TOKEN_IN = 0.11;
/** Smallest route tag or text label we let reach paper, in points. */
const MIN_TEXT_PT = 5.5;
const BASE_ROUTE = 2.6;
const BASE_TOKEN = 36;
const MAX_AUTO_LINE = 6;
const MAX_AUTO_TOKEN = 8;
const MAX_TEXT = 4;
/** Printed tokens get a white ring, so closest pairs may overlap this little. */
const TOKEN_OVERLAP = 1.1;
/** Never zoom tighter than this many canvas units across. */
const MIN_FRAME_W = 300;
const PAD = 26;

/**
 * How far tokens can grow before the closest pair runs together. Pairs drawn
 * touching on purpose (a centre with the quarterback under him) don't count;
 * the rest may overlap by a quarter, since printed tokens get a white ring
 * that keeps neighbours apart.
 */
function tokenRoom(scene: Scene): number {
  const players = scene.nodes.filter((n) => n.kind === "player" && !n.hidden) as Extract<SceneNode, { kind: "player" }>[];
  let closest = Infinity;
  for (const a of players)
    for (const b of players) {
      if (a === b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, (a.size + b.size) / 2);
      if (d >= 1) closest = Math.min(closest, d);
    }
  return Math.max(1, closest * TOKEN_OVERLAP);
}

export type Boost = {
  /** Multiplier for line widths. */
  line: number;
  /** Multiplier for player tokens and their letters. */
  token: number;
  /** Let tokens grow only as far as the room between players allows (down to `floor`). */
  fit?: boolean;
  /** Smallest token multiplier `fit` may settle on. */
  floor?: number;
  /** Solid dots with no letters. */
  dots?: boolean;
  /** Points per canvas unit on paper; lifts route tags and text to a readable size. */
  ptPerUnit?: number;
};

/** How much a label of `size` canvas units must grow to print at least MIN_TEXT_PT. */
const textBoost = (size: number, ptPerUnit?: number) =>
  ptPerUnit ? Math.min(MAX_TEXT, Math.max(1, MIN_TEXT_PT / (size * ptPerUnit))) : 1;

/**
 * Scale every line by `line` and tokens by `token`; with `fit`, tokens only
 * grow as far as the room between players allows. Route tags and text grow
 * until they print at a readable size. Positions don't move.
 */
export function boostScene(scene: Scene, b: Boost): Scene {
  const { line, token, fit = false, floor = 1, dots = false, ptPerUnit } = b;
  if (line === 1 && token === 1 && !dots && !ptPerUnit) return scene;
  const tokenK = fit ? Math.max(Math.min(token, floor), Math.min(token, tokenRoom(scene))) : token;
  const tagK = textBoost(TAG_SIZE, ptPerUnit);
  // Only auto weights drop letters; a size the coach picked keeps them.
  const tooSmall = (size: number) => fit && !!ptPerUnit && (size * ptPerUnit) / 72 < LETTER_TOKEN_IN;
  const nodes = scene.nodes.map((n): SceneNode => {
    if (n.kind === "player") return { ...n, size: n.size * tokenK, label: dots || tooSmall(n.size * tokenK) ? "" : n.label };
    if (n.kind === "path") return { ...n, width: n.width * line, ...(n.tag ? { tagScale: tagK } : {}) };
    if (n.kind === "shape") return { ...n, width: n.width * line };
    return { ...n, fontSize: n.fontSize * Math.max(Math.min(tokenK, 1.6), textBoost(n.fontSize, ptPerUnit)) };
  });
  return { ...scene, nodes: ptPerUnit ? dropCrowdedTags(nodes) : nodes };
}

/**
 * Route tags and text labels never print below MIN_TEXT_PT, so on a small box
 * a labelled play (a route tree, a fully tagged concept) lands its labels on
 * top of each other. Keep the first read's tag, then the rest in drawing
 * order, and leave off any label that would cover one already kept: a pile of
 * overlapping labels reads as nothing.
 */
function dropCrowdedTags(nodes: SceneNode[]): SceneNode[] {
  type Label = { id: string; first: boolean; box: Box };
  const labels: Label[] = [];
  for (const n of nodes) {
    if (n.hidden) continue;
    if (n.kind === "path") {
      const t = tagLayout(n);
      if (!t) continue;
      const end = toWorld(n, t.at);
      labels.push({ id: n.id, first: !!n.firstRead, box: { x: end.x + t.ox - t.halfW, y: end.y + t.oy - t.halfH, w: t.halfW * 2, h: t.halfH * 2 } });
    } else if (n.kind === "text" && n.text.trim()) {
      const w = (Math.max(40, n.text.length * n.fontSize * 0.56) + 16) * Math.abs(n.scaleX || 1);
      const h = n.fontSize * 1.64 * Math.abs(n.scaleY || 1);
      labels.push({ id: n.id, first: false, box: { x: n.x - w / 2, y: n.y - h / 2, w, h } });
    }
  }
  const kept: Box[] = [];
  const dropped = new Set<string>();
  for (const l of [...labels].sort((a, b) => Number(b.first) - Number(a.first))) {
    const b = l.box;
    if (kept.some((k) => b.x < k.x + k.w && k.x < b.x + b.w && b.y < k.y + k.h && k.y < b.y + b.h)) dropped.add(l.id);
    else kept.push(b);
  }
  if (!dropped.size) return nodes;
  return nodes.map((n): SceneNode => (!dropped.has(n.id) ? n : n.kind === "path" ? { ...n, tag: "" } : { ...n, hidden: true }));
}

/** Bounds of everything visible in the play, or null for an empty scene. */
export function playBox(scene: Scene): Box | null {
  const all = unionBox(scene.nodes.filter((n) => !n.hidden).flatMap((n) => [worldBox(n), ...tagBox(n)]));
  return all && onCanvas(all);
}

/**
 * Only the canvas is ever drawn, so anything dragged off it (a stray note, a route
 * pulled past the edge) must not shrink the whole play to fit: that is what made
 * tokens and lines print huge against a tiny field. Null when nothing is left on it.
 */
function onCanvas(b: Box): Box | null {
  const x = Math.max(b.x, 0);
  const y = Math.max(b.y, 0);
  const w = Math.min(b.x + b.w, CANVAS_W) - x;
  const h = Math.min(b.y + b.h, CANVAS_H) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Room for a route tag, which rides just past the end of its route. */
function tagBox(n: SceneNode): Box[] {
  if (n.kind !== "path" || !n.tag?.trim() || n.points.length < 2) return [];
  const end = toWorld(n, n.points[n.points.length - 1]);
  const size = TAG_SIZE * (n.tagScale ?? 1);
  const reach = n.tag.trim().length * size * 0.56 + size + 12;
  return [{ x: end.x - reach, y: end.y - reach, w: reach * 2, h: reach * 2 }];
}

/**
 * Zoom never cuts the play off: zooming in only crops empty field. The
 * zoomed box slides over the play, and grows back if the play is still wider.
 */
function keepPlay(box: Box, play: Box | null, aspect: number): Box {
  if (!play) return box;
  const slide = (lo: number, len: number, pLo: number, pLen: number) =>
    pLen >= len ? pLo + pLen / 2 - len / 2 : Math.min(Math.max(lo, pLo + pLen - len), pLo);
  const moved = { ...box, x: slide(box.x, box.w, play.x, play.w), y: slide(box.y, box.h, play.y, play.h) };
  return play.w <= box.w && play.h <= box.h ? moved : toAspect(unionBox([moved, play])!, aspect);
}

/** Grow a box about its centre until it has the given width / height ratio. */
function toAspect(b: Box, aspect: number): Box {
  let { w, h } = b;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/** Line and token weights that keep a play readable when `unitsAcross` prints `inches` wide. */
export function autoWeight(
  unitsAcross: number,
  inches: number,
  heightIn = Infinity,
): { line: number; token: number; floor: number } {
  const ptPerUnit = (inches * 72) / unitsAcross;
  // What the box can carry: full size in a tall box, scaled down with the box when it is short.
  const tokenIn = Math.min(MIN_TOKEN_IN, Math.max(SHORT_TOKEN_IN, heightIn * TOKEN_SHARE_OF_HEIGHT));
  const floorIn = Math.min(FLOOR_TOKEN_IN, Math.max(SHORT_FLOOR_IN, heightIn * FLOOR_SHARE_OF_HEIGHT));
  const routePt = Math.min(MIN_ROUTE_PT, Math.max(THIN_ROUTE_PT, heightIn * 72 * ROUTE_SHARE_OF_HEIGHT));
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  return {
    line: clamp(routePt / (BASE_ROUTE * ptPerUnit), 1, MAX_AUTO_LINE),
    token: clamp((tokenIn * 72) / (BASE_TOKEN * ptPerUnit), MIN_TOKEN_SHRINK, MAX_AUTO_TOKEN),
    floor: clamp((floorIn * 72) / (BASE_TOKEN * ptPerUnit), MIN_TOKEN_SHRINK, MAX_AUTO_TOKEN),
  };
}

/**
 * Auto weights keep tokens apart (bigger icons included) but never let them
 * print smaller than FLOOR_TOKEN_IN; a weight the coach picks is applied as
 * asked. Icon size and line thickness scale on top.
 */
function weightsFor(look: PrintLook, unitsAcross: number, inches: number, heightIn: number): Boost {
  const ptPerUnit = (inches * 72) / unitsAcross;
  const icons = look.icons ?? 1;
  const lines = look.lines ?? 1;
  if (look.weight !== "auto") return { line: look.weight * lines, token: look.weight * icons, dots: look.dots, ptPerUnit };
  const auto = autoWeight(unitsAcross, inches, heightIn);
  return { line: auto.line * lines, token: auto.token * icons, floor: auto.floor * icons, fit: true, dots: look.dots, ptPerUnit };
}

/** Shrink (zoom in) or grow (zoom out) a box about its centre. */
function zoomBox(b: Box, zoom = 1): Box {
  if (zoom === 1) return b;
  const w = b.w / zoom;
  const h = b.h / zoom;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/** The framed scene, its view box, the line weight, and points per canvas unit on paper. */
export type Framed = { scene: Scene; box: Box; weight: number; ptPerUnit: number };

/**
 * The scene and view box to print for an output of `wIn` × `hIn` inches.
 * The box always matches the output's shape, so nothing is squashed.
 */
export function frameScene(scene: Scene, look: PrintLook, wIn: number, hIn: number): Framed {
  const aspect = wIn / hIn;
  const whole = toAspect({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }, aspect);
  const ppu = (b: Box) => (wIn * 72) / b.w;
  if (look.fit === "field") {
    const w = weightsFor(look, whole.w, wIn, hIn);
    const boosted = boostScene(scene, w);
    const play = playBox(boosted);
    const box = keepPlay(zoomBox(whole, look.zoom), play && pad(play, PAD * Math.min(w.line, 2)), aspect);
    return { scene: boosted, box, weight: w.line, ptPerUnit: ppu(box) };
  }
  const raw = playBox(scene);
  if (!raw) return { scene: boostScene(scene, { line: 1, token: 1, dots: look.dots }), box: whole, weight: 1, ptPerUnit: ppu(whole) };
  // Weight depends on the zoom and the zoom on the (heavier) tokens, so settle it in two passes.
  let box = toAspect(pad(raw, PAD), aspect);
  const w = weightsFor(look, Math.max(box.w, MIN_FRAME_W), wIn, hIn);
  const boosted = boostScene(scene, w);
  const play = pad(playBox(boosted) ?? raw, PAD * Math.min(w.line, 2));
  box = toAspect(play, aspect);
  if (box.w < MIN_FRAME_W) box = toAspect({ ...box, x: box.x + box.w / 2 - MIN_FRAME_W / 2, w: MIN_FRAME_W }, aspect);
  box = keepPlay(zoomBox(box, look.zoom), play, aspect);
  return { scene: boosted, box, weight: w.line, ptPerUnit: ppu(box) };
}

const pad = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, w: b.w + p * 2, h: b.h + p * 2 });

/**
 * False when a play, printed `wIn` × `hIn` inches, has to drop its player
 * letters (auto weight turns tokens too small to letter into plain dots), so
 * the Wristbands page can warn before the coach prints. Always true for the dots look.
 */
export function lettersFit(scene: Scene, look: PrintLook, wIn: number, hIn: number): boolean {
  if (look.dots) return true;
  const printed = frameScene(scene, look, wIn, hIn).scene.nodes;
  return scene.nodes.every((n, i) => n.kind !== "player" || !n.label || n.hidden || (printed[i]?.kind === "player" && !!printed[i].label));
}
