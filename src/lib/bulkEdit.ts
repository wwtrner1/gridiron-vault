import { BRAND_COLORS, letterColor, normalizeHex, TEAM_COLORS } from "./colors";
import { convertField } from "./fieldConvert";
import type { TokenPreset } from "./presets";
import type { LocalPlaybook } from "./store";
import { CANVAS_W, STROKE_WEIGHTS } from "./types";
import type { EndCap, FieldView, LineCurve, LineStyle, PathNode, PlayerNode, PlayerShape, PlayMeta, Scene, SceneNode, StoredPlay } from "./types";

/** Which players, lines or text a style change reaches; everything left out matches. */
export type StyleWhere = {
  /** Players with this letter; for lines, the lines those players run. */
  letter?: string;
  /** The color it wears now: a player's fill, a line's or text's color. */
  color?: string;
  /** Players only: offense or defense. */
  side?: "offense" | "defense";
  /** Lines only: solid, dashed, dotted or motion now. */
  lineStyle?: LineStyle;
};

/**
 * Any look a coach can set in the Designer's Style card. Players: fill,
 * letterColor, size, shape, label, outline. Lines: color, width, lineStyle,
 * curve, endCap. Text: color, fontSize, weight.
 */
export type StyleSet = {
  fill?: string;
  letterColor?: string;
  size?: number;
  shape?: PlayerShape;
  label?: string;
  outline?: "solid" | "dash" | "none";
  color?: string;
  width?: number;
  lineStyle?: LineStyle;
  curve?: LineCurve;
  endCap?: EndCap;
  fontSize?: number;
  weight?: number;
};

export type StyleTarget = "players" | "routes" | "text";

/** One-click wristband looks. On the play: Wristband bold is the Designer's button; Sideline 2×4 thickens the routes. */
export const WRISTBAND_FORMATS = ["bold", "sideline"] as const;
export type WristbandFormat = (typeof WRISTBAND_FORMATS)[number];

export const PLAY_TYPES = ["pass", "run", "defense", "special"] as const;
/** The Designer's fields, with the names the coach sees there (kept here so the function needn't load the field drawing code). */
export const FIELD_LABELS: Record<FieldView, string> = { half: "Half field", full: "Full field", redzone: "Red zone", flag: "Flag 30×70", blank: "Whiteboard" };
export const FIELD_IDS = Object.keys(FIELD_LABELS) as FieldView[];

/** Wristband cards print the field about 4 in wide, so lines and tokens need to be at their heaviest. */
export const BOLD_WIDTH = STROKE_WEIGHTS[STROKE_WEIGHTS.length - 1];
export const BOLD_PLAYER = 44;

/** The Designer's Wristband bold on one node: heaviest lines, bigger players, heavy text. */
export function wristbandBold(n: SceneNode): SceneNode {
  if (n.kind === "path") return n.width === BOLD_WIDTH ? n : { ...n, width: BOLD_WIDTH };
  if (n.kind === "player") return n.side === "ball" || n.size >= BOLD_PLAYER ? n : { ...n, size: BOLD_PLAYER };
  if (n.kind === "text") return n.weight === 800 && n.fontSize >= 24 ? n : { ...n, weight: 800, fontSize: Math.max(n.fontSize, 24) };
  return n;
}

/** Limits a style change is held to, so a typo can't make a 400-pixel player. */
export const STYLE_LIMITS = { size: [20, 72], width: [1, 8], fontSize: [10, 64], weight: [300, 900] } as const;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/**
 * Bulk changes Griddy can make across many plays at once: recolor every
 * player with a letter ("all Ys yellow"), swap one letter for another ("pull
 * the S out, put an H in", "every green X is now a blue Z"), clear the
 * letters off the tokens, or take the text boxes off the field. Griddy only
 * describes the change; this module works out which plays and players it
 * touches, so the coach sees the count and a before/after before anything is
 * written. `only` narrows a change to players wearing that color now.
 */
export type BulkChange =
  /** Every offense player with this letter takes this fill; the letter stays readable. */
  | { op: "recolor"; letter: string; color: string; only?: string }
  /** Every offense player with letter `from` becomes `to`, wearing `to`'s position color and shape, or `color` if given. */
  | { op: "swap"; from: string; to: string; color?: string; only?: string }
  /** The routes, blocks and motion run by players with this letter take this color. */
  | { op: "route_color"; letter: string; color: string; only?: string }
  /** The letters inside player tokens are cleared: one letter's, or every player's when no letter is given. */
  | { op: "clear_letters"; letter?: string; only?: string }
  /** Every text box on the field is removed. */
  | { op: "remove_text" }
  /** The whole play flipped left to right across the middle of the field ("run it to the other side"). */
  | { op: "mirror" }
  /** Any look on players, lines or text ("make every route 5 px dashed", "players bigger", "text white"). */
  | { op: "style"; target: StyleTarget; where?: StyleWhere; set: StyleSet }
  /** A one-click wristband look on every play ("make my MID TN Blue plays Wristband bold"). */
  | { op: "wristband"; format: WristbandFormat }
  /** The field the play is drawn on (full, half, red zone, flag 30×70, whiteboard); the drawing itself stays put. */
  | { op: "field"; view: FieldView }
  /** The play's category (type) and tags. */
  | { op: "meta"; playType?: PlayMeta["playType"]; addTags?: string[]; removeTags?: string[] }
  /** The plays are filed in a playbook (made if it doesn't exist), and taken out of `from` when moving. */
  | { op: "file"; playbook: string; from?: string }
  /** New names (and formations) for particular plays, chosen by Griddy from what their diagrams show. */
  | { op: "rename"; names: { id: string; name: string; formation?: string }[] };

export type BulkScope = { kind: "vault" } | { kind: "playbook"; name: string } | { kind: "plays"; ids: string[] };

/** Narrows the scope to one category of play: a type, a tag, a formation. */
export type BulkFilter = { playType?: PlayMeta["playType"]; tag?: string; formation?: string; field?: FieldView };

export type BulkEdit = { scope: BulkScope; filter?: BulkFilter; changes: BulkChange[] };

/** Most changes one card carries. */
export const MAX_BULK_CHANGES = 6;

export const LETTER = /^[A-Z0-9]{1,3}$/;

const up = (s: string) => s.trim().toUpperCase();

/** A fill a coach asked for (hex, or a palette name such as "Yellow"), as #rrggbb; null if it isn't a color. */
export const bulkColor = (input: string) =>
  normalizeHex(input) ?? [...TEAM_COLORS, ...BRAND_COLORS].find((c) => c.name.toLowerCase() === input.trim().toLowerCase())?.hex ?? null;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Whether a player's fill reads as the color the coach named. Near enough
 * counts, so "the green Xs" finds the preset Z green and a saved team green
 * alike, while green and blue, or royal blue and navy, stay apart.
 */
export function sameColor(fill: string, asked: string): boolean {
  const a = normalizeHex(fill);
  const b = bulkColor(asked);
  if (!a || !b) return false;
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) <= 56;
}

/** The palette color nearest a fill, so Griddy can say "green" for the Z preset's #1d7a50. */
export function nearestColorName(fill: string): string | null {
  const a = normalizeHex(fill);
  if (!a) return null;
  const x = rgb(a);
  const dist = (hex: string) => {
    const y = rgb(hex);
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  return [...TEAM_COLORS, ...BRAND_COLORS].reduce((best, c) => (dist(c.hex) < dist(best.hex) ? c : best)).name;
}

/** One letter in one color, and how many plays have it: what "the green Xs" can match. */
export type VaultLook = { letter: string; color: string; plays: number };

/** Most letter-and-color pairs sent to Griddy. */
export const MAX_LOOKS = 40;

/** Every offense letter-and-color pair across the coach's plays, most common first. */
export function vaultLooks(plays: StoredPlay[]): VaultLook[] {
  const count = new Map<string, VaultLook>();
  for (const p of plays) {
    const seen = new Set<string>();
    for (const n of p.scene.nodes) {
      if (n.kind !== "player" || n.side !== "offense" || !n.label) continue;
      const color = normalizeHex(n.fill);
      const key = `${up(n.label)} ${color}`;
      if (!color || seen.has(key)) continue;
      seen.add(key);
      const look = count.get(key) ?? { letter: up(n.label), color, plays: 0 };
      look.plays++;
      count.set(key, look);
    }
  }
  return [...count.values()].sort((a, b) => b.plays - a.plays || a.letter.localeCompare(b.letter)).slice(0, MAX_LOOKS);
}

type PlayerChange = Extract<BulkChange, { op: "recolor" | "swap" | "clear_letters" }>;

function changePlayer(p: PlayerNode, change: PlayerChange, tokens: TokenPreset[]): PlayerNode | null {
  if (change.only && !sameColor(p.fill, change.only)) return null;
  if (change.op === "clear_letters") {
    if (!p.label) return null;
    // Without a letter it clears everyone, defense too; with one, offense only, like the other changes.
    if (change.letter && (p.side !== "offense" || up(p.label) !== up(change.letter))) return null;
    return { ...p, label: "" };
  }
  if (p.side !== "offense" || !p.label) return null;
  const label = up(p.label);
  if (change.op === "recolor") {
    const fill = bulkColor(change.color);
    if (label !== up(change.letter) || !fill) return null;
    if (p.fill.toLowerCase() === fill && p.stroke.toLowerCase() === fill) return null;
    return { ...p, fill, stroke: fill, textColor: letterColor(fill) };
  }
  if (label !== up(change.from) || up(change.from) === up(change.to)) return null;
  const look = tokens.find((t) => t.side === "offense" && up(t.label) === up(change.to));
  const swapped = look
    ? { ...p, label: look.label, fill: look.fill, stroke: look.stroke, textColor: look.textColor, shape: look.shape }
    : { ...p, label: up(change.to) };
  const fill = change.color ? bulkColor(change.color) : null;
  return fill ? { ...swapped, fill, stroke: fill, textColor: letterColor(fill) } : swapped;
}

function stylePlayer(p: PlayerNode, where: StyleWhere, set: StyleSet): PlayerNode | null {
  if (p.side === "ball") return null;
  if (where.letter && (p.side !== "offense" || up(p.label) !== up(where.letter))) return null;
  if (where.side && p.side !== where.side) return null;
  if (where.color && !sameColor(p.fill, where.color)) return null;
  const next = { ...p };
  const fill = set.fill ? bulkColor(set.fill) : null;
  if (fill) Object.assign(next, { fill, stroke: fill, textColor: letterColor(fill) });
  const text = set.letterColor ? bulkColor(set.letterColor) : null;
  if (text) next.textColor = text;
  if (set.size != null) next.size = clamp(set.size, STYLE_LIMITS.size);
  if (set.shape) next.shape = set.shape;
  if (set.label != null) next.label = up(set.label).slice(0, 3);
  if (set.outline) next.outlineStyle = set.outline;
  return JSON.stringify(next) === JSON.stringify(p) ? null : next;
}

function styleLine(n: PathNode, set: StyleSet): PathNode {
  const next = { ...n };
  const stroke = set.color ? bulkColor(set.color) : null;
  // A first read always draws in FIRST_READ, so its color is left alone.
  if (stroke && !n.firstRead) next.stroke = stroke;
  if (set.width != null) next.width = clamp(set.width, STYLE_LIMITS.width);
  if (set.lineStyle) next.style = set.lineStyle;
  if (set.curve) next.curve = set.curve;
  if (set.endCap) next.endCap = set.endCap;
  return next;
}

/** The player a line belongs to: the one it's glued to, else the one standing where it starts. */
function runnerOf(path: PathNode, players: PlayerNode[]): PlayerNode | undefined {
  return players.find((p) => p.id === path.fromId) ?? players.find((p) => Math.hypot(p.x - path.x, p.y - path.y) < 2);
}

/** Left to right across the middle of the field. Letters and text stay readable; lines and shapes mirror. */
function mirrorNode(n: SceneNode): SceneNode {
  const x = CANVAS_W - n.x;
  if (n.kind === "player") return { ...n, x, rotation: -n.rotation };
  if (n.kind === "text") return { ...n, x, rotation: -n.rotation, align: n.align === "start" ? "end" : n.align === "end" ? "start" : n.align };
  if (n.kind === "path")
    return {
      ...n,
      x,
      rotation: -n.rotation,
      points: n.points.map((p) => ({ x: -p.x, y: p.y })),
      handles: Object.fromEntries(Object.entries(n.handles).map(([k, h]) => [k, { x: -h.x, y: h.y }])),
    };
  return { ...n, x, rotation: -n.rotation, scaleX: -n.scaleX };
}

/**
 * One scene with every change applied in order (so "swap S for H, then make
 * H yellow" works), and how many players, lines or text boxes changed. Node ids are kept, so
 * routes stay attached to their runners. A first read always draws in
 * FIRST_READ, so a route recolor leaves it alone and counts it instead.
 */
export function editScene(scene: Scene, changes: BulkChange[], tokens: TokenPreset[]): { scene: Scene; players: number; firstReads: number } {
  const touched = new Set<string>();
  const firstReads = new Set<string>();
  let nodes = scene.nodes;
  let view = scene.view;
  let moved: Pick<Scene, "losY" | "pivot"> | null = null;
  for (const change of changes) {
    if (change.op === "mirror") {
      nodes = nodes.map(mirrorNode);
      nodes.forEach((n) => n.kind === "player" && touched.add(n.id));
      continue;
    }
    if (change.op === "field") {
      // Routes keep their depth in yards on the new field, as when the coach changes it in the Designer.
      const move = convertField({ ...scene, ...moved, nodes, view }, change.view);
      view = change.view;
      if (move.moved) (nodes = move.scene.nodes), (moved = { losY: move.scene.losY, pivot: move.scene.pivot });
      continue;
    }
    if (change.op === "meta" || change.op === "file" || change.op === "rename") continue;
    if (change.op === "wristband") {
      nodes = nodes.map((n) => {
        const next = change.format === "bold" ? wristbandBold(n) : n.kind === "path" && n.width < STROKE_WEIGHTS[2] ? { ...n, width: STROKE_WEIGHTS[2] } : n;
        if (next !== n) touched.add(n.id);
        return next;
      });
      continue;
    }
    if (change.op === "style") {
      const where = change.where ?? {};
      if (change.target === "players") {
        nodes = nodes.map((n) => {
          const next = n.kind === "player" ? stylePlayer(n, where, change.set) : null;
          if (!next) return n;
          touched.add(n.id);
          return next;
        });
      } else if (change.target === "routes") {
        const runners = where.letter
          ? nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side === "offense" && up(n.label) === up(where.letter!))
          : null;
        nodes = nodes.map((n) => {
          // Closed paths are zones, not lines anyone runs.
          if (n.kind !== "path" || n.closed) return n;
          if (runners && !runnerOf(n, runners)) return n;
          if (where.color && !sameColor(n.stroke, where.color)) return n;
          if (where.lineStyle && n.style !== where.lineStyle) return n;
          const next = styleLine(n, change.set);
          if (change.set.color && n.firstRead) firstReads.add(n.id);
          if (JSON.stringify(next) === JSON.stringify(n)) return n;
          touched.add(n.id);
          return next;
        });
      } else {
        nodes = nodes.map((n) => {
          if (n.kind !== "text" || (where.color && !sameColor(n.color, where.color))) return n;
          const color = change.set.color ? bulkColor(change.set.color) : null;
          const next = {
            ...n,
            ...(color ? { color } : {}),
            ...(change.set.fontSize != null ? { fontSize: clamp(change.set.fontSize, STYLE_LIMITS.fontSize) } : {}),
            ...(change.set.weight != null ? { weight: clamp(change.set.weight, STYLE_LIMITS.weight) } : {}),
          };
          if (JSON.stringify(next) === JSON.stringify(n)) return n;
          touched.add(n.id);
          return next;
        });
      }
      continue;
    }
    if (change.op === "remove_text") {
      const kept = nodes.filter((n) => n.kind !== "text");
      nodes.forEach((n) => n.kind === "text" && touched.add(n.id));
      nodes = kept;
      continue;
    }
    if (change.op === "route_color") {
      const fill = bulkColor(change.color);
      const players = nodes.filter(
        (n): n is PlayerNode =>
          n.kind === "player" && n.side === "offense" && up(n.label) === up(change.letter) && (!change.only || sameColor(n.fill, change.only)),
      );
      if (!fill || !players.length) continue;
      nodes = nodes.map((n) => {
        if (n.kind !== "path" || n.stroke.toLowerCase() === fill || !runnerOf(n, players)) return n;
        if (n.firstRead) {
          firstReads.add(n.id);
          return n;
        }
        touched.add(n.id);
        return { ...n, stroke: fill };
      });
      continue;
    }
    nodes = nodes.map((n) => {
      if (n.kind !== "player") return n;
      const next = changePlayer(n, change, tokens);
      if (!next) return n;
      touched.add(n.id);
      return next;
    });
  }
  const changed = touched.size > 0 || moved !== null;
  return { scene: changed || view !== scene.view ? { ...scene, ...moved, ...(changed ? { nodes } : {}), view } : scene, players: touched.size, firstReads: firstReads.size };
}

export type BulkTarget = { before: StoredPlay; after: StoredPlay; players: number; doubled: string[] };

/** A playbook a bulk edit files plays in (or takes them out of): its play ids before and after. */
export type BulkFiling = { book: LocalPlaybook; before: string[]; after: string[]; created: boolean };

export type BulkPlan = {
  targets: BulkTarget[];
  /** Playbooks whose plays change ("move them to Red Zone"). */
  filings: BulkFiling[];
  /** Plays in scope, changed or not. */
  inScope: number;
  /** A playbook the coach named that doesn't exist. */
  missingBook: string | null;
  /** First-read routes a route recolor left as they are. */
  firstReads: number;
};

/** "Trips Right" ↔ "Trips Left", keeping the coach's capitals. */
export function swapSides(text: string): string {
  return text.replace(/\b(right|left)\b/gi, (word) => {
    const to = word.toLowerCase() === "right" ? "left" : "right";
    if (word === word.toUpperCase()) return to.toUpperCase();
    return word[0] === word[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
  });
}

/** Whether a list of changes leaves plays flipped (two flips cancel out). */
export const flips = (changes: BulkChange[]) => changes.filter((c) => c.op === "mirror").length % 2 === 1;

/** A play's new type and tags, or null when the changes leave them as they are. */
function metaOf(p: StoredPlay, changes: BulkChange[]): Pick<StoredPlay, "playType" | "tags"> | null {
  let { playType, tags } = p;
  for (const c of changes) {
    if (c.op !== "meta") continue;
    if (c.playType) playType = c.playType;
    const drop = new Set((c.removeTags ?? []).map((t) => t.trim().toLowerCase()));
    tags = tags.filter((t) => !drop.has(t.trim().toLowerCase()));
    for (const t of c.addTags ?? []) if (t.trim() && !tags.some((x) => x.toLowerCase() === t.trim().toLowerCase())) tags = [...tags, t.trim()];
  }
  return playType === p.playType && JSON.stringify(tags) === JSON.stringify(p.tags) ? null : { playType, tags: tags.slice(0, 12) };
}

/** A play's new name and formation from a rename, or null when it keeps both. */
function renamedAs(p: StoredPlay, changes: BulkChange[]): Pick<StoredPlay, "name" | "formation"> | null {
  let name = p.name;
  let formation = p.formation;
  for (const c of changes) {
    if (c.op !== "rename") continue;
    const hit = c.names.find((n) => n.id === p.id);
    if (!hit) continue;
    name = hit.name;
    if (hit.formation) formation = hit.formation;
  }
  return name === p.name && formation === p.formation ? null : { name, formation };
}

const bookNamed = (books: LocalPlaybook[], name: string) => books.find((b) => b.name.trim().toLowerCase() === name.trim().toLowerCase());

/** Playbooks the scoped plays are filed in or moved out of. A playbook that doesn't exist yet is made. */
function fileBooks(changes: BulkChange[], plays: StoredPlay[], books: LocalPlaybook[]): BulkFiling[] {
  const ids = plays.map((p) => p.id);
  const out = new Map<string, BulkFiling>();
  const get = (name: string, make: boolean) => {
    const found = bookNamed(books, name) ?? [...out.values()].find((f) => f.book.name.toLowerCase() === name.trim().toLowerCase())?.book;
    if (!found && !make) return null;
    const book = found ?? { id: `book-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: name.trim(), description: "Filed by Griddy.", color: "#16C8E8", isPublic: false, playIds: [] };
    const f = out.get(book.id) ?? { book, before: book.playIds, after: book.playIds, created: !found };
    out.set(book.id, f);
    return f;
  };
  for (const c of changes) {
    if (c.op !== "file") continue;
    const to = get(c.playbook, true)!;
    to.after = [...to.after.filter((id) => !ids.includes(id)), ...ids];
    const from = c.from ? get(c.from, false) : null;
    if (from && from !== to) from.after = from.after.filter((id) => !ids.includes(id));
  }
  return [...out.values()].filter((f) => JSON.stringify(f.before) !== JSON.stringify(f.after));
}

/** Which plays a bulk edit changes, and what each looks like afterwards. */
export function planBulkEdit(edit: BulkEdit, plays: StoredPlay[], books: LocalPlaybook[], tokens: TokenPreset[]): BulkPlan {
  let scoped = plays;
  let missingBook: string | null = null;
  if (edit.scope.kind === "playbook") {
    const name = edit.scope.name.trim().toLowerCase();
    const book = books.find((b) => b.name.trim().toLowerCase() === name);
    if (!book) missingBook = edit.scope.name;
    const ids = new Set(book?.playIds ?? []);
    scoped = plays.filter((p) => ids.has(p.id));
  } else if (edit.scope.kind === "plays") {
    const ids = new Set(edit.scope.ids);
    scoped = plays.filter((p) => ids.has(p.id));
  }
  const f = edit.filter;
  if (f) {
    const lower = (v: string) => v.trim().toLowerCase();
    scoped = scoped.filter(
      (p) =>
        (!f.playType || p.playType === f.playType) &&
        (!f.tag || p.tags.some((t) => lower(t) === lower(f.tag!))) &&
        (!f.formation || lower(p.formation) === lower(f.formation)) &&
        (!f.field || p.scene.view === f.field),
    );
  }
  const now = new Date().toISOString();
  let firstReads = 0;
  const targets = scoped.flatMap((p): BulkTarget[] => {
    const { scene, players, firstReads: reads } = editScene(p.scene, edit.changes, tokens);
    firstReads += reads;
    const meta = metaOf(p, edit.changes);
    const renamed = renamedAs(p, edit.changes);
    const fieldChanged = scene.view !== p.scene.view;
    if (!players && !meta && !renamed && !fieldChanged) return [];
    // A swap onto a letter the play already has leaves two of them; say so rather than guess which to move.
    const letters = scene.nodes.flatMap((n) => (n.kind === "player" && n.side === "offense" && n.label ? [up(n.label)] : []));
    const doubled = [...new Set(letters.filter((l, i) => letters.indexOf(l) !== i))].filter((l) =>
      edit.changes.some((c) => c.op === "swap" && up(c.to) === l),
    );
    // A flipped play's name and formation follow it to the other side.
    const sides = flips(edit.changes) ? { name: swapSides(p.name), formation: swapSides(p.formation) } : {};
    return [{ before: p, after: { ...p, ...meta, ...sides, ...renamed, fieldView: scene.view, scene, updatedAt: now }, players, doubled }];
  });
  return { targets, filings: fileBooks(edit.changes, scoped, books), inScope: scoped.length, missingBook, firstReads };
}

/** "Y → yellow", "Green X → Z (royal blue)", "Clear letters", for the card and for Griddy. */
export function describeChange(c: BulkChange, colorLabel: (hex: string) => string): string {
  const name = (hex: string) => colorLabel(bulkColor(hex) ?? hex);
  const who = (letter: string, only?: string) => (only ? `${name(only).replace(/^./, (ch) => ch.toUpperCase())} ${up(letter)}` : up(letter));
  if (c.op === "mirror") return "Flip left ↔ right";
  if (c.op === "field") return `Field → ${FIELD_LABELS[c.view]}`;
  if (c.op === "wristband") return c.format === "bold" ? "Wristband bold" : "Sideline 2×4";
  if (c.op === "rename") return `Rename ${c.names.length} ${c.names.length === 1 ? "play" : "plays"}`;
  if (c.op === "file") return c.from ? `Move from ${c.from} to ${c.playbook}` : `File in ${c.playbook}`;
  if (c.op === "meta")
    return [
      c.playType && `Type → ${c.playType}`,
      c.addTags?.length && `Tag ${c.addTags.join(", ")}`,
      c.removeTags?.length && `Untag ${c.removeTags.join(", ")}`,
    ]
      .filter(Boolean)
      .join(" · ");
  if (c.op === "style") {
    const w = c.where ?? {};
    const whom =
      [w.color && name(w.color), w.lineStyle, w.side, w.letter && (c.target === "routes" ? `${up(w.letter)}'s` : up(w.letter))].filter(Boolean).join(" ") || "All";
    const noun = c.target === "routes" ? "routes" : c.target === "text" ? "text" : w.letter ? "" : "players";
    const s = c.set;
    const what = [
      s.fill && name(s.fill),
      c.target !== "players" && s.color && name(s.color),
      s.letterColor && `${name(s.letterColor)} letters`,
      s.size != null && `size ${s.size}`,
      s.shape,
      s.label != null && (s.label ? `letter ${up(s.label)}` : "no letter"),
      s.outline && `${s.outline} outline`,
      s.width != null && `${s.width} px`,
      s.lineStyle,
      s.curve,
      s.endCap && `${s.endCap} end`,
      s.fontSize != null && `${s.fontSize} pt`,
      s.weight != null && `weight ${s.weight}`,
    ]
      .filter(Boolean)
      .join(", ");
    return `${whom} ${noun}`.replace(/\s+/g, " ").trim().replace(/^./, (ch) => ch.toUpperCase()) + ` → ${what}`;
  }
  if (c.op === "remove_text") return "Remove text boxes";
  if (c.op === "clear_letters") return c.letter ? `Clear ${who(c.letter, c.only)}'s letter` : c.only ? `Clear letters on ${name(c.only)} players` : "Clear every letter";
  if (c.op === "route_color") return `${who(c.letter, c.only)}'s routes → ${name(c.color)}`;
  if (c.op === "recolor") return `${who(c.letter, c.only)} → ${name(c.color)}`;
  return `${who(c.from, c.only)} → ${up(c.to)}${c.color ? ` (${name(c.color)})` : ""}`;
}

type Look = Pick<PlayerNode, "label" | "fill" | "stroke" | "textColor" | "shape" | "size" | "outlineStyle">;
const look = (p: PlayerNode): Look => ({
  label: p.label,
  fill: p.fill,
  stroke: p.stroke,
  textColor: p.textColor,
  shape: p.shape,
  size: p.size,
  outlineStyle: p.outlineStyle,
});
const sameLook = (a: Look, b: Look) => (Object.keys(a) as (keyof Look)[]).every((k) => a[k] === b[k]);

/**
 * Undo on a field that may have changed since. A player whose only change
 * was its letter or colors gets those back and keeps any later moves; any
 * other node the bulk edit changed (a flipped line, a recolored route) goes
 * back as it was, and text boxes it removed come back. Nodes the edit didn't
 * touch stay as they are now.
 */
export function restorePlayers(field: Scene, before: Scene, after: Scene): Scene {
  const was = new Map(before.nodes.map((n) => [n.id, n] as const));
  const changed = new Map(
    after.nodes.flatMap((n) => {
      const old = was.get(n.id);
      if (!old || JSON.stringify(old) === JSON.stringify(n)) return [];
      const lookOnly =
        n.kind === "player" && old.kind === "player" && JSON.stringify({ ...n, ...look(old) }) === JSON.stringify(old) && !sameLook(look(n), look(old));
      return [[n.id, lookOnly ? "look" : "node"] as const];
    }),
  );
  const kept = new Set(after.nodes.map((n) => n.id));
  const onField = new Set(field.nodes.map((n) => n.id));
  const removed = before.nodes.filter((n) => !kept.has(n.id) && !onField.has(n.id));
  // A field change comes back whole (field, line of scrimmage, pivot) while the play is still on the field it was moved to.
  const unmove = before.view !== after.view && field.view === after.view ? { view: before.view, losY: before.losY, pivot: before.pivot } : {};
  if (!changed.size && !removed.length && !("view" in unmove)) return field;
  return {
    ...field,
    ...unmove,
    nodes: [
      ...field.nodes.map((n) => {
        const how = changed.get(n.id);
        const old = was.get(n.id);
        if (!how || !old) return n;
        return how === "look" && n.kind === "player" && old.kind === "player" ? { ...n, ...look(old) } : old;
      }),
      ...removed,
    ],
  };
}

const SHAPES: PlayerShape[] = ["circle", "square", "triangle", "diamond", "cross"];
const LINE_STYLES: LineStyle[] = ["solid", "dashed", "dotted", "motion"];
const CURVES: LineCurve[] = ["straight", "spline", "bezier"];
const END_CAPS: EndCap[] = ["none", "arrow", "tee", "dot", "chevron"];
const OUTLINES = ["solid", "dash", "none"] as const;

const pick = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
const limit = (v: unknown, range: readonly [number, number]) => {
  const n = num(v);
  return n === undefined ? undefined : clamp(n, range);
};
const text = (v: unknown, max: number) => (v == null ? "" : String(v).slice(0, max).trim());

/**
 * One of the open-ended changes (style, wristband, meta, file) as Griddy sent
 * it, checked: unknown values are dropped, and a filter that doesn't parse
 * drops the change rather than widening it. Null when nothing usable is left.
 */
export function cleanOpenChange(c: Record<string, unknown>): BulkChange | null {
  if (c.op === "wristband") {
    const format = pick(c.format, WRISTBAND_FORMATS);
    return format ? { op: "wristband", format } : null;
  }
  if (c.op === "field") {
    const view = pick(c.view, FIELD_IDS);
    return view ? { op: "field", view } : null;
  }
  if (c.op === "meta") {
    const tags = (v: unknown) => (Array.isArray(v) ? v.map((t) => text(t, 30)).filter(Boolean).slice(0, 8) : []);
    const playType = pick(c.playType, PLAY_TYPES);
    const addTags = tags(c.addTags);
    const removeTags = tags(c.removeTags);
    if (!playType && !addTags.length && !removeTags.length) return null;
    return { op: "meta", ...(playType ? { playType } : {}), ...(addTags.length ? { addTags } : {}), ...(removeTags.length ? { removeTags } : {}) };
  }
  if (c.op === "file") {
    const playbook = text(c.playbook, 120);
    const from = text(c.from, 120);
    return playbook ? { op: "file", playbook, ...(from && from.toLowerCase() !== playbook.toLowerCase() ? { from } : {}) } : null;
  }
  if (c.op !== "style") return null;
  const target = pick(c.target, ["players", "routes", "text"] as const);
  if (!target) return null;
  const w = (c.where ?? {}) as Record<string, unknown>;
  const where: StyleWhere = {};
  if (w.letter != null && w.letter !== "") {
    const letter = text(w.letter, 3).toUpperCase();
    if (!LETTER.test(letter)) return null;
    where.letter = letter;
  }
  if (w.color != null && w.color !== "") {
    const color = bulkColor(text(w.color, 30));
    if (!color) return null;
    where.color = color;
  }
  if (w.side != null && w.side !== "") {
    const side = pick(w.side, ["offense", "defense"] as const);
    if (!side) return null;
    where.side = side;
  }
  if (w.lineStyle != null && w.lineStyle !== "") {
    const lineStyle = pick(w.lineStyle, LINE_STYLES);
    if (!lineStyle) return null;
    where.lineStyle = lineStyle;
  }
  const s = (c.set ?? {}) as Record<string, unknown>;
  const color = (v: unknown) => (v == null || v === "" ? undefined : (bulkColor(text(v, 30)) ?? undefined));
  const set: StyleSet = {};
  if (target === "players") {
    set.fill = color(s.fill);
    set.letterColor = color(s.letterColor);
    set.size = limit(s.size, STYLE_LIMITS.size);
    set.shape = pick(s.shape, SHAPES);
    if (s.label != null) {
      const label = text(s.label, 3).toUpperCase();
      if (label === "" || LETTER.test(label)) set.label = label;
    }
    set.outline = pick(s.outline, OUTLINES);
  } else if (target === "routes") {
    set.color = color(s.color);
    set.width = limit(s.width, STYLE_LIMITS.width);
    set.lineStyle = pick(s.lineStyle, LINE_STYLES);
    set.curve = pick(s.curve, CURVES);
    set.endCap = pick(s.endCap, END_CAPS);
  } else {
    set.color = color(s.color);
    set.fontSize = limit(s.fontSize, STYLE_LIMITS.fontSize);
    set.weight = limit(s.weight, STYLE_LIMITS.weight);
  }
  const kept = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined)) as StyleSet;
  if (!Object.keys(kept).length) return null;
  return { op: "style", target, ...(Object.keys(where).length ? { where } : {}), set: kept };
}

/** A category filter as Griddy sent it; null when it names nothing usable. */
export function cleanFilter(f: unknown): BulkFilter | null {
  if (!f || typeof f !== "object") return null;
  const r = f as Record<string, unknown>;
  const playType = pick(r.playType, PLAY_TYPES);
  const tag = text(r.tag, 30);
  const formation = text(r.formation, 60);
  const field = pick(r.field, FIELD_IDS);
  const out: BulkFilter = { ...(playType ? { playType } : {}), ...(tag ? { tag } : {}), ...(formation ? { formation } : {}), ...(field ? { field } : {}) };
  return Object.keys(out).length ? out : null;
}
