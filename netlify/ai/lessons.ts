import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { readLessonRules, readLessons } from "../../db/schema.js";
import type { Correction, ReadLesson } from "../../src/lib/photo.js";
import { ROUTE_IDS } from "../../src/lib/assistant.js";

/**
 * The reader's memory (Wes, 2026-11-13). Every fix a coach makes to a scanned
 * or photographed play (`correctionsBetween` in src/lib/photo.ts) is counted
 * here per coach. The coach's own lessons go into their next read straight
 * away; a lesson only reaches everyone's reads once `APP_MIN_COACHES`
 * different coaches have made it, so one coach's private shorthand stays
 * theirs, and the owner can switch any app-wide lesson off.
 */
export const APP_MIN_COACHES = 3;
const KINDS = new Set(["letter", "route"]);
const ROUTES = new Set(ROUTE_IDS);
const LETTER = /^[A-Z0-9]{1,3}$/;

/** Only lessons that can be checked: a 1–3 character mark to a letter, or one route id to another. */
export function cleanCorrections(raw: unknown): Correction[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Correction[] = [];
  for (const c of list.slice(0, 12)) {
    const kind = String(c?.kind ?? "");
    const from = String(c?.from ?? "").slice(0, 24);
    const to = String(c?.to ?? "").slice(0, 24);
    if (!KINDS.has(kind) || from === to) continue;
    if (kind === "letter" && !(LETTER.test(from) && LETTER.test(to))) continue;
    if (kind === "route" && !(ROUTES.has(from) && ROUTES.has(to))) continue;
    out.push({ kind: kind as Correction["kind"], from, to });
  }
  return out;
}

export async function teach(ownerId: string, raw: unknown) {
  const list = cleanCorrections(raw);
  for (const c of list)
    await db
      .insert(readLessons)
      .values({ ownerId, kind: c.kind, fromValue: c.from, toValue: c.to })
      .onConflictDoUpdate({
        target: [readLessons.ownerId, readLessons.kind, readLessons.fromValue, readLessons.toValue],
        set: { times: sql`${readLessons.times} + 1`, updatedAt: new Date() },
      });
  return { learned: list.length };
}

export async function myLessons(ownerId: string) {
  const rows = await db
    .select({ id: readLessons.id, kind: readLessons.kind, from: readLessons.fromValue, to: readLessons.toValue, times: readLessons.times, updatedAt: readLessons.updatedAt })
    .from(readLessons)
    .where(eq(readLessons.ownerId, ownerId))
    .orderBy(desc(readLessons.times), desc(readLessons.updatedAt))
    .limit(100);
  return { lessons: rows };
}

export async function forget(ownerId: string, id?: string) {
  await db.delete(readLessons).where(id ? and(eq(readLessons.ownerId, ownerId), eq(readLessons.id, id)) : eq(readLessons.ownerId, ownerId));
  return { ok: true };
}

/** Every lesson as the whole app sees it: how many coaches, how many fixes, and whether the owner switched it off. */
export async function appLessons() {
  const rows = await db
    .select({
      kind: readLessons.kind,
      from: readLessons.fromValue,
      to: readLessons.toValue,
      coaches: sql<number>`count(distinct ${readLessons.ownerId})::int`,
      times: sql<number>`sum(${readLessons.times})::int`,
      off: sql<boolean>`coalesce(bool_or(${readLessonRules.off}), false)`,
    })
    .from(readLessons)
    .leftJoin(
      readLessonRules,
      and(eq(readLessonRules.kind, readLessons.kind), eq(readLessonRules.fromValue, readLessons.fromValue), eq(readLessonRules.toValue, readLessons.toValue)),
    )
    .groupBy(readLessons.kind, readLessons.fromValue, readLessons.toValue)
    .orderBy(sql`count(distinct ${readLessons.ownerId}) desc`, sql`sum(${readLessons.times}) desc`)
    .limit(300);
  return rows.map((r) => ({ ...r, live: !r.off && r.coaches >= APP_MIN_COACHES }));
}

/** The lessons for one coach's next read: theirs, then the app's that they don't already have. */
export async function lessonsFor(ownerId: string): Promise<ReadLesson[]> {
  try {
    const mine = (await myLessons(ownerId)).lessons.slice(0, 20);
    const have = new Set(mine.map((l) => `${l.kind}|${l.from}`));
    const app = (await appLessons()).filter((l) => l.live && !have.has(`${l.kind}|${l.from}`)).slice(0, 20);
    return [
      ...mine.map((l) => ({ kind: l.kind as ReadLesson["kind"], from: l.from, to: l.to, times: l.times, scope: "coach" as const })),
      ...app.map((l) => ({ kind: l.kind as ReadLesson["kind"], from: l.from, to: l.to, times: l.times, scope: "app" as const })),
    ];
  } catch (e) {
    // The memory never stops a read.
    console.error("lessons", e);
    return [];
  }
}

/** The owner's switch for one app-wide lesson. */
export async function setLessonOff(kind: string, from: string, to: string, off: boolean) {
  await db
    .insert(readLessonRules)
    .values({ kind, fromValue: from, toValue: to, off })
    .onConflictDoUpdate({ target: [readLessonRules.kind, readLessonRules.fromValue, readLessonRules.toValue], set: { off, updatedAt: new Date() } });
}

/** The owner's purge of one lesson from every coach's memory. */
export async function purgeLesson(kind: string, from: string, to: string) {
  const gone = await db
    .delete(readLessons)
    .where(and(eq(readLessons.kind, kind), eq(readLessons.fromValue, from), eq(readLessons.toValue, to)))
    .returning({ id: readLessons.id });
  return gone.length;
}
