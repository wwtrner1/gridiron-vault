import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { emailOn, sendEmails, sendTexts, smsOn } from "./send.js";
import { dropTeamFiles } from "./files.js";
import { dropSignup, joinToken, signedUpPhones, signups, signupTeam } from "./texts.js";
import { db } from "../../db/index.js";
import { depthCharts, hubEvents, hubMessages, organizations, orgMembers, teamPlayers, teams } from "../../db/schema.js";
import { cleanDepth, cleanEvent, familyContacts, MESSAGE_LIMITS, teamText, type HubMessage, cleanPlayer, SCHEDULE_LIMITS, type EventDraft, type HubEvent, cleanTeam, DEPTH_UNITS, HUB_LIMITS, type DepthChart, type DepthUnit, type HubPlayer, type HubState, type HubTeam, type PlayerInfo } from "../../src/lib/teamHub.js";

/**
 * Team hub routes, behind the sign-in and phone checks. The director of an
 * organisation sees and changes everything in it; an active member coach
 * sees the teams whose staff they are on. Rosters hold minors' contacts and
 * medical notes, so every answer is per-person and `private, no-store`, and a
 * team the coach can't see answers the same 404 as one that doesn't exist.
 */

export type Me = { id: string; email: string; name: string };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_TEAM = "That team isn't in a Front Office you're on. Ask your director to add you to its staff.";
const NO_ORG = "That Front Office isn't one you belong to.";
const iso = (d: Date | null) => (d ? d.toISOString() : "");

/** Who this coach is in an organisation: its director, an active coach (with their member id), or nobody. */
export type Access = { orgId: string; orgName: string; director: boolean; memberId: string | null };

export async function accessTo(me: Me, orgId: string | undefined): Promise<Access | null> {
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

async function depth(teamId: string): Promise<DepthChart[]> {
  const rows = await db.select().from(depthCharts).where(eq(depthCharts.teamId, teamId));
  return rows.map((r) => ({ unit: r.unit as DepthUnit, slots: r.slots as DepthChart["slots"], updatedAt: iso(r.updatedAt) }));
}

const eventRow = (e: EventDraft, shift: number) => ({
  ...e,
  startsAt: new Date(new Date(e.startsAt).getTime() + shift),
  endsAt: e.endsAt ? new Date(new Date(e.endsAt).getTime() + shift) : null,
});

/** Null when this coach may add to or change that calendar (a team they staff, or the whole Front Office for the director). */
export async function mayWrite(me: Me, access: Access, teamId: string | null): Promise<Response | null> {
  if (teamId === null) return access.director ? null : fail("Only the director adds events for the whole Front Office.", 403);
  const found = await teamFor(me, teamId);
  return found && found.team.orgId === access.orgId ? null : fail(NO_TEAM, 404);
}

/** Every event this coach can see: the whole Front Office's, and their teams'. */
async function calendar(me: Me, access: Access): Promise<HubEvent[]> {
  const visible = await staffTeams(access);
  const rows = await db
    .select()
    .from(hubEvents)
    .where(and(eq(hubEvents.orgId, access.orgId), visible.length ? or(isNull(hubEvents.teamId), inArray(hubEvents.teamId, visible)) : isNull(hubEvents.teamId)))
    .orderBy(asc(hubEvents.startsAt))
    .limit(SCHEDULE_LIMITS.events);
  return rows.map((r) => ({
    id: r.id,
    teamId: r.teamId,
    kind: r.kind as HubEvent["kind"],
    title: r.title,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    location: r.location,
    opponent: r.opponent,
    homeAway: r.homeAway as HubEvent["homeAway"],
    notes: r.notes,
    sheetId: r.sheetId,
    scoreUs: r.scoreUs,
    scoreThem: r.scoreThem,
    canceled: r.canceled,
  }));
}

/** Team ids this coach is on the staff of in the organisation. */
export async function staffTeams(access: Access) {
  return (await db.select().from(teams).where(eq(teams.orgId, access.orgId))).filter((t) => onStaff(access, t)).map((t) => t.id);
}

/** The newest messages this coach can see: the whole Front Office's and their teams'. */
async function board(me: Me, access: Access): Promise<HubMessage[]> {
  const visible = await staffTeams(access);
  const rows = await db
    .select()
    .from(hubMessages)
    .where(and(eq(hubMessages.orgId, access.orgId), visible.length ? or(isNull(hubMessages.teamId), inArray(hubMessages.teamId, visible)) : isNull(hubMessages.teamId)))
    .orderBy(desc(hubMessages.createdAt))
    .limit(MESSAGE_LIMITS.list);
  return rows.map((r) => ({
    id: r.id,
    teamId: r.teamId,
    channel: r.channel === "family" ? "family" : "staff",
    authorName: r.authorName,
    mine: r.authorId === me.id,
    subject: r.subject,
    body: r.body,
    emailed: r.emailed,
    texted: r.texted,
    createdAt: iso(r.createdAt),
  }));
}

/**
 * A new message. Staff notes are just saved. A family announcement is saved
 * and, when the site has email or texts set up and the coach asked for them,
 * sent from the server to the team's roster contacts. The browser never
 * chooses the recipients, so this can't be used to message anyone else.
 */
async function post(me: Me, access: Access, body: Record<string, unknown>): Promise<Response> {
  const channel = body.channel === "family" ? "family" : "staff";
  const teamId = typeof body.teamId === "string" && body.teamId ? body.teamId : null;
  const text = typeof body.body === "string" ? body.body.trim().slice(0, MESSAGE_LIMITS.body) : "";
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, MESSAGE_LIMITS.subject) : "";
  if (!text) return fail("Write the message first.");
  const denied = await mayWrite(me, access, teamId);
  if (denied) return denied;
  if (channel === "family" && !teamId) return fail("Pick the team whose families get this.");

  let emailed = 0;
  let texted = 0;
  if (channel === "family" && teamId && (body.email === true || body.sms === true)) {
    const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId));
    const players = (await db.select({ info: teamPlayers.info }).from(teamPlayers).where(eq(teamPlayers.teamId, teamId))).map((r) => r.info as PlayerInfo);
    // Emails go to the roster; texts only to numbers that signed up on the team's link.
    const { emails } = familyContacts(players);
    const phones = body.sms === true ? await signedUpPhones(teamId) : [];
    const since = new Date(Date.now() - 86_400_000);
    const [today] = await db
      .select({ e: sql<number>`coalesce(sum(${hubMessages.emailed}), 0)::int`, s: sql<number>`coalesce(sum(${hubMessages.texted}), 0)::int` })
      .from(hubMessages)
      .where(and(eq(hubMessages.orgId, access.orgId), gte(hubMessages.createdAt, since)));
    if (body.email === true && emailOn() && emails.length) {
      if ((today?.e ?? 0) + emails.length > MESSAGE_LIMITS.emailPerDay) return fail(`Your Front Office has sent its ${MESSAGE_LIMITS.emailPerDay} emails for today. Try again tomorrow.`, 429);
      emailed = await sendEmails(emails, subject || `${team?.name ?? "Team"} update`, `${text}\n\n— ${me.name || "Coach"}, ${team?.name ?? access.orgName}`, me.email);
    }
    if (body.sms === true && smsOn() && phones.length) {
      if ((today?.s ?? 0) + phones.length > MESSAGE_LIMITS.smsPerDay) return fail(`Your Front Office has sent its ${MESSAGE_LIMITS.smsPerDay} texts for today. Try again tomorrow.`, 429);
      texted = await sendTexts(phones, teamText(team?.name ?? access.orgName, subject, text));
    }
  }
  await db.insert(hubMessages).values({ orgId: access.orgId, teamId, channel, authorId: me.id, authorName: me.name || me.email, subject, body: text, emailed, texted });
  return json({ messages: await board(me, access), delivery: { email: emailOn(), sms: smsOn() }, emailed, texted }, 201);
}

/** Member ids the director picked that really are coaches in this organisation. */
async function realCoaches(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ id: orgMembers.id }).from(orgMembers).where(and(eq(orgMembers.orgId, orgId), inArray(orgMembers.id, ids.filter((i) => UUID.test(i)))));
  return rows.map((r) => r.id);
}

/**
 * `/api/hub/:orgId[/events|/messages]`, `/api/hub-events/:id`, `/api/hub-messages/:id`, `/api/teams[/:id[/players|/texts]]`, `/api/team-players/:id` and `/api/text-signups/:id`.
 */
export async function hubRoute(me: Me, req: Request, resource: string, id?: string, action?: string): Promise<Response> {
  const method = req.method;
  const body = method === "POST" || method === "PUT" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};

  if (resource === "hub" && method === "GET" && !action) {
    const access = await accessTo(me, id);
    if (!access) return fail(NO_ORG, 404);
    return json(await hubState(access));
  }

  if (resource === "hub" && action === "events") {
    const access = await accessTo(me, id);
    if (!access) return fail(NO_ORG, 404);
    if (method === "GET") return json({ events: await calendar(me, access) });
    if (method === "POST") {
      const clean = cleanEvent(body.event);
      if (typeof clean === "string") return fail(clean);
      const denied = await mayWrite(me, access, clean.teamId);
      if (denied) return denied;
      const weeks = Math.min(Math.max(Math.floor(Number(body.repeatWeeks) || 0), 0), SCHEDULE_LIMITS.repeat);
      const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(hubEvents).where(eq(hubEvents.orgId, access.orgId));
      if ((count?.n ?? 0) + weeks + 1 > SCHEDULE_LIMITS.events) return fail(`A Front Office calendar holds ${SCHEDULE_LIMITS.events} events. Remove old ones first.`, 403);
      const week = 7 * 86_400_000;
      const rows = Array.from({ length: weeks + 1 }, (_, i) => ({
        ...eventRow(clean, i * week),
        orgId: access.orgId,
        createdBy: me.id,
      }));
      await db.insert(hubEvents).values(rows);
      return json({ events: await calendar(me, access), added: rows.length }, 201);
    }
  }

  if (resource === "hub" && action === "messages") {
    const access = await accessTo(me, id);
    if (!access) return fail(NO_ORG, 404);
    if (method === "GET") return json({ messages: await board(me, access), delivery: { email: emailOn(), sms: smsOn() } });
    if (method === "POST") return await post(me, access, body);
  }

  if (resource === "hub-messages" && id && UUID.test(id) && method === "DELETE") {
    const [row] = await db.select().from(hubMessages).where(eq(hubMessages.id, id));
    const access = row ? await accessTo(me, row.orgId) : null;
    if (!row || !access || (row.authorId !== me.id && !access.director)) return fail("Only the coach who wrote it, or the director, can remove a message.", 404);
    await db.delete(hubMessages).where(eq(hubMessages.id, id));
    return json({ messages: await board(me, access), delivery: { email: emailOn(), sms: smsOn() } });
  }

  if (resource === "hub-events" && id && UUID.test(id)) {
    const [row] = await db.select().from(hubEvents).where(eq(hubEvents.id, id));
    const access = row ? await accessTo(me, row.orgId) : null;
    if (!row || !access) return fail("That event isn't on a calendar you can see.", 404);
    const denied = await mayWrite(me, access, row.teamId);
    if (denied) return denied;
    if (method === "PUT") {
      const clean = cleanEvent(body.event);
      if (typeof clean === "string") return fail(clean);
      // Moving it to another team (or the whole Front Office) needs rights there too.
      const deniedThere = await mayWrite(me, access, clean.teamId);
      if (deniedThere) return deniedThere;
      await db.update(hubEvents).set({ ...eventRow(clean, 0), updatedAt: new Date() }).where(eq(hubEvents.id, id));
      return json({ events: await calendar(me, access) });
    }
    if (method === "DELETE") {
      await db.delete(hubEvents).where(eq(hubEvents.id, id));
      return json({ events: await calendar(me, access) });
    }
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
      await dropTeamFiles(team.id);
      await db.delete(teams).where(eq(teams.id, team.id));
      return json(await hubState(access));
    }

    if (action === "depth" && method === "GET") return json({ charts: await depth(team.id) });

    if (action === "depth" && method === "PUT") {
      const unit = String(body.unit) as DepthUnit;
      if (!DEPTH_UNITS.includes(unit)) return fail("Pick offense, defense or special teams.");
      const ids = await db.select({ id: teamPlayers.id }).from(teamPlayers).where(eq(teamPlayers.teamId, team.id));
      const slots = cleanDepth(body.slots, new Set(ids.map((r) => r.id)));
      await db
        .insert(depthCharts)
        .values({ teamId: team.id, unit, slots })
        .onConflictDoUpdate({ target: [depthCharts.teamId, depthCharts.unit], set: { slots, updatedAt: new Date() } });
      return json({ charts: await depth(team.id) });
    }

    // Family texts: the sign-up link and who has signed up. `fresh` retires the old link.
    if (action === "texts" && (method === "GET" || method === "POST")) {
      const token = await joinToken(team.id, team.joinToken, method === "POST" && body.fresh === true);
      return json({ token, signups: await signups(team.id), sms: smsOn() });
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

  if (resource === "text-signups" && id && UUID.test(id) && method === "DELETE") {
    const teamId = await signupTeam(id);
    const found = teamId ? await teamFor(me, teamId) : null;
    if (!found) return fail("That sign-up isn't on a team you can see.", 404);
    await dropSignup(id, found.team.id);
    return json({ token: found.team.joinToken, signups: await signups(found.team.id), sms: smsOn() });
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
