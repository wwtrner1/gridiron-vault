import { and, desc, eq, ilike, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { playArchive } from "../../db/schema.js";

/**
 * The owner's archive of plays (Wes, 2026-11-13): every play a signed-in
 * coach creates, copies, imports or scans to their account is copied here,
 * shared or not, and stays when the coach deletes it (`deletedAt` is set).
 * The owner browses and purges it in /admin → Play archive. It is erased
 * with the coach's account, and the Privacy page says it exists.
 */
type PlayRow = { id: string; ownerId: string; name: string; playType: string; tags: unknown; scene: unknown };

export const sourceOf = (tags: unknown): string => {
  const t = Array.isArray(tags) ? tags.map(String) : [];
  if (t.includes("scan") || t.includes("whiteboard")) return "scanned";
  if (t.includes("imported") || t.includes("griddy") || t.includes("pptx")) return "imported";
  if (t.includes("starter") || t.includes("ready-to-go") || t.includes("copy")) return "copied";
  return "created";
};

/** Keeps the archive copy current. Never blocks the coach's save. */
export async function archivePlay(owner: { email: string; name: string }, row: PlayRow, source?: string) {
  try {
    const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    const values = {
      playId: row.id,
      ownerId: row.ownerId,
      ownerName: owner.name,
      ownerEmail: owner.email,
      name: row.name,
      playType: row.playType,
      source: source ?? sourceOf(tags),
      tags,
      scene: row.scene ?? {},
    };
    const { source: _keep, ...update } = values;
    await db
      .insert(playArchive)
      .values(values)
      .onConflictDoUpdate({ target: playArchive.playId, set: { ...update, updatedAt: new Date() } });
  } catch (e) {
    console.error("archive", e);
  }
}

export async function markArchivedDeleted(playId: string) {
  await db.update(playArchive).set({ deletedAt: new Date() }).where(eq(playArchive.playId, playId)).catch(() => undefined);
}

export const ARCHIVE_PAGE = 60;

export async function archiveList(q: URLSearchParams) {
  const filters = [];
  const text = q.get("q")?.trim().slice(0, 80);
  if (text) filters.push(or(ilike(playArchive.name, `%${text}%`), ilike(playArchive.ownerEmail, `%${text}%`), ilike(playArchive.ownerName, `%${text}%`))!);
  const source = q.get("source");
  if (source && ["created", "copied", "imported", "scanned"].includes(source)) filters.push(eq(playArchive.source, source));
  const owner = q.get("owner");
  if (owner) filters.push(eq(playArchive.ownerId, owner.slice(0, 80)));
  if (q.get("deleted") === "1") filters.push(isNotNull(playArchive.deletedAt));
  const page = Math.max(0, Math.min(200, Number(q.get("page")) || 0));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, [total], counts] = await Promise.all([
    db.select().from(playArchive).where(where).orderBy(desc(playArchive.updatedAt)).limit(ARCHIVE_PAGE).offset(page * ARCHIVE_PAGE),
    db.select({ n: sql<number>`count(*)::int` }).from(playArchive).where(where),
    db.select({ source: playArchive.source, n: sql<number>`count(*)::int` }).from(playArchive).groupBy(playArchive.source),
  ]);
  return { plays: rows, total: total?.n ?? 0, page, pageSize: ARCHIVE_PAGE, bySource: Object.fromEntries(counts.map((c) => [c.source, c.n])) };
}

/**
 * Purges archive copies (never the coach's own plays): one play, every copy
 * from one coach, everything older than a number of days, only plays the coach
 * already deleted, or the whole archive.
 */
export async function purgeArchive(body: Record<string, unknown>): Promise<{ purged: number } | { error: string }> {
  const scope = String(body.scope ?? "");
  let where;
  if (scope === "play") where = eq(playArchive.playId, String(body.playId ?? "").slice(0, 80));
  else if (scope === "coach") where = eq(playArchive.ownerId, String(body.ownerId ?? "").slice(0, 80));
  else if (scope === "older") {
    const days = Math.round(Number(body.days));
    if (!(days >= 1 && days <= 3650)) return { error: "Choose how many days to keep, 1 to 3650." };
    where = lt(playArchive.updatedAt, new Date(Date.now() - days * 86_400_000));
  } else if (scope === "deleted") where = isNotNull(playArchive.deletedAt);
  else if (scope === "all") {
    if (body.confirm !== "PURGE") return { error: 'Type PURGE to empty the whole archive.' };
    where = sql`true`;
  } else return { error: "Choose what to purge." };
  const gone = await db.delete(playArchive).where(where).returning({ id: playArchive.playId });
  return { purged: gone.length };
}
