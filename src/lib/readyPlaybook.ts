/**
 * The Ready-to-Go 5v5 Playbook: 24 plays in four sections (Spread, Trips &
 * Bunch, Twins, Misdirection & Run), drawn as real scene data with the
 * quarterback's reading order numbered on the field (1, 2, 3), the first
 * read in cyan. One tap copies all of them into a coach's Vault as a playbook.
 *
 * Routes are written in yards from the player: +x toward the right sideline,
 * +y upfield. One yard is 20 canvas units, so a 10-yard route is 200.
 */
import { baseNode, CANVAS_W, DEFAULT_STROKE, uid } from "./types";
import type { PathNode, PlayMeta, PlayerNode, Point, Scene, SceneNode, StoredPlay } from "./types";
import { OFFENSE_TOKENS, makePlayer } from "./presets";
import { api, toStoredPlay } from "./api";
import { store } from "./store";
import type { Tier } from "./plan";

const LOS = 430;
const CX = CANVAS_W / 2;
const YD = 20;
const INK = "#0B1524";
const RUN = "#D24B3E";
const BALL = "#F2A63B";

export const READY_BOOK_NAME = "Ready-to-Go 5v5 Playbook";

/** Where players line up, in canvas units from the ball (dy: + is behind the line). */
const W = 340; // wide
const S = 170; // slot
const SPOT = {
  wideL: [-W, 4],
  slotL: [-S, 6],
  wideR: [W, 4],
  slotR: [S, 6],
  innerR: [150, 6],
  midR: [250, 6],
  stackR: [W, 50],
  stackMidR: [250, 52],
  backL: [-90, 112],
  backR: [90, 112],
  deep: [0, 132],
  qb: [0, 60],
  c: [0, 0],
} as const satisfies Record<string, readonly [number, number]>;
type Spot = keyof typeof SPOT;

type Leg = [number, number];
type Route = {
  on: "X" | "Y" | "Z" | "C" | "Q";
  legs: Leg[];
  kind?: "run" | "motion" | "fake" | "block";
  curve?: boolean;
};
type Handoff = { to: "X" | "Y" | "Z" | "C"; fake?: boolean };
type Read = { n: number; on: "X" | "Y" | "Z" | "C" | "Q" };

type ReadySpec = {
  n: number;
  name: string;
  formation: string;
  section: "spread" | "trips" | "twins" | "misdirection";
  playType: PlayMeta["playType"];
  /** Alignment: where each player stands. Q and C are always there. */
  at: Partial<Record<"X" | "Y" | "Z", Spot>>;
  routes: Route[];
  handoffs?: Handoff[];
  reads: Read[];
  /** One line on the concept, then the reading order in words. */
  about: string;
  readText: string;
};

const SECTION_TAG: Record<ReadySpec["section"], string> = {
  spread: "spread",
  trips: "trips & bunch",
  twins: "twins",
  misdirection: "misdirection & run",
};

const R = (on: Route["on"], legs: Leg[], extra: Partial<Route> = {}): Route => ({ on, legs, ...extra });

/* ------------------------------------------------------------ the 24 plays */

export const READY_PLAYS: ReadySpec[] = [
  /* ---- Section 1: Spread (balanced attack) ---- */
  {
    n: 1, name: "All Curls", formation: "Spread", section: "spread", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("X", [[0, 7], [1, -2]]), R("Z", [[0, 7], [-1, -2]]), R("Y", [[0, 5], [-0.8, -1]]), R("C", [[0, 5], [0.6, -1]])],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "X" }, { n: 2, on: "Z" }, { n: 3, on: "C" }],
    about: "Everyone sits down facing the quarterback: outside at 7 yards back to 5, inside at 5 back to 4.",
    readText: "1 Y (quick inside look) · 2 X or Z (outside matchup) · 3 C (safety valve)",
  },
  {
    n: 2, name: "Quick Slants", formation: "Spread", section: "spread", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("X", [[0, 3], [3, 3]]), R("Z", [[0, 3], [-3, 3]]), R("Y", [[0, 2], [-4, 3]]), R("C", [[0.5, 1], [3, 0.5]])],
    reads: [{ n: 1, on: "X" }, { n: 2, on: "Y" }, { n: 3, on: "C" }],
    about: "Three-step slants from both sides; the center slips into the right flat a count late.",
    readText: "1 X (fast timing throw) · 2 Y (over the middle) · 3 C (check-down)",
  },
  {
    n: 3, name: "Mesh", formation: "Spread Stack", section: "spread", playType: "pass",
    at: { X: "wideL", Y: "wideR", Z: "stackR" },
    routes: [R("X", [[0, 2], [15, 0]]), R("Y", [[0, 3], [-15, 0]]), R("Z", [[0, 7], [-4, 4]]), R("C", [[0, 5], [0.6, -1]])],
    reads: [{ n: 1, on: "X" }, { n: 1, on: "Y" }, { n: 2, on: "C" }, { n: 3, on: "Z" }],
    about: "X and Y cross shallow at 2 and 3 yards so their defenders run into each other; Z posts over the top.",
    readText: "1 X or Y (whoever the mesh frees) · 2 C (sits behind the mesh) · 3 Z (deep if the safety bites)",
  },
  {
    n: 4, name: "Curl-Flat", formation: "Spread", section: "spread", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("C", [[-1, 2], [-6, 1]]), R("X", [[0, 8], [1, -2]]), R("Y", [[0, 6], [4, 4]]), R("Z", [[0, 5], [5, 0]])],
    reads: [{ n: 1, on: "C" }, { n: 2, on: "X" }, { n: 3, on: "Y" }],
    about: "The left corner can't take both: the center in the flat and X curling at 6.",
    readText: "1 C (if the corner plays deep) · 2 X (if the corner jumps C) · 3 Y (deep sideline)",
  },
  {
    n: 5, name: "Slant-Flat", formation: "Spread Twins Left", section: "spread", playType: "pass",
    at: { X: "wideL", Y: "slotL", Z: "wideR" },
    routes: [R("Y", [[0, 1], [-7, 0]]), R("X", [[0, 2], [4, 3]]), R("Z", [[0, 10], [-12, 0]]), R("C", [[0, 9]])],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "X" }, { n: 3, on: "Z" }],
    about: "Y widens to the flat and pulls the corner; X slants in right behind him.",
    readText: "1 Y (check the corner's depth) · 2 X (behind the pulling corner) · 3 Z (late window)",
  },
  {
    n: 6, name: "Four Verticals", formation: "Spread", section: "spread", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("C", [[0, 15]]), R("Y", [[0, 15]]), R("X", [[0, 15]]), R("Z", [[0, 15]])],
    reads: [{ n: 1, on: "C" }, { n: 1, on: "Y" }, { n: 2, on: "X" }, { n: 2, on: "Z" }],
    about: "All four run straight and deep. Throw away from the safety.",
    readText: "1 C or Y (read the safety down the seams) · 2 X or Z (single coverage outside)",
  },

  /* ---- Section 2: Trips & Bunch (overloads, red zone) ---- */
  {
    n: 7, name: "Smash", formation: "Trips Right", section: "trips", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("Z", [[0, 5], [-0.4, -1]]), R("Y", [[0, 8], [4, 4]]), R("X", [[0, 8], [12, 0]]), R("C", [[-1, 1.5], [-6, 0.5]])],
    reads: [{ n: 1, on: "Z" }, { n: 2, on: "Y" }, { n: 3, on: "X" }],
    about: "Hitch underneath, corner over the top: a high-low on the right corner.",
    readText: "1 Z (if the corner drops) · 2 Y (if the corner jumps Z, throw high to the corner) · 3 X (backside)",
  },
  {
    n: 8, name: "Flood", formation: "Trips Right", section: "trips", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("Z", [[0, 15]]), R("Y", [[0, 10], [7, 0]]), R("C", [[2, 2], [6, 1]]), R("X", [[0, 8], [5, 5]])],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "C" }, { n: 3, on: "Z" }],
    about: "Three levels to the right sideline: flat, 10-yard out, go.",
    readText: "1 Y (intermediate sweet spot) · 2 C (low flat) · 3 Z (deep shot)",
  },
  {
    n: 9, name: "Spot", formation: "Trips Right", section: "trips", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("C", [[2, -0.5], [7, 1.5]], { curve: true }), R("Z", [[0, 4], [-2, 2]]), R("Y", [[0, 6], [4, 4]]), R("X", [[0, 2], [4, 3]])],
    reads: [{ n: 1, on: "C" }, { n: 2, on: "Z" }, { n: 3, on: "Y" }],
    about: "A triangle on one defender: swing in the flat, Z sitting in the hole, Y on the corner.",
    readText: "1 C (speed to the flat) · 2 Z (soft spot in the zone) · 3 Y (over the top)",
  },
  {
    n: 10, name: "Scissors", formation: "Trips Right", section: "trips", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("Y", [[0, 8], [4, 4]]), R("Z", [[0, 8], [-7, 4]]), R("C", [[0, 4], [0.5, -1]])],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "Z" }, { n: 3, on: "C" }],
    about: "Y breaks to the corner flag while Z crosses under him to the post.",
    readText: "1 Y (corner flag) · 2 Z (post underneath) · 3 C (dump-off)",
  },
  {
    n: 11, name: "Trips Bubble Screen", formation: "Trips Right", section: "trips", playType: "pass",
    at: { X: "innerR", Y: "midR", Z: "wideR" },
    routes: [R("X", [[1.5, -1.5], [5, 0]], { curve: true }), R("Y", [[0, 7]], { kind: "block" }), R("Z", [[0, 7]], { kind: "block" }), R("C", [[0, 6], [-10, 0]])],
    reads: [{ n: 1, on: "X" }, { n: 2, on: "C" }],
    about: "X bubbles behind the line and catches it on the snap; Y and Z clear or block their men.",
    readText: "1 X (throw on the snap) · 2 C (if the bubble is blown up)",
  },
  {
    n: 12, name: "Trips Cross Go", formation: "Trips Right Stack", section: "trips", playType: "pass",
    at: { X: "innerR", Y: "midR", Z: "stackMidR" },
    routes: [R("Z", [[0.5, 3], [0, 13]]), R("X", [[0, 3], [-14, 0]]), R("Y", [[0, 5], [-15, 0]]), R("C", [[2, 1], [5, 0]])],
    reads: [{ n: 1, on: "Z" }, { n: 2, on: "Y" }, { n: 3, on: "C" }],
    about: "X and Y cross away and take the defense with them; Z waits a half-count and runs up the empty seam.",
    readText: "1 Z (the seam) · 2 Y (underneath) · 3 C (outlet)",
  },

  /* ---- Section 3: Twins (dual threats) ---- */
  {
    n: 13, name: "Out and Up (Chair)", formation: "Twins Left", section: "twins", playType: "pass",
    at: { X: "wideL", Y: "slotL", Z: "wideR" },
    routes: [R("X", [[0, 4], [-4, 0], [0, 10]]), R("Y", [[0, 2], [4, 3]]), R("C", [[0, 5], [0.5, -1]])],
    reads: [{ n: 1, on: "X" }, { n: 2, on: "C" }, { n: 3, on: "Y" }],
    about: "X sells the 4-yard out, then turns it up the sideline; Y's slant holds the safety inside.",
    readText: "1 X (on the vertical burst) · 2 C (safe option) · 3 Y (backside)",
  },
  {
    n: 14, name: "Double Out", formation: "Twins Right", section: "twins", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("Z", [[0, 5], [5, 0]]), R("Y", [[0, 10], [9, 0]]), R("X", [[0, 6], [4, 4]])],
    reads: [{ n: 1, on: "Z" }, { n: 2, on: "Y" }, { n: 3, on: "X" }],
    about: "Two outs stacked at 5 and 10 yards; X's post punishes a safety who cheats over.",
    readText: "1 Z (short out) · 2 Y (deep out) · 3 X (if the safety cheats over)",
  },
  {
    n: 15, name: "Post-Wheel", formation: "Twins Left", section: "twins", playType: "pass",
    at: { X: "wideL", Y: "slotL", Z: "wideR" },
    routes: [R("Y", [[0, 8], [4, 4]]), R("X", [[-1, 1.5], [-3, 1], [-0.5, 10]], { curve: true }), R("C", [[0, 3]])],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "X" }, { n: 3, on: "C" }],
    about: "Y's deep post drags the safety inside; X goes to the flat and wheels up the numbers.",
    readText: "1 Y (does the safety follow?) · 2 X (over the shoulder on the sideline) · 3 C (dump-off)",
  },
  {
    n: 16, name: "Hitch and Go", formation: "Twins Left", section: "twins", playType: "pass",
    at: { X: "wideL", Y: "slotL", Z: "wideR" },
    routes: [R("Z", [[0, 5], [-0.6, -0.8], [0.6, 10]]), R("C", [[1, 1], [6, 0]])],
    reads: [{ n: 1, on: "Z" }, { n: 2, on: "C" }],
    about: "Z turns to show the hitch, holds a count, then goes deep; the center's out pulls the corner down.",
    readText: "1 Z (throw on the second burst) · 2 C (if the corner didn't bite)",
  },
  {
    n: 17, name: "Stick", formation: "Twins Right", section: "twins", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("Y", [[0, 5], [-1, 0]]), R("Z", [[0, 3], [4, 0]]), R("C", [[-1, 1.5], [-6, 0.5]])],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "Z" }, { n: 3, on: "C" }],
    about: "Y sticks at 5 facing in; Z's quick out stretches the corner wide.",
    readText: "1 Y (chain mover against zone) · 2 Z (if they lock on Y) · 3 C (check-down)",
  },
  {
    n: 18, name: "Whip Out", formation: "Twins Left", section: "twins", playType: "pass",
    at: { X: "wideL", Y: "slotL", Z: "wideR" },
    routes: [R("X", [[1.5, 2], [-6, 0]]), R("Y", [[0, 15]])],
    reads: [{ n: 1, on: "X" }, { n: 2, on: "Y" }],
    about: "X fakes the slant for three hard steps, plants, and whips back out to the sideline.",
    readText: "1 X (as he whips back out) · 2 Y (deep seam)",
  },

  /* ---- Section 4: Misdirection & run ---- */
  {
    n: 19, name: "Jet Sweep", formation: "Jet", section: "misdirection", playType: "run",
    at: { X: "wideL", Y: "wideR", Z: "slotR" },
    routes: [
      R("Y", [[-0.5, -3.3], [-16.5, 0]], { kind: "motion" }),
      R("Y", [[-17, -3.3], [-6, 0.3], [-1.5, 6]], { kind: "run", curve: true }),
      R("Z", [[0, 6]], { kind: "block" }),
      R("C", [[0, 5]], { kind: "block" }),
      R("Q", [[3, 0], [1.5, 4]], { kind: "fake" }),
    ],
    handoffs: [{ to: "Y" }],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "Q" }],
    about: "Y motions behind the quarterback and takes the pop pass or handoff at full speed to the left edge; C and Z lead.",
    readText: "1 Y (handoff on the run) · 2 QB keep (fake it and run opposite if the rusher chases the motion)",
  },
  {
    n: 20, name: "Fake Reverse", formation: "Split Backs", section: "misdirection", playType: "run",
    at: { X: "backL", Y: "backR", Z: "wideR" },
    routes: [
      R("X", [[-6, 0.5], [-3, 5]], { kind: "fake" }),
      R("Y", [[-2, -1], [6, -1.5], [8, 3], [1, 6]], { kind: "run", curve: true }),
      R("C", [[2, 3], [2, 3]], { kind: "block" }),
      R("Z", [[0, 15]]),
    ],
    handoffs: [{ to: "X", fake: true }, { to: "Y" }],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "Z" }],
    about: "Fake to X going left; Y loops behind the quarterback and takes it back wide right. Z is deep if your league allows the throw.",
    readText: "1 Y (clean counter handoff) · 2 Z (QB rolls behind Y and throws deep, if allowed)",
  },
  {
    n: 21, name: "QB Bootleg", formation: "Single Back Right", section: "misdirection", playType: "run",
    at: { X: "backR", Y: "slotL", Z: "wideL" },
    routes: [
      R("X", [[-4, 3], [0, 3]], { kind: "fake" }),
      R("Q", [[-4, 0.5], [-6, 2]], { kind: "run" }),
      R("C", [[-1, 0.5], [-8, 0.5]]),
      R("Y", [[0, 8], [-6, 0]]),
    ],
    handoffs: [{ to: "X", fake: true }],
    reads: [{ n: 1, on: "Q" }, { n: 2, on: "C" }, { n: 3, on: "Y" }],
    about: "Hard fake to X up the middle, then the quarterback rolls left with C flat and Y on an out.",
    readText: "1 QB run (if the edge is clear) · 2 C (over the rush) · 3 Y (deeper sideline)",
  },
  {
    n: 22, name: "Criss-Cross", formation: "Split Backs", section: "misdirection", playType: "run",
    at: { X: "backL", Y: "backR" },
    routes: [
      R("X", [[5, 1.5], [6, 0], [2, 5]], { kind: "fake" }),
      R("Y", [[-3, -1.5], [-6, 0], [-2, 5]], { kind: "run", curve: true }),
      R("C", [[0, 1], [0, 9]]),
    ],
    handoffs: [{ to: "X", fake: true }, { to: "Y" }],
    reads: [{ n: 1, on: "Y" }, { n: 2, on: "C" }],
    about: "X crosses in front of the quarterback, Y loops behind him the other way: their paths make an X.",
    readText: "1 Y (handoff the other way) · 2 C (delayed vertical up the middle)",
  },
  {
    n: 23, name: "Center Loop", formation: "Spread", section: "misdirection", playType: "pass",
    at: { X: "wideL", Y: "slotR", Z: "wideR" },
    routes: [R("C", [[0, 1.5], [-1, -3.5], [-4, -0.5], [-5, 1.5]], { curve: true }), R("X", [[0, 15]]), R("Y", [[0, 15]]), R("Z", [[0, 15]])],
    reads: [{ n: 1, on: "C" }, { n: 2, on: "X" }],
    about: "Everyone clears deep; the center fakes inside and loops behind the quarterback to the empty left flat.",
    readText: "1 C (let the rusher fly by, then dump it to C) · 2 X (backside)",
  },
  {
    n: 24, name: "Toss Sweep Left", formation: "Pistol", section: "misdirection", playType: "run",
    at: { X: "slotL", Y: "deep", Z: "wideR" },
    routes: [
      R("X", [[0.5, -0.8], [12, 0]], { kind: "motion" }),
      R("Y", [[-4, 0.5], [-8, 1], [-2, 6]], { kind: "run", curve: true }),
      R("C", [[-4, 2], [-3, 3]], { kind: "block" }),
    ],
    handoffs: [{ to: "Y" }],
    reads: [{ n: 1, on: "Y" }],
    about: "X's fast motion across the quarterback is the decoy; the quarterback spins and tosses over the rusher to Y sweeping left.",
    readText: "1 Y (quick catch and run)",
  },
];

/* ------------------------------------------------------------ scene builder */

const token = (code: string) => OFFENSE_TOKENS.find((t) => t.code === code)!;
const CODE: Record<"X" | "Y" | "Z", string> = { X: "X", Y: "Y", Z: "Z" };

function line(from: Point, legs: Leg[], z: number, opts: Partial<PathNode>): PathNode {
  const points: Point[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (const [dx, dy] of legs) {
    x += dx * YD;
    y -= dy * YD;
    // Lines stop at the sideline rather than running off the field.
    points.push({ x: Math.min(CANVAS_W - 16 - from.x, Math.max(16 - from.x, x)), y: Math.max(12 - from.y, y) });
  }
  return {
    ...baseNode({ x: from.x, y: from.y, z, name: "Route" }),
    kind: "path",
    points,
    handles: {},
    style: "solid",
    curve: "straight",
    startCap: "none",
    endCap: "arrow",
    stroke: INK,
    width: DEFAULT_STROKE,
    closed: false,
    fill: "none",
    fillOpacity: 0.16,
    fromId: null,
    toId: null,
    ...opts,
  };
}

function readMark(at: Point, n: number, z: number): SceneNode {
  return {
    ...baseNode({ x: at.x, y: at.y, z, name: `Read ${n}` }),
    kind: "text",
    text: String(n),
    fontSize: 18,
    color: n === 1 ? "#0E9FBB" : INK,
    weight: 700,
    align: "middle",
    boxed: true,
  };
}

export function readyScene(spec: ReadySpec): Scene {
  const nodes: SceneNode[] = [];
  const group = uid("grp");
  const players = new Map<string, PlayerNode>();
  let z = 200;
  const place = (key: "Q" | "C" | "X" | "Y" | "Z", code: string, spot: Spot) => {
    const [dx, dy] = SPOT[spot];
    const p = { ...makePlayer(token(code), CX + dx, LOS + dy), groupId: group, z: z++ };
    players.set(key, p);
    nodes.push(p);
  };
  place("C", "C", "c");
  place("Q", "QB", "qb");
  for (const k of ["X", "Y", "Z"] as const) {
    const spot = spec.at[k];
    if (spot) place(k, CODE[k], spot);
  }

  // Where each player's last line ends, for the read numbers.
  const ends = new Map<string, Point>();
  const firstReader = spec.reads.find((r) => r.n === 1)?.on;
  let firstDone = false;
  let lz = 100;
  for (const r of spec.routes) {
    const from = players.get(r.on);
    if (!from) continue;
    const isFirst = !firstDone && r.on === firstReader && (r.kind === undefined || r.kind === "run");
    if (isFirst) firstDone = true;
    const node = line(from, r.legs, lz++, {
      style: r.kind === "motion" ? "motion" : r.kind === "fake" ? "dashed" : "solid",
      stroke: r.kind === "run" || (r.kind === "fake" && r.on === "Q") ? RUN : INK,
      endCap: r.kind === "block" ? "tee" : "arrow",
      curve: r.curve ? "spline" : "straight",
      firstRead: isFirst || undefined,
      // Glued to the player, so moving him brings his line.
      fromId: r.kind === "motion" ? null : from.id,
      name: r.kind === "motion" ? "Motion" : r.kind === "block" ? "Block" : r.kind === "fake" ? "Fake" : r.kind === "run" ? "Run" : "Route",
    });
    nodes.push(node);
    if (r.kind !== "motion") {
      const tip = node.points[node.points.length - 1];
      ends.set(r.on, { x: from.x + tip.x, y: from.y + tip.y });
    }
  }

  // Handoffs and fakes: a dashed ball-colored line from the quarterback.
  const qb = players.get("Q")!;
  for (const h of spec.handoffs ?? []) {
    const to = players.get(h.to);
    if (!to) continue;
    // Toward where the carrier will be: a few yards along his path, or him.
    const target = { x: (qb.x + to.x) / 2, y: Math.max(qb.y, to.y) + 10 };
    const dx = target.x - qb.x;
    const dy = target.y - qb.y;
    nodes.push(
      line(qb, [[dx / YD, -dy / YD]], lz++, {
        style: "dashed",
        stroke: h.fake ? "#9AA7B4" : BALL,
        name: h.fake ? "Fake handoff" : "Handoff",
        width: 2.6,
      }),
    );
  }

  // Read numbers beside the end of each reader's line (or beside the player).
  let rz = 400;
  const used: Point[] = [];
  for (const r of spec.reads) {
    const p = players.get(r.on);
    if (!p) continue;
    const end = ends.get(r.on) ?? { x: p.x, y: p.y };
    let at = { x: Math.min(CANVAS_W - 24, Math.max(24, end.x + (end.x < CX ? -22 : 22))), y: Math.max(20, end.y - 18) };
    while (used.some((u) => Math.hypot(u.x - at.x, u.y - at.y) < 26)) at = { ...at, y: at.y - 26 };
    used.push(at);
    nodes.push(readMark(at, r.n, rz++));
  }

  return { version: 2, view: "half", width: 1040, height: 660, losY: LOS, pivot: null, nodes };
}

/** A fresh copy of one ready play, as a play in the coach's Vault. */
export function readyPlay(spec: ReadySpec, ownerName: string): StoredPlay {
  return {
    id: uid("play"),
    ownerName,
    name: `${String(spec.n).padStart(2, "0")} · ${spec.name}`,
    formation: spec.formation,
    playType: spec.playType,
    personnel: "5-on-5 offense",
    description: `${spec.about} Reads: ${spec.readText}.`,
    tags: ["ready-to-go", SECTION_TAG[spec.section]],
    isPublic: false,
    fieldView: "half",
    scene: readyScene(spec),
    preview: "",
    saveCount: 0,
    updatedAt: new Date().toISOString(),
    remote: false,
  };
}

/* ------------------------------------------------- adding it to the Vault */


export type AddResult = { ok: true; added: number } | { ok: false; reason: string };

/**
 * Copies all 24 plays into the coach's Vault and files them in a playbook
 * named "Ready-to-Go 5v5 Playbook". Saved in this browser first; signed in,
 * each play and the playbook also go to the coach's account.
 */
export async function addReadyPlaybook(opts: { tier: Tier; vaultSize: number; ownerName: string; signedIn: boolean }): Promise<AddResult> {
  const room = opts.tier.playLimit - opts.vaultSize;
  if (room < READY_PLAYS.length)
    return {
      ok: false,
      reason: `The playbook has ${READY_PLAYS.length} plays and your ${opts.tier.name} Vault has room for ${Math.max(0, room)} more. Delete some plays or move up a plan.`,
    };
  let plays = READY_PLAYS.map((spec) => readyPlay(spec, opts.ownerName));
  plays.forEach((p) => store.upsertPlay(p));
  const book = {
    id: uid("book"),
    name: READY_BOOK_NAME,
    description: "24 plays in four sections (Spread, Trips & Bunch, Twins, Misdirection & Run) with the quarterback's reads numbered 1-2-3 on every diagram.",
    color: "#16C8E8",
    isPublic: false,
    updatedAt: new Date().toISOString(),
    playIds: plays.map((p) => p.id),
  };
  store.upsertPlaybook(book);

  if (opts.signedIn) {
    // Swap each local copy for the account's copy, keeping the playbook's order.
    const synced: StoredPlay[] = [];
    for (const p of plays) {
      try {
        const res = await api.createPlay({
          name: p.name,
          formation: p.formation,
          playType: p.playType,
          personnel: p.personnel,
          description: p.description,
          tags: p.tags,
          fieldView: p.fieldView,
          scene: p.scene,
          isPublic: false,
        });
        const saved = toStoredPlay(res.play);
        store.removePlay(p.id);
        store.upsertPlay(saved);
        synced.push(saved);
      } catch {
        synced.push(p); // stays in this browser; it syncs the next time it's saved
      }
    }
    plays = synced;
    store.upsertPlaybook({ ...book, playIds: plays.map((p) => p.id) });
  }
  return { ok: true, added: plays.length };
}
