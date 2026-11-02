import type { HubPlayer } from "./teamHub";
import type { TeamSource } from "./teamSource";

/**
 * The roster on screen, for Griddy's "remove these players" and "mark him
 * injured". The Roster tab (My team or a Front Office team) sets it while it
 * shows a team and clears it when it closes; Griddy's roster card writes
 * through its source and hands the new list back so the tab updates. Tiny and
 * type-only, so the roster screens load nothing more for it.
 */
export type GriddyRoster = {
  team: string;
  players: HubPlayer[];
  source: TeamSource;
  onChange: (players: HubPlayer[]) => void;
};

let current: GriddyRoster | null = null;

/** Returns the cleanup that clears it, unless another roster took its place meanwhile. */
export function setGriddyRoster(roster: GriddyRoster): () => void {
  current = roster;
  return () => {
    if (current === roster) current = null;
  };
}

export const griddyRoster = (): GriddyRoster | null => current;
