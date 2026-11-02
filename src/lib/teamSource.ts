import { useEffect } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import {
  blankMyTeam,
  cleanDepth,
  cleanMyTeams,
  cleanPlayer,
  HUB_LIMITS,
  MY_TEAM_ID,
  MY_TEAMS_MAX,
  type MyTeamDoc,
  type MyTeamsDoc,
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
  /** Where this team's player documents and pictures are filed on the account (`/api/player-files/<scope>/…`). */
  fileScope: string;
  roster(): Promise<{ players: HubPlayer[] }>;
  addPlayers(players: PlayerInfo[]): Promise<{ players: HubPlayer[]; added: number }>;
  updatePlayer(id: string, player: PlayerInfo): Promise<{ players: HubPlayer[] }>;
  deletePlayer(id: string): Promise<{ players: HubPlayer[] }>;
  /** Several at once (the roster's Remove selected). */
  deletePlayers(ids: string[]): Promise<{ players: HubPlayer[] }>;
  depthCharts(): Promise<{ charts: DepthChart[] }>;
  saveDepth(unit: DepthUnit, slots: DepthSlot[]): Promise<{ charts: DepthChart[] }>;
};

/** A Front Office team, through the API. */
export const hubSource = (teamId: string): TeamSource => ({
  fileScope: teamId,
  roster: () => api.roster(teamId),
  addPlayers: (players) => api.addPlayers(teamId, players),
  updatePlayer: (id, player) => api.updatePlayer(id, player),
  deletePlayer: (id) => api.deletePlayer(id),
  deletePlayers: (ids) => api.deletePlayers(teamId, ids),
  depthCharts: () => api.depthCharts(teamId),
  saveDepth: (unit, slots) => api.saveDepth(teamId, unit, slots),
});

/* --------------------------------------------------------------- My team --- */

/** The coach's own teams, kept in this browser and copied to the account while signed in (see `MyTeamSync`). */
export type MyTeam = MyTeamDoc;
export { MY_TEAM_ID };

const KEY = "grid1ronvault.myteams.v1";
/** Where the single team lived before a coach could keep more than one; read once to move it over. */
const OLD_KEY = "grid1ronvault.myteam.v1";
/** The team this browser has open. */
const PICK_KEY = "grid1ronvault.myteamPick.v1";
const listeners = new Set<(from: "local" | "account") => void>();

export function loadMyTeams(): MyTeamsDoc {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    const doc = raw ? cleanMyTeams(JSON.parse(raw)) : { teams: [], updatedAt: "" };
    return doc.teams.length ? doc : { teams: [blankMyTeam()], updatedAt: doc.updatedAt };
  } catch {
    return { teams: [blankMyTeam()], updatedAt: "" };
  }
}

/** The id of the team open in this browser (the first team when the pick is gone). */
export function currentTeamId(doc = loadMyTeams()): string {
  let pick = "";
  try {
    pick = localStorage.getItem(PICK_KEY) ?? "";
  } catch {
    /* private window: the first team */
  }
  return doc.teams.some((t) => t.id === pick) ? pick : doc.teams[0].id;
}

export function pickMyTeam(id: string) {
  try {
    localStorage.setItem(PICK_KEY, id);
  } catch {
    /* the pick lasts this visit */
  }
}

/** One team: the open one unless an id is given. */
export function loadMyTeam(id?: string): MyTeam {
  const doc = loadMyTeams();
  const want = id ?? currentTeamId(doc);
  return doc.teams.find((t) => t.id === want) ?? doc.teams[0];
}

function store(doc: MyTeamsDoc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    localStorage.removeItem(OLD_KEY);
  } catch {
    throw new Error("This browser won't let us save the roster. Turn off private browsing, or free some space, and try again.");
  }
}

const stamp = () => new Date().toISOString();

/** Save a change to one team: it gets a new time, and the account copy follows a moment later. */
export function saveMyTeam(team: MyTeam) {
  const doc = loadMyTeams();
  const at = stamp();
  const next = { ...team, updatedAt: at };
  const teams = doc.teams.some((t) => t.id === team.id) ? doc.teams.map((t) => (t.id === team.id ? next : t)) : [...doc.teams, next];
  store({ teams, updatedAt: at });
  listeners.forEach((l) => l("local"));
}

let teamSeq = 0;
/** A new, empty team, opened in this browser. */
export function addMyTeam(name: string): MyTeam {
  const doc = loadMyTeams();
  if (doc.teams.length >= MY_TEAMS_MAX) throw new Error(`My team holds ${MY_TEAMS_MAX} teams. Remove one you no longer coach first.`);
  const team = { ...blankMyTeam(`t${Date.now().toString(36)}${(teamSeq++).toString(36)}`, name.trim().slice(0, HUB_LIMITS.name) || "New team"), updatedAt: stamp() };
  store({ teams: [...doc.teams, team], updatedAt: team.updatedAt });
  pickMyTeam(team.id);
  listeners.forEach((l) => l("local"));
  return team;
}

/** Removes a team and its players' files on the account; the last team left is emptied instead. */
export function removeMyTeam(id: string) {
  const doc = loadMyTeams();
  const at = stamp();
  const left = doc.teams.filter((t) => t.id !== id);
  store({ teams: left.length ? left : [{ ...blankMyTeam(), updatedAt: at }], updatedAt: at });
  void api.dropPlayerFiles(localScope(id)).catch(() => undefined);
  listeners.forEach((l) => l("local"));
}

/** Called after every change; `account` means the account's newer copy replaced this browser's. */
export function onMyTeam(listener: (from: "local" | "account") => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const hasData = (d: MyTeamsDoc) =>
  d.teams.length > 1 || d.teams.some((t) => t.players.length > 0 || t.charts.some((c) => c.slots.length > 0) || t.name !== "My team" || !!t.level || !!t.season);

/** What the account holds, so an unchanged team isn't sent again. */
let sentAt = "";

async function pushMyTeam() {
  const doc = loadMyTeams();
  if (!doc.updatedAt || doc.updatedAt === sentAt || !hasData(doc)) return;
  try {
    const res = await api.saveMyTeams(doc);
    sentAt = res.teams?.updatedAt ?? doc.updatedAt;
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
      .myTeams()
      .then(({ teams: remote }) => {
        if (!alive || !remote || !remote.teams.length) return;
        const local = loadMyTeams();
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
    // A change made with no signal goes up when the signal is back (a no-op when the account is current).
    const online = () => void pushMyTeam();
    window.addEventListener("online", online);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      off();
    };
  }, [id]);

  return null;
}

/** Where one of this browser's teams files its players' documents on the account. */
export const localScope = (teamId: string) => `my.${teamId}`;

const PUSH_DELAY_MS = 1500;

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Same checks as the server, so a pasted sheet behaves the same here as in the Front Office. */
function checked(info: PlayerInfo): PlayerInfo {
  const clean = cleanPlayer(info);
  if (typeof clean === "string") throw new Error(clean);
  return clean;
}

export const localSource = (teamId: string = currentTeamId()): TeamSource => {
  const write = (change: (t: MyTeam) => MyTeam) => {
    const next = change(loadMyTeam(teamId));
    saveMyTeam(next);
    return next;
  };
  const now = () => new Date().toISOString();
  const drop = (ids: string[]) =>
    write((t) => ({
      ...t,
      players: t.players.filter((p) => !ids.includes(p.id)),
      charts: t.charts.map((c) => ({ ...c, slots: c.slots.map((s) => ({ ...s, playerIds: s.playerIds.filter((x) => !ids.includes(x)) })) })),
    }));
  // A removed player's documents on the account go too (nothing to do when signed out).
  const dropFiles = (ids: string[]) => ids.forEach((id) => void api.dropPlayerFiles(localScope(teamId), id).catch(() => undefined));
  return {
    fileScope: localScope(teamId),
    roster: async () => ({ players: loadMyTeam(teamId).players }),
    addPlayers: async (list) => {
      const team = loadMyTeam(teamId);
      const room = HUB_LIMITS.players - team.players.length;
      if (room <= 0) throw new Error(`A roster holds ${HUB_LIMITS.players} players. Remove someone first.`);
      const added = list.slice(0, room).map((p) => ({ ...checked(p), id: newId(), teamId, updatedAt: now() }));
      const next = write((t) => ({ ...t, players: [...t.players, ...added] }));
      return { players: next.players, added: added.length };
    },
    updatePlayer: async (id, player) => {
      const info = checked(player);
      const next = write((t) => ({ ...t, players: t.players.map((p) => (p.id === id ? { ...p, ...info, updatedAt: now() } : p)) }));
      return { players: next.players };
    },
    deletePlayer: async (id) => {
      dropFiles([id]);
      return { players: drop([id]).players };
    },
    deletePlayers: async (ids) => {
      dropFiles(ids);
      return { players: drop(ids).players };
    },
    depthCharts: async () => ({ charts: loadMyTeam(teamId).charts }),
    saveDepth: async (unit, slots) => {
      const next = write((t) => {
        const clean = cleanDepth(slots, new Set(t.players.map((p) => p.id)));
        return { ...t, charts: [...t.charts.filter((c) => c.unit !== unit), { unit, slots: clean, updatedAt: now() }] };
      });
      return { charts: next.charts };
    },
  };
};
