import { assignmentsFor, type Assignment } from "./assignments";
import { toWorld } from "./geometry";
import type { PathNode, PlayerNode, Scene } from "./types";

/**
 * Griddy Quiz: questions built from the plays a coach already drew, so a
 * player is tested on the install with nothing for the coach to write.
 * Pure, so the player page and a check of it use the same code.
 */

type Play = { id: string; name: string; scene: Scene };

export type RouteOption = { scene: Scene; correct: boolean };
export type NameOption = { label: string; correct: boolean };

export type Question =
  | { kind: "route"; id: string; prompt: string; options: RouteOption[] }
  | { kind: "name"; id: string; prompt: string; scene: Scene; options: NameOption[] };

const INK = "#0B1524";
/** Routes that end within this many field units of each other look the same to a player. */
const SAME_ENDING = 55;

const shuffle = <T,>(items: T[]): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** A player's drawn lines. More than two usually means a bunch where a neighbor's lines start on him too, which would make a muddled choice. */
const routesIn = (lines: PathNode[]) => {
  const drawn = lines.filter((l) => l.points.length > 1 && !l.closed);
  return drawn.length > 2 ? [] : drawn;
};

/** A set of lines moved so the player they belong to stands on `to`, restyled so color and labels give nothing away. */
function moved(lines: PathNode[], from: PlayerNode, to: PlayerNode): PathNode[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return lines.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy, fromId: null, toId: null, assignOf: undefined, tag: undefined, firstRead: false, stroke: INK, width: 4 }));
}

/** Where a set of lines ends, relative to its player, for telling two sets apart. */
const ending = (lines: PathNode[], who: PlayerNode) => {
  const last = lines[lines.length - 1];
  const end = toWorld(last, last.points[last.points.length - 1]);
  return { x: end.x - who.x, y: end.y - who.y, n: lines.length };
};

/** "What's your route?": the player's real route among routes borrowed from his teammates, all standing where he stands. */
function routeQuestion(a: Assignment<Play>, others: Assignment<Play>[], letter: string, n: number): Question | null {
  const real = routesIn(a.lines);
  if (!real.length) return null;
  const want = ending(real, a.player);
  const seen = [want];
  const wrong: PathNode[][] = [];
  for (const o of shuffle(others)) {
    const lines = routesIn(o.lines);
    if (!lines.length) continue;
    const e = ending(lines, o.player);
    if (seen.some((s) => s.n === e.n && Math.hypot(s.x - e.x, s.y - e.y) < SAME_ENDING)) continue;
    seen.push(e);
    wrong.push(moved(lines, o.player, a.player));
    if (wrong.length === 3) break;
  }
  if (!wrong.length) return null;
  const sceneOf = (lines: PathNode[]): Scene => ({ ...a.play.scene, nodes: [{ ...a.player, shade: undefined }, ...lines] });
  const options: RouteOption[] = shuffle([
    { scene: sceneOf(moved(real, a.player, a.player)), correct: true },
    ...wrong.map((lines) => ({ scene: sceneOf(lines), correct: false })),
  ]);
  return { kind: "route", id: `route-${a.play.id}-${n}`, prompt: `${a.play.name}: which route does the ${letter} run?`, options };
}

/** "Which play is this?": the player's job on one play, and four play names. */
function nameQuestion(a: Assignment<Play>, plays: Play[], letter: string, n: number): Question | null {
  const names = [...new Set(plays.filter((p) => p.id !== a.play.id && p.name !== a.play.name).map((p) => p.name))];
  if (!names.length) return null;
  const options: NameOption[] = shuffle([{ label: a.play.name, correct: true }, ...shuffle(names).slice(0, 3).map((label) => ({ label, correct: false }))]);
  return { kind: "name", id: `name-${a.play.id}-${n}`, prompt: `You're the ${letter}. Which play is this?`, scene: a.scene, options };
}

/** A round for one player: up to `count` questions, routes and play names mixed. */
export function buildQuiz(plays: Play[], letter: string, count = 8): Question[] {
  const all = assignmentsFor(plays, letter);
  // Plays where he has a route or block teach more than standing still, so those lead.
  const drawn = all.filter((a) => a.lines.length);
  const jobs = drawn.length >= 3 ? drawn : all;
  const everyone = (letterOf: string) => assignmentsFor(plays, letterOf);
  // Routes borrowed from every other offensive letter in the book.
  const pool: Assignment<Play>[] = [];
  const offense = new Set<string>();
  for (const p of plays) for (const n of p.scene.nodes) if (n.kind === "player" && n.side === "offense" && n.label.trim()) offense.add(n.label.trim().toUpperCase());
  for (const l of offense) pool.push(...everyone(l));
  const out: Question[] = [];
  shuffle(jobs).forEach((a, i) => {
    const others = pool.filter((o) => o.play.id !== a.play.id || o.player.id !== a.player.id);
    const q = i % 2 === 0 ? routeQuestion(a, others, letter, i) ?? nameQuestion(a, plays, letter, i) : nameQuestion(a, plays, letter, i) ?? routeQuestion(a, others, letter, i);
    if (q) out.push(q);
  });
  return out.slice(0, count);
}
