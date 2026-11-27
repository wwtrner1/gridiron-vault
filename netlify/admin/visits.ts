import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { aiUsage, events, pageViews, playbookShares, profiles, teamTexts, visits } from "../../db/schema.js";
import { sha } from "./admin.js";

/**
 * Visitor counts and time on site, kept in our own database. A visit is one
 * browser-tab session. We store no IP address, no cookie and no user id; the
 * `visitor` value is a hash of the browser's random id and today's date, so it
 * counts people per day but cannot follow one across days.
 */
const SID = /^[A-Za-z0-9]{12,40}$/;
const PV = SID;
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

/** A campaign tag kept to plain words: "instagram / launch", never a link or an address. */
export const tidyCampaign = (raw: unknown) =>
  String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._ /-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

const deviceOf = (ua: string) => (/iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|iPhone|Android/i.test(ua) ? "mobile" : "desktop");

/** One beacon: {sid, pv?, path?, ref?, utm?, back?, hit?, secs?}. Never an error for the browser. */
export async function recordVisit(opts: { raw: string; deviceId: string; ua: string; host: string; signedIn: boolean }) {
  if (opts.raw.length > 1000 || BOT.test(opts.ua)) return;
  let b: { did?: unknown; sid?: unknown; pv?: unknown; path?: unknown; ref?: unknown; utm?: unknown; back?: unknown; hit?: unknown; secs?: unknown };
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
      campaign: tidyCampaign(b.utm),
      returning: b.back === true,
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
  // The page itself: a new row when it opens, its seconds as the beats come in (capped by the clock the same way).
  const pv = String(b.pv ?? "");
  if (PV.test(pv)) {
    if (hit)
      await db
        .insert(pageViews)
        .values({ pv, sid, day, path: tidyPath(String(b.path ?? "/")) })
        .onConflictDoNothing();
    else if (secs)
      await db
        .update(pageViews)
        .set({
          seconds: sql`least(${pageViews.seconds} + least(${secs}, greatest(0, extract(epoch from now() - ${pageViews.lastBeatAt}))::int + 5), ${MAX_VISIT_SECONDS})`,
          lastBeatAt: new Date(),
        })
        .where(and(eq(pageViews.pv, pv), eq(pageViews.sid, sid)));
  }
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
    await db.delete(visits).where(sql`${visits.day} < ${cutoff}`);
    await db.delete(pageViews).where(sql`${pageViews.day} < ${cutoff}`);
  }
}

const num = (v: unknown) => Number(v ?? 0);

/** The dashboard: per-day visitors and time on site, plus where visitors come from. */
export async function visitorStats(days: number) {
  const from = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
  const inRange = gte(visits.day, from);
  const [insights, perDay, totals, landing, referrers, devices, live, signups] = await Promise.all([
    siteInsights(from),
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
    db
      .select({ k: visits.landing, n: sql<number>`count(*)`, bounced: sql<number>`count(*) filter (where ${visits.seconds} < 10 and ${visits.pages} <= 1)` })
      .from(visits)
      .where(inRange)
      .groupBy(visits.landing)
      .orderBy(sql`count(*) desc`)
      .limit(10),
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
      .where(and(gte(profiles.createdAt, new Date(`${from}T00:00:00Z`)), sql`${profiles.plan} <> 'master'`))
      .groupBy(sql`to_char(${profiles.createdAt}, 'YYYY-MM-DD')`),
  ]);
  const signupBy = new Map(signups.map((s) => [s.day, num(s.n)]));
  const t = totals[0];
  return {
    ...insights,
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
    landing: landing.map((r) => ({ name: r.k, n: num(r.n), bounced: num(r.bounced) })),
    referrers: referrers.map((r) => ({ name: r.k, n: num(r.n) })),
    devices: devices.map((r) => ({ name: r.k, n: num(r.n) })),
  };
}

/** When a visit started, on the clock in Tennessee. `started_at` is stored in UTC. */
const CENTRAL = sql`((${visits.startedAt} at time zone 'UTC') at time zone 'America/Chicago')`;

/** Paid plans: a new coach on one of these counts as paying in the funnel. */
const PAID = ["solo", "crew", "program"];
/** Coaches who aren't the owner (the owner's profile is kept on `master`). */
const notOwner = (ownerCol: unknown) => sql`${ownerCol} not in (select ${profiles.id} from ${profiles} where ${profiles.plan} = 'master')`;

/**
 * What the owner console needs to steer the product, all from data the app already keeps: every page's views,
 * time on page and how often a visit ends there; the path from a first visit to a paying coach; when coaches
 * visit (Central time); new against returning browsers; campaign tags; coaches by plan; and which tools get used.
 * Counts only, never a person.
 */
export async function siteInsights(from: string) {
  const fromTs = new Date(`${from}T00:00:00Z`);
  const pvRange = gte(pageViews.day, from);
  const lastPages = db
    .selectDistinctOn([pageViews.sid], { sid: pageViews.sid, path: pageViews.path })
    .from(pageViews)
    .where(pvRange)
    .orderBy(pageViews.sid, desc(pageViews.at), desc(pageViews.id))
    .as("last_pages");
  const [pages, exits, reach, newCoaches, heat, returningRows, campaigns, plans, eventUse, aiUse, shares, texts] = await Promise.all([
    db
      .select({
        path: pageViews.path,
        views: sql<number>`count(*)`,
        visits: sql<number>`count(distinct ${pageViews.sid})`,
        avgSeconds: sql<number>`coalesce(avg(${pageViews.seconds}), 0)`,
      })
      .from(pageViews)
      .where(pvRange)
      .groupBy(pageViews.path)
      .orderBy(sql`count(*) desc`)
      .limit(15),
    // The last page of each visit: where people leave.
    db
      .select({ path: lastPages.path, n: sql<number>`count(*)` })
      .from(lastPages)
      .groupBy(lastPages.path)
      .orderBy(sql`count(*) desc`)
      .limit(15),
    db
      .select({
        pricing: sql<number>`count(distinct ${pageViews.sid}) filter (where ${pageViews.path} = '/pricing')`,
        designer: sql<number>`count(distinct ${pageViews.sid}) filter (where ${pageViews.path} = '/build' or ${pageViews.path} = '/build/*')`,
        signin: sql<number>`count(distinct ${pageViews.sid}) filter (where ${pageViews.path} = '/signin')`,
      })
      .from(pageViews)
      .where(pvRange),
    db
      .select({
        accounts: sql<number>`count(*)`,
        // Spelled out with table names: inside a subquery Drizzle leaves column names bare, and "id" would mean the play's own id.
        madePlay: sql<number>`count(*) filter (where exists (select 1 from "plays" where "plays"."owner_id" = "profiles"."id"))`,
        paying: sql<number>`count(*) filter (where ${profiles.plan} in (${sql.join(PAID.map((p) => sql`${p}`), sql`, `)}))`,
      })
      .from(profiles)
      .where(and(gte(profiles.createdAt, fromTs), sql`${profiles.plan} <> 'master'`)),
    db
      .select({ dow: sql<number>`extract(dow from ${CENTRAL})::int`, hour: sql<number>`extract(hour from ${CENTRAL})::int`, n: sql<number>`count(*)` })
      .from(visits)
      .where(gte(visits.day, from))
      .groupBy(sql`1, 2`),
    db.select({ returning: visits.returning, n: sql<number>`count(*)` }).from(visits).where(gte(visits.day, from)).groupBy(visits.returning),
    db
      .select({ k: visits.campaign, n: sql<number>`count(*)`, signedIn: sql<number>`count(*) filter (where ${visits.signedIn})` })
      .from(visits)
      .where(and(gte(visits.day, from), sql`${visits.campaign} <> ''`))
      .groupBy(visits.campaign)
      .orderBy(sql`count(*) desc`)
      .limit(10),
    db
      .select({
        plan: profiles.plan,
        coaches: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${profiles.lastActiveAt} >= ${fromTs})`,
        joined: sql<number>`count(*) filter (where ${profiles.createdAt} >= ${fromTs})`,
      })
      .from(profiles)
      .where(sql`${profiles.plan} <> 'master'`)
      .groupBy(profiles.plan)
      .orderBy(sql`count(*) desc`),
    db
      .select({ k: events.name, n: sql<number>`count(*)`, coaches: sql<number>`count(distinct ${events.ownerId})` })
      .from(events)
      .where(and(gte(events.at, fromTs), notOwner(events.ownerId)))
      .groupBy(events.name),
    db
      .select({ k: aiUsage.kind, n: sql<number>`coalesce(sum(${aiUsage.count}), 0)`, coaches: sql<number>`count(distinct ${aiUsage.ownerId})` })
      .from(aiUsage)
      .where(and(gte(aiUsage.day, from), notOwner(aiUsage.ownerId)))
      .groupBy(aiUsage.kind),
    db
      .select({ n: sql<number>`count(*)`, coaches: sql<number>`count(distinct ${playbookShares.ownerId})` })
      .from(playbookShares)
      .where(and(gte(playbookShares.createdAt, fromTs), notOwner(playbookShares.ownerId))),
    db
      .select({ n: sql<number>`count(*)`, coaches: sql<number>`count(distinct ${teamTexts.ownerId})` })
      .from(teamTexts)
      .where(and(gte(teamTexts.createdAt, fromTs), notOwner(teamTexts.ownerId))),
  ]);
  const views = new Map(pages.map((p) => [p.path, num(p.views)]));
  const r = reach[0];
  const c = newCoaches[0];
  const back = returningRows.find((x) => x.returning);
  const fresh = returningRows.find((x) => !x.returning);
  const EVENT_WORDS: Record<string, string> = { play_created: "Plays created", call_sheet_opened: "Call sheets opened", play_exported: "Plays exported" };
  const AI_WORDS: Record<string, string> = { assistant: "Griddy messages", import: "Plays imported", scan: "Plays read from a scan", photo: "Photo reviews" };
  return {
    pages: pages.map((p) => ({ path: p.path, views: num(p.views), visits: num(p.visits), avgSeconds: Math.round(num(p.avgSeconds)) })),
    exits: exits.map((e) => ({ path: e.path, n: num(e.n), views: views.get(e.path) ?? num(e.n) })),
    funnel: {
      pricing: num(r?.pricing),
      designer: num(r?.designer),
      signin: num(r?.signin),
      accounts: num(c?.accounts),
      madePlay: num(c?.madePlay),
      paying: num(c?.paying),
    },
    heat: heat.map((h) => ({ dow: num(h.dow), hour: num(h.hour), n: num(h.n) })),
    newVsReturning: { new: num(fresh?.n), returning: num(back?.n) },
    campaigns: campaigns.map((x) => ({ name: x.k, n: num(x.n), signedIn: num(x.signedIn) })),
    plans: plans.map((p) => ({ plan: p.plan, coaches: num(p.coaches), active: num(p.active), joined: num(p.joined) })),
    features: [
      ...eventUse.map((e) => ({ name: EVENT_WORDS[e.k] ?? e.k, n: num(e.n), coaches: num(e.coaches) })),
      ...aiUse.map((a) => ({ name: AI_WORDS[a.k] ?? a.k, n: num(a.n), coaches: num(a.coaches) })),
      { name: "Playbooks shared with players", n: num(shares[0]?.n), coaches: num(shares[0]?.coaches) },
      { name: "Team texts sent", n: num(texts[0]?.n), coaches: num(texts[0]?.coaches) },
    ].sort((a, b) => b.n - a.n),
  };
}
