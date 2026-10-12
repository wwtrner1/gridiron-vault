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
};

export type PhotoRequest = {
  /** Base64 JPEG, already shrunk in the browser. */
  image: string;
  game: GameType;
  terms: { term: string; means: string }[];
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

export function photoSystem(req: Pick<PhotoRequest, "game" | "terms">): string {
  const terms = req.terms
    .slice(0, 80)
    .map((t) => `- ${t.term}: ${t.means}`)
    .join("\n");
  return `You read photos of football plays — whiteboards, chalkboards, notebook and binder pages — for GridIronVault, a playbook app, and record them with the tool.

Players: circles or letters are offense, Xs or Vs are usually defense. Record every player with the center of its mark as a fraction of the image. Map the coach's letters to GridIronVault's: Q quarterback, C center, X split end, Z flanker, Y tight end or slot, H running back, S slot or second back. R, T, F, B or HB for a running back become H.

Routes: for each line from an offensive player, record the line itself (path, from the player to the arrow tip), which way its last part heads in the image (breaks), and the closest shape from the tool's list. Name the shape by where the line goes relative to that player: toward the nearer sideline is out-breaking (out, corner, flat, fade, comeback); toward the middle is in-breaking (in, dig, post, slant, drag); a line that runs upfield and then turns back toward the line of scrimmage is a curl (turns back inside), a hitch (short) or a comeback (turns back outside). The route tree: 1 flat, 2 slant, 3 comeback, 4 curl, 5 out, 6 dig, 7 corner, 8 post, 9 go. A line ending in a T is a block. A squiggle before the snap is motion.

When a line could be two routes (a corner that might be a post), choose the likelier and ask one short question with both options. Don't ask about anything you're sure of. If there is no play in the photo, set isPlay false and say why.

The coach draws ${req.game === "11" ? "11-man" : req.game} football.${terms ? `\n\nThe coach's own terms:\n${terms}` : ""}`;
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
  return { ...node, z, ...(p.side === "defense" ? { size: 30, outlineStyle: "none" as const } : {}) };
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
