import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accountActivity, profiles } from "../../db/schema.js";
import { ACTIVITY_KINDS, traceCodeOf, type ActivityKind } from "../../src/lib/activity.js";
import { sha } from "./admin.js";

/** How long sign-in and capture rows are kept. */
export const ACTIVITY_DAYS = 180;
/** Most capture signals one account can add in a day, so a stuck key can't fill the table. */
const DAILY_CAP = 400;
/** An app open from the same device inside this window is the same visit. */
const OPEN_GAP_MS = 30 * 60_000;

/** What Netlify tells a function about where a request came from. */
export type Origin = { ip?: string; geo?: { city?: string; subdivision?: { code?: string }; country?: { code?: string } } };

/** "Chrome on Windows" from a user agent. Rough on purpose: enough to tell a coach's laptop from a stranger's phone. */
export function browserOf(ua: string) {
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Linux" : "";
  return [b, os].filter(Boolean).join(" on ") || "Unknown browser";
}

/** The IP with its last part dropped: 203.0.113.x, or the first three groups of an IPv6 address. */
export function ipPrefix(ip = "") {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/\.\d+$/, ".x");
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:…`;
  return "";
}

const placeOf = (o: Origin) => [o.geo?.city, o.geo?.subdivision?.code, o.geo?.country?.code].filter(Boolean).join(", ").slice(0, 80);

type Where = { ua: string; deviceId: string; origin: Origin };
const columns = ({ ua, deviceId, origin }: Where) => ({
  browser: browserOf(ua),
  deviceHash: deviceId ? sha(`device:${deviceId}`).slice(0, 16) : "",
  ipPrefix: ipPrefix(origin.ip),
  place: placeOf(origin),
});

async function prune() {
  if (Math.random() < 0.02) await db.delete(accountActivity).where(sql`${accountActivity.at} < now() - interval '${sql.raw(String(ACTIVITY_DAYS))} days'`);
}

/** A sign-in, or an app open (at most one per device every half hour). Never throws: activity must not block the app. */
export async function recordAccess(ownerId: string, kind: "sign_in" | "open", where: Where) {
  try {
    const cols = columns(where);
    if (kind === "open") {
      const [recent] = await db
        .select({ id: accountActivity.id })
        .from(accountActivity)
        .where(
          and(
            eq(accountActivity.ownerId, ownerId),
            inArray(accountActivity.kind, ["open", "sign_in"]),
            eq(accountActivity.deviceHash, cols.deviceHash),
            gte(accountActivity.at, new Date(Date.now() - OPEN_GAP_MS)),
          ),
        )
        .limit(1);
      if (recent) return;
    }
    await db.insert(accountActivity).values({ ownerId, kind, ...cols });
    await prune();
  } catch (e) {
    console.error("activity", e);
  }
}

/** A batch of capture signals from the browser (see src/lib/captureLog.ts). Unknown kinds and oversized batches are dropped. */
export async function recordCapture(ownerId: string, raw: string, where: Where) {
  if (raw.length > 8000) return;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(list)) return;
  const rows = list.slice(0, 20).flatMap((r) => {
    const kind = String((r as Record<string, unknown>)?.kind ?? "") as ActivityKind;
    if (!ACTIVITY_KINDS.includes(kind) || kind === "sign_in" || kind === "open") return [];
    const detail: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries((r as Record<string, unknown>).detail ?? {}).slice(0, 8)) {
      if (typeof v === "string") detail[k.slice(0, 30)] = v.slice(0, 120);
      else if (typeof v === "number" || typeof v === "boolean") detail[k.slice(0, 30)] = v;
    }
    return [{ kind, detail }];
  });
  if (!rows.length) return;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accountActivity)
    .where(and(eq(accountActivity.ownerId, ownerId), gte(accountActivity.at, new Date(Date.now() - 86400_000))));
  if (n >= DAILY_CAP) return;
  const cols = columns(where);
  await db.insert(accountActivity).values(rows.slice(0, DAILY_CAP - n).map((r) => ({ ownerId, ...cols, ...r })));
  await prune();
}

/** One coach's sign-ins and capture signals, newest first. */
export async function activityOf(uid: string, limit = 300) {
  return db
    .select({ id: accountActivity.id, kind: accountActivity.kind, browser: accountActivity.browser, deviceHash: accountActivity.deviceHash, ipPrefix: accountActivity.ipPrefix, place: accountActivity.place, detail: accountActivity.detail, at: accountActivity.at })
    .from(accountActivity)
    .where(eq(accountActivity.ownerId, uid))
    .orderBy(desc(accountActivity.at))
    .limit(limit);
}

/** Everyone's activity, newest first, with the coach's email; `kinds` narrows it ("access" = sign-ins and opens, "capture" = the rest). */
export async function activityFeed(filter: "all" | "access" | "capture", days: number) {
  const access = ["sign_in", "open"];
  const kinds = filter === "access" ? access : filter === "capture" ? ACTIVITY_KINDS.filter((k) => !access.includes(k)) : [...ACTIVITY_KINDS];
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({ id: accountActivity.id, ownerId: accountActivity.ownerId, email: profiles.email, kind: accountActivity.kind, browser: accountActivity.browser, deviceHash: accountActivity.deviceHash, ipPrefix: accountActivity.ipPrefix, place: accountActivity.place, detail: accountActivity.detail, at: accountActivity.at })
    .from(accountActivity)
    .leftJoin(profiles, eq(profiles.id, accountActivity.ownerId))
    .where(and(inArray(accountActivity.kind, kinds), gte(accountActivity.at, since)))
    .orderBy(desc(accountActivity.at))
    .limit(1000);
  // Per-coach capture totals in the window, the "who grabs the most" view.
  const totals = await db
    .select({ ownerId: accountActivity.ownerId, email: profiles.email, kind: accountActivity.kind, n: sql<number>`count(*)::int` })
    .from(accountActivity)
    .leftJoin(profiles, eq(profiles.id, accountActivity.ownerId))
    .where(and(inArray(accountActivity.kind, ACTIVITY_KINDS.filter((k) => !access.includes(k))), gte(accountActivity.at, since)))
    .groupBy(accountActivity.ownerId, profiles.email, accountActivity.kind);
  return { rows, totals };
}

/** Capture signals per coach in the last 7 days, for the user list and the watch flags. */
export async function captureCounts() {
  const rows = await db
    .select({ id: accountActivity.ownerId, n: sql<number>`count(*)::int` })
    .from(accountActivity)
    .where(and(inArray(accountActivity.kind, ["screenshot_key", "print", "copy", "export"]), gte(accountActivity.at, new Date(Date.now() - 7 * 86400_000))))
    .groupBy(accountActivity.ownerId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** Who a PDF's trace code (in its Keywords) belongs to. Checks every account, current ones only. */
export async function findTrace(code: string) {
  const want = code.trim().toUpperCase();
  if (!/^GV-[0-9A-F]{10}$/.test(want)) return null;
  const all = await db.select({ id: profiles.id, email: profiles.email, name: profiles.displayName }).from(profiles);
  for (const p of all) if ((await traceCodeOf(p.id)) === want) return p;
  return null;
}
