/**
 * The 56 starter plays, redrawn as GridIronVault scene data.
 *
 * The originals were flat card images. These are real scenes: every token and
 * every line is editable, the ink weights match the GridIronVault brand, and the
 * same diagram drives the editor, the Vault thumbnail and the printed card.
 */
import { baseNode, uid, CANVAS_W, DEFAULT_STROKE } from "./types";
import type { PathNode, PlayMeta, PlayerNode, Point, Scene, SceneNode } from "./types";
import { DEFENSE_TOKENS, OFFENSE_TOKENS, makePlayer, type TokenPreset } from "./presets";

const LOS = 430;
const CX = CANVAS_W / 2;

const INK = "#0B1524";
const RUN = "#D24B3E";
const BALL = "#F2A63B";
const COVER = "#2E7DBE";
const ZONE = "#16C8E8";

/* ------------------------------------------------------------------ routes */

import { ROUTES, type Seg } from "./routes";

/* -------------------------------------------------------- formation layouts */

type Slot = [key: string, code: string, dx: number, dy: number];

const SLOTS: Record<string, Slot[]> = {
  "Route Tree": [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["Z", "Z", 250, 2]],
  "Single Back": [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["X", "X", -300, 4], ["Z", "Z", 300, 4], ["RB", "RB", -62, 76]],
  Spread: [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["X", "X", -332, 4], ["Y", "Y", -152, 10], ["Z", "Z", 332, 4], ["RB", "RB", 152, 10]],
  Bunch: [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["X", "X", 188, 6], ["Y", "Y", 244, 46], ["Z", "Z", 300, 6], ["RB", "RB", -184, 10]],
  Trips: [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["X", "X", -320, 4], ["Y", "Y", 198, 8], ["Z", "Z", 302, 4], ["RB", "RB", 116, 12]],
  "Trips Stack": [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["X", "X", -320, 4], ["Y", "Y", 244, 4], ["Z", "Z", 244, 46], ["RB", "RB", 244, 88]],
  Twins: [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["X", "X", 198, 4], ["Z", "Z", 312, 4], ["RB", "RB", -200, 8]],
  "Twins Stack": [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["X", "X", 250, 4], ["Z", "Z", 250, 48], ["RB", "RB", -200, 8]],
  "I Formation": [["C", "C", 0, 0], ["QB", "QB", 0, 56], ["X", "X", -300, 4], ["Z", "Z", 300, 4], ["RB", "RB", 0, 124]],
  "Double Back": [["C", "C", 0, 0], ["QB", "QB", 0, 58], ["X", "X", -306, 4], ["Z", "Z", 306, 4], ["RB", "RB", -84, 112], ["H", "H", 84, 112]],
  "Single Set": [["C", "C", 0, 0], ["QB", "QB", 0, 58], ["Y", "Y", -168, 8], ["Z", "Z", 286, 4], ["RB", "RB", 74, 104]],
  Empty: [["C", "C", 0, 0], ["QB", "QB", 0, 60], ["X", "X", -332, 4], ["Y", "Y", -168, 8], ["Z", "Z", 332, 4], ["H", "H", 168, 8]],
  Defense: [
    ["R", "R", 0, -96],
    ["CB1", "CB", -276, -176],
    ["CB2", "CB", 276, -176],
    ["LB", "LB", -104, -128],
    ["FS", "FS", 6, -226],
  ],
};

/** Defensive shells layered over an offensive look. */
const SHELLS: Record<string, Slot[]> = {
  man: [["R", "R", 0, -92], ["CB1", "CB", -300, -58], ["CB2", "CB", 300, -58], ["LB", "LB", -120, -104], ["FS", "FS", 120, -104]],
  cover1: [["R", "R", 0, -92], ["CB1", "CB", -288, -66], ["CB2", "CB", 288, -66], ["LB", "LB", -96, -112], ["FS", "FS", 4, -254]],
  cover2: [["R", "R", 0, -92], ["CB1", "CB", -290, -60], ["CB2", "CB", 290, -60], ["SS", "SS", -170, -232], ["FS", "FS", 170, -232]],
  cover3: [["R", "R", 0, -92], ["CB1", "CB", -300, -196], ["CB2", "CB", 300, -196], ["LB", "LB", -110, -114], ["FS", "FS", 4, -244]],
  cover4: [["CB1", "CB", -304, -200], ["CB2", "CB", 304, -200], ["SS", "SS", -110, -216], ["FS", "FS", 110, -216], ["LB", "LB", 0, -114]],
};

const preset = (code: string): TokenPreset =>
  [...OFFENSE_TOKENS, ...DEFENSE_TOKENS].find((t) => t.code === code)!;

/* ------------------------------------------------------------ scene builder */

type Assign = {
  /** Slot key from SLOTS / SHELLS. */
  on: string;
  route: keyof typeof ROUTES | "handoff" | "man" | "zone" | "motion";
  to?: string;
  color?: string;
  label?: string;
  /** Force the break direction instead of letting it follow the token's side. */
  flip?: boolean;
  dashed?: boolean;
  /** The quarterback's first read, drawn in cyan. */
  read?: boolean;
};

export type StarterSpec = PlayMeta & {
  n: number;
  shell?: keyof typeof SHELLS;
  slots?: string;
  assigns: Assign[];
};

function tokenScene(spec: StarterSpec) {
  const nodes: SceneNode[] = [];
  const byKey = new Map<string, PlayerNode>();
  const offenseGroup = uid("grp");
  const defenseGroup = uid("grp");

  const drop = (slots: Slot[], group: string, base: number) =>
    slots.forEach(([key, code, dx, dy], i) => {
      const node = { ...makePlayer(preset(code), CX + dx, LOS + dy), groupId: group, z: base + i };
      byKey.set(key, node);
      nodes.push(node);
    });

  const layout = SLOTS[spec.slots ?? spec.formation] ?? SLOTS["Single Back"];
  drop(layout, offenseGroup, 200);
  if (spec.shell) drop(SHELLS[spec.shell], defenseGroup, 180);

  let z = 100;
  for (const a of spec.assigns) {
    const from = byKey.get(a.on);
    if (!from) continue;

    if (a.route === "handoff" || a.route === "man") {
      const target = a.to ? byKey.get(a.to) : null;
      if (!target) continue;
      nodes.push(
        link(from, target, a.route === "handoff" ? BALL : a.color ?? COVER, z++, a.route === "man"),
      );
      continue;
    }

    if (a.route === "zone") {
      nodes.push(zoneBlob({ x: from.x, y: from.y - 74 }, a.color ?? ZONE, z++, a.label));
      continue;
    }

    if (a.route === "motion") {
      nodes.push(
        path(
          from,
          [[0, 26], [from.x > CX ? -180 : 180, 8]],
          a.color ?? INK,
          z++,
          { style: "motion", endCap: "arrow" },
        ),
      );
      continue;
    }

    const segs = ROUTES[a.route] ?? ROUTES.go;
    const mirror = a.flip ?? from.x < CX;
    const isBlock = a.route === "block";
    nodes.push(
      path(from, mirror ? segs.map(([dx, dy]) => [-dx, dy] as Seg) : segs, a.color ?? INK, z++, {
        endCap: isBlock ? "tee" : "arrow",
        style: a.dashed ? "dashed" : "solid",
        curve: a.route === "wheel" || a.route === "sweep" || a.route === "counter" ? "spline" : "straight",
        firstRead: a.read ?? false,
      }),
    );
  }

  return nodes;
}

function path(
  from: Point,
  segs: Seg[],
  color: string,
  z: number,
  opts: Partial<PathNode> = {},
): PathNode {
  const points: Point[] = [{ x: 0, y: 0 }];
  let cx = 0;
  let cy = 0;
  for (const [dx, dy] of segs) {
    cx += dx;
    cy += dy;
    // Routes stop at the sideline rather than running off the field.
    points.push({ x: Math.min(CANVAS_W - 16 - from.x, Math.max(16 - from.x, cx)), y: cy });
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
    stroke: color,
    width: DEFAULT_STROKE,
    closed: false,
    fill: "none",
    fillOpacity: 0.16,
    fromId: null,
    toId: null,
    ...opts,
  };
}

function link(from: PlayerNode, to: PlayerNode, color: string, z: number, dashed: boolean): PathNode {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const padA = from.size / 2 + 4;
  const padB = to.size / 2 + 7;
  return {
    ...path({ x: from.x + ux * padA, y: from.y + uy * padA }, [[(len - padA - padB) * ux, (len - padA - padB) * uy]], color, z, {
      style: dashed ? "dashed" : "dashed",
      endCap: "arrow",
      name: dashed ? "Coverage" : "Handoff",
    }),
    fromId: from.id,
    toId: to.id,
  };
}

function zoneBlob(centre: Point, color: string, z: number, label?: string): PathNode {
  const w = 108;
  const h = 62;
  return {
    ...baseNode({ x: centre.x, y: centre.y, z, name: label ? `${label} zone` : "Coverage zone" }),
    kind: "path",
    points: [
      { x: -w, y: 0 },
      { x: -w * 0.6, y: -h },
      { x: w * 0.6, y: -h },
      { x: w, y: 0 },
      { x: w * 0.6, y: h },
      { x: -w * 0.6, y: h },
    ],
    handles: {},
    style: "dashed",
    curve: "spline",
    startCap: "none",
    endCap: "none",
    stroke: color,
    width: 2.6,
    closed: true,
    fill: color,
    fillOpacity: 0.14,
    fromId: null,
    toId: null,
  };
}

/** Numbered route tree — the teaching diagram, not a play. */
function routeTree(range: "0-5" | "6-9"): SceneNode[] {
  const nodes: SceneNode[] = [];
  // Receiver on the right, as the canvas route tree draws it: outs break to the sideline, ins to the middle.
  const origin = { x: CX + 210, y: LOS };
  nodes.push({ ...makePlayer(preset("Z"), origin.x, origin.y), z: 300 });
  const tree: [string, keyof typeof ROUTES][] =
    range === "0-5"
      ? [["0 · Hitch", "hitch"], ["1 · Flat", "flat"], ["2 · Slant", "slant"], ["3 · Comeback", "comeback"], ["4 · Curl", "curl"], ["5 · Out", "out"]]
      : [["6 · Dig", "dig"], ["7 · Corner", "corner"], ["8 · Post", "post"], ["9 · Go", "go"], ["Wheel", "wheel"], ["Cross", "cross"]];

  const shades = [INK, "#2E7DBE", "#2E9E6B", "#7A6BD2", "#F2A63B", "#D24B3E"];
  const placed: { x: number; y: number; half: number }[] = [];
  tree.forEach(([label, route], i) => {
    const line = path(origin, ROUTES[route], shades[i % shades.length], 100 + i, { endCap: "arrow" });
    nodes.push(line);
    const tip = line.points[line.points.length - 1];
    // Label beyond the arrowhead, on the side the route breaks, so it never sits on its own line.
    const side = tip.x < -8 ? -1 : 1;
    const half = (label.length * 17 * 0.56) / 2 + 12;
    const x = origin.x + tip.x + side * half;
    // Short routes end close together: move a label up until it clears the ones already placed.
    let y = origin.y + tip.y;
    while (placed.some((b) => Math.abs(b.x - x) < b.half + half && Math.abs(b.y - y) < 28)) y -= 30;
    placed.push({ x, y, half });
    nodes.push({
      ...baseNode({ x, y, z: 400 + i, name: label }),
      kind: "text",
      text: label,
      fontSize: 17,
      color: shades[i % shades.length],
      weight: 700,
      align: "middle",
      boxed: true,
    });
  });
  return nodes;
}

export function starterScene(spec: StarterSpec): Scene {
  const nodes =
    spec.formation === "Route Tree" ? routeTree(spec.name.includes("6") ? "6-9" : "0-5") : tokenScene(spec);
  return {
    version: 2,
    view: spec.playType === "defense" ? "half" : "half",
    width: 1040,
    height: 660,
    losY: LOS,
    pivot: null,
    nodes,
  };
}

/* ------------------------------------------------------------- the 56 plays */

const P = (
  n: number,
  name: string,
  formation: string,
  playType: PlayMeta["playType"],
  description: string,
  tags: string[],
  assigns: Assign[],
  extra: Partial<StarterSpec> = {},
): StarterSpec => ({
  n,
  name,
  formation,
  playType,
  personnel: playType === "defense" ? "5-on-5 defense" : "5-on-5 offense",
  description,
  tags,
  isPublic: true,
  assigns,
  ...extra,
});

export const STARTERS: StarterSpec[] = [
  P(1, "Route Tree 0–5", "Route Tree", "special", "The short half of the tree. Teach the numbers first — every call after this is shorthand.", ["teaching", "routes"], []),
  P(2, "Route Tree 6–9", "Route Tree", "special", "The deep half of the tree plus the two hardest releases. Walk it before you run it.", ["teaching", "routes"], []),

  P(3, "Single Back — Base", "Single Back", "pass", "The starting point. Everybody runs a clean stem so you can see spacing before you add motion.", ["base", "install"], [
    { on: "X", route: "go" }, { on: "Z", route: "out" }, { on: "RB", route: "flat" },
  ]),
  P(4, "Single Back — Smash", "Single Back", "pass", "Hitch under, corner over the top. High-low on the cornerback all day.", ["base", "smash"], [
    { on: "Z", route: "corner" }, { on: "X", route: "hitch" }, { on: "RB", route: "swing" },
  ]),
  P(5, "Single Back — Dagger", "Single Back", "pass", "Clear it out with the go, then drop the dig in behind the linebacker.", ["base", "dagger"], [
    { on: "X", route: "go" }, { on: "Z", route: "dig" }, { on: "RB", route: "drag" },
  ]),
  P(6, "Single Back — Swing Screen", "Single Back", "pass", "Quick out to the back with both receivers stalking. Easy completion when they rush hard.", ["base", "screen"], [
    { on: "RB", route: "swing" }, { on: "X", route: "block" }, { on: "Z", route: "block" },
  ]),

  P(7, "Spread — Base", "Spread", "pass", "Four across the field. Find the widest defender and throw away from him.", ["spread", "install"], [
    { on: "X", route: "go" }, { on: "Y", route: "slant" }, { on: "Z", route: "go" }, { on: "RB", route: "slant" },
  ]),
  P(8, "Spread — Flood Right", "Spread", "pass", "Three levels to the right side: flat, out, corner. Read it high to low.", ["spread", "flood"], [
    { on: "Z", route: "corner", read: true }, { on: "RB", route: "out" }, { on: "Y", route: "flat", flip: true }, { on: "X", route: "post" },
  ]),
  P(9, "Spread — Double Slants", "Spread", "pass", "Both sides slant inside. Snap, one step, throw — this is your two-minute answer.", ["spread", "quick"], [
    { on: "X", route: "slant" }, { on: "Y", route: "slant" }, { on: "Z", route: "slant" }, { on: "RB", route: "slant" },
  ]),
  P(10, "Spread — Mesh", "Spread", "pass", "Two drags crossing at four yards. Somebody comes free every single time.", ["spread", "mesh"], [
    { on: "Y", route: "drag" }, { on: "RB", route: "drag" }, { on: "X", route: "go" }, { on: "Z", route: "corner" },
  ]),

  P(11, "Bunch — Base", "Bunch", "pass", "Three tight to the right. The stack alone beats man coverage before anyone moves.", ["bunch", "install"], [
    { on: "X", route: "slant" }, { on: "Y", route: "flat" }, { on: "Z", route: "go" }, { on: "RB", route: "drag" },
  ]),
  P(12, "Bunch — Triangle", "Bunch", "pass", "Flat, corner and seam out of the same cluster. Pick the level the defense leaves open.", ["bunch", "triangle"], [
    { on: "Y", route: "flat" }, { on: "Z", route: "corner" }, { on: "X", route: "seam" }, { on: "RB", route: "swing" },
  ]),
  P(13, "Bunch — Rub", "Bunch", "pass", "The inside man sets the rub, the outside man releases clean underneath him.", ["bunch", "rub"], [
    { on: "X", route: "slant" }, { on: "Y", route: "pivot" }, { on: "Z", route: "out" }, { on: "RB", route: "flat", flip: true },
  ]),
  P(14, "Bunch — Return", "Bunch", "pass", "Everybody breaks out, one comes back. Great on a defense that chases hard.", ["bunch", "return"], [
    { on: "Z", route: "comeback" }, { on: "Y", route: "out" }, { on: "X", route: "post" }, { on: "RB", route: "screen" },
  ]),

  P(15, "Trips — Base", "Trips", "pass", "Three to the right, one isolated left. Count the defenders and take the free side.", ["trips", "install"], [
    { on: "Y", route: "hitch" }, { on: "Z", route: "go" }, { on: "RB", route: "flat" }, { on: "X", route: "slant" },
  ]),
  P(16, "Trips — Flood", "Trips", "pass", "Classic three-level flood to the trips side. First read is the flat.", ["trips", "flood"], [
    { on: "Z", route: "corner" }, { on: "Y", route: "out" }, { on: "RB", route: "flat", read: true }, { on: "X", route: "dig" },
  ]),
  P(17, "Trips — Y Cross", "Trips", "pass", "Send the inside man all the way across. He clears the middle at twelve yards.", ["trips", "cross"], [
    { on: "Y", route: "cross" }, { on: "Z", route: "go" }, { on: "RB", route: "hitch" }, { on: "X", route: "comeback" },
  ]),
  P(18, "Trips — Bubble", "Trips", "pass", "Snap and pitch it wide. Two blockers in front of the ball on the edge.", ["trips", "bubble"], [
    { on: "RB", route: "swing" }, { on: "Y", route: "block" }, { on: "Z", route: "block" }, { on: "X", route: "go" },
  ]),

  P(19, "Trips Stack — Base", "Trips Stack", "pass", "Stacked releases. Nobody can press what they cannot reach.", ["stack", "install"], [
    { on: "Y", route: "go" }, { on: "Z", route: "out" }, { on: "RB", route: "flat" }, { on: "X", route: "slant" },
  ]),
  P(20, "Trips Stack — Levels", "Trips Stack", "pass", "Three depths on the same track: five, ten, fifteen. Throw to the open window.", ["stack", "levels"], [
    { on: "RB", route: "hitch" }, { on: "Z", route: "out" }, { on: "Y", route: "corner" }, { on: "X", route: "post" },
  ]),
  P(21, "Trips Stack — Wheel", "Trips Stack", "pass", "Inside man takes the wheel up the sideline behind the two outs.", ["stack", "wheel"], [
    { on: "RB", route: "wheel" }, { on: "Z", route: "in" }, { on: "Y", route: "slant" }, { on: "X", route: "go" },
  ]),
  P(22, "Trips Stack — Dagger", "Trips Stack", "pass", "Clear the safety, then fill the space he left with the dig.", ["stack", "dagger"], [
    { on: "Y", route: "go" }, { on: "Z", route: "dig" }, { on: "RB", route: "drag" }, { on: "X", route: "comeback" },
  ]),

  P(23, "Twins — Base", "Twins", "pass", "Two right, one back left. The simplest read in the book.", ["twins", "install"], [
    { on: "X", route: "slant" }, { on: "Z", route: "go" }, { on: "RB", route: "flat", flip: true },
  ]),
  P(24, "Twins — Slant Flat", "Twins", "pass", "Slant and flat off the same side. If the linebacker jumps the slant, hit the flat.", ["twins", "quick"], [
    { on: "X", route: "slant", read: true }, { on: "Z", route: "flat" }, { on: "RB", route: "drag" },
  ]),
  P(25, "Twins — Post Wheel", "Twins", "pass", "Inside man to the post, back on the wheel underneath him. Two deep answers.", ["twins", "wheel"], [
    { on: "X", route: "post" }, { on: "Z", route: "wheel" }, { on: "RB", route: "hitch", flip: true },
  ]),
  P(26, "Twins — Curl Flat", "Twins", "pass", "Curl at ten, flat at three. The standard beater against soft zone.", ["twins", "zone"], [
    { on: "X", route: "stop" }, { on: "Z", route: "flat" }, { on: "RB", route: "swing", flip: true },
  ]),

  P(27, "Twins Stack — Base", "Twins Stack", "pass", "Stack the twins so the outside man never gets touched off the line.", ["stack", "install"], [
    { on: "X", route: "out" }, { on: "Z", route: "go" }, { on: "RB", route: "slant" },
  ]),
  P(28, "Twins Stack — Pick", "Twins Stack", "pass", "Front man sits, back man releases across his face. Legal rub, open man.", ["stack", "rub"], [
    { on: "Z", route: "hitch" }, { on: "X", route: "drag" }, { on: "RB", route: "flat", flip: true },
  ]),
  P(29, "Twins Stack — Double Go", "Twins Stack", "pass", "Both stacked receivers straight up the field. Take the one the safety leaves.", ["stack", "deep"], [
    { on: "X", route: "go" }, { on: "Z", route: "fade" }, { on: "RB", route: "screen", flip: true },
  ]),
  P(30, "Twins Stack — Scissors", "Twins Stack", "pass", "Corner and post crossing at fifteen. Hardest thing in the book to cover deep.", ["stack", "deep"], [
    { on: "X", route: "corner" }, { on: "Z", route: "post" }, { on: "RB", route: "drag" },
  ]),

  P(31, "I Formation — Base", "I Formation", "run", "Both backs behind the quarterback. Downhill, no thinking.", ["i-form", "install"], [
    { on: "RB", route: "dive", color: RUN }, { on: "X", route: "block" }, { on: "Z", route: "block" },
  ]),
  P(32, "I Formation — Power Right", "I Formation", "run", "Give it and follow the receiver's stalk block to the edge.", ["i-form", "power"], [
    { on: "RB", route: "sweep", color: RUN }, { on: "Z", route: "block" }, { on: "X", route: "post" },
  ]),
  P(33, "I Formation — Play Action", "I Formation", "pass", "Show the dive, pull it, and throw the post behind the crashing safety.", ["i-form", "play-action"], [
    { on: "RB", route: "dive", color: RUN, dashed: true }, { on: "X", route: "post" }, { on: "Z", route: "out" },
  ]),
  P(34, "I Formation — Counter", "I Formation", "run", "Step one way, run the other. The back has to sell the first step.", ["i-form", "counter"], [
    { on: "RB", route: "counter", color: RUN }, { on: "X", route: "block" }, { on: "Z", route: "slant" },
  ]),

  P(35, "Double Back — Base", "Double Back", "run", "Two backs, two directions, one read. Teaches ball handling fast.", ["double-back", "install"], [
    { on: "RB", route: "dive", color: RUN }, { on: "H", route: "sweep", color: RUN }, { on: "X", route: "block" },
  ]),
  P(36, "Double Back — Crossbuck", "Double Back", "run", "Backs cross behind the quarterback. Nobody on defense knows who has it.", ["double-back", "misdirection"], [
    { on: "RB", route: "sweep", color: RUN }, { on: "H", route: "counter", color: RUN }, { on: "Z", route: "block" },
  ]),
  P(37, "Double Back — Split Flow", "Double Back", "pass", "Backs release opposite ways and both receivers run verticals.", ["double-back", "spacing"], [
    { on: "RB", route: "flat" }, { on: "H", route: "flat", flip: true }, { on: "X", route: "go" }, { on: "Z", route: "go" },
  ]),
  P(38, "Double Back — Toss Sweep", "Double Back", "run", "Pitch it wide immediately and let the second back lead the way.", ["double-back", "sweep"], [
    { on: "H", route: "sweep", color: RUN }, { on: "RB", route: "block" }, { on: "Z", route: "block" },
  ]),

  P(39, "Single Set — Base", "Single Set", "pass", "One back offset, two receivers. Quiet formation, lots of answers.", ["single-set", "install"], [
    { on: "Y", route: "slant" }, { on: "Z", route: "go" }, { on: "RB", route: "flat" },
  ]),
  P(40, "Single Set — Choice", "Single Set", "pass", "Outside man reads the corner and takes whatever he gives up.", ["single-set", "option"], [
    { on: "Z", route: "option" }, { on: "Y", route: "drag" }, { on: "RB", route: "swing" },
  ]),
  P(41, "Single Set — Drive", "Single Set", "pass", "Shallow drag under a dig. Two men working the same middle window.", ["single-set", "drive"], [
    { on: "Y", route: "drag" }, { on: "Z", route: "dig" }, { on: "RB", route: "hitch" },
  ]),
  P(42, "Single Set — Fade Out", "Single Set", "pass", "Back-shoulder fade with the out underneath. Red-zone staple.", ["single-set", "red-zone"], [
    { on: "Z", route: "fade" }, { on: "Y", route: "out" }, { on: "RB", route: "flat" },
  ]),

  P(43, "HB Dive", "Single Back", "run", "Hand it off, hit the first open lane. If it is stuffed, you learned the defense is inside-heavy.", ["run", "install"], [
    { on: "QB", route: "handoff", to: "RB" }, { on: "RB", route: "dive", color: RUN }, { on: "X", route: "block" }, { on: "Z", route: "block" },
  ]),
  P(44, "Crossbuck", "Double Back", "run", "Both backs cross. Give it to the second one and let the first one draw the flow.", ["run", "misdirection"], [
    { on: "QB", route: "handoff", to: "H" }, { on: "RB", route: "counter", color: RUN, dashed: true }, { on: "H", route: "sweep", color: RUN },
  ]),
  P(45, "End Around", "Spread", "run", "Motion the receiver behind the quarterback and hand it to him going full speed.", ["run", "motion"], [
    { on: "Y", route: "motion" }, { on: "QB", route: "handoff", to: "Y" }, { on: "RB", route: "block" }, { on: "Z", route: "block" },
  ]),
  P(46, "Reverse", "Spread", "run", "Start it one way, hand it back the other. Needs a hard-selling first runner.", ["run", "reverse"], [
    { on: "QB", route: "handoff", to: "RB" }, { on: "RB", route: "sweep", color: RUN, dashed: true }, { on: "Y", route: "reverse", color: RUN },
  ]),
  P(47, "Double Reverse", "Spread", "run", "Two handoffs going opposite directions. High risk, and it breaks huge when it hits.", ["run", "reverse", "trick"], [
    { on: "QB", route: "handoff", to: "RB" }, { on: "RB", route: "sweep", color: RUN, dashed: true }, { on: "Y", route: "reverse", color: RUN }, { on: "X", route: "end_around", color: RUN },
  ]),
  P(48, "Fake Double Reverse", "Spread", "run", "Sell both handoffs, keep it, and take the edge the defense just vacated.", ["run", "trick"], [
    { on: "RB", route: "sweep", color: RUN, dashed: true }, { on: "Y", route: "reverse", color: RUN, dashed: true }, { on: "QB", route: "keep", color: RUN },
  ]),
  P(49, "Fake Triple Reverse", "Trips", "run", "Three fakes and a keeper. Only run it once a season, and only when you are ahead.", ["run", "trick"], [
    { on: "RB", route: "sweep", color: RUN, dashed: true }, { on: "Y", route: "reverse", color: RUN, dashed: true }, { on: "Z", route: "end_around", color: RUN, dashed: true }, { on: "QB", route: "keep", color: RUN },
  ]),
  P(50, "HB Option", "Single Back", "pass", "Back takes the pitch and reads the corner: run it or throw it back inside.", ["run", "option"], [
    { on: "QB", route: "handoff", to: "RB" }, { on: "RB", route: "sweep", color: RUN }, { on: "Z", route: "out" }, { on: "X", route: "go" },
  ]),
  P(51, "QB Option", "Empty", "run", "Quarterback keeps it and reads the edge defender. Nothing to hand off, nothing to fumble.", ["run", "option"], [
    { on: "QB", route: "keep", color: RUN }, { on: "H", route: "block" }, { on: "Y", route: "block" }, { on: "Z", route: "go" },
  ]),

  P(52, "Man Free", "Defense", "defense", "Everyone locks on a receiver, one rusher, safety plays centre field.", ["defense", "man"], [
    { on: "CB1", route: "man", to: "X", color: COVER },
    { on: "CB2", route: "man", to: "Z", color: COVER },
    { on: "LB", route: "man", to: "RB", color: COVER },
    { on: "R", route: "rush", color: RUN },
  ], { shell: "man", slots: "Spread" }),
  P(53, "Cover 1", "Defense", "defense", "Man underneath with a single high safety. The rusher must get home.", ["defense", "cover-1"], [
    { on: "CB1", route: "man", to: "X", color: COVER },
    { on: "CB2", route: "man", to: "Z", color: COVER },
    { on: "LB", route: "man", to: "Y", color: COVER },
    { on: "FS", route: "drop", color: ZONE },
    { on: "R", route: "rush", color: RUN },
  ], { shell: "cover1", slots: "Spread" }),
  P(54, "Cover 2", "Defense", "defense", "Two deep halves, corners sit in the flats. Take away the sideline, give up the middle.", ["defense", "cover-2"], [
    { on: "SS", route: "zone", color: ZONE, label: "Deep half" },
    { on: "FS", route: "zone", color: ZONE, label: "Deep half" },
    { on: "CB1", route: "zone", color: COVER, label: "Flat" },
    { on: "CB2", route: "zone", color: COVER, label: "Flat" },
    { on: "R", route: "rush", color: RUN },
  ], { shell: "cover2", slots: "Spread" }),
  P(55, "Cover 3", "Defense", "defense", "Three deep thirds, two underneath. The safest call you own.", ["defense", "cover-3"], [
    { on: "CB1", route: "zone", color: ZONE, label: "Deep third" },
    { on: "CB2", route: "zone", color: ZONE, label: "Deep third" },
    { on: "FS", route: "zone", color: ZONE, label: "Deep middle" },
    { on: "LB", route: "zone", color: COVER, label: "Hook" },
    { on: "R", route: "rush", color: RUN },
  ], { shell: "cover3", slots: "Spread" }),
  P(56, "Cover 4", "Defense", "defense", "Four deep quarters, nobody rushes. Nothing goes over your head.", ["defense", "cover-4"], [
    { on: "CB1", route: "zone", color: ZONE, label: "Quarter" },
    { on: "CB2", route: "zone", color: ZONE, label: "Quarter" },
    { on: "SS", route: "zone", color: ZONE, label: "Quarter" },
    { on: "FS", route: "zone", color: ZONE, label: "Quarter" },
    { on: "LB", route: "zone", color: COVER, label: "Hook" },
  ], { shell: "cover4", slots: "Spread" }),
];

/** The handful shown free in the public Vault before anyone signs up. */
export const FREE_SAMPLE_NUMBERS = [3, 9, 16, 43, 53];

export const starterMeta = (spec: StarterSpec): PlayMeta => ({
  name: spec.name,
  formation: spec.formation,
  playType: spec.playType,
  personnel: spec.personnel,
  description: spec.description,
  tags: spec.tags,
  isPublic: true,
});
