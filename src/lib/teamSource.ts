import { useEffect } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import {
  blankMyTeam,
  cleanDepth,
  cleanMyTeam,
  cleanPlayer,
  HUB_LIMITS,
  MY_TEAM_ID,
  type MyTeamDoc,
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

/** The coach's own team, kept in this browser and copied to the account while signed in (see `MyTeamSync`). */
export type MyTeam = MyTeamDoc;
export { MY_TEAM_ID };

const KEY = "grid1ronvault.myteam.v1";
const listeners = new Set<(from: "local" | "account") => void>();

export function loadMyTeam(): MyTeam {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? cleanMyTeam(JSON.parse(raw)) : blankMyTeam();
  } catch {
    return blankMyTeam();
  }
}

function store(team: MyTeam) {
  try {
    localStorage.setItem(KEY, JSON.stringify(team));
  } catch {
    throw new Error("This browser won't let us save the roster. Turn off private browsing, or free some space, and try again.");
  }
}

/** Save a change made here: it gets a new time, and the account copy follows a moment later. */
export function saveMyTeam(team: MyTeam) {
  store({ ...team, updatedAt: new Date().toISOString() });
  listeners.forEach((l) => l("local"));
}

/** Called after every change; `account` means the account's newer copy replaced this browser's. */
export function onMyTeam(listener: (from: "local" | "account") => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const hasData = (t: MyTeam) => t.players.length > 0 || t.charts.some((c) => c.slots.length > 0) || t.name !== "My team" || !!t.level || !!t.season;

/** What the account holds, so an unchanged team isn't sent again. */
let sentAt = "";

async function pushMyTeam() {
  const team = loadMyTeam();
  if (!team.updatedAt || team.updatedAt === sentAt || !hasData(team)) return;
  try {
    const res = await api.saveMyTeam(team);
    sentAt = res.team?.updatedAt ?? team.updatedAt;
  } catch {
    /* still saved in this browser; the next change tries again */
  }
}

/**
 * Mounted once, under the sign-in provider. Signing in pulls the account's
 * copy and keeps whichever is newer; every change here pushes a moment later.
 */
export function MyTeamSync() {
  const { account } = useAuth();
  const id = account?.id;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: number | undefined;
    const off = onMyTeam((from) => {
      if (from !== "local" || !alive) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pushMyTeam(), PUSH_DELAY_MS);
    });
    // Pull first, so a fresh browser never sends an empty team over the account's.
    api
      .myTeam()
      .then(({ team: remote }) => {
        if (!alive || !remote) return;
        const local = loadMyTeam();
        if (remote.updatedAt > local.updatedAt || !hasData(local)) {
          store(remote);
          sentAt = remote.updatedAt;
          listeners.forEach((l) => l("account"));
        } else if (remote.updatedAt === local.updatedAt) sentAt = local.updatedAt;
      })
      .catch(() => {
        /* offline: the team in this browser still works */
      })
      .finally(() => {
        if (alive) void pushMyTeam();
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      off();
    };
  }, [id]);

  return null;
}

const PUSH_DELAY_MS = 1500;

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
