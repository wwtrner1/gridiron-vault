import { assignmentPath } from "./assistant";
import type { Assignment } from "./assistant";
import { ZONE_FILL, ZONE_STROKE } from "./defense";
import { isLineman } from "./formations";
import { makeShape, reconcileConnections } from "./scene";
import { baseNode, CANVAS_W } from "./types";
import type { PathNode, PlayerNode, Point, Scene, SceneNode } from "./types";

/**
 * Route library, from the Grid1ron Design canvas (Designer · assistant,
 * tools…): drag a tile onto a player, or pick players and click a tile.
 * Icons are drawn in a 56×44 box for a receiver on the right of the
 * formation: he stands at (28, 40), outside-breaking routes go right toward
 * the sideline and inside-breaking routes go left toward the middle.
 */
export type Tile = {
  id: string;
  label: string;
  num?: number;
  kind: "route" | "block" | "motion" | "handoff" | "pitch" | "zone" | "man" | "rush";
  /** Route or block id from routes.ts. */
  action?: string;
  icon: string;
  /** Who the tile is for. */
  side: "offense" | "defense";
};

const R = (id: string, label: string, icon: string, num?: number): Tile => ({ id, label, num, kind: "route", action: id, icon, side: "offense" });

/** The route tree, numbered as the canvas numbers it. */
export const OUR_TREE: Tile[] = [
  R("flat", "Flat", "M28 40 L30 34 L52 30", 1),
  R("slant", "Slant", "M28 40 L28 32 L8 12", 2),
  R("comeback", "Comeback", "M28 40 L28 10 L40 18", 3),
  R("curl", "Curl", "M28 40 L28 10 L20 18", 4),
  R("out", "Out", "M28 40 L28 18 L52 18", 5),
  R("dig", "Dig", "M28 40 L28 16 L4 16", 6),
  R("corner", "Corner", "M28 40 L28 20 L50 4", 7),
  R("post", "Post", "M28 40 L28 20 L8 4", 8),
  R("go", "Go", "M28 40 L28 4", 9),
];

/** The quick-game routes flag teams lean on. */
export const FIVE_SET: Tile[] = [
  R("bubble", "Bubble", "M28 40 L32 42 Q42 44 52 40"),
  R("hitch", "Hitch", "M28 40 L28 18 L32 24"),
  R("slant", "Slant", "M28 40 L28 32 L8 12"),
  R("out", "Out", "M28 40 L28 22 L52 22"),
  R("drag", "Drag", "M28 40 L28 34 L4 30"),
  R("corner", "Corner", "M28 40 L28 20 L50 4"),
  R("post", "Post", "M28 40 L28 20 L8 4"),
  R("go", "Go", "M28 40 L28 4"),
  R("wheel", "Wheel", "M28 40 Q44 44 48 26 L50 4"),
];

export const MORE_TILES: Tile[] = [
  { id: "handoff", label: "Handoff", kind: "handoff", icon: "M28 40 L28 24 M20 24 L36 24", side: "offense" },
  { id: "pitch", label: "Pitch", kind: "pitch", icon: "M14 36 Q30 20 46 34", side: "offense" },
  { id: "motion", label: "Motion", kind: "motion", icon: "M8 34 q4 -6 8 0 t8 0 t8 0 L46 34", side: "offense" },
  { id: "zone", label: "Zone", kind: "zone", icon: "M28 40 L28 18 M12 14 a16 7 0 1 0 32 0 a16 7 0 1 0 -32 0", side: "defense" },
  { id: "man", label: "Man", kind: "man", icon: "M12 10 L44 36", side: "defense" },
  { id: "rush", label: "Rush", kind: "rush", icon: "M28 6 L28 38 M20 38 L36 38", side: "defense" },
  { id: "block", label: "Block", kind: "block", action: "base", icon: "M28 40 L28 16 M20 16 L36 16", side: "offense" },
];

const ARROW = "#0B1524";

/** Who's on the field: everyone, and the offense players who run routes. */
function cast(scene: Scene) {
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden);
  const receivers = players.filter((p) => p.side === "offense" && p.label && p.label.toUpperCase() !== "Q" && !isLineman(p));
  return { players, receivers };
}

function line(from: Point, to: Point, opts: Partial<PathNode>, z: number): PathNode {
  return {
    ...baseNode({ x: from.x, y: from.y, z, name: "Line" }),
    kind: "path",
    points: [{ x: 0, y: 0 }, { x: to.x - from.x, y: to.y - from.y }],
    handles: {},
    style: "solid",
    curve: "straight",
    startCap: "none",
    endCap: "arrow",
    stroke: ARROW,
    width: 3,
    closed: false,
    fill: "none",
    fillOpacity: 0,
    fromId: null,
    toId: null,
    ...opts,
  };
}

export type ApplyResult = { scene: Scene; ids: string[]; message: string } | { error: string };

/**
 * Gives each chosen player the tile's job. A player's earlier job from the
 * library or a preset is replaced, so clicking another tile swaps the route.
 */
export function applyTile(scene: Scene, tile: Tile, playerIds: string[], ink: string, width: number, z: number): ApplyResult {
  const { players, receivers } = cast(scene);
  const chosen = players.filter((p) => playerIds.includes(p.id));
  if (!chosen.length) return { error: `Pick a player first, or drag ${tile.label} onto one.` };
  const runners = (p: PlayerNode) =>
    chosen.length === 1 || !(tile.kind === "route" || tile.kind === "block" || tile.kind === "motion") || (p.label.toUpperCase() !== "Q" && !!p.label);
  const fits = chosen.filter((p) => (tile.side === "defense" ? p.side === "defense" : p.side === "offense") && runners(p));
  if (!fits.length)
    return { error: tile.side === "defense" ? `${tile.label} is for defenders. Pick a defender.` : `${tile.label} is for the offense. Pick an offensive player.` };

  const added: SceneNode[] = [];
  let zi = z;
  for (const p of fits) {
    const from = { x: p.x, y: p.y };
    const own = { stroke: ink, width, assignOf: p.id };
    switch (tile.kind) {
      case "route":
      case "block":
      case "motion": {
        const a: Assignment = { player: p.label, kind: tile.kind, action: tile.action ?? tile.kind, heard: "" };
        added.push({ ...assignmentPath(a, from, scene.losY, zi++), ...own, name: `${p.label || "Player"} ${tile.label}` });
        break;
      }
      case "handoff":
      case "pitch":
        // Two players are involved, so the Designer draws these with `exchangeLine`.
        return { error: `Click the player with the ball, then the one getting the ${tile.label.toLowerCase()}.` };
      case "rush": {
        const a: Assignment = { player: p.label, kind: "route", action: "rush", heard: "" };
        added.push({ ...assignmentPath(a, from, scene.losY, zi++), ...own, name: `${p.label || "Defender"} rush` });
        break;
      }
      case "man": {
        const target = [...receivers].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (!target) return { error: "There's no receiver on the play to cover. Drop an offense first." };
        added.push(line(from, target, { ...own, stroke: ZONE_STROKE, style: "dashed", name: `${p.label || "Defender"} man on ${target.label}` }, zi++));
        break;
      }
      case "zone": {
        // A shaded drop area deeper than the defender, toward the middle of his side.
        const c = { x: Math.min(CANVAS_W - 120, Math.max(120, p.x + (CANVAS_W / 2 - p.x) * 0.15)), y: Math.max(60, p.y - 110) };
        added.push({ ...makeShape("ellipse", c, 220, 78, ZONE_STROKE, zi++), name: `${p.label || "Defender"} zone`, fill: ZONE_FILL, fillOpacity: 0.85, width: 1.6, dash: "dashed" });
        added.push(line(from, c, { ...own, stroke: ZONE_STROKE, style: "dashed", endCap: "dot", name: `${p.label || "Defender"} drop` }, zi++));
        break;
      }
    }
  }
  const replaced = new Set(fits.map((p) => p.id));
  const kept = scene.nodes.filter((n) => !(n.kind === "path" && n.assignOf && replaced.has(n.assignOf)));
  const who = fits.map((p) => p.label || "player").join(", ");
  return {
    scene: { ...scene, nodes: [...kept, ...added] },
    ids: added.map((n) => n.id),
    message: `${tile.label} for ${who}.${skippedNote(chosen, fits, tile)}`,
  };
}

/**
 * Drops a tile on the empty field at `at`, for a coach who clicked a tile
 * with nobody picked: the route starts where they clicked, belongs to no one
 * yet ("Snap to nearest player" glues it on later), and breaks toward the
 * near sideline like a library route does.
 */
export function placeTile(scene: Scene, tile: Tile, at: Point, ink: string, width: number, z: number): ApplyResult {
  const own = { stroke: ink, width };
  switch (tile.kind) {
    case "route":
    case "block":
    case "motion":
    case "rush": {
      const kind = tile.kind === "rush" ? "route" : tile.kind;
      const a: Assignment = { player: "", kind, action: tile.action ?? tile.kind, heard: "" };
      const node = { ...assignmentPath(a, at, scene.losY, z), ...own, name: tile.label };
      return { scene: { ...scene, nodes: [...scene.nodes, node] }, ids: [node.id], message: `${tile.label} placed. Right-click it and pick Snap to nearest player to give it to someone.` };
    }
    case "handoff":
    case "pitch": {
      // Just the mark, where the coach clicked: a pitch goes out and back toward the near sideline.
      const pitch = tile.kind === "pitch";
      const out = at.x < CANVAS_W / 2 ? -1 : 1;
      const end = pitch ? { x: at.x + out * 120, y: at.y + 30 } : { x: at.x + out * 56, y: at.y };
      const node = line(at, end, { ...own, name: tile.label, style: pitch ? "dashed" : "solid", endCap: pitch ? "arrow" : "none" }, z);
      return {
        scene: { ...scene, nodes: [...scene.nodes, node] },
        ids: [node.id],
        message: `${tile.label} drawn. Drag it into place, or drag its ends to the players.`,
      };
    }
    case "zone": {
      const node = { ...makeShape("ellipse", at, 220, 78, ZONE_STROKE, z), name: "Zone", fill: ZONE_FILL, fillOpacity: 0.85, width: 1.6, dash: "dashed" as const };
      return { scene: { ...scene, nodes: [...scene.nodes, node] }, ids: [node.id], message: "Zone dropped. Drag its handles to fit the area." };
    }
    case "man":
      return { error: "Man coverage goes from a defender to a receiver. Click a defender." };
  }
}

/**
 * A handoff or pitch from any player to another player (or to a spot on the
 * field). Nobody has to be tagged Q: the coach picks who has the ball. The
 * line is glued to both players (`fromId`/`toId`), so it follows either one
 * when they move, and it leaves the receiver's own route alone.
 */
export function exchangeLine(
  scene: Scene,
  tile: Tile,
  giverId: string,
  to: { playerId: string | null; at: Point },
  ink: string,
  width: number,
  z: number,
): ApplyResult {
  const giver = scene.nodes.find((n): n is PlayerNode => n.id === giverId && n.kind === "player");
  if (!giver) return { error: `That player is gone. Click who has the ball for the ${tile.label.toLowerCase()}.` };
  if (to.playerId === giver.id) return { error: `Click a different player to take the ${tile.label.toLowerCase()}.` };
  const target = to.playerId ? scene.nodes.find((n): n is PlayerNode => n.id === to.playerId && n.kind === "player") : null;
  const pitch = tile.kind === "pitch";
  const node = line(
    giver,
    target ?? to.at,
    {
      stroke: ink,
      width,
      name: `${tile.label} ${giver.label || "player"} to ${target ? target.label || "player" : "spot"}`,
      style: pitch ? "dashed" : "solid",
      endCap: pitch ? "arrow" : "none",
      fromId: giver.id,
      toId: target?.id ?? null,
    },
    z,
  );
  const next = reconcileConnections({ ...scene, nodes: [...scene.nodes, node] });
  const who = (p: PlayerNode) => p.label || "the player";
  return {
    scene: next,
    ids: [node.id],
    message: `${tile.label} from ${who(giver)}${target ? ` to ${who(target)}` : ""}. It follows them when they move.`,
  };
}

/** Why some chosen players didn't get the job, in plain words. */
function skippedNote(chosen: PlayerNode[], fits: PlayerNode[], tile: Tile): string {
  const left = chosen.filter((p) => !fits.includes(p));
  if (!left.length) return "";
  const otherSide = left.filter((p) => (tile.side === "defense" ? p.side !== "defense" : p.side !== "offense")).length;
  const notes: string[] = [];
  if (otherSide) notes.push(`${otherSide} on the other side of the ball`);
  if (left.some((p) => p.label.toUpperCase() === "Q")) notes.push("the quarterback");
  if (left.some((p) => p.side === "offense" && !p.label)) notes.push("the linemen");
  return notes.length ? ` Skipped ${notes.join(", ")}.` : "";
}

/** The player under a drop point, within a token's reach. */
export function playerAt(scene: Scene, at: Point): PlayerNode | null {
  let best: PlayerNode | null = null;
  let bestD = 34;
  for (const n of scene.nodes)
    if (n.kind === "player" && !n.hidden) {
      const d = Math.hypot(n.x - at.x, n.y - at.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
  return best;
}
