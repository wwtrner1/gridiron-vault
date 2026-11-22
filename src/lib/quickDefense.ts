import { fromOwner, lineFor, replaceLines, type LineSpec } from "./assignLine";
import { DEFENSE_INK, ZONE_STROKE } from "./defense";
import { firstLevel, GAP, readField, secondLevel, stopShort, type Field } from "./fieldRead";
import { fieldInset } from "./fieldUnits";
import { fieldWidthYards, ownLines, unitsFor } from "./quickRoutes";
import { CANVAS_W } from "./types";
import type { PathNode, PlayerNode, Point, Scene } from "./types";

/**
 * One-click defender assignments (Wes, 2026-11-22): a coach clicks a defender,
 * picks his job, and the line is drawn from him the way Wes draws it on his
 * sheets: a solid arrow for a rush, a dashed arrow for man coverage, a dashed
 * line with a dot for a zone drop, a zigzag for a read ("hit"), a curved loop
 * for a twist. The job's name goes under his token (`PlayerNode.job`), so the
 * talking points and the Responsibility chips know it.
 *
 * Pure, and it works on an upright scene (offense below the line of
 * scrimmage): the Designer turns a play drawn from the defense's end round
 * first. Near the line everything is measured against the line's spacing
 * (`GAP`); deep drops are measured in yards so they read true on every field.
 */

export type DefenderJob = {
  id: string;
  label: string;
  /** What the tile says under the name. */
  hint: string;
  /** The coach's words for what he does ("rushes the A gap"). */
  talk: string;
  /** The tag under his token: the Playbook language term for the job. */
  tag: string;
  group: "rush" | "coverage";
  /** Man coverage needs a second click on the receiver. */
  needsTarget?: boolean;
  /** Which tiles Flip changes: inside or outside for a slant, the side for a gap, a loop or a contain. */
  flips?: boolean;
  /** The tile's little drawing in a 56×44 box: the defender at the top, the offense below. */
  icon: string;
};

export const DEFENDER_JOBS: DefenderJob[] = [
  { id: "rush", label: "Rush", hint: "Straight at the QB", talk: "rushes straight up the field at the quarterback.", tag: "Rush", group: "rush", icon: "M28 6 L28 38" },
  { id: "a-gap", label: "A gap", hint: "Blitz inside", talk: "blitzes the A gap, between the center and the guard.", tag: "A gap", group: "rush", flips: true, icon: "M36 6 L28 38" },
  { id: "b-gap", label: "B gap", hint: "Blitz the middle gap", talk: "blitzes the B gap, between the guard and the tackle.", tag: "B gap", group: "rush", flips: true, icon: "M42 6 L32 38" },
  { id: "c-gap", label: "C gap", hint: "Blitz outside", talk: "blitzes the C gap, outside the tackle.", tag: "C gap", group: "rush", flips: true, icon: "M48 6 L38 38" },
  { id: "slant", label: "Slant", hint: "Next gap over", talk: "slants into the next gap over.", tag: "Slant", group: "rush", flips: true, icon: "M22 6 L36 34" },
  { id: "loop", label: "Loop", hint: "Curve around", talk: "loops around behind his teammate, into the gap he leaves.", tag: "Loop", group: "rush", flips: true, icon: "M18 6 Q42 12 34 22 Q24 30 38 38" },
  { id: "contain", label: "Contain", hint: "Rush wide, keep him in", talk: "rushes wide and keeps the quarterback inside him.", tag: "Contain", group: "rush", flips: true, icon: "M34 6 Q50 18 42 38" },
  { id: "peel", label: "Peel", hint: "Rush, then the back", talk: "rushes, then peels off to cover the back if he releases.", tag: "Peel", group: "rush", icon: "M28 6 L28 20 Q38 26 46 38" },
  { id: "hit", label: "Hit", hint: "Read, then fill", talk: "hits, reading the blocker in front of him, then filling the gap.", tag: "Hit", group: "rush", icon: "M28 6 L22 12 L34 18 L22 24 L34 30 L28 36" },
  { id: "man", label: "Man", hint: "Then click a receiver", talk: "covers his man.", tag: "Man", group: "coverage", needsTarget: true, icon: "M12 6 L44 38" },
  { id: "flat", label: "Flat", hint: "5 yds, toward the sideline", talk: "drops to the flat, about five yards deep toward the sideline.", tag: "Flat", group: "coverage", flips: true, icon: "M28 6 L48 18" },
  { id: "curl", label: "Curl", hint: "10 yds over the hash", talk: "drops to the curl, about ten yards deep over the hash.", tag: "Hook/curl", group: "coverage", flips: true, icon: "M28 6 L34 28 M26 28 L42 28" },
  { id: "hook", label: "Hook", hint: "10 yds middle", talk: "drops to the middle hook, about ten yards deep.", tag: "Middle hook", group: "coverage", icon: "M28 6 L28 30 M20 30 L36 30" },
  { id: "hole", label: "Hole", hint: "Read the hole", talk: "plays the hole, reading the run, then dropping to the middle.", tag: "Hole", group: "coverage", icon: "M28 6 L28 22 M22 22 a6 3 0 1 0 12 0 a6 3 0 1 0 -12 0" },
  { id: "robber", label: "Robber", hint: "Jump the middle", talk: "robs the middle, about ten yards deep, jumping anything over the middle.", tag: "Robber", group: "coverage", icon: "M12 22 L44 22" },
  { id: "deep-third", label: "Deep 1/3", hint: "Deep third", talk: "drops to the deep third.", tag: "Deep 1/3", group: "coverage", flips: true, icon: "M28 6 L38 38" },
  { id: "deep-half", label: "Deep 1/2", hint: "Deep half", talk: "drops to the deep half.", tag: "Deep 1/2", group: "coverage", flips: true, icon: "M28 6 L34 40" },
  { id: "deep-quarter", label: "Deep 1/4", hint: "Deep quarter", talk: "drops to the deep quarter.", tag: "Deep 1/4", group: "coverage", flips: true, icon: "M28 6 L32 40" },
  { id: "deep-middle", label: "Deep middle", hint: "Free safety", talk: "plays the deep middle, over the top of everything.", tag: "Deep middle", group: "coverage", icon: "M28 6 L28 40" },
  { id: "spy", label: "Spy", hint: "Shadow the QB", talk: "spies the quarterback and mirrors him if he runs.", tag: "Spy", group: "coverage", icon: "M28 6 L28 24 M20 24 L36 24" },
];

export const defenderJob = (id: string): DefenderJob | undefined => DEFENDER_JOBS.find((j) => j.id === id);

/** Defenders who can take a rush or coverage job: not the offense. */
export const isDefender = (p: PlayerNode) => p.side === "defense";

/* ------------------------------------------------------------------ geometry */

/** Keeps an x on the field: the sidelines of this scene's view (a flag field's are well in from the card's edge), or the card's edge on a whiteboard. */
function clampFor(scene: Scene): (x: number) => number {
  const inset = scene.view === "blank" ? 16 : fieldInset(scene.view ?? "half");
  return (x) => Math.min(CANVAS_W - inset, Math.max(inset, x));
}

/** Where the quarterback is, or where he would be in a normal drop. */
export function qbSpot(f: Field, scene: Scene): Point {
  return { x: f.qb?.x ?? f.ball, y: f.qb?.y ?? f.losY + unitsFor(scene).y * 5 };
}

export type Gap = { x: number; letter: "A" | "B" | "C" | "D" | "E"; side: -1 | 1 };

/**
 * The gaps along the line: a letter and a spot between each pair of blockers,
 * left to right, A beside the center and on out. Tight ends count as blockers;
 * with no line on the field the gaps sit at the standard 50 apart.
 */
export function gapCenters(f: Field): Gap[] {
  const xs = [...f.ol, ...f.tes].map((p) => p.x).sort((a, b) => a - b);
  const line = xs.length >= 3 ? xs : [f.ball - 100, f.ball - 50, f.ball, f.ball + 50, f.ball + 100];
  let ci = 0;
  line.forEach((x, i) => {
    if (Math.abs(x - f.ball) < Math.abs(line[ci] - f.ball)) ci = i;
  });
  const letters = ["A", "B", "C", "D", "E"] as const;
  const out: Gap[] = [];
  for (let i = ci; i < line.length; i++) {
    const a = line[i];
    const b = i + 1 < line.length ? line[i + 1] : a + GAP;
    out.push({ x: (a + b) / 2, letter: letters[Math.min(i - ci, 4)], side: 1 });
  }
  for (let i = ci; i >= 0; i--) {
    const a = line[i];
    const b = i - 1 >= 0 ? line[i - 1] : a - GAP;
    out.push({ x: (a + b) / 2, letter: letters[Math.min(ci - i, 4)], side: -1 });
  }
  return out.sort((a, b) => a.x - b.x);
}

/** The gap with this letter on this side of the ball, or the nearest one when the line is short. */
export function gapAt(f: Field, letter: Gap["letter"], side: 1 | -1): Gap {
  const gaps = gapCenters(f);
  const hit = gaps.find((g) => g.letter === letter && g.side === side);
  if (hit) return hit;
  const k = "ABCDE".indexOf(letter);
  return { x: f.ball + side * (GAP * (k + 0.5)), letter, side };
}

/** The index of the gap nearest to x (ties go to `bias`'s side). */
function nearestGap(gaps: Gap[], x: number, bias: 1 | -1): number {
  let best = 0;
  gaps.forEach((g, i) => {
    if (Math.abs(g.x - x) - bias * 0.01 * (g.x - x) < Math.abs(gaps[best].x - x) - bias * 0.01 * (gaps[best].x - x)) best = i;
  });
  return best;
}

/** The gap a down man moves to on a slant: the next one toward the middle (`inside`) or away from it. */
export function slantGap(f: Field, d: PlayerNode, inside: boolean, dir: 1 | -1): Gap {
  const gaps = gapCenters(f);
  const i = nearestGap(gaps, d.x, dir);
  const toMiddle = gaps[i].x > f.ball ? -1 : 1;
  const step = inside ? toMiddle : (-toMiddle as 1 | -1);
  return gaps[Math.min(gaps.length - 1, Math.max(0, i + step))];
}

/** True for a defender lined up over the ball (the nose, a free safety): he has no side of his own to flip away from. */
export const isCentered = (f: Field, d: PlayerNode): boolean => Math.abs(d.x - f.ball) < 6;

/** Which way a defender's own side is: toward the sideline he stands nearest (the middle goes by `dir`). */
export function ownSide(f: Field, d: PlayerNode, dir: 1 | -1): 1 | -1 {
  return isCentered(f, d) ? dir : d.x < f.ball ? -1 : 1;
}

/** A rusher's line: through a spot on the line, then on to the quarterback's depth, slightly toward him. */
function rushThrough(f: Field, scene: Scene, d: PlayerNode, through: Point, bendTo = 0.3): Point[] {
  const clampX = clampFor(scene);
  const qb = qbSpot(f, scene);
  const end = { x: through.x + (qb.x - through.x) * bendTo, y: qb.y - 16 };
  return [{ x: clampX(through.x), y: through.y }, { x: clampX(end.x), y: Math.max(through.y + 8, end.y) }].filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 4);
}

/**
 * The deep and underneath drops, by landmark: yards from the line and fractions of the field's width.
 * `side` is the side the coach wants (his own unless he flipped it); a deep landmark is the one he is
 * nearest to, mirrored across the field when `flipped`.
 */
function dropSpot(scene: Scene, f: Field, d: PlayerNode, id: string, side: 1 | -1, flipped: boolean): Point | null {
  const u = unitsFor(scene);
  const W = fieldWidthYards(scene);
  const mid = CANVAS_W / 2;
  const clampX = clampFor(scene);
  const at = (xYards: number, deep: number): Point => ({ x: clampX(mid + xYards * u.x), y: Math.max(24, f.losY - deep * u.y) });
  const nearest = (stops: number[]) => {
    const n = stops.reduce((best, s) => (Math.abs(mid + s * u.x - d.x) < Math.abs(mid + best * u.x - d.x) ? s : best), stops[0]);
    return flipped ? -n : n;
  };
  switch (id) {
    case "flat":
      return { x: clampX(d.x + side * Math.max(7, W * 0.17) * u.x), y: Math.max(24, f.losY - 5 * u.y) };
    case "curl":
      return at(side * (W / 6), 10);
    case "hook":
      return at(0, 10);
    case "hole":
      // The middle, six yards off the line, and always a drop: a backer already standing there still goes a couple of yards deeper.
      return at(0, Math.max(6, (f.losY - d.y) / u.y + 2.5));
    case "robber":
      return at(0, 10);
    case "deep-third":
      return at(nearest([-W / 3, 0, W / 3]), 17);
    case "deep-half":
      return at(nearest([-W / 4, W / 4]), 18);
    case "deep-quarter":
      return at(nearest([(-3 * W) / 8, -W / 8, W / 8, (3 * W) / 8]), 17);
    case "deep-middle":
      return at(0, 18);
    default:
      return null;
  }
}

/** The receiver a man defender covers when the coach hasn't clicked one: the nearest eligible player. */
export function nearestReceiver(f: Field, d: PlayerNode, taken: Set<string> = new Set()): PlayerNode | null {
  const pool = f.eligible.filter((r) => !taken.has(r.id));
  const list = pool.length ? pool : f.eligible;
  return list.reduce<PlayerNode | null>((best, r) => (!best || Math.hypot(r.x - d.x, r.y - d.y) < Math.hypot(best.x - d.x, best.y - d.y) ? r : best), null);
}

/** A man line from a defender to a receiver, stopping a step short of him. */
export function manPoints(d: Point, r: PlayerNode): Point[] {
  return [stopShort(d, r, 0.6)];
}

/** A defender's own rush color: his outline, unless that isn't a plain hex. */
export function rushInk(d: PlayerNode): string {
  return /^#[0-9a-f]{6}$/i.test(d.stroke ?? "") ? d.stroke : DEFENSE_INK;
}

/** What a job can be told besides who has it: the play's side, inside or outside, the receiver, and words for the line and the token. */
export type JobOpts = {
  dir: 1 | -1;
  inside?: boolean;
  target?: PlayerNode | null;
  /** Force a gap rush, loop, contain or drop to this side instead of the side he stands on. */
  side?: 1 | -1;
  /** The coach flipped the job: a deep landmark goes to the mirror of the one he is nearest to. */
  flipped?: boolean;
  /** Where a loop comes out (an x on the line, a gap's middle): the gap a twist names, instead of a step over from where he stands. */
  to?: number;
  /** Text on the line itself ("PEEL", "HIT", "SWAP", "READ HOLE"), in place of the job's own. */
  pathTag?: string;
  /** The words under his token, in place of the job's own. */
  jobTag?: string;
};

/** The line a job draws for a defender, in absolute canvas points after his own spot. */
export function jobShape(scene: Scene, f: Field, d: PlayerNode, id: string, o: JobOpts): { points: Point[]; spec: Partial<LineSpec>; target: PlayerNode | null } | null {
  const u = unitsFor(scene);
  const dir = o.dir;
  const side = o.side ?? ownSide(f, d, dir);
  const clampX = clampFor(scene);
  const here: Point = { x: d.x, y: d.y };
  const qb = qbSpot(f, scene);
  const losY = f.losY;
  switch (id) {
    case "rush":
      return { points: rushThrough(f, scene, d, { x: d.x, y: losY - 8 }, 0.25), spec: {}, target: null };
    case "a-gap":
    case "b-gap":
    case "c-gap": {
      const g = gapAt(f, id[0].toUpperCase() as Gap["letter"], side);
      return { points: rushThrough(f, scene, d, { x: g.x, y: losY - 8 }, 0.35), spec: {}, target: null };
    }
    case "slant": {
      const g = slantGap(f, d, o.inside ?? true, dir);
      return { points: [{ x: g.x, y: losY + 30 }], spec: {}, target: null };
    }
    case "loop": {
      const o2 = side;
      const out = clampX(o.to ?? d.x + o2 * GAP * 0.55);
      return {
        points: [
          { x: d.x + o2 * GAP * 0.45, y: Math.min(d.y + 14, losY - 14) },
          { x: clampX((d.x + out) / 2 + o2 * GAP * 0.4), y: losY - 2 },
          { x: out, y: Math.max(losY + 22, qb.y - 26) },
        ],
        spec: { curve: "spline" },
        target: null,
      };
    }
    case "contain": {
      const o2 = side;
      return {
        points: [
          { x: clampX(d.x + o2 * 10), y: losY - 10 },
          { x: clampX(d.x + o2 * GAP * 0.55), y: Math.max(losY + 16, qb.y - 14) },
        ],
        spec: { curve: "spline" },
        target: null,
      };
    }
    case "peel": {
      return { points: rushThrough(f, scene, d, { x: d.x, y: losY - 8 }, 0.2), spec: { tag: "PEEL" }, target: null };
    }
    case "hit": {
      const blockers = [...f.ol, ...f.tes];
      const t = blockers.length
        ? blockers.reduce((best, b) => (Math.abs(b.x - d.x) + Math.abs(b.y - d.y) * 0.1 < Math.abs(best.x - d.x) + Math.abs(best.y - d.y) * 0.1 ? b : best))
        : null;
      const end = t ? stopShort(here, t, 0.9) : { x: d.x, y: losY - 6 };
      return { points: [end], spec: { zigzag: true, tag: "HIT" }, target: null };
    }
    case "man": {
      const r = o.target ?? nearestReceiver(f, d);
      return r ? { points: manPoints(here, r), spec: { style: "dashed" }, target: r } : null;
    }
    case "spy": {
      const spot = { x: qb.x, y: Math.max(losY + 8, qb.y - u.y * 4) };
      return { points: [spot], spec: { style: "dashed", endCap: "dot" }, target: null };
    }
    default: {
      const to = dropSpot(scene, f, d, id, side, !!o.flipped);
      return to ? { points: [to], spec: { style: "dashed", endCap: "dot" }, target: null } : null;
    }
  }
}

/** A job's line for a defender, without touching the scene. `target` is the receiver for man coverage. */
export function assignmentFor(scene: Scene, d: PlayerNode, id: string, o: JobOpts): { spec: LineSpec; job: DefenderJob; target: PlayerNode | null } | null {
  const job = defenderJob(id);
  if (!job) return null;
  const f = readField(scene);
  const built = jobShape(scene, f, d, id, o);
  if (!built) return null;
  const name = job.id === "man" && built.target ? `${d.label || "Defender"} man on ${built.target.label}` : `${d.label || "Defender"} ${job.label.toLowerCase()}`;
  return {
    spec: {
      name,
      points: fromOwner(d, built.points),
      style: built.spec.style ?? "solid",
      curve: built.spec.curve ?? "straight",
      endCap: built.spec.endCap ?? "arrow",
      ...(built.spec.zigzag ? { zigzag: true } : {}),
      ...(o.pathTag ?? built.spec.tag ? { tag: o.pathTag ?? built.spec.tag } : {}),
    },
    job,
    target: built.target,
  };
}

/** The color a defender's line is drawn in: red for what attacks, blue for coverage. */
export const jobInk = (d: PlayerNode, job: DefenderJob): string => (job.group === "rush" ? rushInk(d) : ZONE_STROKE);

/** The scene with the stale zone shapes of lines about to go taken off with them (a drop's shaded area). */
function withoutZonesOf(scene: Scene, lines: PathNode[]): Scene {
  const ends = lines.filter((l) => l.endCap === "dot" && l.style === "dashed" && l.points.length > 1).map((l) => ({ x: l.x + l.points[l.points.length - 1].x, y: l.y + l.points[l.points.length - 1].y }));
  if (!ends.length) return scene;
  const gone = new Set(
    scene.nodes.filter((n) => n.kind === "shape" && /zone/i.test(n.name) && ends.some((e) => Math.hypot(n.x - e.x, n.y - e.y) < 4)).map((n) => n.id),
  );
  return gone.size ? { ...scene, nodes: scene.nodes.filter((n) => !gone.has(n.id)) } : scene;
}

/** The scene with this defender's earlier line (and a drop's shaded zone) taken off. */
export function clearDefender(scene: Scene, d: PlayerNode): Scene {
  const had = ownLines(scene, d);
  const next = replaceLines(withoutZonesOf(scene, had), d, []);
  return { ...next, nodes: next.nodes.map((n) => (n.kind === "player" && n.id === d.id && n.job ? { ...n, job: undefined } : n)) };
}

/** Gives a defender this job, replacing any line he already had and putting its name under his token. */
export function giveAssignment(
  scene: Scene,
  d: PlayerNode,
  id: string,
  o: JobOpts & { width: number; z: number },
): { scene: Scene; path: PathNode; job: DefenderJob; target: PlayerNode | null } | null {
  const built = assignmentFor(scene, d, id, o);
  if (!built) return null;
  const path = lineFor(d, built.spec, { ink: jobInk(d, built.job), width: o.width, z: o.z });
  const cleared = withoutZonesOf(scene, ownLines(scene, d));
  const next = replaceLines(cleared, d, [path]);
  const nodes = next.nodes.map((n) => (n.kind === "player" && n.id === d.id ? { ...n, job: o.jobTag ?? built.job.tag } : n));
  return { scene: { ...next, nodes }, path, job: built.job, target: built.target };
}

/** True while nobody on the field can play a defender's role: no defenders, so the menu has nothing to offer. */
export const hasDefense = (scene: Scene): boolean => scene.nodes.some((n) => n.kind === "player" && !n.hidden && !n.ghostOf && n.side === "defense");

/** Handy for pressures and schemes: the first and second level on the field. */
export function levels(scene: Scene) {
  const f = readField(scene);
  return { f, first: firstLevel(f), second: secondLevel(f) };
}
