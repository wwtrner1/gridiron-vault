import { admin as identityAdmin } from "@netlify/identity";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  aiUsage,
  auditLog,
  callSheets,
  playbookPlays,
  playbooks,
  plays,
  profiles,
  trash,
  trustedDevices,
} from "../../db/schema.js";
import { TIERS, type TierId } from "../../src/lib/plan.js";
import { audit, type Actor } from "./admin.js";

/** How long a deleted play, playbook or Call Sheet can be put back. */
export const TRASH_DAYS = 30;

type Kind = "play" | "playbook" | "call_sheet";

/** Copies a row to the trash before the coach's delete goes through. Never blocks the delete. */
export async function keepInTrash(ownerId: string, kind: Kind, row: { id: string; name: string } & Record<string, unknown>, extra: Record<string, unknown> = {}) {
  try {
    await db.insert(trash).values({ ownerId, kind, originalId: row.id, name: row.name, payload: { ...row, ...extra } });
    if (Math.random() < 0.05) await db.delete(trash).where(sql`${trash.deletedAt} < now() - interval '${sql.raw(String(TRASH_DAYS))} days'`);
  } catch (e) {
    console.error("trash", e);
  }
}

const day = (n: number) => new Date(Date.now() - n * 86400_000);

/** One coach, as the owner sees them when helping with a problem. */
export async function userDetail(actor: Actor, uid: string) {
  const [prof] = await db.select().from(profiles).where(eq(profiles.id, uid));
  let ident: Awaited<ReturnType<typeof identityAdmin.getUser>> | null = null;
  try {
    ident = await identityAdmin.getUser(uid);
  } catch {
    /* not in Identity (deleted) or Identity unreachable */
  }
  const [playRows, bookRows, sheetRows, trashRows, devices, usage, history] = await Promise.all([
    db
      .select({ id: plays.id, name: plays.name, playType: plays.playType, formation: plays.formation, isPublic: plays.isPublic, updatedAt: plays.updatedAt })
      .from(plays)
      .where(eq(plays.ownerId, uid))
      .orderBy(desc(plays.updatedAt))
      .limit(500),
    db
      .select({ id: playbooks.id, name: playbooks.name, updatedAt: playbooks.updatedAt, plays: sql<number>`(select count(*)::int from ${playbookPlays} where ${playbookPlays.playbookId} = ${playbooks.id})` })
      .from(playbooks)
      .where(eq(playbooks.ownerId, uid)),
    db.select({ id: callSheets.id, name: callSheets.name, updatedAt: callSheets.updatedAt }).from(callSheets).where(eq(callSheets.ownerId, uid)),
    db
      .select({ id: trash.id, kind: trash.kind, name: trash.name, deletedAt: trash.deletedAt, restoredAt: trash.restoredAt })
      .from(trash)
      .where(and(eq(trash.ownerId, uid), gte(trash.deletedAt, day(TRASH_DAYS))))
      .orderBy(desc(trash.deletedAt)),
    db.select({ label: trustedDevices.label, lastSeen: trustedDevices.lastSeen }).from(trustedDevices).where(eq(trustedDevices.ownerId, uid)),
    db
      .select({ day: aiUsage.day, kind: aiUsage.kind, count: aiUsage.count })
      .from(aiUsage)
      .where(and(eq(aiUsage.ownerId, uid), gte(aiUsage.day, day(14).toISOString().slice(0, 10))))
      .orderBy(desc(aiUsage.day)),
    db.select().from(auditLog).where(eq(auditLog.targetId, uid)).orderBy(desc(auditLog.at)).limit(30),
  ]);
  await audit(actor, "view_user", uid);
  return {
    profile: prof ? { ...prof, phone: prof.phone ? `•••• ${prof.phone.slice(-4)}` : null } : null,
    identity: ident
      ? { email: ident.email, confirmedAt: ident.confirmedAt, createdAt: ident.createdAt, lastSignInAt: ident.lastSignInAt, provider: ident.provider }
      : null,
    plays: playRows,
    playbooks: bookRows,
    sheets: sheetRows,
    trash: trashRows,
    devices,
    usage,
    history,
    trashDays: TRASH_DAYS,
  };
}

/** Everything a coach has stored, as one JSON file the owner can keep or hand back. */
export async function userExport(actor: Actor, uid: string) {
  const [p, b, bp, s] = await Promise.all([
    db.select().from(plays).where(eq(plays.ownerId, uid)),
    db.select().from(playbooks).where(eq(playbooks.ownerId, uid)),
    db
      .select({ playbookId: playbookPlays.playbookId, playId: playbookPlays.playId, sortOrder: playbookPlays.sortOrder })
      .from(playbookPlays)
      .innerJoin(playbooks, eq(playbookPlays.playbookId, playbooks.id))
      .where(eq(playbooks.ownerId, uid)),
    db.select().from(callSheets).where(eq(callSheets.ownerId, uid)),
  ]);
  await audit(actor, "export_user_data", uid, { plays: p.length, playbooks: b.length, sheets: s.length });
  return { exportedAt: new Date().toISOString(), userId: uid, plays: p, playbooks: b, playbookPlays: bp, callSheets: s };
}

const when = (v: unknown) => (typeof v === "string" ? new Date(v) : new Date());

/** Puts a trashed item back in its owner's Vault, or another coach's when `toUserId` is given. */
export async function restoreItem(actor: Actor, trashId: string, toUserId?: string) {
  const [item] = await db.select().from(trash).where(eq(trash.id, trashId));
  if (!item) return { error: "That item isn't in the trash any more.", status: 404 };
  if (item.restoredAt) return { error: "That item was already restored.", status: 409 };
  if (item.deletedAt && item.deletedAt < day(TRASH_DAYS)) return { error: `Items are kept ${TRASH_DAYS} days and that one has expired.`, status: 410 };
  const owner = toUserId || item.ownerId;
  const [target] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, owner));
  if (!target) return { error: "That coach has no account to restore into.", status: 404 };
  const row = item.payload;
  let newId = "";

  await db.transaction(async (tx) => {
    const free = async (table: typeof plays | typeof playbooks | typeof callSheets) => {
      const [hit] = await tx.select({ id: table.id }).from(table).where(eq(table.id, item.originalId));
      return !hit;
    };
    if (item.kind === "play") {
      const [r] = await tx
        .insert(plays)
        .values({
          ...(await free(plays) ? { id: item.originalId } : {}),
          ownerId: owner,
          ownerName: String(row.ownerName ?? ""),
          name: String(row.name ?? "Restored play"),
          formation: String(row.formation ?? ""),
          playType: String(row.playType ?? "pass"),
          personnel: String(row.personnel ?? "5v5"),
          description: String(row.description ?? ""),
          tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
          fieldView: String(row.fieldView ?? "full"),
          scene: row.scene ?? {},
          preview: String(row.preview ?? ""),
          isPublic: Boolean(row.isPublic),
          createdAt: when(row.createdAt),
        })
        .returning({ id: plays.id });
      newId = r.id;
    } else if (item.kind === "playbook") {
      const [r] = await tx
        .insert(playbooks)
        .values({
          ...(await free(playbooks) ? { id: item.originalId } : {}),
          ownerId: owner,
          name: String(row.name ?? "Restored playbook"),
          description: String(row.description ?? ""),
          color: String(row.color ?? "#DB5A33"),
          isPublic: Boolean(row.isPublic),
          createdAt: when(row.createdAt),
        })
        .returning({ id: playbooks.id });
      newId = r.id;
      // Put back the plays it held, those that still exist.
      const ids = Array.isArray(row.playIds) ? (row.playIds as string[]) : [];
      if (ids.length) {
        const live = await tx.select({ id: plays.id }).from(plays).where(and(inArray(plays.id, ids), eq(plays.ownerId, owner)));
        const keep = new Set(live.map((l) => l.id));
        const members = ids.filter((i) => keep.has(i)).map((playId, sortOrder) => ({ playbookId: r.id, playId, sortOrder }));
        if (members.length) await tx.insert(playbookPlays).values(members);
      }
    } else {
      const [r] = await tx
        .insert(callSheets)
        .values({
          ...(await free(callSheets) ? { id: item.originalId } : {}),
          ownerId: owner,
          name: String(row.name ?? "Restored Call Sheet"),
          columns: row.columns ?? [],
          rows: row.rows ?? [],
          createdAt: when(row.createdAt),
        })
        .returning({ id: callSheets.id });
      newId = r.id;
    }
    await tx.update(trash).set({ restoredAt: new Date() }).where(and(eq(trash.id, trashId), isNull(trash.restoredAt)));
  });

  await audit(actor, "restore_item", item.ownerId, { kind: item.kind, name: item.name, trashId, restoredAs: newId, intoUser: owner });
  return { ok: true as const, id: newId };
}

/** Support fix: set a coach's plan (never to master, which comes only from the owner list). */
export async function setUserPlan(actor: Actor, uid: string, plan: string) {
  if (plan === "master" || plan === "trial" || !(plan in TIERS)) return { error: "That isn't a plan a coach can be on.", status: 400 };
  const before = await db.select({ plan: profiles.plan }).from(profiles).where(eq(profiles.id, uid));
  if (!before[0]) return { error: "That coach has no profile yet.", status: 404 };
  await db.update(profiles).set({ plan: plan as TierId }).where(eq(profiles.id, uid));
  await audit(actor, "set_plan", uid, { from: before[0].plan, to: plan });
  return { ok: true as const };
}
