import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { myTeamLinks, myTeams, myTeamSignups, teamTexts } from "../../db/schema.js";
import { cleanMyTeams, teamText, type TextSignup } from "../../src/lib/teamHub.js";
import {
  AUDIENCES,
  hasPlaceholder,
  SETTLED,
  signed,
  signer,
  signupsFor,
  TEAM_TEXTS_PER_DAY,
  TEXT_MAX,
  type Audience,
  type TeamText,
  type TeamTextRecipient,
  type TextStatus,
} from "../../src/lib/textTeam.js";
import { sendTextEach, smsOn, textStatus } from "./send.js";

/**
 * Text the team from GridIronVault's number (My team → Text the team), the solo coach's one-tap send.
 *
 *   GET    /api/my-team/:teamId/texts           the sign-up link, who signed up, the last texts, whether sending is on
 *   POST   /api/my-team/:teamId/texts           { body, audience } sends now and answers each recipient's status
 *   GET    /api/my-team/:teamId/texts/:textId   asks Twilio again about recipients still on their way
 *   POST   /api/my-team/:teamId/link            a new sign-up link (the old one stops working)
 *   DELETE /api/my-team-signups/:id             takes one family off the list
 *
 * Only numbers that signed up themselves on the team's `/join/:token` page are ever texted (A2P 10DLC), never the
 * roster's. Sending needs `smsOn()` (TEAM_SMS=on plus the Twilio keys); until then the routes still hand out the
 * link and the list, so families can sign up before the number is approved. Owner only, never cached.
 */

type Me = { id: string; name: string };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);

const TEAM_ID = /^[A-Za-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY = 20;
/** Twilio is asked again only about texts this recent; older ones keep the last state it gave. */
const REFRESH_DAYS = 7;
/** The same words to the same team inside this window are a second tap, not a second text. */
const REPEAT_MS = 2 * 60_000;
const STATUSES: TextStatus[] = ["queued", "accepted", "scheduled", "sending", "sent", "delivered", "read", "undelivered", "failed", "stopped", "error"];

const asStatus = (s: string): TextStatus => (STATUSES.includes(s as TextStatus) ? (s as TextStatus) : "failed");

async function myTeam(ownerId: string, teamId: string) {
  const [row] = await db.select({ data: myTeams.data }).from(myTeams).where(eq(myTeams.ownerId, ownerId));
  return row ? (cleanMyTeams(row.data).teams.find((t) => t.id === teamId) ?? null) : null;
}

async function linkFor(ownerId: string, teamId: string, fresh = false): Promise<string> {
  const where = and(eq(myTeamLinks.ownerId, ownerId), eq(myTeamLinks.teamId, teamId));
  if (!fresh) {
    const [had] = await db.select({ token: myTeamLinks.token }).from(myTeamLinks).where(where);
    if (had) return had.token;
  }
  const token = randomBytes(16).toString("base64url");
  await db.delete(myTeamLinks).where(where);
  await db.insert(myTeamLinks).values({ token, ownerId, teamId });
  return token;
}

async function signupList(ownerId: string, teamId: string): Promise<TextSignup[]> {
  const rows = await db
    .select()
    .from(myTeamSignups)
    .where(and(eq(myTeamSignups.ownerId, ownerId), eq(myTeamSignups.teamId, teamId)))
    .orderBy(asc(myTeamSignups.player), asc(myTeamSignups.name));
  return rows.map((r) => ({ id: r.id, name: r.name, player: r.player, phone: r.phone, createdAt: r.createdAt ? r.createdAt.toISOString() : "" }));
}

const toText = (r: typeof teamTexts.$inferSelect): TeamText => ({
  id: r.id,
  at: r.createdAt ? r.createdAt.toISOString() : "",
  body: r.body,
  recipients: (Array.isArray(r.recipients) ? r.recipients : []) as TeamTextRecipient[],
});

async function history(ownerId: string, teamId: string): Promise<TeamText[]> {
  const rows = await db
    .select()
    .from(teamTexts)
    .where(and(eq(teamTexts.ownerId, ownerId), eq(teamTexts.teamId, teamId)))
    .orderBy(desc(teamTexts.createdAt))
    .limit(HISTORY);
  return rows.map(toText);
}

/** Texts sent from the coach's account in the last day, counting every recipient. */
async function sentToday(ownerId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(jsonb_array_length(${teamTexts.recipients})), 0)::int` })
    .from(teamTexts)
    .where(and(eq(teamTexts.ownerId, ownerId), gte(teamTexts.createdAt, new Date(Date.now() - 86_400_000))));
  return row?.n ?? 0;
}

async function state(me: Me, teamId: string, fresh = false) {
  return {
    token: await linkFor(me.id, teamId, fresh),
    signups: await signupList(me.id, teamId),
    texts: await history(me.id, teamId),
    sms: smsOn(),
    sentToday: await sentToday(me.id),
    perDay: TEAM_TEXTS_PER_DAY,
  };
}

async function send(me: Me, teamId: string, teamName: string, raw: Record<string, unknown>): Promise<Response> {
  if (!smsOn()) return fail("Texting from GridIronVault isn't switched on yet. Families can still sign up on the team's link.", 409);
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) return fail("Write the text first.");
  if (hasPlaceholder(body)) return fail("Fill in the [brackets] before you send.");
  const words = signed(body, signer(me.name, teamName));
  if (words.length > TEXT_MAX) return fail(`Keep the text under ${TEXT_MAX} characters, your name included.`);
  const audience: Audience = AUDIENCES.some((a) => a.id === raw.audience) ? (raw.audience as Audience) : "all";

  const list = signupsFor(await signupList(me.id, teamId), audience);
  if (!list.length) return fail("Nobody in that group has signed up for texts yet. Share the team's sign-up link first.");
  if ((await sentToday(me.id)) + list.length > TEAM_TEXTS_PER_DAY)
    return fail(`You've reached today's ${TEAM_TEXTS_PER_DAY} texts from GridIronVault. Try again tomorrow.`, 429);

  const [repeat] = await db
    .select({ id: teamTexts.id })
    .from(teamTexts)
    .where(and(eq(teamTexts.ownerId, me.id), eq(teamTexts.teamId, teamId), eq(teamTexts.body, words), gte(teamTexts.createdAt, new Date(Date.now() - REPEAT_MS))));
  if (repeat) return fail("That exact text just went to this team. Change it if you meant to send another.", 409);

  // The row goes in before anything is sent, so a send cut off halfway still shows in the history (and blocks a
  // second tap) rather than leaving texts out with no record.
  const queued: TeamTextRecipient[] = list.map((s) => ({ name: s.name, player: s.player, phone: s.phone, sid: "", status: "queued", code: null }));
  const [held] = await db.insert(teamTexts).values({ ownerId: me.id, teamId, body: words, recipients: queued }).returning({ id: teamTexts.id });

  const results = new Map((await sendTextEach(list.map((s) => s.phone), teamText(teamName, "", words))).map((r) => [r.to, r]));
  const stopped: string[] = [];
  const recipients: TeamTextRecipient[] = list.map((s) => {
    const r = results.get(s.phone);
    if (r?.code === 21610) stopped.push(s.id);
    const status: TextStatus = !r ? "error" : r.code === 21610 ? "stopped" : asStatus(r.status);
    return { name: s.name, player: s.player, phone: s.phone, sid: r?.sid ?? "", status, code: r?.code ?? null };
  });
  // A number that replied STOP comes off the list now, so the coach's count stays true and it isn't tried again.
  for (const id of stopped) await db.delete(myTeamSignups).where(and(eq(myTeamSignups.id, id), eq(myTeamSignups.ownerId, me.id)));

  const [row] = await db.update(teamTexts).set({ recipients }).where(eq(teamTexts.id, held.id)).returning();
  return json({ text: toText(row), ...(await state(me, teamId)) }, 201);
}

/** Asks Twilio again about each recipient still on its way, and keeps what it says. */
async function refresh(me: Me, teamId: string, textId: string): Promise<Response> {
  const [row] = await db.select().from(teamTexts).where(and(eq(teamTexts.id, textId), eq(teamTexts.ownerId, me.id), eq(teamTexts.teamId, teamId)));
  if (!row) return fail("That text isn't in this team's history.", 404);
  const text = toText(row);
  const recent = row.createdAt && Date.now() - row.createdAt.getTime() < REFRESH_DAYS * 86_400_000;
  if (recent && smsOn()) {
    let changed = false;
    const next = await Promise.all(
      text.recipients.map(async (r) => {
        if (SETTLED.includes(r.status)) return r;
        // No message id after a few minutes: the send was cut off before Twilio answered for this number.
        if (!r.sid) {
          if (Date.now() - (row.createdAt?.getTime() ?? 0) < REPEAT_MS) return r;
          changed = true;
          return { ...r, status: "error" as const };
        }
        const now = await textStatus(r.sid);
        if (!now || (now.status === r.status && now.code === r.code)) return r;
        changed = true;
        return { ...r, status: asStatus(now.status), code: now.code };
      }),
    );
    if (changed) {
      await db.update(teamTexts).set({ recipients: next }).where(eq(teamTexts.id, row.id));
      text.recipients = next;
    }
  }
  return json({ text });
}

/** `/api/my-team/:teamId/(texts|link)[/:textId]` after the sign-in check. */
export async function myTeamTextsRoute(me: Me, req: Request, teamId: string, action: string, textId?: string): Promise<Response> {
  if (!TEAM_ID.test(teamId)) return fail("That address is not part of the playbook API.", 404);
  const team = await myTeam(me.id, teamId);
  if (!team) return fail("Save this team to your account first. It saves on its own while you're signed in, so try again in a moment.", 404);

  if (action === "link" && req.method === "POST") return json(await state(me, teamId, true));
  if (action !== "texts") return fail("That address is not part of the playbook API.", 404);
  if (textId) return UUID.test(textId) && req.method === "GET" ? await refresh(me, teamId, textId) : fail("That address is not part of the playbook API.", 404);
  if (req.method === "GET") return json(await state(me, teamId));
  if (req.method === "POST") return await send(me, teamId, team.name, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  return fail("That address is not part of the playbook API.", 404);
}

/** `DELETE /api/my-team-signups/:id`: the coach takes a family off the list (they asked, or a wrong number). */
export async function dropMyTeamSignup(me: Me, id: string): Promise<Response> {
  if (!UUID.test(id)) return fail("That address is not part of the playbook API.", 404);
  const [row] = await db.select().from(myTeamSignups).where(and(eq(myTeamSignups.id, id), eq(myTeamSignups.ownerId, me.id)));
  if (!row) return fail("That sign-up is already gone.", 404);
  await db.delete(myTeamSignups).where(eq(myTeamSignups.id, id));
  return json(await state(me, row.teamId));
}

