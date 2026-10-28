import { BLOCKS, ROUTES } from "./routes";
import { backSpot, FORMATION_NAMES, GAME_TYPES, layoutFormation, letterSpot, tokenFor } from "./formations";
import type { GameType, Placed } from "./formations";
import { makePlayer } from "./presets";
import type { TokenPreset } from "./presets";
import { baseNode, CANVAS_W } from "./types";
import type { PathNode, PlayerNode, Point, SceneNode, StoredPlay } from "./types";

/**
 * How Griddy reads one play call (formerly the Play assistant, from the
 * Grid1ron Design canvas: Designer · assistant, tools…): the read shows how
 * each player was taken, as chips, and nothing is drawn until the coach
 * confirms. Shared by the browser and the Netlify function so both agree on
 * the shape of a read.
 */
export const ROUTE_IDS = Object.keys(ROUTES).filter((r) => !["rush", "drop", "block"].includes(r));
export const BLOCK_IDS = Object.keys(BLOCKS);

export type Assignment = {
  /** Letter as drawn: Q, C, X, Y, Z, H, S, or an extra such as W or T. */
  player: string;
  kind: "route" | "block" | "motion";
  /** A ROUTE_IDS id for routes, a BLOCK_IDS id for blocks, "motion" for motion. */
  action: string;
  /** Break toward the sideline ("out") or the middle ("in"); default follows the route. */
  toward?: "in" | "out";
  /** Which way the route breaks on the field, when a photo shows it; wins over `toward`. */
  breaks?: "left" | "right";
  firstRead?: boolean;
  /** The words in the call that gave this read, shown on the chip. */
  heard: string;
};

export type AssistantRead = {
  formation: string;
  game: GameType;
  personnel?: string;
  name: string;
  assignments: Assignment[];
  /** Questions about parts of the call the assistant wasn't sure of. */
  unsure: string[];
};

export type AssistantRequest = {
  call: string;
  game: GameType;
  /** The coach's own words from Playbook language. */
  terms: { term: string; means: string }[];
  /** One play of a Griddy import: counted against the daily import limit, not chat. */
  bulk?: boolean;
};

export const MAX_CALL = 400;

export const ASSISTANT_TOOL = {
  name: "draw_play",
  description: "Record how the coach's play call maps onto a formation and each player's assignment.",
  input_schema: {
    type: "object",
    properties: {
      formation: { type: "string", enum: FORMATION_NAMES },
      game: { type: "string", enum: GAME_TYPES.map((g) => g.id) },
      personnel: { type: "string", description: "11-man only: 10, 11, 12, 13, 20, 21, 22, 23 or 00." },
      name: { type: "string", description: "A short play name in the coach's words, e.g. 'Trips Right — Scissors'." },
      assignments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            player: { type: "string", description: "Q, C, X, Y, Z, H (running back) or S (slot / second back)." },
            kind: { type: "string", enum: ["route", "block", "motion"] },
            action: { type: "string", enum: [...ROUTE_IDS, ...BLOCK_IDS, "motion"] },
            toward: { type: "string", enum: ["in", "out"], description: "Only when the call breaks the route the other way from its usual shape ('slant out', 'fade in'). Leave it off for a plain out, in, slant or corner: they already break the right way." },
            firstRead: { type: "boolean" },
            heard: { type: "string", description: "The exact words from the call this came from." },
          },
          required: ["player", "kind", "action", "heard"],
        },
      },
      unsure: { type: "array", items: { type: "string" }, description: "Short questions to the coach about anything ambiguous." },
    },
    required: ["formation", "game", "name", "assignments", "unsure"],
  },
};

export function assistantSystem(req: AssistantRequest): string {
  const terms = req.terms
    .slice(0, 80)
    .map((t) => `- ${t.term}: ${t.means}`)
    .join("\n");
  return `You turn a football coach's play call into a diagram plan for GridIronVault, a playbook app.

Letters: Q quarterback, C center, X split end (usually left), Z flanker (usually right), Y tight end or slot, H running back, S slot or second back. In 5v5 flag there are Q, C and three others; in 7v7 Q, C and five receivers; 11-man adds a line.

Route tree: 1 flat, 2 slant, 3 comeback, 4 curl, 5 out, 6 dig, 7 corner, 8 post, 9 go. Other routes: ${ROUTE_IDS.join(", ")}. Blocks: ${BLOCK_IDS.join(", ")}.

Rules:
- Use only the formations, routes and blocks allowed by the tool.
- Only list players the call gives a job; don't invent assignments for the rest.
- Mark firstRead on at most one route, and only when the call names the read.
- Use the coach's own terms below before general football meaning.
- If a word could mean two things, pick the likelier and add a short question to "unsure".
- The game type the coach is drawing is ${req.game}; keep it unless the call clearly says otherwise.
${terms ? `\nThe coach's terms:\n${terms}` : ""}`;
}

/* ------------------------------------------------------------------ drawing */

const INK = "#0B1524";

/** Players, then routes, for a read — ready to drop on the field in one group. */
/** Token codes behind the letters coaches call: H is the running back, S the second back / slot. */
export const CODE_FOR: Record<string, string> = { Q: "QB", C: "C", X: "X", Y: "Y", Z: "Z", H: "RB", S: "H" };

/**
 * The formation's players, with anyone the call names but the formation
 * lacks (5v5 Trips has no running back, say) swapped in for a player the
 * call left without a job. A called running back lines up in the backfield,
 * and any other letter at its own spot in the full formation when it's free.
 */
export function placeForRead(read: AssistantRead, tokens: TokenPreset[]): Placed[] {
  const placed = layoutFormation(read.game, read.personnel ?? "11", read.formation);
  const letter = (p: Placed) => tokenFor(p, tokens).label.toUpperCase();
  const called = new Set(read.assignments.map((a) => a.player.toUpperCase()));
  const have = new Set(placed.map(letter));
  for (const want of called) {
    if (have.has(want) || !CODE_FOR[want] || want === "Q" || want === "C") continue;
    // Swap out the innermost skill player the call didn't mention.
    const spare = placed
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (p.role === "wr" || p.role === "te" || p.role === "rb") && !called.has(letter(p)))
      .sort((a, b) => Math.abs(a.p.dx) - Math.abs(b.p.dx))[0];
    if (!spare) continue;
    // A called letter lines up where the formation puts it (X alone on the left in Trips Right), if that spot is free.
    const home = letterSpot(read.formation, CODE_FOR[want]);
    const free = home && !placed.some((p, i) => i !== spare.i && Math.abs(p.dx - home.dx) < 40 && Math.abs(p.dy - home.dy) < 30);
    const spot = want === "H" ? backSpot(read.formation) : free ? home : { dx: spare.p.dx, dy: spare.p.dy };
    placed[spare.i] = { ...spot, code: CODE_FOR[want], role: want === "H" ? "rb" : spare.p.role };
    have.delete(letter(spare.p));
    have.add(want);
  }
  return placed;
}

export function readToNodes(read: AssistantRead, tokens: TokenPreset[], losY: number, z: number): SceneNode[] {
  const placed = placeForRead(read, tokens);
  const cx = CANVAS_W / 2;
  const players = placed.map((p, i) => ({ ...makePlayer(tokenFor(p, tokens), cx + p.dx, losY + p.dy), z: z + i }));
  return [...players, ...routesFor(read.assignments, players, losY, z + players.length)];
}

/** One line per assignment, from the player with that letter; letters not on the field are skipped. */
export function routesFor(assignments: Assignment[], players: PlayerNode[], losY: number, z: number): PathNode[] {
  const byLetter = new Map(players.filter((p) => p.label).map((p) => [p.label.toUpperCase(), p]));
  const paths: PathNode[] = [];
  assignments.forEach((a, i) => {
    const from = byLetter.get(a.player.toUpperCase());
    if (from) paths.push(assignmentPath(a, from, losY, z + i));
  });
  return paths;
}

/** Routes a back runs from where he stands; every other route from the backfield releases across the line first. */
const BACKFIELD_ROUTES = ["swing", "screen", "bubble", "wheel", "dive", "sweep", "counter", "reverse", "end_around", "keep", "qb_sneak"];

export function assignmentPath(a: Assignment, from: Point, losY: number, z: number): PathNode {
  const cx = CANVAS_W / 2;
  const segs =
    a.kind === "motion"
      ? ([[0, 26], [from.x > cx ? -180 : 180, 8]] as [number, number][])
      : ((a.kind === "block" ? BLOCKS[a.action] : ROUTES[a.action]) ?? ROUTES.go);
  // Shapes are drawn for a receiver on the right, so a left-side player mirrors them:
  // an out still breaks to his sideline and a slant still breaks to the middle.
  let mirror = from.x < cx;
  const last = [...segs].reverse().find(([dx]) => dx !== 0)?.[0] ?? 0;
  // "toward" only flips a route the call breaks the other way from its usual shape (an "out" slant).
  if (a.kind === "route" && a.toward && last !== 0 && (last > 0 ? "out" : "in") !== a.toward) mirror = !mirror;
  // Flip the shape so its last leg points the way the board shows.
  if (a.breaks && last !== 0) mirror = (last > 0) === (a.breaks === "left");
  const points: Point[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  if (a.kind === "route" && from.y - losY > 40 && !BACKFIELD_ROUTES.includes(a.action)) {
    x = mirror ? -80 : 80;
    y = losY - from.y - 12;
    points.push({ x, y });
  }
  for (const [dx, dy] of segs) {
    x += a.kind === "motion" ? dx : mirror ? -dx : dx;
    y += dy;
    // Routes stop at the sideline rather than running off the field.
    const p = { x: Math.min(CANVAS_W - 16 - from.x, Math.max(16 - from.x, x)), y };
    // A leg the sideline squeezed to nothing would hide the route's end, so it's dropped.
    const prev = points[points.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) >= 8) points.push(p);
  }
  // Every route ends on a leg long enough to show its arrow or block mark; one cut short
  // at the sideline finishes upfield along it instead.
  if (points.length < 2) points.push({ x: 0, y: a.kind === "block" ? -44 : -60 });
  const end = points[points.length - 1];
  const before = points[points.length - 2];
  if (Math.hypot(end.x - before.x, end.y - before.y) < 26) points[points.length - 1] = { x: end.x, y: before.y - 30 };
  return {
    ...baseNode({ x: from.x, y: from.y, z, name: a.kind === "block" ? "Block" : a.kind === "motion" ? "Motion" : "Route" }),
    kind: "path",
    points,
    handles: {},
    style: a.kind === "motion" ? "motion" : "solid",
    curve: ["wheel", "sweep", "counter", "bubble"].includes(a.action) ? "spline" : "straight",
    startCap: "none",
    endCap: a.kind === "block" && a.action !== "chip" ? "tee" : "arrow",
    stroke: INK,
    width: 3,
    closed: false,
    fill: "none",
    fillOpacity: 0,
    fromId: null,
    toId: null,
    firstRead: a.kind === "route" && a.firstRead ? true : undefined,
  };
}

/* --------------------------------------------------------------- near match */

/** The Vault play most like this read, if any is close: same formation and a shared concept word. */
export function nearMatch(read: AssistantRead, plays: StoredPlay[]): StoredPlay | null {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const want = words(read.name);
  let best: { play: StoredPlay; score: number } | null = null;
  for (const p of plays) {
    let score = 0;
    if (p.formation && p.formation.toLowerCase() === read.formation.toLowerCase()) score += 2;
    for (const w of words(`${p.name} ${p.tags.join(" ")}`)) if (want.has(w)) score += 1;
    if (score >= 3 && (!best || score > best.score)) best = { play: p, score };
  }
  return best?.play ?? null;
}

/** The letters a chip can switch a player to, with what each means in GridIronVault. */
export const PLAYER_LETTERS: { letter: string; means: string }[] = [
  { letter: "X", means: "split end" },
  { letter: "Y", means: "tight end / slot" },
  { letter: "Z", means: "flanker" },
  { letter: "H", means: "running back" },
  { letter: "S", means: "slot / 2nd back" },
  { letter: "Q", means: "quarterback" },
  { letter: "C", means: "center" },
];

/**
 * The coach's own letters win: when the words a chip came from start with a
 * player letter ("H flat"), that is the player, whatever the read guessed.
 */
export function trustSaidLetters(read: AssistantRead): AssistantRead {
  return {
    ...read,
    assignments: read.assignments.map((a) => {
      const said = a.heard?.trim().match(/^([QCXYZHS])(?=\b|[^a-z])/i)?.[1]?.toUpperCase();
      return said && said !== a.player.toUpperCase() ? { ...a, player: said } : a;
    }),
  };
}

export const ACTION_LABEL = (a: Assignment) =>
  a.kind === "motion" ? "motion" : a.action.replace(/_/g, " ");
