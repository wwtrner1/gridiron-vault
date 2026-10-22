import { BRAND_COLORS, letterColor, normalizeHex, TEAM_COLORS } from "./colors";
import type { TokenPreset } from "./presets";
import type { LocalPlaybook } from "./store";
import { CANVAS_W } from "./types";
import type { PathNode, PlayerNode, Scene, SceneNode, StoredPlay } from "./types";

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
  for (const change of changes) {
    if (change.op === "mirror") {
      nodes = nodes.map(mirrorNode);
      nodes.forEach((n) => n.kind === "player" && touched.add(n.id));
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
    // A flipped play's name and formation follow it to the other side.
    const sides = flips(edit.changes) ? { name: swapSides(p.name), formation: swapSides(p.formation) } : {};
    return [{ before: p, after: { ...p, ...sides, scene, updatedAt: now }, players, doubled }];
  });
  return { targets, inScope: scoped.length, missingBook, firstReads };
}

/** "Y → yellow", "Green X → Z (royal blue)", "Clear letters", for the card and for Griddy. */
export function describeChange(c: BulkChange, colorLabel: (hex: string) => string): string {
  const name = (hex: string) => colorLabel(bulkColor(hex) ?? hex);
  const who = (letter: string, only?: string) => (only ? `${name(only).replace(/^./, (ch) => ch.toUpperCase())} ${up(letter)}` : up(letter));
  if (c.op === "mirror") return "Flip left ↔ right";
  if (c.op === "remove_text") return "Remove text boxes";
  if (c.op === "clear_letters") return c.letter ? `Clear ${who(c.letter, c.only)}'s letter` : c.only ? `Clear letters on ${name(c.only)} players` : "Clear every letter";
  if (c.op === "route_color") return `${who(c.letter, c.only)}'s routes → ${name(c.color)}`;
  if (c.op === "recolor") return `${who(c.letter, c.only)} → ${name(c.color)}`;
  return `${who(c.from, c.only)} → ${up(c.to)}${c.color ? ` (${name(c.color)})` : ""}`;
}

type Look = Pick<PlayerNode, "label" | "fill" | "stroke" | "textColor" | "shape">;
const look = (p: PlayerNode): Look => ({ label: p.label, fill: p.fill, stroke: p.stroke, textColor: p.textColor, shape: p.shape });
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
  if (!changed.size && !removed.length) return field;
  return {
    ...field,
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
