import { BLOCK_IDS, CODE_FOR, ROUTE_IDS, routesFor } from "./assistant";
import type { Assignment, AssistantRead } from "./assistant";
import { DEFENSE_INK } from "./defense";
import { FORMATION_NAMES, GAME_TYPES } from "./formations";
import type { GameType } from "./formations";
import { makePlayer } from "./presets";
import type { TokenPreset } from "./presets";
import { baseNode, CANVAS_H, CANVAS_W } from "./types";
import type { PathNode, PlayerNode, Point, SceneNode } from "./types";

/**
 * Whiteboard photo review, from the Grid1ron Design canvas (Upload · review
 * a whiteboard photo): Claude reads the photo of a board or playbook page,
 * the play is rebuilt on the field, and the coach answers anything it
 * wasn't sure of before saving. Shared by the browser and the function.
 */
export type BoardPlayer = {
  /** Letter as written on the board, e.g. "R". */
  board: string;
  /** The GridIronVault letter for that player, e.g. "H". */
  vault: string;
  side: "offense" | "defense";
  /** Position in the photo, 0–1 from the left and from the top. */
  x: number;
  y: number;
  /** A defender's responsibility as drawn (Deep 1/3, Flat, Man X, Rush…), drawn under his token. */
  job?: string;
};

/** An assignment read from a photo, with the line as drawn. */
export type PhotoAssignment = Assignment & {
  /** The drawn line, from the player to the arrow tip, 0–1 in the photo. */
  path?: { x: number; y: number }[];
};

export type PhotoQuestion = { player: string; question: string; options: string[] };

export type PhotoRead = {
  isPlay: boolean;
  /** Why not, when isPlay is false. */
  reason?: string;
  name: string;
  formation: string;
  game: GameType;
  /** Line of scrimmage, 0–1 from the top of the photo. */
  losY: number;
  /** Which way the offense faces on the board. */
  offenseAt: "bottom" | "top";
  players: BoardPlayer[];
  assignments: PhotoAssignment[];
  questions: PhotoQuestion[];
  /** Offense (the default) or a defense drawn on its own. */
  playType?: "offense" | "defense";
  /** The coverage the board names or shows, for a defense. */
  coverage?: string;
  /** Set when GridIronVault moved the quarterback letter (see `fixQuarterback`). */
  qbNote?: string;
};

export type PhotoRequest = {
  /** Base64 JPEG, already shrunk in the browser. */
  image: string;
  game: GameType;
  terms: { term: string; means: string }[];
  /** Filled in by the function from the coach's and the app's corrections; never sent by the browser. */
  lessons?: ReadLesson[];
};

/** Longest side sent to Claude; larger photos cost more and read no better. */
export const MAX_EDGE = 1568;
export const MAX_IMAGE_CHARS = 4_000_000;

const ACTIONS = [...ROUTE_IDS, ...BLOCK_IDS, "motion"];

export const PHOTO_TOOL = {
  name: "rebuild_play",
  description: "Record the play drawn in the photo: every player, their assignments, and anything unclear.",
  input_schema: {
    type: "object",
    properties: {
      isPlay: { type: "boolean", description: "False if the photo has no football play diagram." },
      reason: { type: "string" },
      name: { type: "string", description: "The play's title if one is written, else a short name like 'Trips — Flood'." },
      formation: { type: "string", enum: [...FORMATION_NAMES, "Custom"] },
      game: { type: "string", enum: GAME_TYPES.map((g) => g.id) },
      losY: { type: "number", description: "Line of scrimmage as a fraction of the image height (0 top, 1 bottom)." },
      offenseAt: { type: "string", enum: ["bottom", "top"] },
      players: {
        type: "array",
        items: {
          type: "object",
          properties: {
            board: { type: "string", description: "Letter or mark as written (X for an unlabelled defender)." },
            vault: { type: "string", description: "GridIronVault letter: Q, C, X, Y, Z, H (running back), S (slot / second back); defenders keep the board letter." },
            side: { type: "string", enum: ["offense", "defense"] },
            x: { type: "number", description: "Center of the mark, fraction of image width." },
            y: { type: "number", description: "Center of the mark, fraction of image height." },
            job: { type: "string", description: "Defenders only: the responsibility the board shows, e.g. Deep 1/3, Deep 1/2, Flat, Hook, Curl, Robber, Man X, Rush, Blitz, Spy." },
          },
          required: ["board", "vault", "side", "x", "y"],
        },
      },
      assignments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            player: { type: "string", description: "GridIronVault letter." },
            kind: { type: "string", enum: ["route", "block", "motion"] },
            action: { type: "string", enum: ACTIONS },
            breaks: { type: "string", enum: ["left", "right"], description: "Which way the last part of the line heads in the image; leave out for a straight vertical line." },
            path: {
              type: "array",
              description: "The line as drawn: 2–6 points from the player to the arrow tip, each a fraction of the image.",
              items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
            },
            firstRead: { type: "boolean" },
          },
          required: ["player", "kind", "action"],
        },
      },
      playType: { type: "string", enum: ["offense", "defense"], description: "defense when the diagram is a defensive call (drops, rushes, coverage) rather than an offensive play." },
      coverage: { type: "string", description: "Defense: the coverage named or shown, e.g. Cover 2, Cover 3, Cover 1, Man, Cover 0." },
      questions: {
        type: "array",
        description: "At most 3, only where a line could be two routes.",
        items: {
          type: "object",
          properties: {
            player: { type: "string" },
            question: { type: "string", description: "e.g. 'Z route: corner or post? The line bends at about 8 yards.'" },
            options: { type: "array", items: { type: "string", enum: ACTIONS } },
          },
          required: ["player", "question", "options"],
        },
      },
    },
    required: ["isPlay", "name", "formation", "game", "losY", "offenseAt", "players", "assignments", "questions"],
  },
};

export function photoSystem(req: Pick<PhotoRequest, "game" | "terms" | "lessons">): string {
  const terms = req.terms
    .slice(0, 80)
    .map((t) => `- ${t.term}: ${t.means}`)
    .join("\n");
  return `You read photos of football plays — whiteboards, chalkboards, notebook and binder pages — for GridIronVault, a playbook app, and record them with the tool.

Players: circles or letters are offense, Xs or Vs are usually defense. Record every player with the center of its mark as a fraction of the image. Map the coach's letters to GridIronVault's: Q quarterback, C center, X split end, Z flanker, Y tight end or slot, H running back, S slot or second back. R, T, F, B or HB for a running back become H.

Routes: for each line from an offensive player, record the line itself (path, from the player to the arrow tip), which way its last part heads in the image (breaks), and the closest shape from the tool's list. Name the shape by where the line goes relative to that player: toward the nearer sideline is out-breaking (out, corner, flat, fade, comeback); toward the middle is in-breaking (in, dig, post, slant, drag); a line that runs upfield and then turns back toward the line of scrimmage is a curl (turns back inside), a hitch (short) or a comeback (turns back outside). The route tree: 1 flat, 2 slant, 3 comeback, 4 curl, 5 out, 6 dig, 7 corner, 8 post, 9 go. A line ending in a T is a block. A squiggle before the snap is motion.

The quarterback: a player with no line who stands behind the center (under center or a few yards deep in the shotgun) is the quarterback taking the snap and throwing. Map him to Q even when the board writes a number or another letter, and don't ask about him. A square or a player on the ball in the middle is usually the center (C).

Defenses: when the diagram shows defenders with drops, rushes or coverage shells, record each defender's responsibility in job and set playType defense with the coverage. Lines from defenders are not offensive routes; leave them out of assignments.

When a line could be two routes (a corner that might be a post), choose the likelier and ask one short question with both options. Don't ask about anything you're sure of. If there is no play in the photo, set isPlay false and say why.

The coach draws ${req.game === "11" ? "11-man" : req.game} football.${terms ? `\n\nThe coach's own terms:\n${terms}` : ""}${lessonText(req.lessons)}`;
}

/** What corrections taught the reader, for the prompt: this coach's first, then what many coaches agree on. */
export type ReadLesson = { kind: "letter" | "route"; from: string; to: string; times: number; scope: "coach" | "app" };

export function lessonText(lessons: ReadLesson[] | undefined): string {
  if (!lessons?.length) return "";
  const line = (l: ReadLesson) =>
    l.kind === "letter"
      ? `- A mark written "${l.from}" is the player GridIronVault calls ${l.to}.`
      : `- A line you would read as "${l.from.replace(/_/g, " ")}" was corrected to "${l.to.replace(/_/g, " ")}" (${l.times} time${l.times === 1 ? "" : "s"}); look twice before choosing ${l.from.replace(/_/g, " ")}.`;
  const mine = lessons.filter((l) => l.scope === "coach").slice(0, 20);
  const app = lessons.filter((l) => l.scope === "app").slice(0, 20);
  return [
    mine.length ? `\n\nThis coach corrected earlier reads (follow these first):\n${mine.map(line).join("\n")}` : "",
    app.length ? `\n\nCorrections many coaches made:\n${app.map(line).join("\n")}` : "",
  ].join("");
}

/* ----------------------------------------------- the quarterback, by rule */

const isOffense = (p: BoardPlayer) => p.side === "offense";
/** How far behind the line a player stands, in image fractions (positive is the backfield). */
const depthOf = (read: PhotoRead, p: BoardPlayer) => (read.offenseAt === "top" ? read.losY - p.y : p.y - read.losY);

/**
 * A player with no line, standing behind the middle of the line, is the
 * quarterback taking the snap and throwing (Wes, 2026-11-13). When the reader
 * gave Q to someone else, the two letters change places (the old Q becomes the
 * center when he stands on the ball and the board has no center), and any
 * question about the quarterback is dropped.
 */
export function fixQuarterback(read: PhotoRead): PhotoRead {
  const offense = read.players.filter(isOffense);
  if (!offense.length || read.playType === "defense") return read;
  const hasLine = (letter: string) => read.assignments.some((a) => a.player.toUpperCase() === letter.toUpperCase());
  const center = offense.find((p) => p.vault.toUpperCase() === "C");
  const ballX = center ? center.x : offense.reduce((s, p) => s + p.x, 0) / offense.length;
  const q = offense.find((p) => p.vault.toUpperCase() === "Q");
  const dropAsk = (r: PhotoRead) => ({ ...r, questions: r.questions.filter((x) => x.player.toUpperCase() !== "Q") });
  if (q && !hasLine("Q")) return dropAsk(read);
  // Routeless players in the backfield near the ball, the one nearest the middle first.
  const spot = offense
    .filter((p) => p !== q && !hasLine(p.vault) && depthOf(read, p) > 0.02 && Math.abs(p.x - ballX) < 0.12)
    .sort((a, b) => Math.abs(a.x - ballX) - Math.abs(b.x - ballX) || depthOf(read, b) - depthOf(read, a))[0];
  if (!spot) return read;
  const freed = spot.vault.toUpperCase();
  const oldQTo = q && !center && Math.abs(depthOf(read, q)) < 0.05 && Math.abs(q.x - ballX) < 0.08 ? "C" : freed;
  const swap = (letter: string) => {
    const l = letter.toUpperCase();
    if (q && l === "Q") return oldQTo;
    if (l === freed) return "Q";
    return letter;
  };
  const players = read.players.map((p) => (p === spot ? { ...p, vault: "Q" } : p === q ? { ...p, vault: oldQTo } : p));
  const assignments = read.assignments.map((a) => ({ ...a, player: swap(a.player) }));
  const questions = read.questions.map((x) => ({ ...x, player: swap(x.player) }));
  const qbNote = `The player marked ${spot.board} has no line and stands behind the center, so he's the quarterback taking the snap.${
    q ? ` The ${q.board} the read called Q is now ${oldQTo}.` : ""
  }`;
  return dropAsk({ ...read, players, assignments, questions, qbNote });
}

/* ------------------------------------------------ the coach's corrections */

/** Gives a player another Vault letter; his line follows him, and a player already wearing that letter takes the old one. */
export function setLetter(read: PhotoRead, index: number, letter: string): PhotoRead {
  const p = read.players[index];
  const next = letter.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  if (!p || !next || next === p.vault.toUpperCase()) return read;
  const old = p.vault.toUpperCase();
  const other = read.players.findIndex((x, i) => i !== index && x.side === p.side && x.vault.toUpperCase() === next);
  const swap = (l: string) => (l.toUpperCase() === old ? next : other >= 0 && l.toUpperCase() === next ? old : l);
  return {
    ...read,
    players: read.players.map((x, i) => (i === index ? { ...x, vault: next } : i === other ? { ...x, vault: old } : x)),
    assignments: p.side === "offense" ? read.assignments.map((a) => ({ ...a, player: swap(a.player) })) : read.assignments,
    questions: read.questions.map((q) => ({ ...q, player: swap(q.player) })),
  };
}

/**
 * Sets (or with `null` removes) one player's assignment. A new shape drops
 * the traced line, which was the old shape, so the route library draws the
 * new one; the same shape keeps it.
 */
export function setAssignment(read: PhotoRead, letter: string, next: Pick<PhotoAssignment, "kind" | "action" | "breaks"> | null): PhotoRead {
  const L = letter.toUpperCase();
  const old = read.assignments.find((a) => a.player.toUpperCase() === L);
  const rest = read.assignments.filter((a) => a.player.toUpperCase() !== L);
  const questions = read.questions.filter((q) => q.player.toUpperCase() !== L);
  if (!next) return { ...read, assignments: rest, questions };
  const same = old && old.action === next.action && old.kind === next.kind;
  const made: PhotoAssignment = {
    ...(old ?? { heard: "" }),
    player: L,
    kind: next.kind,
    action: next.action,
    breaks: next.breaks,
    path: same && old?.breaks === next.breaks ? old?.path : undefined,
  };
  return { ...read, assignments: [...rest, made], questions };
}

export function setPlayer(read: PhotoRead, index: number, patch: Partial<BoardPlayer>): PhotoRead {
  return { ...read, players: read.players.map((p, i) => (i === index ? { ...p, ...patch } : p)) };
}

export function removePlayer(read: PhotoRead, index: number): PhotoRead {
  const p = read.players[index];
  if (!p) return read;
  const L = p.vault.toUpperCase();
  const still = read.players.some((x, i) => i !== index && x.side === "offense" && x.vault.toUpperCase() === L);
  return {
    ...read,
    players: read.players.filter((_, i) => i !== index),
    assignments: p.side === "offense" && !still ? read.assignments.filter((a) => a.player.toUpperCase() !== L) : read.assignments,
    questions: read.questions.filter((q) => q.player.toUpperCase() !== L),
  };
}

/** A player the reader missed, dropped near the ball (offense just behind the line, defense across it). */
export function addPlayer(read: PhotoRead, side: "offense" | "defense", letter: string): PhotoRead {
  const offense = read.players.filter(isOffense);
  const ballX = offense.length ? offense.reduce((s, p) => s + p.x, 0) / offense.length : 0.5;
  const away = read.offenseAt === "top" ? -1 : 1;
  const taken = read.players.filter((p) => p.side === side).length;
  const x = Math.min(0.95, Math.max(0.05, ballX + ((taken % 5) - 2) * 0.06));
  const y = Math.min(0.98, Math.max(0.02, read.losY + away * (side === "offense" ? 0.08 : -0.12)));
  const L = letter.toUpperCase().slice(0, 3) || "?";
  return { ...read, players: [...read.players, { board: L, vault: L, side, x, y }] };
}

/** One correction the coach made to a read, for the reader to learn from. */
export type Correction = { kind: "letter" | "route"; from: string; to: string };

/**
 * What the coach changed between the read and the version they used: a mark
 * the board wrote that means another Vault letter, and a route shape read as
 * one thing that was another. Only what generalises is kept (no positions,
 * names or players added by hand).
 */
export function correctionsBetween(before: PhotoRead, after: PhotoRead): Correction[] {
  const out: Correction[] = [];
  const seen = new Set<string>();
  const add = (c: Correction) => {
    const k = `${c.kind}|${c.from}|${c.to}`;
    if (c.from && c.to && c.from !== c.to && !seen.has(k)) seen.add(k), out.push(c);
  };
  for (const a of after.players) {
    const b = before.players.find((p) => p.board === a.board && Math.abs(p.x - a.x) < 1e-6 && Math.abs(p.y - a.y) < 1e-6);
    if (!b || a.side !== "offense") continue;
    if (b.vault.toUpperCase() !== a.vault.toUpperCase() && a.board.toUpperCase() !== a.vault.toUpperCase())
      add({ kind: "letter", from: a.board.toUpperCase(), to: a.vault.toUpperCase() });
    const was = before.assignments.find((x) => x.player.toUpperCase() === b.vault.toUpperCase());
    const now = after.assignments.find((x) => x.player.toUpperCase() === a.vault.toUpperCase());
    if (was && now && was.kind === "route" && now.kind === "route") add({ kind: "route", from: was.action, to: now.action });
  }
  return out.slice(0, 12);
}

/* ------------------------------------------------------------ in the browser */

/** Shrinks a photo to MAX_EDGE and returns it as base64 JPEG, plus its shape. */
export async function prepareImage(file: File): Promise<{ data: string; url: string; aspect: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { data: url.split(",")[1], url, aspect: canvas.height / canvas.width };
}

export const asAssistantRead = (read: PhotoRead): AssistantRead => ({
  formation: FORMATION_NAMES.includes(read.formation) ? read.formation : FORMATION_NAMES[0],
  game: read.game,
  name: read.name,
  assignments: read.assignments,
  unsure: [],
});

const neutral = (label: string, side: "offense" | "defense"): TokenPreset =>
  side === "defense"
    ? { code: label, label, title: `Defender ${label}`, hint: "", shape: "circle", fill: "transparent", stroke: DEFENSE_INK, textColor: DEFENSE_INK, side: "defense" }
    : { code: label, label, title: `Player ${label}`, hint: "", shape: "circle", fill: "#FFFFFF", stroke: "#0B1524", textColor: "#0B1524", side: "offense" };

type Mapper = { at: (x: number, y: number) => Point; ballX: number };

/** Maps photo fractions onto the field: line of scrimmage on the Designer's, offense facing up. */
function mapper(read: PhotoRead, aspect: number, losY: number): Mapper {
  const flip = read.offenseAt === "top";
  const width = CANVAS_W - 120;
  const at = (x: number, y: number): Point => ({
    x: 60 + (flip ? 1 - x : x) * width,
    y: Math.min(CANVAS_H - 24, Math.max(24, losY + (y - read.losY) * width * aspect * (flip ? -1 : 1))),
  });
  const center = read.players.find((p) => p.side === "offense" && p.vault.toUpperCase() === "C");
  return { at, ballX: center ? at(center.x, center.y).x : CANVAS_W / 2 };
}

/** Breaks as seen on the field: a board drawn upside down flips left and right. */
const fieldAssignments = (read: PhotoRead): PhotoAssignment[] =>
  read.offenseAt === "top"
    ? read.assignments.map((a) => (a.breaks ? { ...a, breaks: a.breaks === "left" ? ("right" as const) : ("left" as const) } : a))
    : read.assignments;

function playerNode(p: BoardPlayer, at: Point, tokens: TokenPreset[], z: number): PlayerNode {
  const code = CODE_FOR[p.vault.toUpperCase()];
  const token = p.side === "offense" && code ? tokens.find((t) => t.code === code) : undefined;
  const node = makePlayer(token ?? neutral(p.vault.toUpperCase().slice(0, 2), p.side), at.x, at.y);
  return { ...node, z, ...(p.side === "defense" ? { size: 30, outlineStyle: "none" as const } : {}), ...(p.job ? { job: p.job } : {}) };
}

/** A line traced from the photo, starting at its player's token. */
function tracedPath(a: PhotoAssignment, from: PlayerNode, m: Mapper, z: number): PathNode | null {
  const pts = (a.path ?? []).map((p) => m.at(p.x, p.y));
  if (pts.length < 2) return null;
  return {
    ...baseNode({ x: from.x, y: from.y, z, name: a.kind === "block" ? "Block" : a.kind === "motion" ? "Motion" : "Route" }),
    kind: "path",
    points: pts.map((p) => ({ x: p.x - pts[0].x, y: p.y - pts[0].y })),
    handles: {},
    style: a.kind === "motion" ? "motion" : "solid",
    curve: "straight",
    startCap: "none",
    endCap: a.kind === "block" && a.action !== "chip" ? "tee" : "arrow",
    stroke: "#0B1524",
    width: 3,
    closed: false,
    fill: "none",
    fillOpacity: 0,
    fromId: null,
    toId: null,
    firstRead: a.kind === "route" && a.firstRead ? true : undefined,
  };
}

/**
 * The play as drawn: every player where the photo has them, in the coach's
 * position colors, and each line traced as drawn (a route-library shape
 * when a line couldn't be traced).
 */
export function photoLayoutNodes(read: PhotoRead, tokens: TokenPreset[], aspect: number, losY: number, z: number): SceneNode[] {
  const m = mapper(read, aspect, losY);
  const players = read.players.map((p, i) => playerNode(p, m.at(p.x, p.y), tokens, z + i));
  const byLetter = new Map(players.filter((p) => p.label).map((p) => [p.label.toUpperCase(), p]));
  const assignments = fieldAssignments(read);
  const traced: PathNode[] = [];
  const rest: PhotoAssignment[] = [];
  assignments.forEach((a, i) => {
    const from = byLetter.get(a.player.toUpperCase());
    const line = from ? tracedPath(a, from, m, z + players.length + i) : null;
    if (line) traced.push(line);
    else rest.push(a);
  });
  return [...players, ...traced, ...routesFor(rest, players, losY, z + players.length + assignments.length)];
}

/** Standard splits from the ball for receivers, nearest first. */
const SPLITS = [130, 200, 290, 400];

/**
 * The play in the coach's Vault format: every player on the side and in the
 * order the board shows, snapped to standard splits and depths, with a
 * center and quarterback added if the board left them off, and routes drawn
 * from the route library breaking the way the board shows.
 */
export function vaultFormatNodes(read: PhotoRead, tokens: TokenPreset[], aspect: number, losY: number, z: number): SceneNode[] {
  const m = mapper(read, aspect, losY);
  const cx = CANVAS_W / 2;
  const offense = read.players.filter((p) => p.side === "offense");
  const has = (l: string) => offense.some((p) => p.vault.toUpperCase() === l);
  const stub = (l: string): BoardPlayer => ({ board: l, vault: l, side: "offense", x: 0, y: 0 });
  const placed: { p: BoardPlayer; at: Point }[] = [];
  if (!has("C")) placed.push({ p: stub("C"), at: { x: cx, y: losY } });
  if (!has("Q")) placed.push({ p: stub("Q"), at: { x: cx, y: losY + 70 } });

  const backs: { p: BoardPlayer; dx: number }[] = [];
  const sides = { left: [] as { p: BoardPlayer; dx: number; off: boolean }[], right: [] as { p: BoardPlayer; dx: number; off: boolean }[] };
  for (const p of offense) {
    const at = m.at(p.x, p.y);
    const dx = at.x - m.ballX;
    const dy = at.y - losY;
    const letter = p.vault.toUpperCase();
    if (letter === "C") placed.push({ p, at: { x: cx, y: losY } });
    else if (letter === "Q") placed.push({ p, at: { x: cx, y: losY + 70 } });
    else if (dy > 50 && Math.abs(dx) < 160) backs.push({ p, dx });
    else sides[dx < 0 ? "left" : "right"].push({ p, dx, off: dy > 14 });
  }
  // Receivers keep their side and order; the widest takes the widest split it is near.
  for (const side of ["left", "right"] as const) {
    const free = [...SPLITS];
    const sign = side === "left" ? -1 : 1;
    for (const r of [...sides[side]].sort((a, b) => Math.abs(b.dx) - Math.abs(a.dx))) {
      const pick = free.filter((s) => s <= Math.abs(r.dx) + 60).pop() ?? free[0];
      if (pick === undefined) break;
      free.splice(free.indexOf(pick), 1);
      placed.push({ p: r.p, at: { x: cx + sign * pick, y: losY + (r.off ? 26 : 4) } });
    }
  }
  // Backs: the first behind the quarterback, the rest beside him.
  backs
    .sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx))
    .forEach((b, i) => placed.push({ p: b.p, at: i === 0 ? { x: cx, y: losY + 140 } : { x: cx + (b.dx < 0 ? -56 : 56), y: losY + 72 } }));

  const players = placed.map(({ p, at }, i) => playerNode(p, at, tokens, z + i));
  const defense = read.players.filter((p) => p.side === "defense").map((p, i) => playerNode(p, m.at(p.x, p.y), tokens, z + players.length + i));
  return [...players, ...defense, ...routesFor(fieldAssignments(read), players, losY, z + players.length + defense.length)];
}

/** Letters the board used that the Vault calls something else, for the "Your board used…" note. */
export const letterChanges = (read: PhotoRead) =>
  [...new Map(read.players.filter((p) => p.side === "offense" && p.board.toUpperCase() !== p.vault.toUpperCase()).map((p) => [p.board.toUpperCase(), p.vault.toUpperCase()])).entries()];
