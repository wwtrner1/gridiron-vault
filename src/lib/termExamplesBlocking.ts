import { applyScheme } from "./blockSchemes";
import { defenseNodes, layoutDefense, type Coverage, type Front, type LineSet } from "./defense";
import { layoutFormation, tokenFor } from "./formations";
import { OFFENSE_TOKENS, makePlayer } from "./presets";
import { applyPressure, type Gold } from "./pressures";
import { giveBlock } from "./quickBlocks";
import { giveAssignment } from "./quickDefense";
import { routeInk } from "./quickRoutes";
import { makePath, makeText } from "./scene";
import { CANVAS_W, type PlayerNode, type Scene } from "./types";

/**
 * The teaching diagrams for the blocking and defensive-call starter terms
 * (Playbook language: Wes's blocks, schemes and pressures). Each one is drawn
 * by the same code the Designer's one-click blocks, block schemes and
 * pressures use, on a real formation lined up the way New play setup does it,
 * so a term's picture can never drift from what the click draws.
 *
 * Pure, and upright like every glossary scene (offense below the line of
 * scrimmage). `blockingScene(id)` is null for a term that isn't one of these.
 */

const LOS = 430;
const CX = CANVAS_W / 2;
const INK = "#0B1524";
const RUN = "#D24B3E";
const WIDTH = 3;
const Z = 100;

type Pick = (label: string, dx: number, dy: number) => boolean;
type Look = { personnel?: string; formation?: string; offense?: Pick; front?: Front; coverage?: Coverage; defense?: (d: PlayerNode) => boolean; tags?: boolean };

/** The offense lined up as New play setup does it and, when a front is asked for, the Defense library's defense over its line. */
function build(o: Look = {}): Scene {
  const placed = layoutFormation("11", o.personnel ?? "11", o.formation ?? "Doubles").filter((p) => !o.offense || o.offense(tokenFor(p, OFFENSE_TOKENS).label, p.dx, p.dy));
  const offense = placed.map((p, i): PlayerNode => ({ ...makePlayer(tokenFor(p, OFFENSE_TOKENS), CX + p.dx, LOS + p.dy), z: 300 + i }));
  let nodes: Scene["nodes"] = offense;
  if (o.front) {
    const receivers = placed.filter((p) => p.role !== "line" && p.role !== "qb").map((p) => ({ dx: p.dx, dy: p.dy }));
    const line: LineSet = { ol: placed.filter((p) => p.role === "line").map((p) => p.dx), tes: placed.filter((p) => p.role === "te").map((p) => p.dx) };
    const layout = layoutDefense(o.front, o.coverage ?? "Cover 3", receivers, line);
    const defense = defenseNodes(layout, { x: CX, y: LOS }, false, 400, !!o.tags).filter((n) => n.kind !== "player" || !o.defense || o.defense(n));
    nodes = [...offense, ...defense];
  }
  return { version: 2, view: "half", width: CANVAS_W, height: 660, losY: LOS, pivot: null, nodes };
}

const players = (s: Scene, side: PlayerNode["side"]) => s.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side === side);
/** The five linemen, left to right: T G C G T. */
const linemen = (s: Scene) => players(s, "offense").filter((p) => /^(T|G|C)$/.test(p.label)).sort((a, b) => a.x - b.x);
const byLabel = (s: Scene, label: string, side: PlayerNode["side"] = "offense") => players(s, side).find((p) => p.label === label);

/** Gives a player a block, drawn in his color like the click does; the scene as it was if the block doesn't fit. */
function block(s: Scene, who: PlayerNode | undefined, id: string, dir: 1 | -1 = 1): Scene {
  const p = who && s.nodes.find((n): n is PlayerNode => n.kind === "player" && n.id === who.id);
  if (!p) return s;
  return giveBlock(s, p, id, { ink: routeInk(p, INK), width: WIDTH, z: Z + s.nodes.length, dir })?.scene ?? s;
}

/** A whole scheme to the right of the ball. */
const scheme = (s: Scene, id: string): Scene => applyScheme(s, id, { dir: 1, fallbackInk: INK, width: WIDTH, z: Z })?.scene ?? s;

/** The ball carrier's run: a line from where he stands through spots given as (across from the ball, down from the line of scrimmage). */
function carry(s: Scene, from: PlayerNode | undefined, spots: [number, number][]): Scene {
  if (!from) return s;
  const points = [{ x: 0, y: 0 }, ...spots.map(([dx, dy]) => ({ x: CX + dx - from.x, y: LOS + dy - from.y }))];
  const path = { ...makePath("line", { x: from.x, y: from.y }, points, RUN, WIDTH, Z - 1), name: "Run", endCap: "arrow" as const, curve: "spline" as const };
  return { ...s, nodes: [...s.nodes, path] };
}

/** The front seven: down men and backers, no defensive backs. */
const box = (d: PlayerNode) => LOS - d.y <= 110 && Math.abs(d.x - CX) <= 230;

/* ---------------------------------------------------------------- blocking */

/** The line and the quarterback, over a 4-3: what a single block is shown against. */
const lineKit = (): Scene => build({ personnel: "21", formation: "I Formation", offense: (l) => /^(T|G|C|Y|Q)$/.test(l), front: "4-3", defense: box });
/** One back behind the line for the zone runs. */
const zoneKit = (): Scene => build({ personnel: "11", formation: "Pro Set", offense: (l, dx) => !/^(X|Z)$/.test(l) && Math.abs(dx) < 200, front: "4-3", defense: box });
/** [left tackle, left guard, center, right guard, right tackle], the tight end and the backs. */
function crew(s: Scene) {
  const [lt, lg, c, rg, rt] = linemen(s);
  return { lt, lg, c, rg, rt, te: byLabel(s, "Y"), h: byLabel(s, "H"), fb: byLabel(s, "S") };
}

/** Each (player, block, side) in turn on the scene. */
function give(s: Scene, picks: [PlayerNode | undefined, string, (1 | -1)?][]): Scene {
  return picks.reduce((next, [who, id, dir]) => block(next, who, id, dir ?? 1), s);
}

const BLOCKING: Record<string, () => Scene> = {
  "glossary-base-block": () => {
    const s = lineKit();
    const { lt, c, rg, te } = crew(s);
    return give(s, [[lt, "base"], [c, "base"], [rg, "base"], [te, "base"]]);
  },
  "glossary-reach-block": () => {
    const s = lineKit();
    const { c, rg, rt, te } = crew(s);
    return give(s, [[c, "reach"], [rg, "reach"], [rt, "reach"], [te, "reach"]]);
  },
  "glossary-down-block": () => {
    const s = lineKit();
    const { rg, rt, te } = crew(s);
    return give(s, [[rg, "down"], [rt, "down"], [te, "down"]]);
  },
  "glossary-combo-block": () => {
    const s = lineKit();
    const { lg, c } = crew(s);
    return give(s, [[lg, "combo"], [c, "base"]]);
  },
  "glossary-climb": () => {
    const s = lineKit();
    const { lt, lg, c, rg, rt } = crew(s);
    return give(s, [[lt, "base"], [lg, "climb"], [c, "base"], [rg, "base"], [rt, "climb"]]);
  },
  "glossary-pull-and-kick-out": () => {
    const s = lineKit();
    const { lg, c, rg, rt, te } = crew(s);
    return give(s, [[lg, "pull-kick"], [c, "base"], [rg, "down"], [rt, "down"], [te, "down"]]);
  },
  "glossary-pull-and-lead": () => {
    const s = lineKit();
    const { lg, c, rg, rt, te } = crew(s);
    return give(s, [[lg, "pull-lead"], [c, "base"], [rg, "down"], [rt, "down"], [te, "down"]]);
  },
  "glossary-trap": () => {
    const s = lineKit();
    const { lt, lg, c, rg, rt, te } = crew(s);
    // The guard over the 3 technique lets him go: he climbs, and the backside guard pulls across to trap the man he left.
    return give(s, [[lt, "base"], [lg, "trap"], [c, "base"], [rg, "climb"], [rt, "base"], [te, "base"]]);
  },
  "glossary-scoop": () => {
    const s = lineKit();
    const { lg, c, rg, rt } = crew(s);
    return give(s, [[lg, "climb"], [c, "base"], [rg, "climb"], [rt, "scoop"]]);
  },
  "glossary-hinge": () => {
    const s = lineKit();
    const { lt, lg, c, rg, rt, te } = crew(s);
    return give(s, [[lt, "hinge"], [lg, "hinge"], [c, "base"], [rg, "down"], [rt, "down"], [te, "down"]]);
  },
  "glossary-covered-and-uncovered": () => scheme(lineKit(), "covered"),
  "glossary-inside-zone": () => {
    const s = scheme(zoneKit(), "inside-zone");
    return carry(s, crew(s).h, [[-14, 106], [42, 72], [72, 26], [76, -20], [80, -56]]);
  },
  "glossary-outside-zone": () => {
    const s = scheme(zoneKit(), "outside-zone");
    return carry(s, crew(s).h, [[0, 104], [110, 80], [200, 36], [224, -20], [228, -60]]);
  },
  "glossary-power": () => scheme(lineKit(), "power"),
  "glossary-counter": () => scheme(lineKit(), "counter"),
};

/* ------------------------------------------------------------ the defense */

/** The 4-2-5 over a tight formation (no wide receivers, so the picture stays close): what every pressure is put on. */
const defenseKit = (o: { tags?: boolean } = {}): Scene =>
  build({ personnel: "12", formation: "Pro Set", offense: (l) => !/^(X|Z)$/.test(l), front: "4-2-5", defense: (d) => Math.abs(d.x - CX) <= 260, tags: o.tags });

/** Takes the words off every defender but the ones named: a pressure's lines say who goes where, so the tags only crowd them. */
const quiet = (s: Scene, keep: string[] = []): Scene => ({
  ...s,
  nodes: s.nodes.map((n) => (n.kind === "player" && n.side === "defense" && n.job && !keep.includes(n.label) ? { ...n, job: undefined } : n)),
});

/** A pressure from the library on the 4-2-5, gold as asked. */
function pressure(id: string, gold?: Gold, keep: string[] | "all" = []): Scene {
  const s = defenseKit();
  const done = applyPressure(s, id, { gold, width: WIDTH, z: Z });
  return "error" in done ? s : keep === "all" ? done.scene : quiet(done.scene, keep);
}

/** The front seven against the line and one back: what a single defender's job is shown against. */
const frontKit = (): Scene => build({ personnel: "21", formation: "I Formation", offense: (l) => /^(T|G|C|Y|Q|H)$/.test(l), front: "4-2-5", defense: box });

/** Takes the words off one defender's line: the line itself says what he does, and a tag over a lineman's token only hides both. */
function untag(s: Scene, label: string): Scene {
  const d = byLabel(s, label, "defense");
  return d ? { ...s, nodes: s.nodes.map((n) => (n.kind === "path" && n.assignOf === d.id && n.tag ? { ...n, tag: "" } : n)) } : s;
}

/** A defender's own job, drawn by the click that gives it. */
function assign(s: Scene, label: string, job: string, dir: 1 | -1 = 1, tag?: string): Scene {
  const d = byLabel(s, label, "defense");
  if (!d) return s;
  return giveAssignment(s, d, job, { dir, width: WIDTH, z: Z + s.nodes.length, pathTag: tag, jobTag: undefined })?.scene ?? s;
}

const DEFENSE: Record<string, () => Scene> = {
  "glossary-sob": () => pressure("sob"),
  "glossary-go": () => pressure("go"),
  "glossary-mob": () => pressure("mob"),
  "glossary-pinch-mow": () => pressure("pinch-mow"),
  "glossary-missile": () => pressure("missile"),
  "glossary-boom": () => pressure("boom"),
  "glossary-extra": () => pressure("extra"),
  "glossary-backer": () => pressure("backer"),
  "glossary-sextra": () => untag(pressure("sextra"), "S"),
  "glossary-swing": () => pressure("swing"),
  "glossary-twist": () => pressure("twist"),
  "glossary-gold-back": () => pressure("sob", "back", ["R"]),
  "glossary-gold-free": () => {
    // The free rover's line runs up the field through where his own tag would sit, so he gets a word beside him instead.
    const s = pressure("sob", "free");
    const r = byLabel(s, "R", "defense");
    return r ? { ...s, nodes: [...s.nodes, makeText({ x: r.x - 56, y: r.y + 6 }, "Free", INK, Z + s.nodes.length)] } : s;
  },
  // Everyone not rushing is on a man: the words stay on the men who have one, the lines say the rest.
  "glossary-man-pressure": () => pressure("go", undefined, ["M", "$", "R"]),
  "glossary-peel": () => {
    let s = frontKit();
    for (const l of ["W", "N", "T"]) s = assign(s, l, "rush");
    return assign(s, "B", "peel");
  },
  "glossary-hit": () => {
    let s = frontKit();
    for (const l of ["W", "N", "T", "B"]) s = assign(s, l, "rush");
    return assign(s, "M", "hit", 1, "");
  },
  // All eleven over a spread offense: the front seven and the five backs, each with his job in a word.
  "glossary-4-2-5": () => build({ personnel: "12", formation: "Pro Set", offense: (l) => !/^(X|Z)$/.test(l), front: "4-2-5", tags: true }),
};

const ALL: Record<string, () => Scene> = { ...BLOCKING, ...DEFENSE };

/** Every starter term id this file draws. */
export const BLOCKING_DIAGRAMS = Object.keys(ALL);

export function blockingScene(id: string): Scene | null {
  const make = ALL[id];
  return make ? make() : null;
}
