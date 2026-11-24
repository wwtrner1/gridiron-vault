import { fromOwner, lineFor, replaceLines, type Ink, type LineSpec } from "./assignLine";
import { firstLevel, GAP, HEAD_UP, inBox, isQuarterback, nearestDefender, onLine, readField, secondLevel, SECOND_LEVEL, stopShort, type Field } from "./fieldRead";
import { unitsFor } from "./quickRoutes";
import type { PathNode, PlayerNode, Point, Scene } from "./types";

/**
 * One-click blocks (Wes, 2026-11-22): a coach clicks a lineman, a back, a
 * tight end or a receiver, picks how he blocks, and the line is drawn from
 * him in his color with a T on the end, the way a route is. With a defense on
 * the field the block goes to the defender it fits (the man over him, the end
 * he kicks out, the backer he climbs to); with none it is the block's own
 * shape. Every block ends in a T because every reader (talking points, Rules
 * check, Coverage check) tells a block from a route by the T alone.
 *
 * Pure, and it works on an upright scene (offense below the line): the
 * Designer turns a play drawn from the defense's end round first.
 * Shapes are drawn for a play going right (`dir` +1); `dir` -1 mirrors them.
 */

export type BlockKind = {
  id: string;
  label: string;
  /** What the tile says under the name. */
  hint: string;
  /** The coach's words for the talking points: "reaches the defender outside him". */
  talk: string;
  /** The tile's little drawing in a 56×44 box, for a blocker on the right of the ball with the play going right. */
  icon: string;
};

/** A block icon: the line through its points, with the T across its end. */
function blockIcon(pts: [number, number][]): string {
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const [ax, ay] = pts[pts.length - 2];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const px = (-(by - ay) / len) * 8;
  const py = ((bx - ax) / len) * 8;
  return `${d} M${(bx - px).toFixed(1)} ${(by - py).toFixed(1)} L${(bx + px).toFixed(1)} ${(by + py).toFixed(1)}`;
}

/** What a lineman can do: Wes's blocks, plus the click on a defender that was always there. */
export const LINE_BLOCKS: BlockKind[] = [
  { id: "base", label: "Base", hint: "Man over you", talk: "blocks the man over him.", icon: blockIcon([[28, 40], [28, 14]]) },
  { id: "reach", label: "Reach", hint: "Get outside him", talk: "reaches the man over him, stepping to the play side to get his head outside.", icon: blockIcon([[20, 40], [40, 14]]) },
  { id: "down", label: "Down", hint: "Inside gap", talk: "blocks down on the defender inside him.", icon: blockIcon([[36, 40], [20, 14]]) },
  { id: "combo", label: "Combo", hint: "Double, then climb", talk: "doubles with his neighbor, then climbs to the backer.", icon: blockIcon([[28, 40], [28, 26], [36, 10]]) },
  { id: "climb", label: "Climb", hint: "To the backer", talk: "climbs to the second level and blocks a backer.", icon: blockIcon([[28, 40], [28, 6]]) },
  { id: "pull-kick", label: "Pull and kick out", hint: "Around to the end", talk: "pulls and kicks out the end man on the line.", icon: blockIcon([[12, 40], [20, 43], [40, 42], [46, 22]]) },
  { id: "pull-lead", label: "Pull and lead", hint: "Through the hole", talk: "pulls and leads through the hole to a backer.", icon: blockIcon([[10, 40], [18, 43], [38, 42], [46, 10]]) },
  { id: "trap", label: "Trap", hint: "Across to a lineman", talk: "pulls across and traps the first defender past the center.", icon: blockIcon([[20, 40], [26, 43], [38, 42], [42, 22]]) },
  { id: "fold", label: "Fold", hint: "Wrap behind", talk: "folds behind his neighbor and blocks the man the neighbor leaves.", icon: blockIcon([[18, 40], [24, 44], [38, 42], [44, 16]]) },
  { id: "scoop", label: "Scoop", hint: "Inside man", talk: "scoops inside and blocks the defender over the next lineman.", icon: blockIcon([[34, 40], [22, 22], [20, 8]]) },
  { id: "pass-set", label: "Pass set", hint: "Kick back", talk: "sets back in pass protection.", icon: blockIcon([[28, 28], [30, 34], [34, 42]]) },
  { id: "hinge", label: "Hinge", hint: "Backside", talk: "hinges back and across to seal the backside.", icon: blockIcon([[30, 26], [26, 34], [22, 41]]) },
  { id: "screen", label: "Screen release", hint: "Out to the screen", talk: "blocks for a count, then releases to the screen and leads upfield.", icon: blockIcon([[10, 40], [10, 30], [26, 22], [44, 14]]) },
];

/** What a back, tight end or receiver can do. */
export const SKILL_BLOCKS: BlockKind[] = [
  { id: "base", label: "Base", hint: "Man over you", talk: "blocks the man over him.", icon: blockIcon([[28, 40], [28, 14]]) },
  { id: "stalk", label: "Stalk", hint: "Cover the corner", talk: "stalks the defensive back across from him.", icon: blockIcon([[28, 40], [28, 10]]) },
  { id: "crack", label: "Crack", hint: "Back inside", talk: "cracks back inside on the nearest backer or safety.", icon: blockIcon([[40, 40], [40, 26], [20, 10]]) },
  { id: "lead", label: "Lead", hint: "Through the hole", talk: "leads through the hole and blocks the first backer.", icon: blockIcon([[18, 42], [30, 22], [34, 8]]) },
  { id: "kick-out", label: "Kick out", hint: "Seal the end", talk: "kicks out the end man on the line.", icon: blockIcon([[14, 40], [28, 42], [44, 22]]) },
  { id: "arc", label: "Arc", hint: "Around to deep", talk: "arcs outside and blocks a deep defender.", icon: blockIcon([[22, 40], [30, 24], [38, 6]]) },
  { id: "slice", label: "Slice", hint: "Cut off the back", talk: "slices across the formation and cuts off backside pursuit.", icon: blockIcon([[40, 36], [24, 30], [8, 20]]) },
  { id: "pass-pro", label: "Pass pro", hint: "Pick up a rusher", talk: "stays in to pick up the first rusher.", icon: blockIcon([[28, 40], [28, 26]]) },
];

const ALL_KINDS = [...LINE_BLOCKS, ...SKILL_BLOCKS];
export const blockKind = (id: string): BlockKind | undefined => ALL_KINDS.find((k) => k.id === id) ?? undefined;

/** The block a path stands for, read from its name ("T Reach"), so talking points can say how a player blocks. */
export function blockOf(line: Pick<PathNode, "name" | "endCap">): BlockKind | null {
  if (line.endCap !== "tee") return null;
  const hit = ALL_KINDS.filter((k) => line.name.endsWith(` ${k.label}`)).sort((a, b) => b.label.length - a.label.length)[0];
  return hit ?? null;
}

/** The blocks a player is offered: a lineman's, or a skill player's. */
export const blocksFor = (isLine: boolean): BlockKind[] => (isLine ? LINE_BLOCKS : SKILL_BLOCKS);

/** Which way a player's blocks go by default: toward his own side of the ball (the center and the middle go right). */
export function playSide(scene: Scene, p: Point): 1 | -1 {
  const f = readField(scene);
  return p.x < f.ball - 4 ? -1 : 1;
}

/* ------------------------------------------------------------------ geometry */

/**
 * The defender furthest toward the play side on the line (the end man), outside `from` by `past`
 * (a tight end can kick out a man head up on him, so he passes a negative one). Only men in the
 * box count: a corner pressed on a receiver stands on the line too, but he is no end man.
 */
function edgeDefender(f: Field, from: number, dir: 1 | -1, past = GAP * 0.4): PlayerNode | null {
  const pool = firstLevel(f).filter((d) => inBox(f, d) && dir * (d.x - from) > past);
  if (pool.length) return pool.reduce((a, b) => (dir * b.x > dir * a.x ? b : a));
  const backers = secondLevel(f).filter((d) => inBox(f, d) && dir * (d.x - from) > GAP);
  return backers.length ? backers.reduce((a, b) => (dir * b.x > dir * a.x ? b : a)) : null;
}

/** A line that goes behind the blockers: out to the first point, along behind the line, then up into the target. */
function pullPoints(b: Point, dir: 1 | -1, endX: number, endY: number): Point[] {
  const behind = b.y + 10;
  return [
    { x: b.x + dir * GAP * 0.5, y: behind },
    { x: endX - dir * 8, y: behind - 2 },
    { x: endX, y: endY },
  ];
}

type Built = { points: Point[]; curve?: "straight" | "spline"; target: PlayerNode | null };

/** The shape of a block, as absolute points after the blocker's own spot. */
function shape(scene: Scene, f: Field, p: PlayerNode, id: string, dir: 1 | -1): Built | null {
  const { x: bx, y: by } = p;
  const inDir: 1 | -1 = Math.abs(bx - f.ball) < 4 ? dir : bx < f.ball ? 1 : -1;
  const u = unitsFor(scene);
  const first = firstLevel(f);
  const second = secondLevel(f);
  const pick = (pool: PlayerNode[], x: number, y: number, within: number) => nearestDefender({ ...f, defense: pool }, x, y, () => true, within);
  const outer = (dirn: 1 | -1) => f.ol.concat(f.tes).reduce((m, o) => (dirn * o.x > dirn * m ? o.x : m), p.x);

  switch (id) {
    case "base": {
      const t = pick(first, bx, f.losY - 40, GAP * 0.8);
      return t ? { points: [stopShort({ x: bx, y: by }, t)], target: t } : { points: [{ x: bx, y: by - 34 }], target: null };
    }
    case "reach": {
      const t = pick(first.filter((d) => dir * (d.x - bx) >= -HEAD_UP && dir * (d.x - bx) <= GAP * 1.1), bx + dir * 22, f.losY - 40, 48);
      if (t) return { points: [stopShort({ x: bx, y: by }, { ...t, x: t.x + dir * 6 })], target: t };
      return { points: [{ x: bx + dir * GAP * 0.6, y: by - 30 }], target: null };
    }
    case "down": {
      const t = pick(first.filter((d) => inDir * (d.x - bx) >= -HEAD_UP && inDir * (d.x - bx) <= GAP * 1.1), bx + inDir * 22, f.losY - 40, 48);
      if (t) return { points: [stopShort({ x: bx, y: by }, t)], target: t };
      return { points: [{ x: bx + inDir * GAP * 0.5, y: by - 34 }], target: null };
    }
    case "combo": {
      const t = pick(second, bx + dir * 10, f.losY - 84, SECOND_LEVEL * 0.8);
      const mid = { x: bx + dir * 8, y: by - 34 };
      return { points: [mid, t ? stopShort(mid, t) : { x: bx + dir * 18, y: f.losY - 70 }], curve: "spline", target: t };
    }
    case "climb": {
      const t = pick(second, bx, f.losY - 84, SECOND_LEVEL * 0.8);
      return t ? { points: [stopShort({ x: bx, y: by }, t)], target: t } : { points: [{ x: bx, y: f.losY - 76 }], target: null };
    }
    case "pull-kick": {
      const t = edgeDefender(f, bx, dir);
      if (t) {
        const end = { x: t.x - dir * (t.size ?? 30) * 0.5, y: t.y + (t.size ?? 30) * 0.7 };
        return { points: pullPoints({ x: bx, y: by }, dir, end.x, end.y), curve: "spline", target: t };
      }
      const edge = outer(dir) + dir * GAP * 0.7;
      return { points: pullPoints({ x: bx, y: by }, dir, edge, f.losY - 30), curve: "spline", target: null };
    }
    case "pull-lead": {
      const hole = bx + dir * GAP * 1.6;
      const t = pick(second.filter((d) => dir * (d.x - bx) > GAP * 0.5), hole, f.losY - 84, SECOND_LEVEL * 0.9);
      if (t) {
        const end = { x: t.x - dir * (t.size ?? 30) * 0.4, y: t.y + (t.size ?? 30) * 0.7 };
        return { points: pullPoints({ x: bx, y: by }, dir, end.x, end.y), curve: "spline", target: t };
      }
      return { points: pullPoints({ x: bx, y: by }, dir, hole + dir * 8, f.losY - 76), curve: "spline", target: null };
    }
    case "trap": {
      const t = pick(first.filter((d) => dir * (d.x - bx) > GAP * 0.4), bx + dir * GAP * 2, f.losY - 40, GAP * 1.2);
      if (t) {
        const end = { x: t.x - dir * (t.size ?? 30) * 0.5, y: t.y + (t.size ?? 30) * 0.7 };
        return { points: pullPoints({ x: bx, y: by }, dir, end.x, end.y), curve: "spline", target: t };
      }
      return { points: pullPoints({ x: bx, y: by }, dir, bx + dir * GAP * 2, f.losY - 30), curve: "spline", target: null };
    }
    case "fold": {
      const t = pick(second.concat(first), bx + dir * GAP, f.losY - 70, GAP * 1.4);
      const end = t ? { x: t.x - dir * (t.size ?? 30) * 0.4, y: t.y + (t.size ?? 30) * 0.7 } : { x: bx + dir * GAP, y: f.losY - 58 };
      return { points: [{ x: bx + dir * GAP * 0.4, y: by + 12 }, { x: bx + dir * GAP * 0.9, y: by + 2 }, end], curve: "spline", target: t };
    }
    case "scoop": {
      const t = pick(first.filter((d) => inDir * (d.x - bx) > HEAD_UP), bx + inDir * GAP * 0.7, f.losY - 40, GAP * 1.2);
      if (t) return { points: [stopShort({ x: bx, y: by }, t)], target: t };
      return { points: [{ x: bx + inDir * GAP * 0.45, y: by - 46 }], target: null };
    }
    case "pass-set": {
      const out = dir;
      return { points: [{ x: bx + out * 7, y: by + 9 }, { x: bx + out * 15, y: by + 20 }], curve: "spline", target: null };
    }
    case "hinge":
      return { points: [{ x: bx + inDir * 7, y: by + 8 }, { x: bx + inDir * 14, y: by + 18 }], curve: "spline", target: null };
    case "screen":
      return {
        points: [{ x: bx, y: by - 14 }, { x: bx + dir * GAP * 0.7, y: by - 34 }, { x: bx + dir * GAP * 1.3, y: by - 54 }],
        curve: "spline",
        target: null,
      };
    case "stalk": {
      const t = nearestDefender(f, bx, by - u.y * 5, () => true, u.y * 12);
      return t ? { points: [stopShort({ x: bx, y: by }, t)], target: t } : { points: [{ x: bx, y: by - u.y * 5 }], target: null };
    }
    case "crack": {
      const t = nearestDefender(f, bx + inDir * u.x * 6, by - u.y * 6, (d) => !onLine(f, d) && !/^C$/i.test(d.label.trim()) && inDir * (d.x - bx) > 0, u.y * 10);
      return t
        ? { points: [{ x: bx, y: by - u.y * 2 }, stopShort({ x: bx, y: by - u.y * 2 }, t)], target: t }
        : { points: [{ x: bx, y: by - u.y * 2 }, { x: bx + inDir * u.x * 5, y: by - u.y * 6 }], target: null };
    }
    case "lead": {
      const t = pick(second, bx + dir * GAP * 0.5, f.losY - 84, SECOND_LEVEL * 1.1);
      return t ? { points: [stopShort({ x: bx, y: by }, t)], target: t } : { points: [{ x: bx + dir * GAP * 0.5, y: f.losY - 56 }], target: null };
    }
    case "kick-out": {
      const t = edgeDefender(f, bx, dir, -GAP * 0.5);
      if (t) {
        const end = { x: t.x - dir * (t.size ?? 30) * 0.5, y: t.y + (t.size ?? 30) * 0.7 };
        return { points: [{ x: bx + dir * GAP * 0.4, y: by - 6 }, end], curve: "spline", target: t };
      }
      return { points: [{ x: bx + dir * GAP * 0.4, y: by - 6 }, { x: outer(dir) + dir * GAP * 0.6, y: f.losY - 30 }], curve: "spline", target: null };
    }
    case "arc": {
      const t = nearestDefender(f, bx + dir * 30, by - u.y * 8, (d) => d.y < f.losY - SECOND_LEVEL * 0.5, u.y * 14);
      const mid = { x: bx + dir * 18, y: by - 24 };
      return { points: [mid, t ? stopShort(mid, t) : { x: bx + dir * 26, y: by - u.y * 6 }], curve: "spline", target: t };
    }
    case "slice": {
      const t = edgeDefender(f, f.ball, (-dir) as 1 | -1);
      const mid = { x: bx - dir * GAP * 0.6, y: by - 10 };
      return { points: [mid, t ? stopShort(mid, t) : { x: bx - dir * GAP * 1.3, y: by - 24 }], curve: "spline", target: t };
    }
    case "pass-pro": {
      const t = nearestDefender(f, bx, by - 40, (d) => d.y > f.losY - SECOND_LEVEL, 130);
      if (t) {
        const far = stopShort({ x: bx, y: by }, t);
        const len = Math.hypot(far.x - bx, far.y - by);
        const k = len > 26 ? 26 / len : 1;
        return { points: [{ x: bx + (far.x - bx) * k, y: by + (far.y - by) * k }], target: t };
      }
      return { points: [{ x: bx, y: by - 20 }], target: null };
    }
    default:
      return null;
  }
}

/** A block's line for a player, without touching the scene. `target` is the defender it was aimed at, when there was one. */
export function blockFor(scene: Scene, p: PlayerNode, id: string, dir: 1 | -1): { spec: LineSpec; target: PlayerNode | null } | null {
  const kind = blockKind(id);
  if (!kind) return null;
  const f = readField(scene);
  const built = shape(scene, f, p, id, dir);
  if (!built) return null;
  return {
    spec: {
      name: `${p.label || "Player"} ${kind.label}`,
      points: fromOwner(p, built.points),
      curve: built.curve ?? "straight",
      endCap: "tee",
    },
    target: built.target,
  };
}

/** Gives a player this block, replacing any route or block he already had. */
export function giveBlock(scene: Scene, p: PlayerNode, id: string, opts: Ink & { dir: 1 | -1 }): { scene: Scene; path: PathNode; target: PlayerNode | null; kind: BlockKind } | null {
  const built = blockFor(scene, p, id, opts.dir);
  const kind = blockKind(id);
  if (!built || !kind) return null;
  const path = lineFor(p, built.spec, opts);
  return { scene: replaceLines(scene, p, [path]), path, target: built.target, kind };
}

/** True for a quarterback, so menus can leave him out. */
export const isQb = isQuarterback;
