import { admin as identityAdmin } from "@netlify/identity";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  accountLedger,
  aiUsage,
  auditLog,
  events,
  plays,
  profiles,
  trustedDevices,
} from "../../db/schema.js";

/**
 * The owner's console. Everything here is reached only through api.ts after
 * `me.owner` is true; every view of one coach's data and every change is
 * written to audit_log.
 */
export type Actor = { id: string; email: string };

export const sha = (v: string) => createHash("sha256").update(v).digest("hex");

export async function audit(actor: Actor, action: string, targetId = "", detail: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ actorId: actor.id, actorEmail: actor.email, action, targetId, detail });
}

/** Signals the free-plan abuse watch reads. Tune the numbers here. */
export const WATCH = {
  /** Most Griddy messages in one day that counts as "at the cap" (the daily cap is 60). */
  griddyDay: 48,
  /** play_exported events in 24 hours. */
  exportsDay: 40,
  /** Confirmed devices (the limit is 5). */
  devices: 4,
  /** Days a verified phone may be missing before the account is flagged. */
  noPhoneDays: 3,
  /** Accounts confirmed on one device within `deviceWindowDays` (the launch plan's repeat-trial signal). */
  accountsPerDevice: 3,
  deviceWindowDays: 7,
  /** Griddy messages on the day the account was made (someone burning a fresh trial). */
  griddyFirstDay: 20,
} as const;

export type UserRow = {
  id: string;
  email: string;
  name: string;
  signedUpAt: string | null;
  confirmed: boolean;
  provider: string;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  plan: string;
  phone: "verified" | "none";
  deleted: boolean;
  deletedAt: string | null;
  plays: number;
  griddyMonth: number;
  griddyPeakDay: number;
  photosMonth: number;
  exports: number;
  exports24h: number;
  devices: number;
  /** Accounts that have used this phone number, current and deleted. */
  phoneSignups: number;
  /** Most accounts confirmed on any one of this coach's devices in the last WATCH.deviceWindowDays days. */
  devicePeers: number;
  /** Griddy messages on the day the account was made. */
  griddyFirstDay: number;
  flags: string[];
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Every Identity user, in pages. Null when Identity can't be reached (local dev), so the list falls back to profiles. */
async function identityUsers() {
  try {
    const all: Awaited<ReturnType<typeof identityAdmin.listUsers>> = [];
    for (let page = 1; page <= 50; page++) {
      const rows = await identityAdmin.listUsers({ page, perPage: 100 });
      all.push(...rows);
      if (rows.length < 100) break;
    }
    return all;
  } catch {
    return null;
  }
}

const count = (n: unknown) => Number(n ?? 0);

export async function userRows(): Promise<{ users: UserRow[]; identity: boolean }> {
  const day = (n: number) => new Date(Date.now() - n * 86400_000);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const [ident, profs, ledger, playN, devN, aiM, aiPeak, expN, exp24, devRows, aiDays] = await Promise.all([
    identityUsers(),
    db.select().from(profiles),
    db.select().from(accountLedger),
    db.select({ id: plays.ownerId, n: sql`count(*)` }).from(plays).groupBy(plays.ownerId),
    db.select({ id: trustedDevices.ownerId, n: sql`count(*)` }).from(trustedDevices).groupBy(trustedDevices.ownerId),
    db
      .select({ id: aiUsage.ownerId, kind: aiUsage.kind, n: sql`sum(${aiUsage.count})` })
      .from(aiUsage)
      .where(gte(aiUsage.day, monthStart))
      .groupBy(aiUsage.ownerId, aiUsage.kind),
    db
      .select({ id: aiUsage.ownerId, n: sql`max(${aiUsage.count})` })
      .from(aiUsage)
      .where(and(eq(aiUsage.kind, "assistant"), gte(aiUsage.day, day(14).toISOString().slice(0, 10))))
      .groupBy(aiUsage.ownerId),
    db.select({ id: events.ownerId, n: sql`count(*)` }).from(events).where(eq(events.name, "play_exported")).groupBy(events.ownerId),
    db
      .select({ id: events.ownerId, n: sql`count(*)` })
      .from(events)
      .where(and(eq(events.name, "play_exported"), gte(events.at, day(1))))
      .groupBy(events.ownerId),
    db.select({ id: trustedDevices.ownerId, hash: trustedDevices.deviceHash, at: trustedDevices.createdAt }).from(trustedDevices),
    db
      .select({ id: aiUsage.ownerId, day: aiUsage.day, n: aiUsage.count })
      .from(aiUsage)
      .where(and(eq(aiUsage.kind, "assistant"), gte(aiUsage.day, day(60).toISOString().slice(0, 10)))),
  ]);

  const by = (rows: { id: string; n: unknown }[]) => new Map(rows.map((r) => [r.id, count(r.n)]));
  const plays_ = by(playN), dev_ = by(devN), peak_ = by(aiPeak), exp_ = by(expN), exp24_ = by(exp24);
  const ai = (id: string, kind: string) => count(aiM.find((r) => r.id === id && r.kind === kind)?.n);

  const phoneUse = new Map<string, number>();
  for (const l of ledger) if (l.phoneHash) phoneUse.set(l.phoneHash, (phoneUse.get(l.phoneHash) ?? 0) + 1);
  for (const p of profs) if (p.phone) phoneUse.set(sha(p.phone), (phoneUse.get(sha(p.phone)) ?? 0) + 1);

  // Accounts per device, counting only confirmations inside the window, so a family laptop used over a season isn't flagged.
  const recent = day(WATCH.deviceWindowDays);
  const onDevice = new Map<string, Set<string>>();
  for (const d of devRows) {
    if (!d.at || new Date(d.at) < recent) continue;
    if (!onDevice.has(d.hash)) onDevice.set(d.hash, new Set());
    onDevice.get(d.hash)!.add(d.id);
  }
  const peers = (id: string) => Math.max(0, ...devRows.filter((d) => d.id === id).map((d) => onDevice.get(d.hash)?.size ?? 0));
  const griddyOn = new Map(aiDays.map((r) => [`${r.id}|${r.day}`, count(r.n)]));

  const profile = new Map(profs.map((p) => [p.id, p]));
  const ids = new Set<string>([...profs.map((p) => p.id), ...(ident ?? []).map((u) => u.id)]);
  const identById = new Map((ident ?? []).map((u) => [u.id, u]));

  const users: UserRow[] = [...ids].map((id) => {
    const u = identById.get(id);
    const p = profile.get(id);
    const signedUpAt = iso(u?.createdAt ?? p?.createdAt);
    const phone = p?.phone && p.phoneVerifiedAt ? "verified" : "none";
    const row: UserRow = {
      id,
      email: u?.email ?? p?.email ?? "",
      name: p?.displayName || u?.name || "",
      signedUpAt,
      confirmed: Boolean(u?.confirmedAt),
      provider: String(u?.provider ?? ""),
      lastSignInAt: iso(u?.lastSignInAt),
      lastActiveAt: iso(p?.lastActiveAt),
      plan: p?.plan ?? "none yet",
      phone,
      deleted: false,
      deletedAt: null,
      plays: plays_.get(id) ?? 0,
      griddyMonth: ai(id, "assistant"),
      griddyPeakDay: peak_.get(id) ?? 0,
      photosMonth: ai(id, "photo"),
      exports: exp_.get(id) ?? 0,
      exports24h: exp24_.get(id) ?? 0,
      devices: dev_.get(id) ?? 0,
      phoneSignups: p?.phone ? phoneUse.get(sha(p.phone)) ?? 1 : 0,
      devicePeers: peers(id),
      griddyFirstDay: signedUpAt ? griddyOn.get(`${id}|${signedUpAt.slice(0, 10)}`) ?? 0 : 0,
      flags: [],
    };
    // The owner's own testing never raises a flag.
    if (p?.plan === "master") return row;
    const f = row.flags;
    if (row.devicePeers >= WATCH.accountsPerDevice) f.push(`${row.devicePeers} accounts on one device this week`);
    if (row.griddyFirstDay >= WATCH.griddyFirstDay) f.push("Heavy Griddy use on day one");
    if (row.phoneSignups > 1) f.push("Phone used by more than one account");
    if (row.devices >= WATCH.devices) f.push("Many devices");
    if (row.griddyPeakDay >= WATCH.griddyDay) f.push("Near the daily Griddy cap");
    if (row.exports24h >= WATCH.exportsDay) f.push("Heavy exporting today");
    if (phone === "none" && signedUpAt && Date.now() - Date.parse(signedUpAt) > WATCH.noPhoneDays * 86400_000 && row.plays + row.griddyMonth > 0)
      f.push("Using the app with no verified phone");
    return row;
  });

  for (const l of ledger) {
    users.push({
      id: l.userId, email: l.email, name: l.name, signedUpAt: iso(l.signedUpAt), confirmed: true, provider: "", lastSignInAt: null,
      lastActiveAt: null, plan: l.lastPlan, phone: "none", deleted: true, deletedAt: iso(l.deletedAt), plays: l.playCount,
      griddyMonth: 0, griddyPeakDay: 0, photosMonth: 0, exports: 0, exports24h: 0, devices: 0, devicePeers: 0, griddyFirstDay: 0,
      phoneSignups: l.phoneHash ? phoneUse.get(l.phoneHash) ?? 1 : 0, flags: [],
    });
  }
  users.sort((a, b) => (b.signedUpAt ?? "").localeCompare(a.signedUpAt ?? ""));
  return { users, identity: ident !== null };
}

/** A spreadsheet cell that can't run as a formula when the owner opens the file in Excel or Sheets. */
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function usersCsv(users: UserRow[]) {
  const cols: [string, (u: UserRow) => unknown][] = [
    ["Email", (u) => u.email], ["Name", (u) => u.name], ["Signed up", (u) => u.signedUpAt], ["Email confirmed", (u) => u.confirmed ? "yes" : "no"],
    ["Sign-in method", (u) => u.provider], ["Last sign-in", (u) => u.lastSignInAt], ["Last active", (u) => u.lastActiveAt], ["Plan", (u) => u.plan],
    ["Phone", (u) => u.phone], ["Account", (u) => (u.deleted ? `deleted ${u.deletedAt}` : "active")], ["Plays", (u) => u.plays],
    ["Griddy this month", (u) => u.griddyMonth], ["Photo reviews this month", (u) => u.photosMonth], ["Exports", (u) => u.exports],
    ["Devices", (u) => u.devices], ["Accounts on this phone", (u) => u.phoneSignups], ["Accounts on one device (7 days)", (u) => u.devicePeers], ["Griddy on signup day", (u) => u.griddyFirstDay], ["Flags", (u) => u.flags.join("; ")], ["User id", (u) => u.id],
  ];
  return [cols.map(([h]) => cell(h)).join(","), ...users.map((u) => cols.map(([, f]) => cell(f(u))).join(","))].join("\r\n");
}

export async function recentAudit(limit = 200) {
  return db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
}
