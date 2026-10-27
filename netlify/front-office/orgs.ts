import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organizations, orgMembers, orgShares } from "../../db/schema.js";
import { gateFrontOffice, type Gate, type Tier } from "../../src/lib/plan.js";
import { cleanSnapshot, type Snapshot } from "../../src/lib/share.js";
import { dropBlobs, orgFileKeys } from "./files.js";
import { ORG_LIMITS, parseEmails, type FrontOfficeState, type OrgShareSummary } from "../../src/lib/frontOffice.js";

/**
 * Front Office routes. A director owns one organisation, invites coaches by
 * email and shares frozen playbook snapshots with it. A coach sees an invite
 * when signed in with that address, and only accepted members (or the
 * director) can open a shared playbook. Every answer is per-person, so
 * nothing here may be cached by the CDN or a shared cache.
 */

type Me = { id: string; email: string; name: string };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const planFail = (gate: Extract<Gate, { ok: false }>) => json({ error: gate.reason, code: "plan_limit", cta: gate.cta }, 403);
const NOT_FOUND = "That Front Office playbook isn't shared with you. Ask your league director to invite this email.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Shared playbooks of some organisations, without their plays. */
async function summaries(orgIds: string[]): Promise<Map<string, OrgShareSummary[]>> {
  const out = new Map<string, OrgShareSummary[]>();
  if (!orgIds.length) return out;
  const rows = await db
    .select({
      id: orgShares.id,
      orgId: orgShares.orgId,
      source: orgShares.source,
      name: orgShares.name,
      note: orgShares.note,
      plays: sql<number>`coalesce(jsonb_array_length(${orgShares.snapshot}->'plays'), 0)::int`,
      updatedAt: orgShares.updatedAt,
    })
    .from(orgShares)
    .where(inArray(orgShares.orgId, orgIds))
    .orderBy(desc(orgShares.updatedAt));
  for (const r of rows) {
    const list = out.get(r.orgId) ?? [];
    list.push({ id: r.id, source: r.source, name: r.name, note: r.note, plays: r.plays, updatedAt: iso(r.updatedAt) ?? "" });
    out.set(r.orgId, list);
  }
  return out;
}

async function state(me: Me, tier: Tier): Promise<FrontOfficeState> {
  const email = me.email.toLowerCase();
  const [own] = await db.select().from(organizations).where(eq(organizations.ownerId, me.id));
  const memberRows = await db
    .select({ m: orgMembers, org: { id: organizations.id, name: organizations.name, ownerName: organizations.ownerName, ownerId: organizations.ownerId } })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(sql`(${orgMembers.userId} = ${me.id} and ${orgMembers.status} = 'active') or (${orgMembers.email} = ${email} and ${orgMembers.status} = 'invited')`)
    .orderBy(asc(organizations.name));
  const joinedRows = memberRows.filter((r) => r.m.status === "active" && r.org.ownerId !== me.id);
  const shares = await summaries([...(own ? [own.id] : []), ...joinedRows.map((r) => r.org.id)]);

  let mine: FrontOfficeState["mine"] = null;
  if (own) {
    const members = await db.select().from(orgMembers).where(eq(orgMembers.orgId, own.id)).orderBy(asc(orgMembers.email));
    mine = {
      id: own.id,
      name: own.name,
      seats: tier.orgSeats,
      members: members.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        status: m.status === "active" ? "active" : "invited",
        invitedAt: iso(m.invitedAt) ?? "",
        joinedAt: iso(m.joinedAt),
      })),
      shares: shares.get(own.id) ?? [],
    };
  }
  const org = (r: (typeof memberRows)[number]) => ({ id: r.org.id, name: r.org.name, ownerName: r.org.ownerName });
  return {
    mine,
    joined: joinedRows.map((r) => ({ memberId: r.m.id, org: org(r), shares: shares.get(r.org.id) ?? [] })),
    invites: memberRows
      .filter((r) => r.m.status === "invited" && r.org.ownerId !== me.id)
      .map((r) => ({ memberId: r.m.id, org: org(r), invitedAt: iso(r.m.invitedAt) ?? "" })),
  };
}

/** The organisation this coach directs, if `id` is it. */
async function ownOrg(me: Me, id: string | undefined) {
  if (!id || !UUID.test(id)) return null;
  const [row] = await db.select().from(organizations).where(and(eq(organizations.id, id), eq(organizations.ownerId, me.id)));
  return row ?? null;
}

/**
 * `/api/orgs`, `/api/org-members/:id` and `/api/org-shares/:id`. `tierOf` is
 * the coach's plan as the server knows it; asked only when a route needs it.
 */
export async function frontOfficeRoute(me: Me, tierOf: () => Promise<Tier>, req: Request, resource: string, id?: string, action?: string): Promise<Response> {
  const method = req.method;
  const body = method === "POST" || method === "PUT" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};

  if (resource === "orgs") {
    if (method === "GET" && !id) return json(await state(me, await tierOf()));

    if (method === "POST" && !id) {
      const tier = await tierOf();
      const gate = gateFrontOffice(tier);
      if (!gate.ok) return planFail(gate);
      const name = clip(body.name, ORG_LIMITS.name);
      if (!name) return fail("Name your league or program first.");
      const [row] = await db.insert(organizations).values({ ownerId: me.id, ownerName: me.name, name }).onConflictDoNothing().returning();
      if (!row) return fail("You already run a Front Office. Rename it instead.", 409);
      return json(await state(me, tier), 201);
    }

    const org = await ownOrg(me, id);
    if (!org) return fail("That Front Office isn't yours.", 404);

    if (method === "PUT" && !action) {
      const name = clip(body.name, ORG_LIMITS.name);
      if (!name) return fail("Name your league or program first.");
      await db.update(organizations).set({ name, ownerName: me.name }).where(eq(organizations.id, org.id));
      return json(await state(me, await tierOf()));
    }

    if (method === "DELETE" && !action) {
      // Members keep every play they cloned; the shared copies, member list and team hub go.
      const keys = await orgFileKeys(org.id);
      await db.delete(organizations).where(eq(organizations.id, org.id));
      await dropBlobs(keys).catch((e) => console.error("team-files cleanup", e));
      return json(await state(me, await tierOf()));
    }

    if (method === "POST" && action === "members") {
      const emails = parseEmails(body.emails).filter((e) => e !== me.email.toLowerCase());
      if (!emails.length) return fail("Add at least one coach's email address.");
      if (emails.length > ORG_LIMITS.invite) return fail(`Invite up to ${ORG_LIMITS.invite} coaches at a time.`);
      const tier = await tierOf();
      const have = await db.select({ email: orgMembers.email }).from(orgMembers).where(eq(orgMembers.orgId, org.id));
      const fresh = emails.filter((e) => !have.some((h) => h.email === e));
      const gate = gateFrontOffice(tier, have.length, fresh.length);
      if (!gate.ok) return planFail(gate);
      if (fresh.length) await db.insert(orgMembers).values(fresh.map((email) => ({ orgId: org.id, email }))).onConflictDoNothing();
      return json({ ...(await state(me, tier)), invited: fresh.length }, 201);
    }

    if (method === "POST" && action === "shares") {
      const tier = await tierOf();
      const gate = gateFrontOffice(tier);
      if (!gate.ok) return planFail(gate);
      const snap = cleanSnapshot(body.snapshot, "A Front Office playbook");
      if (typeof snap === "string") return fail(snap);
      const source = clip(body.source, 80);
      const note = clip(body.note, ORG_LIMITS.note);
      // One entry per playbook: sharing it again replaces the plays members see.
      if (source) {
        const [had] = await db.select({ id: orgShares.id }).from(orgShares).where(and(eq(orgShares.orgId, org.id), eq(orgShares.source, source)));
        if (had) {
          await db.update(orgShares).set({ name: snap.name, note, snapshot: snap, updatedAt: new Date() }).where(eq(orgShares.id, had.id));
          return json(await state(me, tier));
        }
      }
      const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(orgShares).where(eq(orgShares.orgId, org.id));
      if ((count?.n ?? 0) >= ORG_LIMITS.shares) return fail(`Your Front Office shares ${ORG_LIMITS.shares} playbooks. Stop sharing one you no longer use, then try again.`, 403);
      await db.insert(orgShares).values({ orgId: org.id, source, name: snap.name, note, snapshot: snap });
      return json(await state(me, tier), 201);
    }
  }

  if (resource === "org-members" && id && UUID.test(id)) {
    const [row] = await db
      .select({ m: orgMembers, ownerId: organizations.ownerId })
      .from(orgMembers)
      .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
      .where(eq(orgMembers.id, id));
    const mineToAnswer = row && (row.m.userId === me.id || (row.m.status === "invited" && row.m.email === me.email.toLowerCase()));

    if (method === "POST" && action === "accept") {
      if (!row || !mineToAnswer || row.m.status !== "invited") return fail("That invite isn't for this account. Sign in with the email your director invited.", 404);
      await db
        .update(orgMembers)
        .set({ status: "active", userId: me.id, name: me.name, joinedAt: new Date() })
        .where(and(eq(orgMembers.id, id), eq(orgMembers.status, "invited")));
      return json(await state(me, await tierOf()));
    }

    // The director removes a coach, or a coach declines an invite or leaves.
    if (method === "DELETE" && !action) {
      if (!row || (!mineToAnswer && row.ownerId !== me.id)) return fail("That coach isn't in your Front Office.", 404);
      await db.delete(orgMembers).where(eq(orgMembers.id, id));
      return json(await state(me, await tierOf()));
    }
  }

  if (resource === "org-shares" && id && UUID.test(id)) {
    const [row] = await db
      .select({ s: orgShares, orgName: organizations.name, ownerId: organizations.ownerId })
      .from(orgShares)
      .innerJoin(organizations, eq(organizations.id, orgShares.orgId))
      .where(eq(orgShares.id, id));
    if (!row) return fail(NOT_FOUND, 404);
    const director = row.ownerId === me.id;

    if (method === "GET" && !action) {
      if (!director) {
        const [member] = await db
          .select({ id: orgMembers.id })
          .from(orgMembers)
          .where(and(eq(orgMembers.orgId, row.s.orgId), eq(orgMembers.userId, me.id), eq(orgMembers.status, "active")));
        if (!member) return fail(NOT_FOUND, 404);
      }
      const snap = row.s.snapshot as Snapshot;
      return json({
        share: {
          id: row.s.id,
          source: director ? row.s.source : "",
          name: row.s.name,
          note: row.s.note,
          orgName: row.orgName,
          plays: snap.plays,
          updatedAt: iso(row.s.updatedAt) ?? "",
        },
      });
    }

    if (method === "DELETE" && !action) {
      if (!director) return fail(NOT_FOUND, 404);
      await db.delete(orgShares).where(eq(orgShares.id, id));
      return json(await state(me, await tierOf()));
    }
  }

  return fail("That address is not part of the playbook API.", 404);
}
