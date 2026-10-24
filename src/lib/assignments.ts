import { toWorld } from "./geometry";
import type { PathNode, PlayerNode, Scene, SceneNode, StoredPlay } from "./types";

/** How close (field px) a line has to start to a player to count as his, when it isn't glued to him. */
const OWN_REACH = 26;
const FADE = "#C9D3DB";

/** One letter's job on one play: the play, the player, and his routes and blocks. */
export type Assignment<P extends { scene: Scene } = StoredPlay> = { play: P; player: PlayerNode; lines: PathNode[]; scene: Scene };

const visiblePlayers = (scene: Scene) =>
  scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf && !!n.label.trim());

/** The lines that belong to a player: glued to him, drawn by his preset, or starting where he stands. */
export function linesOf(scene: Scene, player: PlayerNode): PathNode[] {
  return scene.nodes.filter((n): n is PathNode => {
    if (n.kind !== "path" || n.hidden || n.closed) return false;
    if (n.fromId === player.id || n.assignOf === player.id) return true;
    if (n.fromId || n.assignOf || !n.points.length) return false;
    const start = toWorld(n, n.points[0]);
    return Math.hypot(start.x - player.x, start.y - player.y) <= OWN_REACH;
  });
}

/** Every letter that appears in these plays, offense first, then A to Z. */
export function lettersIn(plays: { scene: Scene }[]): { letter: string; side: PlayerNode["side"]; plays: number }[] {
  const seen = new Map<string, { letter: string; side: PlayerNode["side"]; plays: number }>();
  for (const p of plays) {
    const here = new Set<string>();
    for (const n of visiblePlayers(p.scene)) {
      const letter = n.label.trim().toUpperCase();
      if (here.has(letter)) continue;
      here.add(letter);
      const row = seen.get(letter) ?? { letter, side: n.side, plays: 0 };
      row.plays++;
      seen.set(letter, row);
    }
  }
  return [...seen.values()].sort((a, b) => (a.side === b.side ? a.letter.localeCompare(b.letter) : a.side === "offense" ? -1 : 1));
}

/** The play with everyone but `player` and his lines greyed out, so his job stands out. */
function spotlight(scene: Scene, player: PlayerNode, lines: PathNode[]): Scene {
  const keep = new Set([player.id, ...lines.map((l) => l.id)]);
  const nodes = scene.nodes.map((n): SceneNode => {
    if (keep.has(n.id)) return n.kind === "path" ? { ...n, width: n.width + 1 } : n;
    if (n.kind === "player") return { ...n, fill: FADE, stroke: FADE, textColor: "#FFFFFF", shade: undefined };
    if (n.kind === "path") return { ...n, stroke: FADE, firstRead: false, tag: undefined, fill: n.fill === "none" ? "none" : FADE };
    if (n.kind === "shape") return { ...n, stroke: FADE, fill: n.fill === "none" ? "none" : FADE };
    return n;
  });
  return { ...scene, nodes };
}

/** What `letter` does on each play, in playbook order; plays without him are left out. */
export function assignmentsFor<P extends { scene: Scene }>(plays: P[], letter: string): Assignment<P>[] {
  const want = letter.trim().toUpperCase();
  const out: Assignment<P>[] = [];
  for (const play of plays) {
    const player = visiblePlayers(play.scene).find((n) => n.label.trim().toUpperCase() === want);
    if (!player) continue;
    const lines = linesOf(play.scene, player);
    out.push({ play, player, lines, scene: spotlight(play.scene, player, lines) });
  }
  return out;
}
