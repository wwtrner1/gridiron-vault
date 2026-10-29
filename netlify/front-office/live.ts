import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { livePlays, organizations, orgMembers, profiles } from "../../db/schema.js";
import { applyPatch, cleanPatch, LIVE_LIMITS, LIVE_PLANS, type LivePlay } from "../../src/lib/live.js";
import type { Scene } from "../../src/lib/types.js";
import { accessTo, type Me } from "./hub.js";

/**
 * Plays the Staff plan's coaches draw together. The browser polls `GET` for
 * the revision it holds and sends what it changed as a patch (src/lib/live.ts);
 * the server lays the patch on its copy and answers with the whole scene.
 * Access follows the organisation, the director's plan decides whether it may
 * draw live (joining a Front Office stays free), and every answer is
 * `private, no-store`.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400, extra: Record<string, unknown> = {}) => json({ error: message, ...extra }, status);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_THERE = "That live play isn't one you can open. Ask your director to add you to the Front Office.";
const NOT_ON_STAFF = "Drawing together comes with the Staff plan. Your director can switch the Front Office to Staff on the Plans page.";

const summary = (r: typeof livePlays.$inferSelect): LivePlay => ({ id: r.id, orgId: r.orgId, name: r.name, rev: r.rev, updatedAt: (r.updatedAt ?? new Date()).toISOString(), updatedBy: r.updatedBy });

/** Does the organisation's director have a plan that draws together? */
async function mayDrawTogether(orgId: string) {
  const [row] = await db
    .select({ plan: profiles.plan })
    .from(organizations)
    .innerJoin(profiles, eq(profiles.id, organizations.ownerId))
    .where(eq(organizations.id, orgId));
  return Boolean(row && LIVE_PLANS.includes(row.plan));
}

/** The first organisation this coach directs or has joined, when none is named. */
async function firstOrg(me: Me) {
  const [own] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.ownerId, me.id));
  if (own) return own.id;
  const [joined] = await db.select({ id: orgMembers.orgId }).from(orgMembers).where(and(eq(orgMembers.userId, me.id), eq(orgMembers.status, "active")));
  return joined?.id;
}

const validScene = (s: unknown): s is Scene => {
  const sc = s as Scene | null;
  return Boolean(sc && sc.version === 2 && Array.isArray(sc.nodes) && sc.nodes.length <= LIVE_LIMITS.nodes && JSON.stringify(sc).length <= LIVE_LIMITS.bytes);
};

export async function liveRoute(me: Me, req: Request, id?: string): Promise<Response> {
  /* ------------------------------------------------------------ the list */
  if (!id) {
    if (req.method === "GET") {
      const orgId = new URL(req.url).searchParams.get("org") ?? "";
      const access = await accessTo(me, orgId);
      if (!access) return fail(NOT_THERE, 404);
      const rows = await db.select().from(livePlays).where(eq(livePlays.orgId, access.orgId)).orderBy(desc(livePlays.updatedAt));
      return json({ plays: rows.map(summary), live: await mayDrawTogether(access.orgId) });
    }
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { orgId?: string; name?: string; scene?: unknown };
      const access = await accessTo(me, body.orgId ?? (await firstOrg(me)));
      if (!access) return fail("Drawing together needs a Front Office. Start one from the Front Office page and invite your coaches.", 403);
      if (!(await mayDrawTogether(access.orgId))) return fail(NOT_ON_STAFF, 402, { code: "plan_limit" });
      if (!validScene(body.scene)) return fail("That play is too big to share live. Trim it, or split it into two plays.");
      const count = (await db.select({ id: livePlays.id }).from(livePlays).where(eq(livePlays.orgId, access.orgId))).length;
      if (count >= LIVE_LIMITS.plays) return fail(`A Front Office holds ${LIVE_LIMITS.plays} live plays. Delete one you're done with first.`, 409);
      const name = String(body.name ?? "").trim().slice(0, LIVE_LIMITS.name) || "Untitled play";
      const [row] = await db
        .insert(livePlays)
        .values({ orgId: access.orgId, name, scene: body.scene, createdBy: me.id, updatedBy: me.name, updatedAt: new Date() })
        .returning();
      return json({ play: summary(row) }, 201);
    }
    return fail("Not found.", 404);
  }

  /* -------------------------------------------------------- one live play */
  if (!UUID.test(id)) return fail(NOT_THERE, 404);
  const [row] = await db.select().from(livePlays).where(eq(livePlays.id, id));
  const access = row ? await accessTo(me, row.orgId) : null;
  if (!row || !access) return fail(NOT_THERE, 404);

  if (req.method === "DELETE") {
    if (!access.director && row.createdBy !== me.id) return fail("Only the director or the coach who started it can delete a live play.", 403);
    await db.delete(livePlays).where(eq(livePlays.id, id));
    return json({ ok: true });
  }

  // Who else has had this open lately; our own mark is refreshed at most every few seconds so polling stays cheap.
  const now = Date.now();
  const seen = { ...row.seen };
  const stale = !seen[me.id] || now - seen[me.id].at > 5000 || seen[me.id].name !== me.name;
  if (stale) seen[me.id] = { name: me.name, at: now };
  const here = Object.entries(seen)
    .filter(([uid, s]) => uid !== me.id && now - s.at < LIVE_LIMITS.here)
    .map(([, s]) => s.name);
  const keepSeen = Object.fromEntries(Object.entries(seen).filter(([, s]) => now - s.at < 10 * 60_000));

  if (req.method === "GET") {
    if (!(await mayDrawTogether(row.orgId))) return fail(NOT_ON_STAFF, 402, { code: "plan_limit" });
    if (stale) await db.update(livePlays).set({ seen: keepSeen }).where(eq(livePlays.id, id));
    const since = Number(new URL(req.url).searchParams.get("since"));
    if (Number.isInteger(since) && since === row.rev) return json({ rev: row.rev, same: true, here });
    return json({ rev: row.rev, name: row.name, scene: row.scene, here });
  }

  if (req.method === "PUT") {
    if (!(await mayDrawTogether(row.orgId))) return fail(NOT_ON_STAFF, 402, { code: "plan_limit" });
    const body = (await req.json().catch(() => ({}))) as { patch?: unknown };
    const patch = cleanPatch(body.patch);
    if (typeof patch === "string") return fail(patch);
    // Optimistic: lay the patch on the newest copy and write only if nobody else wrote first; otherwise go again.
    let current = row;
    for (let attempt = 0; attempt < 6; attempt++) {
      const next = applyPatch(current.scene as Scene, patch);
      if (!validScene(next)) return fail("That play is getting too big to share live. Remove some shapes first.");
      const won = await db
        .update(livePlays)
        .set({ scene: next, rev: current.rev + 1, updatedBy: me.name, updatedAt: new Date(), seen: keepSeen })
        .where(and(eq(livePlays.id, id), eq(livePlays.rev, current.rev)))
        .returning({ rev: livePlays.rev });
      if (won[0]) return json({ rev: won[0].rev, scene: next, here });
      const [again] = await db.select().from(livePlays).where(eq(livePlays.id, id));
      if (!again) return fail(NOT_THERE, 404);
      current = again;
    }
    return fail("Several coaches saved at once. Try that again.", 409);
  }
  return fail("Not found.", 404);
}
