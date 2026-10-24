import { and, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { profiles, visits } from "../../db/schema.js";
import { sha } from "./admin.js";

/**
 * Visitor counts and time on site, kept in our own database. A visit is one
 * browser-tab session. We store no IP address, no cookie and no user id; the
 * `visitor` value is a hash of the browser's random id and today's date, so it
 * counts people per day but cannot follow one across days.
 */
const SID = /^[A-Za-z0-9]{12,40}$/;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|preview|monitor|curl|wget|python-requests/i;
const MAX_BEAT = 120;
const MAX_VISIT_SECONDS = 6 * 3600;
const KEEP_DAYS = 400;

/** Pages whose address carries an id or a private link token are counted under one name. */
export const tidyPath = (raw: string) => {
  const path = raw.split(/[?#]/)[0].slice(0, 80) || "/";
  return path.replace(/^\/(team|build|grid|game)\/.+$/, "/$1/*");
};

const hostOf = (ref: string, own: string) => {
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "").toLowerCase().slice(0, 80);
    return h === own.replace(/^www\./, "") ? "" : h;
  } catch {
    return "";
  }
};

const deviceOf = (ua: string) => (/iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|iPhone|Android/i.test(ua) ? "mobile" : "desktop");

/** One beacon: {sid, path?, ref?, hit?, secs?}. Never an error for the browser. */
export async function recordVisit(opts: { raw: string; deviceId: string; ua: string; host: string; signedIn: boolean }) {
  if (opts.raw.length > 1000 || BOT.test(opts.ua)) return;
  let b: { did?: unknown; sid?: unknown; path?: unknown; ref?: unknown; hit?: unknown; secs?: unknown };
  try {
    b = JSON.parse(opts.raw);
  } catch {
    return;
  }
  const sid = String(b.sid ?? "");
  if (!SID.test(sid)) return;
  const day = new Date().toISOString().slice(0, 10);
  const secs = Math.max(0, Math.min(MAX_BEAT, Math.round(Number(b.secs) || 0)));
  const hit = b.hit ? 1 : 0;
  await db
    .insert(visits)
    .values({
      sid,
      day,
      visitor: sha(`${opts.deviceId || (/^[A-Za-z0-9-]{8,100}$/.test(String(b.did ?? "")) ? String(b.did) : sid)}|${day}`),
      signedIn: opts.signedIn,
      landing: tidyPath(String(b.path ?? "/")),
      referrer: hostOf(String(b.ref ?? ""), opts.host),
      device: deviceOf(opts.ua),
      seconds: 0,
    })
    .onConflictDoUpdate({
      target: visits.sid,
      set: {
        // Time can't grow faster than the clock: a beat counts for at most the time since the last one, plus a little slack.
        seconds: sql`least(${visits.seconds} + least(${secs}, greatest(0, extract(epoch from now() - ${visits.lastBeatAt}))::int + 5), ${MAX_VISIT_SECONDS})`,
        pages: sql`${visits.pages} + ${hit}`,
        signedIn: sql`${visits.signedIn} or ${opts.signedIn}`,
        lastBeatAt: new Date(),
      },
    });
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
    await db.delete(visits).where(sql`${visits.day} < ${cutoff}`);
  }
}

const num = (v: unknown) => Number(v ?? 0);

/** The dashboard: per-day visitors and time on site, plus where visitors come from. */
export async function visitorStats(days: number) {
  const from = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
  const inRange = gte(visits.day, from);
  const [perDay, totals, landing, referrers, devices, live, signups] = await Promise.all([
    db
      .select({
        day: visits.day,
        visitors: sql<number>`count(distinct ${visits.visitor})`,
        sessions: sql<number>`count(*)`,
        avgSeconds: sql<number>`coalesce(avg(${visits.seconds}), 0)`,
        bounced: sql<number>`count(*) filter (where ${visits.seconds} < 10 and ${visits.pages} <= 1)`,
      })
      .from(visits)
      .where(inRange)
      .groupBy(visits.day)
      .orderBy(visits.day),
    db
      .select({
        sessions: sql<number>`count(*)`,
        avgSeconds: sql<number>`coalesce(avg(${visits.seconds}), 0)`,
        medianSeconds: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${visits.seconds}), 0)`,
        totalSeconds: sql<number>`coalesce(sum(${visits.seconds}), 0)`,
        signedIn: sql<number>`count(*) filter (where ${visits.signedIn})`,
        pages: sql<number>`coalesce(avg(${visits.pages}), 0)`,
      })
      .from(visits)
      .where(inRange),
    db.select({ k: visits.landing, n: sql<number>`count(*)` }).from(visits).where(inRange).groupBy(visits.landing).orderBy(sql`count(*) desc`).limit(10),
    db
      .select({ k: visits.referrer, n: sql<number>`count(*)` })
      .from(visits)
      .where(and(inRange, sql`${visits.referrer} <> ''`))
      .groupBy(visits.referrer)
      .orderBy(sql`count(*) desc`)
      .limit(10),
    db.select({ k: visits.device, n: sql<number>`count(*)` }).from(visits).where(inRange).groupBy(visits.device),
    db.select({ n: sql<number>`count(*)` }).from(visits).where(gte(visits.lastBeatAt, new Date(Date.now() - 120_000))),
    db
      .select({ day: sql<string>`to_char(${profiles.createdAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)` })
      .from(profiles)
      .where(gte(profiles.createdAt, new Date(`${from}T00:00:00Z`)))
      .groupBy(sql`to_char(${profiles.createdAt}, 'YYYY-MM-DD')`),
  ]);
  const signupBy = new Map(signups.map((s) => [s.day, num(s.n)]));
  const t = totals[0];
  return {
    days,
    liveNow: num(live[0]?.n),
    totals: {
      sessions: num(t?.sessions),
      visitorDays: perDay.reduce((a, d) => a + num(d.visitors), 0),
      avgSeconds: Math.round(num(t?.avgSeconds)),
      medianSeconds: Math.round(num(t?.medianSeconds)),
      totalSeconds: num(t?.totalSeconds),
      signedInSessions: num(t?.signedIn),
      pagesPerVisit: Math.round(num(t?.pages) * 10) / 10,
    },
    // Every day in the range, so a day with signups but no visits (or the reverse) still shows.
    perDay: Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10)).map((day) => {
      const d = perDay.find((r) => r.day === day);
      return {
        day,
        visitors: num(d?.visitors),
        sessions: num(d?.sessions),
        avgSeconds: Math.round(num(d?.avgSeconds)),
        bounced: num(d?.bounced),
        signups: signupBy.get(day) ?? 0,
      };
    }),
    landing: landing.map((r) => ({ name: r.k, n: num(r.n) })),
    referrers: referrers.map((r) => ({ name: r.k, n: num(r.n) })),
    devices: devices.map((r) => ({ name: r.k, n: num(r.n) })),
  };
}
