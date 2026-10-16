import { BLOCK_IDS, ROUTE_IDS, type AssistantRead } from "../../src/lib/assistant.js";
import { FORMATION_NAMES, GAME_TYPES, type GameType } from "../../src/lib/formations.js";

/** Every action a read may name: routes, blocks and motion. */
export const ACTIONS = new Set([...ROUTE_IDS, ...BLOCK_IDS, "motion"]);

/** Trust nothing the model returns without checking it against our own lists. */
export function cleanAssignments(list: unknown): AssistantRead["assignments"] {
  let read = false;
  return (Array.isArray(list) ? (list as AssistantRead["assignments"]) : [])
    .filter((a) => a && typeof a.player === "string" && ACTIONS.has(a.action))
    .slice(0, 11)
    .map((a) => {
      const first = Boolean(a.firstRead) && !read && a.kind === "route";
      if (first) read = true;
      return {
        player: a.player.slice(0, 3).toUpperCase(),
        kind: (["route", "block", "motion"].includes(a.kind) ? a.kind : "route") as AssistantRead["assignments"][number]["kind"],
        action: a.action,
        toward: a.toward === "in" || a.toward === "out" ? a.toward : undefined,
        firstRead: first || undefined,
        heard: String(a.heard ?? "").slice(0, 80),
      };
    });
}

/** A whole read from the model (Play assistant or Griddy), checked field by field. */
export function cleanRead(raw: Partial<AssistantRead> | undefined, game: GameType, fallbackName: string): AssistantRead {
  const r = raw ?? {};
  return {
    formation: FORMATION_NAMES.includes(r.formation as string) ? (r.formation as string) : FORMATION_NAMES[0],
    game: GAME_TYPES.some((g) => g.id === r.game) ? (r.game as GameType) : game,
    personnel: typeof r.personnel === "string" ? r.personnel.slice(0, 2) : undefined,
    name: String(r.name || fallbackName).slice(0, 80),
    assignments: cleanAssignments(r.assignments),
    unsure: (Array.isArray(r.unsure) ? r.unsure : []).map((q) => String(q).slice(0, 200)).slice(0, 4),
  };
}
