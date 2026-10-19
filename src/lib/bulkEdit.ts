import { BRAND_COLORS, letterColor, normalizeHex, TEAM_COLORS } from "./colors";
import type { TokenPreset } from "./presets";
import type { LocalPlaybook } from "./store";
import { CANVAS_W } from "./types";
import type { PathNode, PlayerNode, Scene, SceneNode, StoredPlay } from "./types";

/**
 * Bulk changes Griddy can make across many plays at once: recolor every
 * player with a letter ("all Ys yellow"), or swap one letter for another
 * ("pull the S out, put an H in"). Griddy only describes the change; this
 * module works out which plays and players it touches, so the coach sees
 * the count and a before/after before anything is written.
 */
export type BulkChange =
  /** Every offense player with this letter takes this fill; the letter stays readable. */
  | { op: "recolor"; letter: string; color: string }
  /** Every offense player with letter `from` becomes `to`, wearing `to`'s position color and shape. */
  | { op: "swap"; from: string; to: string }
  /** The routes, blocks and motion run by players with this letter take this color. */
  | { op: "route_color"; letter: string; color: string }
  /** The whole play flipped left to right across the middle of the field ("run it to the other side"). */
  | { op: "mirror" };

export type BulkScope = { kind: "vault" } | { kind: "playbook"; name: string } | { kind: "plays"; ids: string[] };

export type BulkEdit = { scope: BulkScope; changes: BulkChange[] };

/** Most changes one card carries. */
export const MAX_BULK_CHANGES = 6;

export const LETTER = /^[A-Z0-9]{1,3}$/;

const up = (s: string) => s.trim().toUpperCase();

/** A fill a coach asked for (hex, or a palette name such as "Yellow"), as #rrggbb; null if it isn't a color. */
export const bulkColor = (input: string) =>
  normalizeHex(input) ?? [...TEAM_COLORS, ...BRAND_COLORS].find((c) => c.name.toLowerCase() === input.trim().toLowerCase())?.hex ?? null;

function changePlayer(p: PlayerNode, change: Extract<BulkChange, { op: "recolor" | "swap" }>, tokens: TokenPreset[]): PlayerNode | null {
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
  return look
    ? { ...p, label: look.label, fill: look.fill, stroke: look.stroke, textColor: look.textColor, shape: look.shape }
    : { ...p, label: up(change.to) };
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
 * H yellow" works), and how many players changed. Node ids are kept, so
 * routes stay attached to their runners. A first read always draws in
 * FIRST_READ, so a route recolor leaves it alone and counts it instead.
 */
export function editScene(scene: Scene, changes: BulkChange[], tokens: TokenPreset[]): { scene: Scene; players: number; firstReads: number } {
  const touched = new Set<string>();
  const firstReads = new Set<string>();
  let nodes = scene.nodes;
  for (const change of changes) {
    if (change.op === "mirror") {
      nodes = nodes.map(mirrorNode);
      nodes.forEach((n) => n.kind === "player" && touched.add(n.id));
      continue;
    }
    if (change.op === "route_color") {
      const fill = bulkColor(change.color);
      const players = nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side === "offense" && up(n.label) === up(change.letter));
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
  return { scene: touched.size ? { ...scene, nodes } : scene, players: touched.size, firstReads: firstReads.size };
}

export type BulkTarget = { before: StoredPlay; after: StoredPlay; players: number; doubled: string[] };

export type BulkPlan = {
  targets: BulkTarget[];
  /** Plays in scope, changed or not. */
  inScope: number;
  /** A playbook the coach named that doesn't exist. */
  missingBook: string | null;
  /** First-read routes a route recolor left as they are. */
  firstReads: number;
};

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
  const now = new Date().toISOString();
  let firstReads = 0;
  const targets = scoped.flatMap((p): BulkTarget[] => {
    const { scene, players, firstReads: reads } = editScene(p.scene, edit.changes, tokens);
    firstReads += reads;
    if (!players) return [];
    // A swap onto a letter the play already has leaves two of them; say so rather than guess which to move.
    const letters = scene.nodes.flatMap((n) => (n.kind === "player" && n.side === "offense" && n.label ? [up(n.label)] : []));
    const doubled = [...new Set(letters.filter((l, i) => letters.indexOf(l) !== i))].filter((l) =>
      edit.changes.some((c) => c.op === "swap" && up(c.to) === l),
    );
    return [{ before: p, after: { ...p, scene, updatedAt: now }, players, doubled }];
  });
  return { targets, inScope: scoped.length, missingBook, firstReads };
}

/** "Y → yellow (#f5d33b)", "S → H", for the card and for Griddy. */
export function describeChange(c: BulkChange, colorLabel: (hex: string) => string): string {
  if (c.op === "mirror") return "Flip left ↔ right";
  if (c.op === "route_color") return `${up(c.letter)}'s routes → ${colorLabel(bulkColor(c.color) ?? c.color)}`;
  return c.op === "recolor" ? `${up(c.letter)} → ${colorLabel(bulkColor(c.color) ?? c.color)}` : `${up(c.from)} → ${up(c.to)}`;
}

type Look = Pick<PlayerNode, "label" | "fill" | "stroke" | "textColor" | "shape">;
const look = (p: PlayerNode): Look => ({ label: p.label, fill: p.fill, stroke: p.stroke, textColor: p.textColor, shape: p.shape });
const sameLook = (a: Look, b: Look) => (Object.keys(a) as (keyof Look)[]).every((k) => a[k] === b[k]);

/**
 * Undo on a field that may have changed since. A player whose only change
 * was its letter or colors gets those back and keeps any later moves; any
 * other node the bulk edit changed (a flipped line, a recolored route) goes
 * back as it was. Nodes the edit didn't touch stay as they are now.
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
  if (!changed.size) return field;
  return {
    ...field,
    nodes: field.nodes.map((n) => {
      const how = changed.get(n.id);
      const old = was.get(n.id);
      if (!how || !old) return n;
      return how === "look" && n.kind === "player" && old.kind === "player" ? { ...n, ...look(old) } : old;
    }),
  };
}
