import type { TokenPreset } from "./presets";

/**
 * Formation library, from the Grid1ron Design canvas (Designer · assistant,
 * tools…): pick a game type, a personnel group and a formation, and the set
 * is built for you. 11-man adds the offensive line; personnel sets the RB
 * and TE count; 7v7 drops the line and the back; 5v5 flag is Q, C and three.
 */
export type GameType = "5v5" | "7v7" | "11";

export const GAME_TYPES: { id: GameType; label: string }[] = [
  { id: "5v5", label: "5v5 flag" },
  { id: "7v7", label: "7v7" },
  { id: "11", label: "11-man" },
];

export type Personnel = { code: string; rb: number; te: number; wr: number };

export const PERSONNEL: Personnel[] = [
  { code: "11", rb: 1, te: 1, wr: 3 },
  { code: "10", rb: 1, te: 0, wr: 4 },
  { code: "12", rb: 1, te: 2, wr: 2 },
  { code: "13", rb: 1, te: 3, wr: 1 },
  { code: "20", rb: 2, te: 0, wr: 3 },
  { code: "21", rb: 2, te: 1, wr: 2 },
  { code: "22", rb: 2, te: 2, wr: 1 },
  { code: "23", rb: 2, te: 3, wr: 0 },
  { code: "00", rb: 0, te: 0, wr: 5 },
];

export const personnelLabel = (p: Personnel) => `${p.code} · ${p.rb} RB, ${p.te} TE, ${p.wr} WR`;

/** [dx, dy, preferred token codes]: dx from the ball, dy behind the line. */
type Spot = [number, number, string[]?];

type Formation = {
  name: string;
  note: string;
  qb: Spot;
  /** Backfield spots, tailback first. Backs with no spot split out as receivers. */
  backs: Spot[];
  /** Receiver spots in the order they fill. */
  spots: Spot[];
  /** Tight-end spots (11-man only), in the order they fill. */
  te?: Spot[];
  /** 5v5 flag: how many backs, and an optional receiver order of its own. */
  five: { backs: number; spots?: Spot[] };
};

const W = 400; // wide (a corner from here still ends on the field)
const S = 290; // slot
const I = 200; // inside
const TE_RIGHT: Spot[] = [[150, 4], [-150, 4], [196, 40]];
const UNDER: Spot = [0, 40];
const GUN: Spot = [0, 72];

const BASE: Formation[] = [
  {
    name: "Trips Right",
    note: "Three receivers to the right — floods a third of the field fast.",
    qb: [0, 70],
    backs: [[0, 140], [-60, 140]],
    spots: [[W, 4, ["Z"]], [-W, 4, ["X"]], [S, 26, ["H", "Y"]], [I, 4, ["Y", "H"]], [-S, 26]],
    five: { backs: 0, spots: [[W, 4, ["Z"]], [S, 26, ["H", "Y"]], [I, 4, ["Y", "H"]]] },
  },
  {
    name: "Doubles",
    note: "Two receivers each side — balanced, hard to shade.",
    qb: GUN,
    backs: [[-56, 72], [56, 72]],
    spots: [[-W, 4, ["X"]], [W, 4, ["Z"]], [-S, 26, ["H", "Y"]], [S, 26, ["Y", "H"]], [-I, 4]],
    five: { backs: 1 },
  },
  {
    name: "Bunch Right",
    note: "Three receivers tight together on the right for natural rubs.",
    qb: GUN,
    backs: [[-56, 72], [56, 72]],
    spots: [[-W, 4, ["X"]], [300, 4, ["Z"]], [255, 42, ["H", "Y"]], [210, 4, ["Y", "H"]], [-S, 26]],
    five: { backs: 0, spots: [[300, 4, ["Z"]], [255, 42, ["H", "Y"]], [210, 4, ["Y", "H"]]] },
  },
  {
    name: "Empty",
    note: "No backs — every eligible receiver releases on the snap.",
    qb: GUN,
    backs: [],
    spots: [[-W, 4, ["X"]], [W, 4, ["Z"]], [-S, 26, ["H", "Y"]], [S, 26, ["Y", "H"]], [230, 4], [-230, 4]],
    five: { backs: 0, spots: [[-W, 4, ["X"]], [W, 4, ["Z"]], [S, 26, ["H", "Y"]]] },
  },
  {
    name: "I Formation",
    note: "Both backs stacked behind the quarterback for downhill runs.",
    qb: UNDER,
    backs: [[0, 150], [0, 98]],
    spots: [[-W, 4, ["X"]], [W, 26, ["Z"]], [-S, 26, ["H", "Y"]], [S, 26], [-I, 4]],
    five: { backs: 2, spots: [[-W, 4, ["X"]]] },
  },
  {
    name: "Pro Set",
    note: "Split backs under center — play-action and both-way runs.",
    qb: UNDER,
    backs: [[-62, 120], [62, 120]],
    spots: [[-W, 4, ["X"]], [W, 26, ["Z"]], [-S, 26, ["H", "Y"]], [S, 26], [-I, 4]],
    five: { backs: 2, spots: [[W, 26, ["Z"]]] },
  },
  {
    name: "Single Back",
    note: "One back behind an under-center quarterback.",
    qb: UNDER,
    backs: [[0, 130], [-62, 120]],
    spots: [[-W, 4, ["X"]], [W, 26, ["Z"]], [-S, 26, ["H", "Y"]], [S, 26, ["Y", "H"]], [-I, 4]],
    five: { backs: 1 },
  },
  {
    name: "Pistol",
    note: "Short shotgun with the back directly behind the quarterback.",
    qb: [0, 62],
    backs: [[0, 130], [-62, 120]],
    spots: [[-W, 4, ["X"]], [W, 4, ["Z"]], [-S, 26, ["H", "Y"]], [S, 26, ["Y", "H"]], [-I, 4]],
    five: { backs: 1 },
  },
  {
    name: "Shotgun Spread",
    note: "Receivers split wide on both edges to stretch the flats.",
    qb: GUN,
    backs: [[56, 72], [-56, 72]],
    spots: [[-W, 4, ["X"]], [W, 4, ["Z"]], [-S + 40, 26, ["H", "Y"]], [S - 40, 26, ["Y", "H"]], [I - 60, 26]],
    five: { backs: 1 },
  },
  {
    name: "Goal Line",
    note: "Everyone tight — short-yardage power.",
    qb: UNDER,
    backs: [[0, 130], [0, 90], [-56, 100]],
    spots: [[-230, 4, ["X"]], [230, 26, ["Z"]], [-190, 30], [190, 30]],
    te: [[150, 4], [-150, 4], [196, 40], [-196, 40]],
    five: { backs: 1, spots: [[-200, 4, ["X"]], [200, 4, ["Z"]]] },
  },
];

/** Flips a formation left-for-right; X and Z trade letters so X stays on the left. */
function mirror(f: Formation, name: string, note: string): Formation {
  const swap = (codes?: string[]) => codes?.map((c) => (c === "X" ? "Z" : c === "Z" ? "X" : c));
  const flip = (spots: Spot[]) => spots.map(([x, y, c]): Spot => [-x, y, swap(c)]);
  return {
    ...f,
    name,
    note,
    backs: flip(f.backs),
    spots: flip(f.spots),
    te: flip(f.te ?? TE_RIGHT),
    five: { ...f.five, spots: f.five.spots && flip(f.five.spots) },
  };
}

export const LIBRARY: Formation[] = [
  BASE[0],
  mirror(BASE[0], "Trips Left", "Three receivers to the left — floods a third of the field fast."),
  ...BASE.slice(1),
];

export const FORMATION_NAMES = LIBRARY.map((f) => f.name);

/** One player in a built formation. */
export type Placed = { dx: number; dy: number; code: string; label?: string; role: "line" | "qb" | "rb" | "te" | "wr" };

// T belongs to the tackles, so a spare tight end is U, V or E.
const NEUTRAL = { rb: ["F", "B"], te: ["U", "V", "E"], wr: ["W", "A", "B"] };

/** 11-man line: 50 apart, so 36-wide tokens keep a clear gap. */
const LINE_SPOTS: [number, string][] = [
  [-100, "T"],
  [-50, "G"],
  [50, "G"],
  [100, "T"],
];
const LINE_NAMES: Record<number, string> = { [-100]: "Left tackle", [-50]: "Left guard", 50: "Right guard", 100: "Right tackle" };

/** A lineman on the field: today's labelled T/G circles, or the unlabelled squares older plays saved. */
export const isLineman = (p: { shape: string; label: string; name: string }) =>
  (p.shape === "square" && !p.label) || /\b(tackle|guard|lineman)\b/i.test(p.name);

/**
 * Lays out a formation as offsets from the ball. `code` is a position token
 * code ("X", "RB"…); extra players past the core letters get a neutral token
 * with their own `label`, as on the canvas.
 */
export function layoutFormation(game: GameType, personnelCode: string, name: string): Placed[] {
  const f = LIBRARY.find((x) => x.name === name) ?? LIBRARY[0];
  const p = PERSONNEL.find((x) => x.code === personnelCode) ?? PERSONNEL[0];
  const counts =
    game === "11" ? p : game === "7v7" ? { rb: 0, te: 0, wr: 5 } : { rb: f.five.backs, te: 0, wr: 3 - f.five.backs };
  const receiverSpots = game === "5v5" && f.five.spots ? f.five.spots : f.spots;

  const out: Placed[] = [{ dx: 0, dy: 0, code: "C", role: "line" }];
  // Left to right: tackle, guard, center, guard, tackle, with a gap between each so they read as five men.
  if (game === "11")
    for (const [dx, label] of LINE_SPOTS) out.push({ dx, dy: 0, code: "OL", label, role: "line" });
  out.push({ dx: f.qb[0], dy: f.qb[1], code: "QB", role: "qb" });

  const used = new Set<string>();
  const neutral = { ...NEUTRAL };
  const claim = (prefs: string[], role: "rb" | "te" | "wr") => {
    const code = prefs.find((c) => !used.has(c));
    if (code) {
      used.add(code);
      return { code };
    }
    const [label, ...rest] = neutral[role];
    neutral[role] = rest;
    return { code: "EXTRA", label: label ?? "" };
  };

  // Receivers fill in order; backs without a backfield spot split out with them.
  const wrQueue = [...receiverSpots];
  const nextWr = (): Spot => wrQueue.shift() ?? [0, 200];
  const splitOut = (): Spot => wrQueue.pop() ?? [0, 200];

  for (let i = 0; i < counts.rb; i++) {
    const spot = f.backs[i] ?? splitOut();
    out.push({ dx: spot[0], dy: spot[1], ...claim(["RB", "H"], "rb"), role: "rb" });
  }
  const teSpots = [...(f.te ?? TE_RIGHT)];
  for (let i = 0; i < counts.te; i++) {
    const spot = teSpots.shift() ?? nextWr();
    out.push({ dx: spot[0], dy: spot[1], ...claim(["Y", "H"], "te"), role: "te" });
  }
  for (let i = 0; i < counts.wr; i++) {
    const spot = nextWr();
    out.push({ dx: spot[0], dy: spot[1], ...claim(spot[2] ?? [], "wr"), role: "wr" });
  }
  return out;
}

/** Token for each placed player: the coach's position colors, or the canvas's plain line and extra tokens. */
export function tokenFor(p: Placed, tokens: TokenPreset[]): TokenPreset {
  if (p.code === "OL")
    return {
      code: "OL",
      label: p.label ?? "",
      title: LINE_NAMES[p.dx] ?? "Lineman",
      hint: "",
      shape: "circle",
      fill: "#FFFFFF",
      stroke: "#0B1524",
      textColor: "#0B1524",
      side: "offense",
    };
  if (p.code === "EXTRA")
    return {
      code: "EXTRA",
      label: p.label ?? "",
      title: p.role === "te" ? "Tight end" : p.role === "rb" ? "Back" : "Receiver",
      hint: "",
      shape: "circle",
      fill: "#FFFFFF",
      stroke: "#0B1524",
      textColor: "#0B1524",
      side: "offense",
    };
  return tokens.find((t) => t.code === p.code)!;
}

/** Where this formation puts its tailback, for a back the call adds. */
export function backSpot(name: string): { dx: number; dy: number } {
  const f = LIBRARY.find((x) => x.name === name) ?? LIBRARY[0];
  const [dx, dy] = f.backs[0] ?? [f.qb[0] + 56, f.qb[1]];
  return { dx, dy };
}

/** Where the full formation lines up a token code (X wide left in Trips Right), for a player the call adds. */
export function letterSpot(name: string, code: string): { dx: number; dy: number } | null {
  const f = LIBRARY.find((x) => x.name === name) ?? LIBRARY[0];
  const spot = f.spots.find((s) => s[2]?.[0] === code);
  return spot ? { dx: spot[0], dy: spot[1] } : null;
}

export function describeFormation(game: GameType, personnelCode: string, name: string): string {
  const g = GAME_TYPES.find((x) => x.id === game)!.label;
  if (game !== "11") return `${g} ${name}`;
  return `${g} ${name}, ${personnelCode} personnel, with five linemen`;
}
