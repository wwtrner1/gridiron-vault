import { onUpright, type Ink } from "./assignLine";
import { applyScheme, blockScheme, type Pick } from "./blockSchemes";
import { readField } from "./fieldRead";
import { applyPressure, pressure, type Gold } from "./pressures";
import { blockKind, giveBlock } from "./quickBlocks";
import { clearDefender, defenderJob, giveAssignment, isCentered } from "./quickDefense";
import { CANVAS_W } from "./types";
import type { PathNode, PlayerNode, Scene } from "./types";

/**
 * What the Designer does with a click on a block tile, an assignment tile, a
 * scheme or a pressure: each takes the scene on the coach's screen (turned
 * round when the play is drawn from the defense's end), says what it did in
 * the coach's words, and hands back the new scene. Directions are the coach's
 * screen: 1 is right, -1 is left.
 */
export type Dir = 1 | -1;
export type Made = { scene: Scene; status: string; label: string; select: string[] };

const sideWord = (dir: Dir) => (dir > 0 ? "right" : "left");
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const nameOf = (p: PlayerNode, fallback: string) => p.label.trim() || fallback;
const find = (scene: Scene, id: string) => scene.nodes.find((n): n is PlayerNode => n.kind === "player" && n.id === id);

/** Which way a player's blocks and drops go until the coach flips them: toward his own side of the ball. */
export function defaultDir(scene: Scene, p: { x: number }): Dir {
  const ball = scene.nodes.find((n): n is PlayerNode => n.kind === "player" && n.side === "offense" && /^C$/i.test(n.label))?.x ?? CANVAS_W / 2;
  return p.x < ball - 4 ? -1 : 1;
}

/** The hint that ends a block's or an assignment's status: Flip only gets a mention where it changes something. */
export const HINT = ["Drag a point to adjust.", "Flip changes the side; drag a point to adjust."] as const;

/** True when two lines run the same way: Flip has nothing to change on a block or drop that reads the same from both sides. */
const sameRun = (a: PathNode, b: PathNode) =>
  a.points.length === b.points.length && a.points.every((p, i) => Math.abs(p.x - b.points[i].x) < 0.5 && Math.abs(p.y - b.points[i].y) < 0.5);

/** A one-click block for a lineman, back, tight end or receiver. `flips` says whether Flip side would change it. */
export function blockFromMenu(scene: Scene, who: PlayerNode, id: string, dir: Dir, ink: Ink): (Made & { path: PathNode; flips: boolean }) | null {
  const kind = blockKind(id);
  if (!kind) return null;
  const run = (way: Dir) =>
    onUpright(scene, way, (flat, d) => {
      const p = find(flat, who.id);
      return p ? giveBlock(flat, p, id, { ...ink, dir: d }) : null;
    });
  const done = run(dir);
  if (!done) return null;
  const path = done.scene.nodes.find((n): n is PathNode => n.id === done.path.id && n.kind === "path");
  if (!path) return null;
  const other = run(-dir as Dir);
  const otherPath = other?.scene.nodes.find((n): n is PathNode => n.id === other.path.id && n.kind === "path");
  const aimed = done.target ? ` (${nameOf(done.target, "the defender")})` : "";
  const flips = !!otherPath && !sameRun(path, otherPath);
  return {
    scene: done.scene,
    path,
    flips,
    label: kind.label,
    select: [path.id],
    status: `${nameOf(who, "The player")} ${kind.talk.replace(/\.$/, "")}${aimed}. ${HINT[+flips]}`,
  };
}

/**
 * A one-click assignment for a defender. `target` is the receiver a man job covers.
 * `dir` is the side of the formation the job goes to; his own side (`defaultDir`) is the first
 * pick and the other side is Flip. `flips` says whether Flip would change it for him.
 */
export function jobFromMenu(scene: Scene, who: PlayerNode, id: string, dir: Dir, ink: Ink, target?: PlayerNode | null): (Made & { path: PathNode; flips: boolean }) | null {
  const job = defenderJob(id);
  if (!job) return null;
  const natural = defaultDir(scene, who);
  const run = (way: Dir) =>
    onUpright(scene, way, (flat, d) => {
      const p = find(flat, who.id);
      if (!p) return null;
      const t = target ? find(flat, target.id) : null;
      const flipped = way !== natural;
      // A defender off the ball has a side of his own (the gap, the sideline, the third he stands in); over the ball the direction alone says which way.
      const off = !isCentered(readField(flat), p);
      return giveAssignment(flat, p, id, { dir: d, side: d, flipped, ...(off ? { inside: !flipped } : {}), target: t, ...ink });
    });
  const done = run(dir);
  if (!done) return null;
  const path = done.scene.nodes.find((n): n is PathNode => n.id === done.path.id && n.kind === "path");
  if (!path) return null;
  const other = job.flips ? run(-dir as Dir) : null;
  const otherPath = other?.scene.nodes.find((n): n is PathNode => n.id === other.path.id && n.kind === "path");
  const who2 = nameOf(who, "The defender");
  const status = done.target ? `${who2} covers ${nameOf(done.target, "his man")} man to man.` : `${who2} ${job.talk.replace(/\.$/, "")}.`;
  const flips = !!otherPath && !sameRun(path, otherPath);
  return { scene: done.scene, path, flips, label: job.label, select: [path.id], status: `${status} ${HINT[+flips]}` };
}

/** A defender's own line and tag taken off. */
export function clearJob(scene: Scene, who: PlayerNode): Made {
  const p = find(scene, who.id) ?? who;
  return { scene: clearDefender(scene, p), label: "Clear assignment", select: [], status: `${nameOf(who, "The defender")}'s assignment is cleared.` };
}

const sentence = (picks: Pick[]) =>
  picks
    .filter((p) => p.block !== "stalk")
    .sort((a, b) => a.player.x - b.player.x)
    .map((p) => `${nameOf(p.player, "?")} ${(blockKind(p.block)?.label ?? p.block).toLowerCase()}`)
    .join(", ");

/** A whole-line block scheme, run to the left or the right of the screen. */
export function schemeFromPanel(scene: Scene, id: string, dir: Dir, ink: { ink: string; width: number; z: number }): (Made & { count: number }) | { error: string } {
  const scheme = blockScheme(id);
  if (!scheme) return { error: "That scheme isn't in the library." };
  const done = onUpright(scene, dir, (flat, d) => applyScheme(flat, id, { dir: d, fallbackInk: ink.ink, width: ink.width, z: ink.z }));
  if (!done) return { error: `${scheme.label} needs offensive linemen on the field. Drop an 11-man formation first (5-on-5 and 7-on-7 have no line to block with).` };
  const ids = done.picks.flatMap((p) => done.scene.nodes.filter((n) => n.kind === "path" && n.assignOf === p.player.id).map((n) => n.id));
  const where = id === "pass-slide" || id === "pass-man" || id === "covered" || id === "draw" || id === "screen" ? "" : ` to the ${sideWord(dir)}`;
  return {
    scene: done.scene,
    label: scheme.label,
    select: ids,
    count: done.picks.length,
    status: `${scheme.label}${where}: ${sentence(done.picks)}. Click any blocker to change his block.`,
  };
}

/** One of Wes's pressures on the defense on the field, with the rover's Gold job when the coach picked one. */
export function pressureFromPanel(scene: Scene, id: string, gold: Gold | null, ink: { width: number; z: number }): (Made & { count: number; notes: string[] }) | { error: string } {
  const pkg = pressure(id);
  if (!pkg) return { error: "That pressure isn't in the library." };
  const done = onUpright(scene, 1, (flat) => {
    const r = applyPressure(flat, id, { gold: gold ?? undefined, ...ink });
    return "error" in r ? { scene: flat, error: r.error } : r;
  });
  if (!done) return { error: "That pressure couldn't be drawn." };
  if ("error" in done) return { error: String(done.error) };
  const rushers = done.rushers.map((d) => nameOf(d, "?"));
  const goldWords = (gold ?? pkg.gold) === "back" ? "the rover takes the back" : "the rover is free";
  return {
    scene: done.scene,
    label: pkg.label,
    select: done.rushers.map((d) => d.id),
    count: rushers.length,
    notes: done.notes,
    status: `${pkg.label}: ${rushers.join(", ")} rush (${rushers.length}); everyone else covers, and ${goldWords}.${done.notes.length ? ` ${done.notes.join(" ")}` : ""} Click any defender to change his job.`,
  };
}

/** Every one-click block and every defender's line and tag taken off the field (routes stay). */
export function clearSets(scene: Scene, which: "blocks" | "defense"): { scene: Scene; removed: number } {
  if (which === "blocks") {
    const owners = new Set(scene.nodes.filter((n) => n.kind === "player" && n.side === "offense").map((n) => n.id));
    const nodes = scene.nodes.filter((n) => !(n.kind === "path" && n.endCap === "tee" && n.assignOf && owners.has(n.assignOf)));
    return { scene: { ...scene, nodes }, removed: scene.nodes.length - nodes.length };
  }
  let next = scene;
  let removed = 0;
  for (const d of scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side === "defense" && !n.ghostOf)) {
    const before = next.nodes.length;
    next = clearDefender(next, d);
    // A tag with no line is an assignment too (the Defense library's technique and gap tags): it counts, and goes.
    removed += before - next.nodes.length + (d.job ? 1 : 0);
  }
  return { scene: next, removed };
}
