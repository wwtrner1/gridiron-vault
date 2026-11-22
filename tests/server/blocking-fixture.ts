import { defenseNodes, layoutDefense, type Coverage, type Front, type LineSet } from "../../src/lib/defense";
import { layoutFormation, tokenFor, type GameType, type Placed } from "../../src/lib/formations";
import { emptyScene, makePlayer, OFFENSE_TOKENS } from "../../src/lib/presets";
import { CANVAS_W } from "../../src/lib/types";
import type { PathNode, PlayerNode, Scene } from "../../src/lib/types";

/**
 * A real play to run the blocking and assignment libraries against: an
 * offense lined up like New play setup does it and, when asked, a defense
 * from the Defense library laid over its line.
 */
export type Fixture = { formation?: string; game?: GameType; personnel?: string; front?: Front; coverage?: Coverage; tags?: boolean; /** Draw the library's own zones and lines, as the Defense library does with its drops shown. */ zones?: boolean };

export function build({ formation = "Doubles", game = "11", personnel = "11", front, coverage = "Cover 3", tags = true, zones = false }: Fixture = {}): Scene {
  const scene: Scene = emptyScene();
  const placed: Placed[] = layoutFormation(game, personnel, formation);
  const offense = placed.map((p, i): PlayerNode => ({ ...makePlayer(tokenFor(p, OFFENSE_TOKENS), CANVAS_W / 2 + p.dx, scene.losY + p.dy), z: i + 1 }));
  scene.nodes = offense;
  if (front) {
    const receivers = placed.filter((p) => p.role !== "line" && p.role !== "qb").map((p) => ({ dx: p.dx, dy: p.dy }));
    const line: LineSet = { ol: placed.filter((p) => p.role === "line").map((p) => p.dx), tes: placed.filter((p) => p.role === "te").map((p) => p.dx) };
    const layout = layoutDefense(front, coverage, receivers, line);
    scene.nodes = [...offense, ...defenseNodes(layout, { x: CANVAS_W / 2, y: scene.losY }, zones, offense.length + 1, tags)];
  }
  return scene;
}

export const players = (scene: Scene, side?: "offense" | "defense") =>
  scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && (!side || n.side === side));
export const paths = (scene: Scene) => scene.nodes.filter((n): n is PathNode => n.kind === "path");
/** A player by his letter ("T" and "G" appear twice: the first is the left one). */
export const byLabel = (scene: Scene, label: string, side: "offense" | "defense" = "offense", nth = 0): PlayerNode => {
  const found = players(scene, side).filter((p) => p.label === label);
  if (!found[nth]) throw new Error(`No ${side} ${label} #${nth}: ${players(scene, side).map((p) => p.label).join(" ")}`);
  return found[nth];
};
/** Lines a player owns (glued by `assignOf`). */
export const linesFor = (scene: Scene, p: PlayerNode) => paths(scene).filter((l) => l.assignOf === p.id);
/** A line's points on the field rather than from its player. */
export const world = (l: PathNode) => l.points.map((p) => ({ x: l.x + p.x, y: l.y + p.y }));
export const endOf = (l: PathNode) => world(l).at(-1)!;
export const INK = { ink: "#222222", width: 3, z: 100 };
