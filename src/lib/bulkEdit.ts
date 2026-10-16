import { BRAND_COLORS, letterColor, normalizeHex, TEAM_COLORS } from "./colors";
import type { TokenPreset } from "./presets";
import type { LocalPlaybook } from "./store";
import type { PlayerNode, Scene, StoredPlay } from "./types";

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
  | { op: "swap"; from: string; to: string };

export type BulkScope = { kind: "vault" } | { kind: "playbook"; name: string } | { kind: "plays"; ids: string[] };

export type BulkEdit = { scope: BulkScope; changes: BulkChange[] };

/** Most changes one card carries. */
export const MAX_BULK_CHANGES = 6;

export const LETTER = /^[A-Z0-9]{1,3}$/;

const up = (s: string) => s.trim().toUpperCase();

/** A fill a coach asked for (hex, or a palette name such as "Yellow"), as #rrggbb; null if it isn't a color. */
export const bulkColor = (input: string) =>
  normalizeHex(input) ?? [...TEAM_COLORS, ...BRAND_COLORS].find((c) => c.name.toLowerCase() === input.trim().toLowerCase())?.hex ?? null;

function changePlayer(p: PlayerNode, change: BulkChange, tokens: TokenPreset[]): PlayerNode | null {
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

/**
 * One scene with every change applied in order (so "swap S for H, then make
 * H yellow" works), and how many players changed. Node ids are kept, so
 * routes stay attached to their runners.
 */
export function editScene(scene: Scene, changes: BulkChange[], tokens: TokenPreset[]): { scene: Scene; players: number } {
  const touched = new Set<string>();
  let nodes = scene.nodes;
  for (const change of changes) {
    nodes = nodes.map((n) => {
      if (n.kind !== "player") return n;
      const next = changePlayer(n, change, tokens);
      if (!next) return n;
      touched.add(n.id);
      return next;
    });
  }
  return { scene: touched.size ? { ...scene, nodes } : scene, players: touched.size };
}

export type BulkTarget = { before: StoredPlay; after: StoredPlay; players: number; doubled: string[] };

export type BulkPlan = {
  targets: BulkTarget[];
  /** Plays in scope, changed or not. */
  inScope: number;
  /** A playbook the coach named that doesn't exist. */
  missingBook: string | null;
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
  const targets = scoped.flatMap((p): BulkTarget[] => {
    const { scene, players } = editScene(p.scene, edit.changes, tokens);
    if (!players) return [];
    // A swap onto a letter the play already has leaves two of them; say so rather than guess which to move.
    const letters = scene.nodes.flatMap((n) => (n.kind === "player" && n.side === "offense" && n.label ? [up(n.label)] : []));
    const doubled = [...new Set(letters.filter((l, i) => letters.indexOf(l) !== i))].filter((l) =>
      edit.changes.some((c) => c.op === "swap" && up(c.to) === l),
    );
    return [{ before: p, after: { ...p, scene, updatedAt: now }, players, doubled }];
  });
  return { targets, inScope: scoped.length, missingBook };
}

/** "Y → yellow (#f5d33b)", "S → H", for the card and for Griddy. */
export function describeChange(c: BulkChange, colorLabel: (hex: string) => string): string {
  return c.op === "recolor" ? `${up(c.letter)} → ${colorLabel(bulkColor(c.color) ?? c.color)}` : `${up(c.from)} → ${up(c.to)}`;
}

type Look = Pick<PlayerNode, "label" | "fill" | "stroke" | "textColor" | "shape">;
const look = (p: PlayerNode): Look => ({ label: p.label, fill: p.fill, stroke: p.stroke, textColor: p.textColor, shape: p.shape });
const sameLook = (a: Look, b: Look) => (Object.keys(a) as (keyof Look)[]).every((k) => a[k] === b[k]);

/**
 * Undo on a field that may have changed since: only the players the bulk
 * edit touched get their old letter and colors back; everything else on the
 * field (moves, new routes) stays as it is now.
 */
export function restorePlayers(field: Scene, before: Scene, after: Scene): Scene {
  const was = new Map(before.nodes.flatMap((n) => (n.kind === "player" ? [[n.id, n] as const] : [])));
  const touched = new Set(
    after.nodes.flatMap((n) => {
      const old = n.kind === "player" ? was.get(n.id) : undefined;
      return n.kind === "player" && old && !sameLook(look(n), look(old)) ? [n.id] : [];
    }),
  );
  if (!touched.size) return field;
  return {
    ...field,
    nodes: field.nodes.map((n) => (n.kind === "player" && touched.has(n.id) ? { ...n, ...look(was.get(n.id)!) } : n)),
  };
}
