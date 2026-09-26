import { BLOCK_IDS, CODE_FOR, readToNodes, ROUTE_IDS, routesFor } from "./assistant";
import type { Assignment, AssistantRead } from "./assistant";
import { DEFENSE_INK } from "./defense";
import { FORMATION_NAMES, GAME_TYPES } from "./formations";
import type { GameType } from "./formations";
import { makePlayer } from "./presets";
import type { TokenPreset } from "./presets";
import { CANVAS_H, CANVAS_W } from "./types";
import type { PlayerNode, SceneNode } from "./types";

/**
 * Whiteboard photo review, from the Grid1ron Design canvas (Upload · review
 * a whiteboard photo): Claude reads the photo of a board or playbook page,
 * the play is rebuilt on the field, and the coach answers anything it
 * wasn't sure of before saving. Shared by the browser and the function.
 */
export type BoardPlayer = {
  /** Letter as written on the board, e.g. "R". */
  board: string;
  /** The Grid1ronVault letter for that player, e.g. "H". */
  vault: string;
  side: "offense" | "defense";
  /** Position in the photo, 0–1 from the left and from the top. */
  x: number;
  y: number;
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
  assignments: Assignment[];
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
            vault: { type: "string", description: "Grid1ronVault letter: Q, C, X, Y, Z, H (running back), S (slot / second back); defenders keep the board letter." },
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
            player: { type: "string", description: "Grid1ronVault letter." },
            kind: { type: "string", enum: ["route", "block", "motion"] },
            action: { type: "string", enum: ACTIONS },
            toward: { type: "string", enum: ["in", "out"] },
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
  return `You read photos of football plays — whiteboards, chalkboards, notebook and binder pages — for Grid1ronVault, a playbook app, and record them with the tool.

Players: circles or letters are offense, Xs or Vs are usually defense. Record every player with the center of its mark as a fraction of the image. Map the coach's letters to Grid1ronVault's: Q quarterback, C center, X split end, Z flanker, Y tight end or slot, H running back, S slot or second back. R, T, F, B or HB for a running back become H.

Routes: pick the closest shape from the tool's list for each line from an offensive player. The route tree: 1 flat, 2 slant, 3 comeback, 4 curl ("hitch"), 5 out, 6 dig, 7 corner, 8 post, 9 go. A line ending in a T is a block. A squiggle before the snap is motion.

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

/**
 * The play as drawn: every player where the photo has them, in the coach's
 * position colors, with routes from the route library.
 */
export function photoLayoutNodes(read: PhotoRead, tokens: TokenPreset[], aspect: number, losY: number, z: number): SceneNode[] {
  const flip = read.offenseAt === "top";
  const width = CANVAS_W - 120;
  const players: PlayerNode[] = read.players.map((p, i) => {
    const fx = flip ? 1 - p.x : p.x;
    const dy = (p.y - read.losY) * width * aspect * (flip ? -1 : 1);
    const x = 60 + fx * width;
    const y = Math.min(CANVAS_H - 24, Math.max(24, losY + dy));
    const code = CODE_FOR[p.vault.toUpperCase()];
    const token = p.side === "offense" && code ? tokens.find((t) => t.code === code) : undefined;
    const node = makePlayer(token ?? neutral(p.vault.toUpperCase().slice(0, 2), p.side), x, y);
    return { ...node, z: z + i, ...(p.side === "defense" ? { size: 30, outlineStyle: "none" as const } : {}) };
  });
  return [...players, ...routesFor(read.assignments, players, losY, z + players.length)];
}

/** The play in the coach's Vault format: the Formation library's spacing and letters, defenders kept where drawn. */
export function vaultFormatNodes(read: PhotoRead, tokens: TokenPreset[], aspect: number, losY: number, z: number): SceneNode[] {
  const offense = readToNodes(asAssistantRead(read), tokens, losY, z);
  const defense = photoLayoutNodes({ ...read, players: read.players.filter((p) => p.side === "defense"), assignments: [] }, tokens, aspect, losY, z + offense.length);
  return [...offense, ...defense];
}

/** Letters the board used that the Vault calls something else, for the "Your board used…" note. */
export const letterChanges = (read: PhotoRead) =>
  [...new Map(read.players.filter((p) => p.side === "offense" && p.board.toUpperCase() !== p.vault.toUpperCase()).map((p) => [p.board.toUpperCase(), p.vault.toUpperCase()])).entries()];
