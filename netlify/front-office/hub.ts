import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organizations, orgMembers, teamPlayers, teams } from "../../db/schema.js";
import { cleanPlayer, cleanTeam, HUB_LIMITS, type HubPlayer, type HubState, type HubTeam, type PlayerInfo } from "../../src/lib/teamHub.js";

/**
 * Team hub routes, behind the sign-in and phone checks. The director of an
 * organisation sees and changes everything in it; an active member coach
 * sees the teams whose staff they are on. Rosters hold minors' contacts and
 * medical notes, so every answer is per-person and `private, no-store`, and a
 * team the coach can't see answers the same 404 as one that doesn't exist.
 */

type Me = { id: string; email: string; name: string };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_TEAM = "That team isn't in a Front Office you're on. Ask your director to add you to its staff.";
const NO_ORG = "That Front Office isn't one you belong to.";
const iso = (d: Date | null) => (d ? d.toISOString() : "");

/** Who this coach is in an organisation: its director, an active coach (with their member id), or nobody. */
type Access = { orgId: string; orgName: string; director: boolean; memberId: string | null };

async function accessTo(me: Me, orgId: string | undefined): Promise<Access | null> {
  if (!orgId || !UUID.test(orgId)) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return null;
  if (org.ownerId === me.id) return { orgId: org.id, orgName: org.name, director: true, memberId: null };
  const [m] = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, me.id), eq(orgMembers.status, "active")));
  return m ? { orgId: org.id, orgName: org.name, director: false, memberId: m.id } : null;
}

const onStaff = (a: Access, t: { coachIds: string[]; allCoaches: boolean }) => a.director || t.allCoaches || (a.memberId !== null && t.coachIds.includes(a.memberId));

/** A team and the coach's access to it, or null when they may not see it. */
async function teamFor(me: Me, teamId: string | undefined) {
  if (!teamId || !UUID.test(teamId)) return null;
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;
  const access = await accessTo(me, team.orgId);
  if (!access || !onStaff(access, team)) return null;
  return { team, access };
}

async function hubState(access: Access): Promise<HubState> {
  const rows = await db
    .select({
      t: teams,
      players: sql<number>`(select count(*)::int from ${teamPlayers} where ${teamPlayers.teamId} = ${teams.id})`,
    })
    .from(teams)
    .where(eq(teams.orgId, access.orgId))
    .orderBy(asc(teams.name));
  const list: HubTeam[] = rows
    .filter((r) => onStaff(access, r.t))
    .map((r) => ({
      id: r.t.id,
      name: r.t.name,
      level: r.t.level,
      season: r.t.season,
      color: r.t.color,
      coachIds: access.director ? r.t.coachIds : [],
      allCoaches: r.t.allCoaches,
      players: r.players,
    }));
  const coaches = access.director
    ? (await db.select().from(orgMembers).where(eq(orgMembers.orgId, access.orgId)).orderBy(asc(orgMembers.email))).map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        active: m.status === "active",
      }))
    : [];
  return { org: { id: access.orgId, name: access.orgName }, role: access.director ? "director" : "coach", teams: list, coaches };
}

const toPlayer = (row: typeof teamPlayers.$inferSelect): HubPlayer => ({
  ...(row.info as PlayerInfo),
  firstName: row.firstName,
  lastName: row.lastName,
  jersey: row.jersey,
  id: row.id,
  teamId: row.teamId,
  updatedAt: iso(row.updatedAt),
});

const playerRow = (p: PlayerInfo) => ({ firstName: p.firstName, lastName: p.lastName, jersey: p.jersey, info: p });

async function roster(teamId: string): Promise<HubPlayer[]> {
  const rows = await db.select().from(teamPlayers).where(eq(teamPlayers.teamId, teamId)).orderBy(asc(teamPlayers.lastName), asc(teamPlayers.firstName));
  return rows.map(toPlayer);
}

/** Member ids the director picked that really are coaches in this organisation. */
async function realCoaches(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ id: orgMembers.id }).from(orgMembers).where(and(eq(orgMembers.orgId, orgId), inArray(orgMembers.id, ids.filter((i) => UUID.test(i)))));
  return rows.map((r) => r.id);
}

/**
 * `/api/hub/:orgId`, `/api/teams[/:id[/players]]` and `/api/team-players/:id`.
 */
export async function hubRoute(me: Me, req: Request, resource: string, id?: string, action?: string): Promise<Response> {
  const method = req.method;
  const body = method === "POST" || method === "PUT" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};

  if (resource === "hub" && method === "GET" && !action) {
    const access = await accessTo(me, id);
    if (!access) return fail(NO_ORG, 404);
    return json(await hubState(access));
  }

  if (resource === "teams") {
    if (method === "POST" && !id) {
      const access = await accessTo(me, String(body.orgId ?? ""));
      if (!access?.director) return fail("Only the director adds teams.", 403);
      const clean = cleanTeam(body);
      if (typeof clean === "string") return fail(clean);
      const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(teams).where(eq(teams.orgId, access.orgId));
      if ((count?.n ?? 0) >= HUB_LIMITS.teams) return fail(`A Front Office holds ${HUB_LIMITS.teams} teams. Remove one you no longer run first.`, 403);
      const [row] = await db
        .insert(teams)
        .values({ ...clean, coachIds: await realCoaches(access.orgId, clean.coachIds), orgId: access.orgId })
        .returning({ id: teams.id });
      return json({ ...(await hubState(access)), created: row.id }, 201);
    }

    const found = await teamFor(me, id);
    if (!found) return fail(NO_TEAM, 404);
    const { team, access } = found;

    if (!action && method === "PUT") {
      if (!access.director) return fail("Only the director changes a team's name and staff.", 403);
      const clean = cleanTeam(body);
      if (typeof clean === "string") return fail(clean);
      await db
        .update(teams)
        .set({ ...clean, coachIds: await realCoaches(access.orgId, clean.coachIds) })
        .where(eq(teams.id, team.id));
      return json(await hubState(access));
    }

    if (!action && method === "DELETE") {
      if (!access.director) return fail("Only the director removes a team.", 403);
      await db.delete(teams).where(eq(teams.id, team.id));
      return json(await hubState(access));
    }

    if (action === "players" && method === "GET") return json({ players: await roster(team.id) });

    if (action === "players" && method === "POST") {
      // One player, or a pasted spreadsheet's worth (`players: [...]`).
      const incoming = Array.isArray(body.players) ? body.players.slice(0, HUB_LIMITS.importRows) : [body.player];
      const clean = incoming.map(cleanPlayer);
      const bad = clean.find((p): p is string => typeof p === "string");
      if (bad && incoming.length === 1) return fail(bad);
      const good = clean.filter((p): p is PlayerInfo => typeof p !== "string");
      if (!good.length) return fail("None of those rows had a player's name.");
      const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(teamPlayers).where(eq(teamPlayers.teamId, team.id));
      if ((count?.n ?? 0) + good.length > HUB_LIMITS.players) return fail(`A roster holds ${HUB_LIMITS.players} players. This would make ${(count?.n ?? 0) + good.length}.`, 403);
      await db.insert(teamPlayers).values(good.map((p) => ({ ...playerRow(p), teamId: team.id })));
      return json({ players: await roster(team.id), added: good.length }, 201);
    }
  }

  if (resource === "team-players" && id && UUID.test(id)) {
    const [row] = await db.select({ teamId: teamPlayers.teamId }).from(teamPlayers).where(eq(teamPlayers.id, id));
    const found = row ? await teamFor(me, row.teamId) : null;
    if (!found) return fail("That player isn't on a roster you can see.", 404);

    if (method === "PUT") {
      const clean = cleanPlayer(body.player);
      if (typeof clean === "string") return fail(clean);
      await db.update(teamPlayers).set({ ...playerRow(clean), updatedAt: new Date() }).where(eq(teamPlayers.id, id));
      return json({ players: await roster(found.team.id) });
    }
    if (method === "DELETE") {
      await db.delete(teamPlayers).where(eq(teamPlayers.id, id));
      return json({ players: await roster(found.team.id) });
    }
  }

  return fail("That address is not part of the playbook API.", 404);
}
