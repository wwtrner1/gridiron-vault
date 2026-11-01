import { readToNodes } from "./assistant";
import { LOOKS } from "./coverage";
import { defenseNodes, FLAG_LOOKS, layoutDefense, layoutFlagDefense, mirrorDefense } from "./defense";
import type { DefenseLayout, FlagLook } from "./defense";
import { isLineman } from "./formations";
import { BOX_DEPTH, fitGaps, gapsFrom, zoneJob } from "./gapFits";
import type { DefenseCall } from "./griddy";
import { turnAround } from "./pov";
import { emptyScene } from "./presets";
import type { TokenPreset } from "./presets";
import { CANVAS_W } from "./types";
import type { PlayerNode, Scene, SceneNode } from "./types";

/**
 * A defense Griddy called, laid out by the same libraries the coach uses:
 * the Defense library's fronts and coverages (11-man), the flag looks under
 * the league's rush line (5-on-5) and the Coverage check's seven-man looks
 * (7v7). With `jobs`, every defender carries his job under the token: the
 * gap he fits in the box, his zone (Deep 1/3, Curl, Flat, Hook, Robber) or
 * his man ("Man X").
 */

/** The look's name as the Opponent front and the Coverage check call it. */
export function defenseLookName(call: DefenseCall): string {
  if (call.game === "11") return `${call.front ?? "4-3"} ${call.coverage}`;
  if (call.game === "5v5") return `1 rush · ${call.coverage}`;
  return call.coverage === "Man" ? "Cover 0 (all man)" : call.coverage;
}

function layoutFor(call: DefenseCall, receivers: { dx: number; dy: number }[], rushUnits: number): DefenseLayout {
  if (call.game === "11") return layoutDefense(call.front ?? "4-3", call.coverage, receivers);
  if (call.game === "5v5") {
    const look = (FLAG_LOOKS as readonly string[]).includes(`1 rush · ${call.coverage}`) ? (`1 rush · ${call.coverage}` as FlagLook) : FLAG_LOOKS[0];
    return layoutFlagDefense(look, rushUnits, receivers);
  }
  const seven = LOOKS["7v7"].find((l) => l.id === `7:${call.coverage}`) ?? LOOKS["7v7"][0];
  return seven.layout(receivers, rushUnits);
}

/** The scout offense a call is lined up against when it names a formation: the library's set, turned left when mirrored. */
export function scoutOffense(call: DefenseCall, tokens: TokenPreset[], losY: number): SceneNode[] {
  if (!call.against) return [];
  const nodes = readToNodes({ formation: call.against, game: call.game, name: call.against, assignments: [], unsure: [] }, tokens, losY, 1);
  return call.mirrored ? nodes.map((n) => ({ ...n, x: CANVAS_W - n.x })) : nodes;
}

/** Jobs for a laid-out defense: gaps for the box in 11-man, the coverage for everyone else. */
function jobsFor(call: DefenseCall, layout: DefenseLayout, receivers: { dx: number; dy: number; label: string }[], lineXs: number[]): string[] {
  const deep = layout.zones.filter((z) => z.dy <= -240).length;
  const gaps = call.game === "11" ? fitGaps(layout.defenders.map((d) => ({ x: d.dx, depth: -d.dy })), gapsFrom(lineXs, 0), 0) : [];
  return layout.defenders.map((d, i) => {
    const line = layout.lines.find((l) => l.from === i && l.kind !== "rush");
    // A man defender's job is his man, even a backer in the box; everyone else in the box fits a gap.
    if (line?.kind === "man") {
      const r = receivers.find((x) => Math.abs(x.dx - line.to.dx) < 1 && Math.abs(x.dy - line.to.dy) < 1);
      return r?.label ? `Man ${r.label}` : "Man";
    }
    if (call.game === "11" && -d.dy <= BOX_DEPTH && gaps[i]) return gaps[i]!;
    if (d.job === "rush" || !line) return d.job === "rush" ? (call.game === "11" ? "Blitz" : "Rush") : "";
    const zone = layout.zones.find((z) => z.dx === line.to.dx && z.dy === line.to.dy) ?? { dx: line.to.dx, dy: line.to.dy };
    const robber = (call.coverage === "Cover 1" || call.coverage === "Man") && zone.dy > -240 && Math.abs(zone.dx) < 150;
    return zoneJob(zone, deep, robber);
  });
}

export type BuiltDefense = {
  /** The defenders, their zones and lines, ready to add to the field (and the scout offense, when the call named a formation). */
  nodes: SceneNode[];
  /** Receivers the man defenders could match. */
  receivers: number;
  look: string;
};

/**
 * Lays the call out on `field` (the open play, or a fresh field for a named
 * formation), lined up on the ball: the center if there is one, else the
 * middle. A play drawn from the defense's end is turned round first and the
 * defense turned back with it, so it still faces the offense.
 */
export function buildDefense(call: DefenseCall, field: Scene, tokens: TokenPreset[], rushUnits: number): BuiltDefense {
  const upright = field.pov === "defense" ? turnAround(field) : field;
  const scout = scoutOffense(call, tokens, upright.losY);
  const base: Scene = call.against ? { ...upright, nodes: scout } : upright;
  const players = base.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf);
  const offense = players.filter((p) => p.side === "offense");
  const center = offense.find((p) => p.label === "C");
  const ball = { x: center?.x ?? CANVAS_W / 2, y: base.losY };
  const hasLine = offense.some(isLineman);
  const eligible = offense
    .filter((p) => p.label && p.label !== "Q" && !isLineman(p) && !(hasLine && p.label === "C"))
    .map((p) => ({ dx: p.x - ball.x, dy: p.y - ball.y, label: p.label }));
  const receivers = eligible.map(({ dx, dy }) => ({ dx, dy }));
  const layout = call.flip ? mirrorDefense(layoutFor(call, receivers.map((r) => ({ ...r, dx: -r.dx })), rushUnits)) : layoutFor(call, receivers, rushUnits);
  // Man lines from a flipped layout end on the real receivers again once mirrored back.
  const lineXs = offense.filter((p) => Math.abs(p.y - base.losY) <= 30 && p !== center).map((p) => p.x - ball.x);
  const jobs = call.jobs ? jobsFor(call, layout, eligible, lineXs) : [];
  let defenders = 0;
  let nodes = defenseNodes(layout, ball, true, 1).map((n) => {
    if (n.kind !== "player") return n;
    const job = jobs[defenders++];
    return job ? { ...n, job } : n;
  });
  nodes = [...(call.against ? scout : []), ...nodes];
  if (field.pov === "defense") nodes = turnAround({ ...upright, nodes }).nodes;
  return { nodes, receivers: receivers.length, look: defenseLookName(call) };
}

/** A fresh field for a call with no play open: the scout offense and the defense on the half field. */
export function defenseField(call: DefenseCall, tokens: TokenPreset[], rushUnits: number): Scene {
  const base = emptyScene();
  return { ...base, nodes: buildDefense({ ...call, against: call.against ?? defaultFormation(call) }, base, tokens, rushUnits).nodes };
}

/** The set a defense is drawn against when the coach named none and no play is open. */
export const defaultFormation = (call: DefenseCall) => (call.game === "11" ? "Pro Set" : "Trips Right");
