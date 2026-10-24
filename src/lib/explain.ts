import { unitsPerYard } from "./field";
import { toWorld } from "./geometry";
import { linesOf } from "./assignments";
import type { PathNode, PlayerNode, Point, Scene } from "./types";
import { CANVAS_W } from "./types";

/**
 * "Write the coaching notes for me": plain-language talking points built from
 * the drawing itself, so a first-year coach has words to teach the play with.
 * Pure and offline; it only describes what is drawn.
 */

const MIN_LEG = 8;

const dir = (a: Point, b: Point): Point | null => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return len < MIN_LEG ? null : { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
};

/** One player's route in words, or null when there is nothing drawn worth saying. */
function sentence(scene: Scene, who: PlayerNode, line: PathNode, sign: 1 | -1): string | null {
  const perYard = unitsPerYard(scene.view);
  const pts = line.points.map((p) => toWorld(line, p));
  if (pts.length < 2 || !perYard) return null;
  const letter = who.label.trim().toUpperCase();
  const yardsAt = (p: Point) => Math.round((sign * (who.y - p.y)) / perYard);
  const label = line.tag?.trim();
  if (line.endCap === "tee") return `${letter} blocks.`;
  if (line.style === "motion") return `${letter} goes in motion across the formation before the snap.`;
  // The break: the sharpest turn in the route.
  let at = -1;
  let best = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = dir(pts[i - 1], pts[i]);
    const b = dir(pts[i], pts[i + 1]);
    if (!a || !b) continue;
    const turn = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
    if (turn > best) (best = turn), (at = i);
  }
  const end = pts[pts.length - 1];
  const name = label ? ` (${label})` : "";
  if (at < 0 || best < 0.45) {
    const out = yardsAt(end);
    const d = dir(pts[0], end);
    if (d && Math.abs(d.x) > Math.abs(d.y) * 1.2) return `${letter} runs a flat route${name} toward the ${d.x < 0 ? "left" : "right"} sideline.`;
    return out >= 3 ? `${letter} runs straight upfield${name}, about ${out} yards.` : `${letter} runs a short route${name}.`;
  }
  const depth = yardsAt(pts[at]);
  const after = dir(pts[at], pts[Math.min(pts.length - 1, at + 1)]);
  const left = after ? after.x < 0 : false;
  const nearLeft = who.x < CANVAS_W / 2;
  const toward = !after ? "" : Math.abs(after.x) < 0.25 ? "back toward the quarterback" : left === nearLeft ? "to the sideline" : "to the middle";
  const side = !after || Math.abs(after.x) < 0.25 ? "" : left ? " (left)" : " (right)";
  if (depth < 1) return `${letter} breaks ${toward}${side} behind the line${name}.`;
  return `${letter} runs ${depth} yards${name}, then breaks ${toward}${side}.`;
}

/** Talking points for a play, one line per player, quarterback first and the first read called out. */
export function explainPlay(scene: Scene): string {
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf && n.side === "offense" && !!n.label.trim());
  const lines: string[] = [];
  const qb = players.find((p) => p.label.trim().toUpperCase() === "Q");
  const read = scene.nodes.find((n): n is PathNode => n.kind === "path" && !!n.firstRead && !n.hidden);
  const reader = read ? players.find((p) => p.id === (read.assignOf ?? read.fromId)) ?? players.find((p) => Math.hypot(p.x - toWorld(read, read.points[0]).x, p.y - toWorld(read, read.points[0]).y) < 30) : undefined;
  if (qb) lines.push(reader ? `Q takes the snap and looks for ${reader.label.trim().toUpperCase()} first.` : "Q takes the snap.");
  for (const p of players) {
    if (p === qb) continue;
    const mine = linesOf(scene, p).filter((l) => l.points.length > 1);
    if (!mine.length) continue;
    const sign: 1 | -1 = p.y >= scene.losY ? 1 : -1;
    const s = sentence(scene, p, mine[0], sign);
    if (s) lines.push(s);
  }
  return lines.join("\n");
}
