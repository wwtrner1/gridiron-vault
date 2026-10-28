import { api } from "./api";
import {
  cleanDepth,
  cleanPlayer,
  DEPTH_UNITS,
  HUB_LIMITS,
  type DepthChart,
  type DepthSlot,
  type DepthUnit,
  type HubPlayer,
  type PlayerInfo,
} from "./teamHub";

/**
 * Where a roster and its depth chart live. The Front Office reads and writes a
 * team on the account; My team keeps one team in this browser. The Roster and
 * Depth chart tabs only talk to this, so both use the same screens.
 */
export type TeamSource = {
  roster(): Promise<{ players: HubPlayer[] }>;
  addPlayers(players: PlayerInfo[]): Promise<{ players: HubPlayer[]; added: number }>;
  updatePlayer(id: string, player: PlayerInfo): Promise<{ players: HubPlayer[] }>;
  deletePlayer(id: string): Promise<{ players: HubPlayer[] }>;
  depthCharts(): Promise<{ charts: DepthChart[] }>;
  saveDepth(unit: DepthUnit, slots: DepthSlot[]): Promise<{ charts: DepthChart[] }>;
};

/** A Front Office team, through the API. */
export const hubSource = (teamId: string): TeamSource => ({
  roster: () => api.roster(teamId),
  addPlayers: (players) => api.addPlayers(teamId, players),
  updatePlayer: (id, player) => api.updatePlayer(id, player),
  deletePlayer: (id) => api.deletePlayer(id),
  depthCharts: () => api.depthCharts(teamId),
  saveDepth: (unit, slots) => api.saveDepth(teamId, unit, slots),
});

/* --------------------------------------------------------------- My team --- */

/** The coach's own team, kept in this browser like the Assignments roster. */
export type MyTeam = { name: string; level: string; season: string; players: HubPlayer[]; charts: DepthChart[] };

const KEY = "grid1ronvault.myteam.v1";
export const MY_TEAM_ID = "my-team";

const blank = (): MyTeam => ({ name: "My team", level: "", season: "", players: [], charts: [] });

export function loadMyTeam(): MyTeam {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<MyTeam> | null;
    if (!raw || typeof raw !== "object") return blank();
    const players = (Array.isArray(raw.players) ? raw.players : []).flatMap((p): HubPlayer[] => {
      const info = cleanPlayer(p);
      const id = (p as Partial<HubPlayer>)?.id;
      return typeof info === "string" || typeof id !== "string" ? [] : [{ ...info, id, teamId: MY_TEAM_ID, updatedAt: String(p.updatedAt ?? "") }];
    });
    const ids = new Set(players.map((p) => p.id));
    const charts = (Array.isArray(raw.charts) ? raw.charts : []).flatMap((c): DepthChart[] =>
      DEPTH_UNITS.includes(c?.unit) ? [{ unit: c.unit, slots: cleanDepth(c.slots, ids), updatedAt: String(c.updatedAt ?? "") }] : [],
    );
    return {
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, HUB_LIMITS.name) : "My team",
      level: typeof raw.level === "string" ? raw.level.slice(0, HUB_LIMITS.short) : "",
      season: typeof raw.season === "string" ? raw.season.slice(0, HUB_LIMITS.short) : "",
      players,
      charts,
    };
  } catch {
    return blank();
  }
}

export function saveMyTeam(team: MyTeam) {
  try {
    localStorage.setItem(KEY, JSON.stringify(team));
  } catch {
    throw new Error("This browser won't let us save the roster. Turn off private browsing, or free some space, and try again.");
  }
}

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Same checks as the server, so a pasted sheet behaves the same here as in the Front Office. */
function checked(info: PlayerInfo): PlayerInfo {
  const clean = cleanPlayer(info);
  if (typeof clean === "string") throw new Error(clean);
  return clean;
}

export const localSource = (): TeamSource => {
  const write = (change: (t: MyTeam) => MyTeam) => {
    const next = change(loadMyTeam());
    saveMyTeam(next);
    return next;
  };
  const now = () => new Date().toISOString();
  return {
    roster: async () => ({ players: loadMyTeam().players }),
    addPlayers: async (list) => {
      const team = loadMyTeam();
      const room = HUB_LIMITS.players - team.players.length;
      if (room <= 0) throw new Error(`A roster holds ${HUB_LIMITS.players} players. Remove someone first.`);
      const added = list.slice(0, room).map((p) => ({ ...checked(p), id: newId(), teamId: MY_TEAM_ID, updatedAt: now() }));
      const next = write((t) => ({ ...t, players: [...t.players, ...added] }));
      return { players: next.players, added: added.length };
    },
    updatePlayer: async (id, player) => {
      const info = checked(player);
      const next = write((t) => ({ ...t, players: t.players.map((p) => (p.id === id ? { ...p, ...info, updatedAt: now() } : p)) }));
      return { players: next.players };
    },
    deletePlayer: async (id) => {
      const next = write((t) => ({
        ...t,
        players: t.players.filter((p) => p.id !== id),
        charts: t.charts.map((c) => ({ ...c, slots: c.slots.map((s) => ({ ...s, playerIds: s.playerIds.filter((x) => x !== id) })) })),
      }));
      return { players: next.players };
    },
    depthCharts: async () => ({ charts: loadMyTeam().charts }),
    saveDepth: async (unit, slots) => {
      const next = write((t) => {
        const clean = cleanDepth(slots, new Set(t.players.map((p) => p.id)));
        return { ...t, charts: [...t.charts.filter((c) => c.unit !== unit), { unit, slots: clean, updatedAt: now() }] };
      });
      return { charts: next.charts };
    },
  };
};
