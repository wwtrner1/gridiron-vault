import { useSyncExternalStore } from "react";
import { COVERAGES, defenseNodes, FLAG_LOOKS, FRONTS, layoutDefense, layoutFlagDefense } from "./defense";
import type { Coverage, FlagLook, Front } from "./defense";
import { isLineman } from "./formations";
import type { PlayerNode, Scene } from "./types";
import { CANVAS_W } from "./types";

/**
 * "Vs defense": a saved play shown faded under the one being drawn, so a coach
 * can check routes against the coverage. Remembered per play in this browser;
 * it is a drawing aid only and never prints or saves into the play.
 *
 * Besides a saved play id, the value can be a stock look from the Opponent
 * front in the play drawer: "look:4-3|Cover 3" (11-man front and coverage) or
 * "look:flag|1 rush · Cover 2" (5-on-5), built around this play's offense.
 */
const KEY = "grid1ronvault.overlay.v1";

type Map_ = Record<string, string>;

function read(): Map_ {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Map_) : {};
  } catch {
    return {};
  }
}

let state: Map_ = read();
const listeners = new Set<() => void>();

export const overlayStore = {
  set(playId: string, overlayId: string | null) {
    const next = { ...state };
    if (overlayId) next[playId] = overlayId;
    else delete next[playId];
    state = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage blocked — the choice still holds this visit */
    }
    listeners.forEach((l) => l());
  },
};

/** The play shown under `playId` ("draft" for a play not saved yet), or null. */
export function useOverlay(playId: string): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state[playId] ?? null,
  );
}

export type OpponentLook = { kind: "front"; front: Front; coverage: Coverage } | { kind: "flag"; look: FlagLook };

export const lookValue = (look: OpponentLook) => (look.kind === "flag" ? `look:flag|${look.look}` : `look:${look.front}|${look.coverage}`);

/** The stock look an overlay value names, or null for a saved play (or anything unreadable). */
export function parseLook(value: string | null): OpponentLook | null {
  if (!value?.startsWith("look:")) return null;
  const [a, b] = value.slice(5).split("|");
  if (a === "flag") return (FLAG_LOOKS as readonly string[]).includes(b) ? { kind: "flag", look: b as FlagLook } : null;
  return (FRONTS as readonly string[]).includes(a) && (COVERAGES as readonly string[]).includes(b) ? { kind: "front", front: a as Front, coverage: b as Coverage } : null;
}

export const lookName = (look: OpponentLook) => (look.kind === "flag" ? look.look : `${look.front} ${look.coverage}`);

/**
 * A stock look drawn as a scene to lay under the play, lined up on its ball
 * (the center, else the middle) with man lines to its receivers, like the
 * Defense library's drop. `rushUnits` puts a flag rusher on the rush line.
 */
export function lookScene(scene: Scene, look: OpponentLook, rushUnits: number): Scene {
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf);
  const offense = players.filter((p) => p.side === "offense");
  const center = offense.find((p) => p.label === "C");
  const ball = { x: center?.x ?? CANVAS_W / 2, y: scene.losY };
  const hasLine = offense.some(isLineman);
  const receivers = offense
    .filter((p) => p.label && p.label !== "Q" && !isLineman(p) && !(hasLine && p.label === "C"))
    .map((p) => ({ dx: p.x - ball.x, dy: p.y - ball.y }));
  const layout = look.kind === "flag" ? layoutFlagDefense(look.look, rushUnits, receivers) : layoutDefense(look.front, look.coverage, receivers);
  return { ...scene, nodes: defenseNodes(layout, ball, true, 0) };
}
