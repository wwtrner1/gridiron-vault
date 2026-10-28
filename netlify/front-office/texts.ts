import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organizations, teams, textSignups } from "../../db/schema.js";
import { CONSENT_VERSION, SIGNUP_TEXT, TEXT_LIMITS, type TextSignup } from "../../src/lib/teamHub.js";
import { normalizePhone } from "../security/phone.js";
import { sendTexts, smsOn } from "./send.js";

/**
 * Family texts sign-up. A team's staff share `/join/:token`; a parent,
 * guardian or older player enters their own mobile number and ticks the
 * consent box, which is the opt-in carriers ask to see for A2P 10DLC. The
 * public routes come before the sign-in checks in api.ts and only ever reveal
 * the team's and Front Office's names.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, TEXT_LIMITS.name) : "");

export const JOIN_TOKEN = /^[A-Za-z0-9_-]{16,40}$/;
const DEAD_LINK = "This sign-up link isn't active. Ask your coach for the team's current link.";

async function teamByToken(token: string) {
  const [row] = await db
    .select({ id: teams.id, name: teams.name, org: organizations.name })
    .from(teams)
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(eq(teams.joinToken, token));
  return row ?? null;
}

/** `GET|POST /api/join/:token`, no sign-in. */
export async function joinRoute(req: Request, token: string): Promise<Response> {
  const team = await teamByToken(token);
  if (!team) return fail(DEAD_LINK, 404);
  if (req.method === "GET") return json({ team: team.name, org: team.org });
  if (req.method !== "POST") return fail("That address is not part of the playbook API.", 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.consent !== true) return fail("Tick the box to agree to team texts first.");
  const phone = normalizePhone(String(body.phone ?? ""));
  // Registered US texting only reaches US numbers.
  if (!phone || !/^\+1\d{10}$/.test(phone)) return fail("Enter a 10-digit US mobile number.");
  const name = clip(body.name);
  if (!name) return fail("Enter your name so the coaches know who signed up.");
  const player = clip(body.player);

  const [had] = await db.select({ id: textSignups.id }).from(textSignups).where(and(eq(textSignups.teamId, team.id), eq(textSignups.phone, phone)));
  if (had) {
    await db.update(textSignups).set({ name, player, consent: CONSENT_VERSION }).where(eq(textSignups.id, had.id));
    return json({ ok: true, again: true });
  }
  // A cap per day keeps a stranger with the link from using it to text a pile of numbers.
  const [counts] = await db
    .select({
      all: sql<number>`count(*)::int`,
      today: sql<number>`count(*) filter (where ${textSignups.createdAt} >= ${new Date(Date.now() - 86_400_000)})::int`,
    })
    .from(textSignups)
    .where(eq(textSignups.teamId, team.id));
  if ((counts?.all ?? 0) >= TEXT_LIMITS.perTeam) return fail("This team's text list is full. Ask your coach.", 403);
  if ((counts?.today ?? 0) >= TEXT_LIMITS.perDay) return fail("A lot of families signed up today. Try again tomorrow.", 429);

  await db.insert(textSignups).values({ teamId: team.id, phone, name, player, consent: CONSENT_VERSION }).onConflictDoNothing();
  const confirmed = smsOn() ? (await sendTexts([phone], SIGNUP_TEXT(team.name)).catch(() => 0)) > 0 : false;
  return json({ ok: true, confirmed }, 201);
}

const toSignup = (r: typeof textSignups.$inferSelect): TextSignup => ({
  id: r.id,
  name: r.name,
  player: r.player,
  phone: r.phone,
  createdAt: r.createdAt ? r.createdAt.toISOString() : "",
});

export async function signups(teamId: string): Promise<TextSignup[]> {
  const rows = await db.select().from(textSignups).where(eq(textSignups.teamId, teamId)).orderBy(asc(textSignups.player), asc(textSignups.name));
  return rows.map(toSignup);
}

/** The numbers the server may text for a team. */
export async function signedUpPhones(teamId: string): Promise<string[]> {
  const rows = await db.select({ phone: textSignups.phone }).from(textSignups).where(eq(textSignups.teamId, teamId));
  return rows.map((r) => r.phone);
}

/** The team's sign-up link token, made the first time staff ask for it (or anew with `fresh`, which retires the old link). */
export async function joinToken(teamId: string, current: string | null, fresh = false): Promise<string> {
  if (current && !fresh) return current;
  const token = randomBytes(16).toString("base64url");
  await db.update(teams).set({ joinToken: token }).where(eq(teams.id, teamId));
  return token;
}

/** Removes one sign-up (a family asked to come off, or a wrong number). The caller has checked staff rights on `teamId`. */
export async function dropSignup(id: string, teamId: string) {
  await db.delete(textSignups).where(and(eq(textSignups.id, id), eq(textSignups.teamId, teamId)));
}

export async function signupTeam(id: string): Promise<string | null> {
  const [row] = await db.select({ teamId: textSignups.teamId }).from(textSignups).where(eq(textSignups.id, id));
  return row?.teamId ?? null;
}

