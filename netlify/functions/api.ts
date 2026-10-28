import type { Config } from "@netlify/functions";
import { admin, getUser } from "@netlify/identity";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, gte, ilike, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  accountLedger,
  aiUsage,
  callSheets,
  events,
  myTeams,
  organizations,
  orgMembers,
  playbookPlays,
  playbookShares,
  playbooks,
  plays,
  playSaves,
  profiles,
  quizResults,
  trialClaims,
  trustedDevices,
} from "../../db/schema.js";
import {
  checkCode,
  DEVICE_DAYS,
  DEVICE_LIMIT,
  hashDevice,
  maskPhone,
  normalizePhone,
  noteHost,
  PhoneError,
  phoneRequired,
  sendCode,
  SMS_PER_DAY,
} from "../security/phone.js";
import { isOwner, onOwnerList } from "../security/owner.js";
import { emailKey, isDisposable, isInternetNumber, phoneKey, trialsOn } from "../security/trial.js";
import { billingOn, expireSeason, handleWebhook, openPortal, startCheckout } from "../billing/stripe.js";
import { recordVisit, visitorStats } from "../admin/visits.js";
import { keepInTrash, restoreItem, setUserPlan, userDetail, userExport } from "../admin/recovery.js";
import { audit, recentAudit, sha, userRows, usersCsv } from "../admin/admin.js";
import { frontOfficeRoute } from "../front-office/orgs.js";
import { hubRoute } from "../front-office/hub.js";
import { JOIN_TOKEN, joinRoute } from "../front-office/texts.js";
import { dropBlobs, filesRoute, orgFileKeys } from "../front-office/files.js";
import { AiError, callTool, MODELS } from "../ai/claude.js";
import { ACTIONS, cleanAssignments, cleanRead } from "../ai/reads.js";
import { gateAi, gateGrid, gatePlaybook, gateSave, gateShare, TIERS, tierFor, TRIAL_DAYS, type AiKind, type Gate, type Tier, type TierId } from "../../src/lib/plan.js";
import { griddy } from "../ai/griddy.js";
import { cleanMyTeam } from "../../src/lib/teamHub.js";
import { cleanSnapshot, SHARE_LIMITS, type Snapshot } from "../../src/lib/share.js";
import {
  ASSISTANT_TOOL,
  assistantSystem,
  MAX_CALL,
  type AssistantRead,
  type AssistantRequest,
} from "../../src/lib/assistant.js";
import { FORMATION_NAMES, GAME_TYPES } from "../../src/lib/formations.js";
import { MAX_IMAGE_CHARS, PHOTO_TOOL, photoSystem, type PhotoRead, type PhotoRequest } from "../../src/lib/photo.js";
import { cleanBoxes, SCAN_SYSTEM, SCAN_TOOL, type ScanBox, type ScanRequest } from "../../src/lib/scan.js";

/** Identity user ids are UUIDs today; accept any safe id so a different provider format doesn't lock the owner out. */
const UUID_OR_ID = /^[A-Za-z0-9_-]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const fail = (message: string, status = 400) => json({ error: message }, status);

/** `owner` is the All-Access Master account: decided server-side by netlify/security/owner.ts, never by anything the browser sends. */
type Session = { id: string; email: string; name: string; owner: boolean; /** Why an address on the owner list was not accepted (shown only to that signed-in person). */ ownerHint?: string };

async function session(): Promise<Session | null> {
  try {
    const user = await getUser();
    if (!user) return null;
    const meta = (user.userMetadata ?? {}) as Record<string, string>;
    const email = user.email ?? "";
    // getUser() falls back to the sign-in token's claims when it can't reach Identity, and the claims carry no
    // "confirmed" stamp. For the owner's address only, ask Identity directly before deciding.
    let confirmed = Boolean(user.confirmedAt);
    let ownerHint: string | undefined;
    if (!confirmed && onOwnerList(email)) {
      try {
        confirmed = Boolean((await admin.getUser(user.id)).confirmedAt);
        if (!confirmed) ownerHint = "Identity says this email is not confirmed.";
      } catch (e) {
        ownerHint = "Identity could not be asked whether this email is confirmed.";
        console.error("owner check", e);
      }
    }
    return {
      id: user.id,
      email,
      name: user.name || meta.full_name || email.split("@")[0] || "Coach",
      owner: isOwner({ email, confirmed }),
      ownerHint,
    };
  } catch {
    return null;
  }
}

async function ensureProfile(user: Session) {
  // With TRIAL_SIGNUPS=on a new coach joins on Sideline and startTrial upgrades them if they have not had a trial before.
  const created = await db
    .insert(profiles)
    .values({ id: user.id, email: user.email, displayName: user.name, plan: user.owner ? "master" : trialsOn() ? "free" : "beta" })
    .onConflictDoNothing()
    .returning({ id: profiles.id });
  if (created.length && !user.owner && trialsOn()) await startTrial(user);
  // The owner's row follows the owner list, so the plan on file matches what the server enforces.
  if (user.owner) await db.update(profiles).set({ plan: "master" }).where(and(eq(profiles.id, user.id), ne(profiles.plan, "master")));
  // "Last active" for the owner's user list: touched at most every five minutes.
  await db
    .update(profiles)
    .set({ lastActiveAt: new Date() })
    .where(and(eq(profiles.id, user.id), or(sql`${profiles.lastActiveAt} is null`, lt(profiles.lastActiveAt, new Date(Date.now() - 300_000)))));
}

/**
 * The 14-day Head Coach trial, once per person. It starts only when this email (with +tags and Gmail dots
 * folded) has never had one, including from an account since deleted, and is not a throwaway inbox. A coach
 * who is refused simply stays on Sideline. The phone check in verifiedPhone() can still take it back.
 */
async function startTrial(user: Session) {
  const key = emailKey(user.email);
  if (!key || isDisposable(user.email)) return;
  const [claimed] = await db.select({ userId: trialClaims.userId }).from(trialClaims).where(eq(trialClaims.keyHash, key));
  if (claimed && claimed.userId !== user.id) return;
  const [before] = await db.select({ id: accountLedger.userId }).from(accountLedger).where(sql`lower(${accountLedger.email}) = ${user.email.toLowerCase()}`);
  if (before) return;
  await db.insert(trialClaims).values({ keyHash: key, kind: "email", userId: user.id }).onConflictDoNothing();
  await db
    .update(profiles)
    .set({ plan: "trial", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) })
    .where(and(eq(profiles.id, user.id), eq(profiles.plan, "free")));
}

/**
 * Called when a coach's phone is confirmed. A number already tied to another person's trial (or to a deleted
 * account), or an internet-only number, ends this coach's trial: they stay on Sideline with everything they made.
 */
async function verifiedPhone(me: Session, phone: string) {
  const [row] = await db.select({ plan: profiles.plan }).from(profiles).where(eq(profiles.id, me.id));
  if (row?.plan !== "trial") return;
  const key = phoneKey(phone);
  const [claimed] = await db.select({ userId: trialClaims.userId }).from(trialClaims).where(eq(trialClaims.keyHash, key));
  const [deleted] = await db.select({ id: accountLedger.userId }).from(accountLedger).where(and(eq(accountLedger.phoneHash, sha(phone)), ne(accountLedger.userId, me.id)));
  if ((claimed && claimed.userId !== me.id) || deleted || (await isInternetNumber(phone))) {
    await db.update(profiles).set({ plan: "free", trialEndsAt: null }).where(and(eq(profiles.id, me.id), eq(profiles.plan, "trial")));
    return;
  }
  await db.insert(trialClaims).values({ keyHash: key, kind: "phone", userId: me.id }).onConflictDoNothing();
}

const DEVICE_COOKIE = "gv_device";
const DEVICE_ID = /^[A-Za-z0-9-]{8,100}$/;

/**
 * Which device this is. The browser's random id comes with every request; the
 * server also keeps it in its own long-lived cookie, which iPhone Safari holds
 * onto when it clears a site's saved data. So a confirmed phone stays
 * confirmed, and a coach isn't texted a new code after every clean-up.
 */
export default async (req: Request) => {
  noteHost(new URL(req.url).hostname);
  const fromCookie = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)gv_device=([^;]+)/)?.[1] ?? "";
  const fromHeader = (req.headers.get("x-device") ?? "").slice(0, 100);
  const deviceId = DEVICE_ID.test(fromCookie) ? fromCookie : DEVICE_ID.test(fromHeader) ? fromHeader : "";
  const res = await route(req, deviceId);
  if (deviceId && deviceId !== fromCookie) {
    res.headers.append("Set-Cookie", `${DEVICE_COOKIE}=${deviceId}; Max-Age=${400 * 86400}; Path=/api; Secure; HttpOnly; SameSite=Lax`);
  }
  return res;
};

async function route(req: Request, deviceId: string): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [resource, id, action] = parts;
  const me = await session();

  try {
    if (resource === "me") {
      if (req.method === "DELETE") {
        if (!me) return fail("Sign in first.", 401);
        return await deleteAccount(me, deviceId, await req.json().catch(() => ({})));
      }
      if (!me) return json({ user: null });
      await ensureProfile(me);
      if (id === "plan" && req.method === "PUT") return await choosePlan(me, await req.json().catch(() => ({})));
      const state = await planState(me);
      return json({ user: { id: me.id, email: me.email, name: me.name }, owner: me.owner, billing: billingOn(), ownerHint: me.owner ? undefined : me.ownerHint, plan: state.tier.id, trialEndsAt: state.trialEndsAt?.toISOString(), security: await securityOf(me, deviceId) });
    }

    /* -------------------------------------------------------- billing --- */
    if (resource === "billing" && req.method === "POST" && (id === "checkout" || id === "portal")) {
      if (!me) return fail("Sign in first.", 401);
      if (me.owner) return fail("Your account is All-Access Master. There's nothing to buy.", 403);
      await ensureProfile(me);
      const body = id === "checkout" ? await req.json().catch(() => ({})) : {};
      const out = id === "checkout" ? await startCheckout(me, String((body as Record<string, unknown>).offer ?? "")) : await openPortal(me);
      return "error" in out ? fail(out.error, 400) : json(out);
    }

    /* ---------------------------------------------------------- phone --- */
    if (resource === "phone") {
      if (!me) return fail("Sign in first.", 401);
      if (req.method !== "POST") return fail("That address is not part of the playbook API.", 404);
      await ensureProfile(me);
      return await phoneRoute(me, deviceId, id, await req.json().catch(() => ({})));
    }

    /* ----------------------------------------------- player links (public) --- */
    // A player opens a link and sends back a quiz score with no account, so these come before the sign-in checks.
    if (resource === "shares" && id && SHARE_TOKEN.test(id) && action !== "results" && req.method === "GET") return await openShare(id);
    if (resource === "shares" && id && SHARE_TOKEN.test(id) && action === "results" && req.method === "POST")
      return await sendScore(id, await req.json().catch(() => ({})));

    // A family signs up for team texts with no account.
    if (resource === "join" && id && JOIN_TOKEN.test(id) && !action) return await joinRoute(req, id);

    // Stripe's webhook proves itself with a signature, not a sign-in.
    if (resource === "billing" && id === "webhook" && req.method === "POST") return await handleWebhook(req);

    // The visitor counter: a beacon from every page view, signed in or not. The owner's own visits aren't counted.
    if (resource === "visit") {
      if (req.method === "POST" && !me?.owner)
        await recordVisit({
          raw: await req.text().catch(() => ""),
          deviceId,
          ua: req.headers.get("user-agent") ?? "",
          host: url.hostname,
          signedIn: Boolean(me),
        }).catch(() => undefined);
      return new Response(null, { status: 204 });
    }

    // Every other signed-in request: a verified phone, from a device confirmed with a code.
    if (me && phoneRequired()) {
      const sec = await securityOf(me, deviceId);
      if (!sec.verified) return json({ error: "Add your mobile number to keep using your account.", code: "phone_required" }, 403);
      if (!sec.trusted) return json({ error: "Confirm this device with the code we text you.", code: "device_unverified" }, 403);
    }

    /* ---------------------------------------------------------- admin --- */
    // The owner's console. Anyone else gets the same answer as for an address that doesn't exist.
    if (resource === "admin") {
      if (!me?.owner) return fail("That address is not part of the playbook API.", 404);
      await ensureProfile(me);
      return await adminRoute(me, req, parts.slice(1));
    }

    /* --------------------------------------------------------- events --- */
    if (resource === "events") {
      // track() beacons here; only signed-in coaches' events are kept, and nothing is ever an error for a beacon.
      if (req.method === "POST" && me) await recordEvent(me, await req.text().catch(() => ""));
      return new Response(null, { status: 204 });
    }

    /* ------------------------------------------------------------- ai --- */
    if (resource === "ai") {
      if (req.method !== "POST") return fail("That address is not part of the playbook API.", 404);
      if (!me) return fail("Sign in to talk to Griddy. He comes with every plan.", 401);
      if (id === "griddy") {
        const monthly = await monthlyAi(me, "assistant");
        if (monthly) return monthly;
        if (!(await spend(me, "assistant")))
          return fail(`That's ${DAILY_AI.assistant} Griddy requests today — the daily limit. It resets at midnight UTC.`, 429);
        return json({ reply: await griddy(await req.json()) });
      }
      if (id === "assistant") return await assistant(me, await req.json());
      if (id === "photo") return await photo(me, await req.json());
      if (id === "scan") return await scan(me, await req.json());
      return fail("That address is not part of the playbook API.", 404);
    }

    /* ---------------------------------------------------------- plays --- */
    if (resource === "plays") {
      if (req.method === "GET" && !id) {
        const scope = url.searchParams.get("scope") ?? "public";
        const q = url.searchParams.get("q")?.trim();
        const formation = url.searchParams.get("formation");
        const type = url.searchParams.get("type");

        const filters = [
          scope === "mine"
            ? me
              ? eq(plays.ownerId, me.id)
              : sql`false`
            : eq(plays.isPublic, true),
        ];
        if (q)
          filters.push(
            or(
              ilike(plays.name, `%${q}%`),
              ilike(plays.formation, `%${q}%`),
              ilike(plays.description, `%${q}%`),
            )!,
          );
        if (formation && formation !== "All")
          filters.push(eq(plays.formation, formation));
        if (type && type !== "All") filters.push(eq(plays.playType, type));

        const rows = await db
          .select()
          .from(plays)
          .where(and(...filters))
          .orderBy(desc(plays.updatedAt))
          .limit(300);
        return json({ plays: rows });
      }

      if (req.method === "GET" && id) {
        const [row] = await db.select().from(plays).where(eq(plays.id, id));
        if (!row) return fail("That play no longer exists.", 404);
        if (!row.isPublic && row.ownerId !== me?.id)
          return fail("This play is private.", 403);
        return json({ play: row });
      }

      if (!me) return fail("Sign in to save plays.", 401);
      await ensureProfile(me);

      if (req.method === "POST" && id === undefined) {
        const body = await req.json();
        const full = await vaultFull(me);
        if (full) return full;
        const [row] = await db
          .insert(plays)
          .values({ ...sanitisePlay(body), ownerId: me.id, ownerName: me.name })
          .returning();
        return json({ play: row }, 201);
      }

      if (req.method === "POST" && action === "copy") {
        const [source] = await db.select().from(plays).where(eq(plays.id, id));
        if (!source || (!source.isPublic && source.ownerId !== me.id))
          return fail("That play is not available to copy.", 404);
        const full = await vaultFull(me);
        if (full) return full;
        const tier = await planOf(me);
        const [copied] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(playSaves)
          .where(and(eq(playSaves.userId, me.id), gte(playSaves.createdAt, monthStart())));
        if ((copied?.n ?? 0) >= tier.copyLimit)
          return planFail({
            ok: false,
            reason: `${tier.name} includes ${tier.copyLimit} copies from the public Vault a month, and you've used them. They reset on the 1st, or move up a plan for more.`,
            cta: "See plans",
          });
        const [row] = await db
          .insert(plays)
          .values({
            ownerId: me.id,
            ownerName: me.name,
            name: `${source.name} (copy)`,
            formation: source.formation,
            playType: source.playType,
            personnel: source.personnel,
            description: source.description,
            tags: source.tags,
            fieldView: source.fieldView,
            scene: source.scene,
            preview: source.preview,
            isPublic: false,
          })
          .returning();
        await db.insert(playSaves).values({ userId: me.id, playId: source.id });
        await db
          .update(plays)
          .set({ saveCount: source.saveCount + 1 })
          .where(eq(plays.id, source.id));
        return json({ play: row }, 201);
      }

      if (req.method === "PUT" && id) {
        const body = await req.json();
        const [row] = await db
          .update(plays)
          .set({ ...sanitisePlayPatch(body), updatedAt: new Date() })
          .where(and(eq(plays.id, id), eq(plays.ownerId, me.id)))
          .returning();
        if (!row) return fail("You can only edit your own plays.", 403);
        return json({ play: row });
      }

      if (req.method === "DELETE" && id) {
        const [old] = UUID.test(id) ? await db.select().from(plays).where(and(eq(plays.id, id), eq(plays.ownerId, me.id))) : [];
        if (old) await keepInTrash(me.id, "play", old);
        await db
          .delete(plays)
          .where(and(eq(plays.id, id), eq(plays.ownerId, me.id)));
        return json({ ok: true });
      }
    }

    /* ------------------------------------------------ player links (coach) --- */
    if (resource === "shares") {
      if (!me) return fail("Sign in to share a playbook with your players.", 401);
      await ensureProfile(me);
      return await shareRoute(me, req.method, id, action, req);
    }

    /* --------------------------------------------------- front office --- */
    if (resource === "orgs" || resource === "org-members" || resource === "org-shares") {
      if (!me) return fail("Sign in to open the Front Office.", 401);
      await ensureProfile(me);
      return await frontOfficeRoute(me, () => planOf(me), req, resource, id, action);
    }

    /* ------------------------------------- team hub files (Front Office) --- */
    if (resource === "hub-folders" || resource === "hub-files" || (resource === "hub" && action === "folders")) {
      if (!me) return fail("Sign in to open the Front Office.", 401);
      await ensureProfile(me);
      return await filesRoute(me, req, resource, id, action);
    }

    /* -------------------------------------------------------- my team --- */
    // The coach's own roster (minors' contacts): owner only, never cached.
    if (resource === "my-team") {
      const mine = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
      if (!me) return req.method === "GET" ? mine({ team: null }) : fail("Sign in to keep your roster on your account.", 401);
      if (req.method === "GET") {
        const [row] = await db.select().from(myTeams).where(eq(myTeams.ownerId, me.id));
        return mine({ team: row ? cleanMyTeam(row.data) : null });
      }
      if (req.method === "PUT") {
        await ensureProfile(me);
        const body = (await req.json().catch(() => ({}))) as { team?: unknown };
        const team = cleanMyTeam(body.team);
        if (!team.updatedAt) team.updatedAt = new Date().toISOString();
        await db
          .insert(myTeams)
          .values({ ownerId: me.id, data: team, updatedAt: new Date() })
          .onConflictDoUpdate({ target: myTeams.ownerId, set: { data: team, updatedAt: new Date() } });
        return mine({ team });
      }
    }

    /* ----------------------------------------- team hub (Front Office) --- */
    if (resource === "hub" || resource === "hub-events" || resource === "hub-messages" || resource === "teams" || resource === "team-players" || resource === "text-signups") {
      if (!me) return fail("Sign in to open the Front Office.", 401);
      await ensureProfile(me);
      return await hubRoute(me, req, resource, id, action);
    }

    /* ------------------------------------------------------ playbooks --- */
    if (resource === "playbooks") {
      if (req.method === "GET") {
        if (!me) return json({ playbooks: [], members: [] });
        const books = await db
          .select()
          .from(playbooks)
          .where(eq(playbooks.ownerId, me.id))
          .orderBy(desc(playbooks.updatedAt));
        // Only this coach's playbooks, and only plays they may see: their own or public ones.
        // Members are ids and order only: the browser already holds the plays (the Vault pulls those).
        const members = await db
          .select({ playbookId: playbookPlays.playbookId, playId: playbookPlays.playId, sortOrder: playbookPlays.sortOrder })
          .from(playbookPlays)
          .innerJoin(playbooks, eq(playbookPlays.playbookId, playbooks.id))
          .innerJoin(plays, eq(playbookPlays.playId, plays.id))
          .where(and(eq(playbooks.ownerId, me.id), or(eq(plays.ownerId, me.id), eq(plays.isPublic, true))))
          .orderBy(playbookPlays.sortOrder);
        return json({ playbooks: books, members });
      }

      if (!me) return fail("Sign in to organise playbooks.", 401);
      await ensureProfile(me);

      if (req.method === "POST" && !id) {
        const body = await req.json();
        const tier = await planOf(me);
        const [have] = await db.select({ n: sql<number>`count(*)::int` }).from(playbooks).where(eq(playbooks.ownerId, me.id));
        const gate = gatePlaybook(tier, have?.n ?? 0);
        if (!gate.ok) return planFail(gate);
        const [row] = await db
          .insert(playbooks)
          .values({
            ownerId: me.id,
            name: String(body.name ?? "Untitled playbook").slice(0, 120),
            description: String(body.description ?? ""),
            color: String(body.color ?? "#DB5A33"),
            isPublic: Boolean(body.isPublic),
          })
          .returning();
        return json({ playbook: row }, 201);
      }

      if (req.method === "POST" && id && action === "plays") {
        const { playId, sortOrder } = await req.json();
        // The playbook has to be this coach's, and the play theirs or public.
        if (!UUID.test(id) || !UUID.test(String(playId ?? ""))) return fail("That play isn't in your Vault.", 404);
        const [book] = await db
          .select({ id: playbooks.id })
          .from(playbooks)
          .where(and(eq(playbooks.id, id), eq(playbooks.ownerId, me.id)));
        if (!book) return fail("You can only add plays to your own playbooks.", 403);
        const [play] = await db
          .select({ id: plays.id })
          .from(plays)
          .where(and(eq(plays.id, String(playId ?? "")), or(eq(plays.ownerId, me.id), eq(plays.isPublic, true))));
        if (!play) return fail("That play isn't in your Vault.", 404);
        const [row] = await db
          .insert(playbookPlays)
          .values({ playbookId: id, playId: play.id, sortOrder: Number.isFinite(Number(sortOrder)) ? Math.trunc(Number(sortOrder)) : 0 })
          .returning();
        return json({ member: row }, 201);
      }

      if (req.method === "PUT" && id) {
        if (!UUID.test(id)) return fail("That playbook isn't in your account.", 404);
        const body = await req.json();
        const [row] = await db
          .update(playbooks)
          .set({
            name: body.name === undefined ? undefined : String(body.name).slice(0, 120),
            description: body.description === undefined ? undefined : String(body.description),
            color: body.color === undefined ? undefined : String(body.color),
            isPublic: body.isPublic === undefined ? undefined : Boolean(body.isPublic),
            updatedAt: new Date(),
          })
          .where(and(eq(playbooks.id, id), eq(playbooks.ownerId, me.id)))
          .returning();
        if (!row) return fail("That playbook isn't in your account.", 404);
        // `playIds` is the whole list, in order: the browser's copy of the playbook replaces the cloud's.
        if (Array.isArray(body.playIds)) {
          const wanted = [...new Set((body.playIds as unknown[]).map(String).filter((p) => UUID.test(p)))].slice(0, 500);
          const visible = wanted.length
            ? await db.select({ id: plays.id }).from(plays).where(and(inArray(plays.id, wanted), or(eq(plays.ownerId, me.id), eq(plays.isPublic, true))))
            : [];
          const ok = new Set(visible.map((v) => v.id));
          const ids = wanted.filter((p) => ok.has(p));
          await db.delete(playbookPlays).where(eq(playbookPlays.playbookId, id));
          if (ids.length) await db.insert(playbookPlays).values(ids.map((playId, sortOrder) => ({ playbookId: id, playId, sortOrder })));
        }
        return json({ playbook: row });
      }

      if (req.method === "DELETE" && id) {
        const [old] = UUID.test(id) ? await db.select().from(playbooks).where(and(eq(playbooks.id, id), eq(playbooks.ownerId, me.id))) : [];
        if (old) {
          const members = await db.select({ playId: playbookPlays.playId }).from(playbookPlays).where(eq(playbookPlays.playbookId, old.id)).orderBy(playbookPlays.sortOrder);
          await keepInTrash(me.id, "playbook", old, { playIds: members.map((m) => m.playId) });
        }
        await db
          .delete(playbooks)
          .where(and(eq(playbooks.id, id), eq(playbooks.ownerId, me.id)));
        return json({ ok: true });
      }
    }

    /* ----------------------------------------------------- call sheets --- */
    if (resource === "call-sheets") {
      if (!me) return req.method === "GET" ? json({ sheets: [] }) : fail("Sign in to save call sheets.", 401);
      await ensureProfile(me);

      if (req.method === "GET") {
        const rows = await db
          .select()
          .from(callSheets)
          .where(eq(callSheets.ownerId, me.id))
          .orderBy(desc(callSheets.updatedAt));
        return json({ sheets: rows });
      }
      if (req.method === "POST") {
        const body = await req.json();
        const tier = await planOf(me);
        const [grids] = await db.select({ n: sql<number>`count(*)::int` }).from(callSheets).where(eq(callSheets.ownerId, me.id));
        const gate = gateGrid(tier, grids?.n ?? 0);
        if (!gate.ok) return planFail(gate);
        const [row] = await db
          .insert(callSheets)
          .values({
            ownerId: me.id,
            name: String(body.name ?? "Game plan"),
            columns: body.columns ?? [],
            rows: body.rows ?? [],
          })
          .returning();
        return json({ sheet: row }, 201);
      }
      if (req.method === "PUT" && id) {
        const body = await req.json();
        const [row] = await db
          .update(callSheets)
          .set({
            name: body.name,
            columns: body.columns,
            rows: body.rows,
            updatedAt: new Date(),
          })
          .where(and(eq(callSheets.id, id), eq(callSheets.ownerId, me.id)))
          .returning();
        if (!row) return fail("That call sheet isn't in your account.", 404);
        return json({ sheet: row });
      }
      if (req.method === "DELETE" && id) {
        const [old] = UUID.test(id) ? await db.select().from(callSheets).where(and(eq(callSheets.id, id), eq(callSheets.ownerId, me.id))) : [];
        if (old) await keepInTrash(me.id, "call_sheet", old);
        await db
          .delete(callSheets)
          .where(and(eq(callSheets.id, id), eq(callSheets.ownerId, me.id)));
        return json({ ok: true });
      }
    }

    return fail("That address is not part of the playbook API.", 404);
  } catch (error) {
    if (error instanceof AiError) return fail(error.message, error.status);
    if (error instanceof PhoneError) return fail(error.message, error.status);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return json({ error: "The playbook service could not complete that request.", detail }, 500);
  }
};

/* ---------------------------------------------------------- admin --- */

async function adminRoute(me: Session, req: Request, path: string[]) {
  const [id, uid, tail] = path;
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
  if (id === "users" && uid && UUID_OR_ID.test(uid)) {
    if (req.method === "GET" && !tail) return json(await userDetail(me, uid));
    if (req.method === "GET" && tail === "export") return json(await userExport(me, uid));
    if (req.method === "POST" && tail === "plan") {
      const r = await setUserPlan(me, uid, String(body.plan ?? ""));
      return r.error ? fail(r.error, r.status ?? 400) : json(r);
    }
  }
  if (id === "trash" && uid && UUID.test(uid) && tail === "restore" && req.method === "POST") {
    const to = body.toUserId ? String(body.toUserId) : undefined;
    if (to && !UUID_OR_ID.test(to)) return fail("That isn't a coach id.");
    const r = await restoreItem(me, uid, to);
    return r.error ? fail(r.error, r.status ?? 400) : json(r);
  }
  if (req.method === "GET" && id === "users") {
    const { users, identity } = await userRows();
    return json({ users, identity });
  }
  if (req.method === "GET" && id === "users.csv") {
    const { users } = await userRows();
    await audit(me, "export_users_csv", "", { rows: users.length });
    return new Response(usersCsv(users), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gridironvault-users-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (req.method === "GET" && id === "visitors") {
    const days = [7, 30, 90].includes(Number(new URL(req.url).searchParams.get("days"))) ? Number(new URL(req.url).searchParams.get("days")) : 30;
    return json(await visitorStats(days));
  }
  if (req.method === "GET" && id === "audit") return json({ entries: await recentAudit() });
  return fail("That address is not part of the playbook API.", 404);
}

/* ---------------------------------------------------------- plans --- */

/** First day of this month (UTC), as a timestamp and as the ai_usage day text. */
const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** The coach's plan as the server knows it (profiles.plan). The browser's copy is only for display. */
async function planOf(me: Session): Promise<Tier> {
  return (await planState(me)).tier;
}

/** The plan plus, on a trial, when it ends. A trial past its end date is Sideline from this request on. */
async function planState(me: Session): Promise<{ tier: Tier; trialEndsAt: Date | null }> {
  if (me.owner) return { tier: TIERS.master, trialEndsAt: null };
  const [row] = await db
    .select({ plan: profiles.plan, trialEndsAt: profiles.trialEndsAt, planEndsAt: profiles.planEndsAt, sub: profiles.stripeSubscriptionId })
    .from(profiles)
    .where(eq(profiles.id, me.id));
  // A one-time Season Pass that has run out, with no subscription behind it, is Sideline from this request on.
  if (row?.plan === "solo" && row.planEndsAt && !row.sub && row.planEndsAt.getTime() <= Date.now()) {
    await expireSeason(me.id);
    return { tier: TIERS.free, trialEndsAt: null };
  }
  if (row?.plan === "trial") {
    if (row.trialEndsAt && row.trialEndsAt.getTime() > Date.now()) return { tier: TIERS.trial, trialEndsAt: row.trialEndsAt };
    await db.update(profiles).set({ plan: "free", trialEndsAt: null }).where(and(eq(profiles.id, me.id), eq(profiles.plan, "trial")));
    return { tier: TIERS.free, trialEndsAt: null };
  }
  return { tier: tierFor(row?.plan), trialEndsAt: null };
}

const planFail = (gate: Extract<Gate, { ok: false }>) => json({ error: gate.reason, code: "plan_limit", cta: gate.cta }, 403);

/** A plan-limit refusal when the Vault is full, else null. */
async function vaultFull(me: Session) {
  const tier = await planOf(me);
  const [have] = await db.select({ n: sql<number>`count(*)::int` }).from(plays).where(eq(plays.ownerId, me.id));
  const gate = gateSave(tier, have?.n ?? 0);
  return gate.ok ? null : planFail(gate);
}

/** A plan-limit refusal when this month's Griddy requests or photo reviews are used up, else null. */
async function monthlyAi(me: Session, kind: AiKind) {
  const tier = await planOf(me);
  const [used] = await db
    .select({ n: sql<number>`coalesce(sum(${aiUsage.count}), 0)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.ownerId, me.id), eq(aiUsage.kind, kind), gte(aiUsage.day, monthStart().toISOString().slice(0, 10))));
  const gate = gateAi(tier, kind, used?.n ?? 0);
  return gate.ok ? null : planFail(gate);
}

/**
 * During beta a coach picks their own plan (Account and Pricing pages). Set
 * PLAN_SELF_SERVE=false when billing takes over, and only billing changes it.
 */
async function choosePlan(me: Session, body: Record<string, unknown>) {
  if (process.env.PLAN_SELF_SERVE === "false") return fail("Plans change through billing. Open Plans to switch.", 403);
  if (me.owner) return fail("Your account is All-Access Master. It doesn't switch plans.", 403);
  const id = String(body.plan ?? "") as TierId;
  if (!(id in TIERS) || id === "master" || id === "trial") return fail("That isn't one of our plans.");
  // With trials on, paid plans open with billing; until then a coach can only step down to Sideline.
  if (trialsOn() && id !== "free") return fail("Head Coach plans open soon. Your trial and your plays are safe until then.", 403);
  await db.update(profiles).set({ plan: id }).where(eq(profiles.id, me.id));
  return json({ plan: id });
}

/* --------------------------------------------------------- events --- */

const EVENT_NAMES = new Set(["play_created", "call_sheet_opened", "play_exported"]);

/** One beacon from track(): one of the three events, with a small flat payload. Anything else is dropped. */
async function recordEvent(me: Session, raw: string) {
  if (raw.length > 2000) return;
  let row: Record<string, unknown>;
  try {
    row = JSON.parse(raw);
  } catch {
    return;
  }
  const name = String(row?.name ?? "");
  if (!EVENT_NAMES.has(name)) return;
  const payload: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(row).slice(0, 16)) {
    if (k === "name" || k === "at") continue;
    if (typeof v === "string") payload[k.slice(0, 40)] = v.slice(0, 120);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) payload[k.slice(0, 40)] = v;
  }
  await db.insert(events).values({ ownerId: me.id, name, payload });
}

/** Most AI calls one coach can make in a day, whatever their plan: the hard stop on cost. */
// "texts" counts codes Twilio actually sent. (It replaced "sms", which also counted refused sends.)
// "import" counts plays Griddy draws from a dump, one per play, so a big import doesn't use up the coach's chat for the day.
// "scan" counts pages looked over for plays; each play read from a page is a "photo".
const DAILY_AI = { assistant: 60, import: 200, photo: 15, scan: 40, texts: SMS_PER_DAY } as const;

/** Counts this call against today's limit; false when the coach is over it. */
async function spend(me: Session, kind: keyof typeof DAILY_AI) {
  // The owner still gets counted (the admin usage view reads these rows) but is never cut off.
  const day = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .insert(aiUsage)
    .values({ ownerId: me.id, day, kind, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.ownerId, aiUsage.day, aiUsage.kind],
      set: { count: sql`${aiUsage.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: aiUsage.count });
  return me.owner || (row?.count ?? 0) <= DAILY_AI[kind];
}

/** Gives back a call that never happened (e.g. Twilio refused to send). */
async function refund(me: Session, kind: keyof typeof DAILY_AI) {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .update(aiUsage)
    .set({ count: sql`greatest(${aiUsage.count} - 1, 0)` })
    .where(and(eq(aiUsage.ownerId, me.id), eq(aiUsage.day, day), eq(aiUsage.kind, kind)));
}

async function assistant(me: Session, body: Partial<AssistantRequest>) {
  const call = String(body.call ?? "").trim().slice(0, MAX_CALL);
  if (!call) return fail("Type or say a play call first.");
  const game = GAME_TYPES.some((g) => g.id === body.game) ? body.game! : "5v5";
  const terms = (Array.isArray(body.terms) ? body.terms : [])
    .slice(0, 80)
    .map((t) => ({ term: String(t?.term ?? "").slice(0, 60), means: String(t?.means ?? "").slice(0, 200) }))
    .filter((t) => t.term);

  if (!body.bulk) {
    const monthly = await monthlyAi(me, "assistant");
    if (monthly) return monthly;
  }
  if (body.bulk) {
    if (!(await spend(me, "import")))
      return fail(`That's ${DAILY_AI.import} imported plays today — the daily limit. The rest can go in tomorrow; it resets at midnight UTC.`, 429);
  } else if (!(await spend(me, "assistant")))
    return fail(`That's ${DAILY_AI.assistant} Griddy requests today — the daily limit. It resets at midnight UTC.`, 429);

  const raw = await callTool<AssistantRead>({
    model: MODELS.assistant,
    system: assistantSystem({ call, game, terms }),
    content: [{ type: "text", text: call }],
    tool: ASSISTANT_TOOL,
    maxTokens: 900,
  });

  return json({ read: cleanRead(raw, game, call) });
}

const unit = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0));

/**
 * Finds the plays on a scanned page or PDF page. It doesn't use a photo
 * review (the reads that follow do), but needs one left this month, and the
 * daily "scan" cap bounds the cost.
 */
async function scan(me: Session, body: Partial<ScanRequest>) {
  const image = String(body.image ?? "");
  if (!image) return fail("Choose a scanned page first.");
  if (image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image))
    return fail("That page couldn't be read. Try a JPG, PNG or PDF under 50 MB.");
  const monthly = await monthlyAi(me, "photo");
  if (monthly) return monthly;
  if (!(await spend(me, "scan")))
    return fail(`That's ${DAILY_AI.scan} scanned pages today — the daily limit. It resets at midnight UTC.`, 429);
  const raw = await callTool<{ plays?: unknown; reason?: unknown }>({
    model: MODELS.photo,
    system: SCAN_SYSTEM,
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
      { type: "text", text: "Find every play diagram on this page." },
    ],
    tool: SCAN_TOOL,
    maxTokens: 1500,
  });
  const plays: ScanBox[] = cleanBoxes(raw.plays);
  return json({ plays, reason: plays.length ? undefined : String(raw.reason ?? "").slice(0, 200) || undefined });
}

async function photo(me: Session, body: Partial<PhotoRequest>) {
  const image = String(body.image ?? "");
  if (!image) return fail("Choose a photo of a play first.");
  if (image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image))
    return fail("That photo couldn't be read. Try a JPG or PNG under 10 MB.");
  const game = GAME_TYPES.some((g) => g.id === body.game) ? body.game! : "5v5";
  const terms = (Array.isArray(body.terms) ? body.terms : [])
    .slice(0, 80)
    .map((t) => ({ term: String(t?.term ?? "").slice(0, 60), means: String(t?.means ?? "").slice(0, 200) }))
    .filter((t) => t.term);

  const monthly = await monthlyAi(me, "photo");
  if (monthly) return monthly;
  if (!(await spend(me, "photo")))
    return fail(`That's ${DAILY_AI.photo} photo reviews today — the daily limit. It resets at midnight UTC.`, 429);

  const raw = await callTool<PhotoRead>({
    model: MODELS.photo,
    system: photoSystem({ game, terms }),
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
      { type: "text", text: "Rebuild the play in this photo." },
    ],
    tool: PHOTO_TOOL,
    maxTokens: 2000,
  });

  const letter = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  const read: PhotoRead = {
    isPlay: raw.isPlay !== false,
    reason: raw.reason ? String(raw.reason).slice(0, 200) : undefined,
    name: String(raw.name ?? "Whiteboard play").slice(0, 80),
    formation: FORMATION_NAMES.includes(raw.formation) ? raw.formation : "Custom",
    game: GAME_TYPES.some((g) => g.id === raw.game) ? raw.game : game,
    losY: unit(raw.losY),
    offenseAt: raw.offenseAt === "top" ? "top" : "bottom",
    players: (Array.isArray(raw.players) ? raw.players : []).slice(0, 24).map((p) => ({
      board: letter(p?.board) || "?",
      vault: letter(p?.vault) || letter(p?.board) || "?",
      side: p?.side === "defense" ? "defense" : "offense",
      x: unit(p?.x),
      y: unit(p?.y),
    })),
    // Photo reads also keep which way each line breaks and the line as drawn.
    assignments: cleanAssignments(raw.assignments).map((a, i) => {
      const src = (Array.isArray(raw.assignments) ? raw.assignments : []).find(
        (r, j) => j >= i && r && String(r.player ?? "").slice(0, 3).toUpperCase() === a.player,
      );
      const path = (Array.isArray(src?.path) ? src.path : []).slice(0, 8).map((p) => ({ x: unit(p?.x), y: unit(p?.y) }));
      return {
        ...a,
        breaks: src?.breaks === "left" || src?.breaks === "right" ? src.breaks : undefined,
        path: path.length >= 2 ? path : undefined,
      };
    }),
    questions: (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 3).map((q) => ({
      player: letter(q?.player),
      question: String(q?.question ?? "").slice(0, 200),
      options: (Array.isArray(q?.options) ? q.options : []).filter((o) => ACTIONS.has(o)).slice(0, 3),
    })).filter((q) => q.question && q.options.length > 1),
  };
  return json({ read });
}

/* --------------------------------------------------- one login, one coach */

type Security = { required: boolean; verified: boolean; trusted: boolean; phone: string | null; devices: number };

/**
 * Deletes the coach's account and everything stored with it: plays (and their
 * playbook links and saves), playbooks, call sheets, devices, AI usage counts,
 * the profile and phone number, then the sign-in itself. Images and video are
 * never stored on the server, so there is nothing else to remove.
 */
/* ------------------------------------------------------- player links --- */

const SHARE_TOKEN = /^[A-Za-z0-9_-]{16,40}$/;
const newToken = () => randomBytes(16).toString("base64url");

/** What a player gets: the frozen playbook and nothing about the coach. */
async function openShare(token: string) {
  const [row] = await db.select().from(playbookShares).where(eq(playbookShares.token, token));
  if (!row) return fail("This link isn't active any more. Ask your coach for a new one.", 404);
  const snap = row.snapshot as Snapshot;
  return json({ share: { name: snap.name, plays: snap.plays, updatedAt: row.updatedAt } });
}

/** A player's quiz score. Anyone with the link may send one; the numbers are checked, the oldest are dropped. */
async function sendScore(token: string, body: Record<string, unknown>) {
  const [share] = await db.select({ id: playbookShares.id }).from(playbookShares).where(eq(playbookShares.token, token));
  if (!share) return fail("This link isn't active any more. Ask your coach for a new one.", 404);
  const total = Math.trunc(Number(body.total));
  const score = Math.trunc(Number(body.score));
  const letter = String(body.letter ?? "").trim().toUpperCase();
  if (!(total >= 1 && total <= 30) || !(score >= 0 && score <= total) || !/^[A-Z0-9]{1,3}$/.test(letter)) return fail("That score couldn't be sent.");
  const playerName = String(body.name ?? "").trim().slice(0, SHARE_LIMITS.playerName);
  await db.insert(quizResults).values({ shareId: share.id, playerName, letter, score, total });
  await db.execute(sql`delete from quiz_results where share_id = ${share.id} and id not in (select id from quiz_results where share_id = ${share.id} order by at desc limit ${SHARE_LIMITS.results})`);
  return json({ ok: true }, 201);
}

async function shareRoute(me: Session, method: string, token: string | undefined, action: string | undefined, req: Request) {
  if (method === "GET" && !token) {
    const rows = await db
      .select({
        token: playbookShares.token,
        source: playbookShares.source,
        name: playbookShares.name,
        snapshot: playbookShares.snapshot,
        updatedAt: playbookShares.updatedAt,
        results: sql<number>`(select count(*)::int from quiz_results r where r.share_id = ${playbookShares.id})`,
      })
      .from(playbookShares)
      .where(eq(playbookShares.ownerId, me.id))
      .orderBy(desc(playbookShares.updatedAt));
    return json({ shares: rows.map((r) => ({ token: r.token, source: r.source, name: r.name, plays: (r.snapshot as Snapshot).plays.length, updatedAt: r.updatedAt, results: r.results })) });
  }

  if (method === "POST" && !token) {
    const gate = gateShare(await planOf(me));
    if (!gate.ok) return planFail(gate);
    const body = await req.json().catch(() => ({}));
    const snap = cleanSnapshot(body.snapshot);
    if (typeof snap === "string") return fail(snap);
    const source = String(body.source ?? "").slice(0, 80);
    // One link per playbook: sharing it again refreshes the plays and keeps the address printed on cards.
    if (source) {
      const [mine] = await db.select({ id: playbookShares.id, token: playbookShares.token }).from(playbookShares).where(and(eq(playbookShares.ownerId, me.id), eq(playbookShares.source, source)));
      if (mine) {
        await db.update(playbookShares).set({ name: snap.name, snapshot: snap, updatedAt: new Date() }).where(eq(playbookShares.id, mine.id));
        return json({ token: mine.token });
      }
    }
    const [mineCount] = await db.select({ n: sql<number>`count(*)::int` }).from(playbookShares).where(eq(playbookShares.ownerId, me.id));
    if ((mineCount?.n ?? 0) >= 40) return fail("You have 40 player links. Stop sharing one you no longer use, then try again.", 403);
    const created = newToken();
    await db.insert(playbookShares).values({ ownerId: me.id, token: created, source, name: snap.name, snapshot: snap });
    return json({ token: created }, 201);
  }

  if (!token || !SHARE_TOKEN.test(token)) return fail("That link isn't one of yours.", 404);
  const [row] = await db.select().from(playbookShares).where(and(eq(playbookShares.token, token), eq(playbookShares.ownerId, me.id)));
  if (!row) return fail("That link isn't one of yours.", 404);

  if (method === "GET" && action === "results") {
    const rows = await db.select().from(quizResults).where(eq(quizResults.shareId, row.id)).orderBy(desc(quizResults.at)).limit(SHARE_LIMITS.results);
    return json({ results: rows.map((r) => ({ id: r.id, playerName: r.playerName, letter: r.letter, score: r.score, total: r.total, at: r.at })) });
  }
  if (method === "PUT") {
    const snap = cleanSnapshot((await req.json().catch(() => ({}))).snapshot);
    if (typeof snap === "string") return fail(snap);
    await db.update(playbookShares).set({ name: snap.name, snapshot: snap, updatedAt: new Date() }).where(eq(playbookShares.id, row.id));
    return json({ token });
  }
  if (method === "DELETE") {
    await db.delete(playbookShares).where(eq(playbookShares.id, row.id));
    return json({ ok: true });
  }
  return fail("That address is not part of the playbook API.", 404);
}

async function deleteAccount(me: Session, deviceId: string, body: Record<string, unknown>) {
  const typed = String(body.confirm ?? "").trim().toLowerCase();
  if (!typed || typed !== me.email.toLowerCase()) return fail("Type your account email exactly to confirm.");
  // A stolen password alone can't delete an account protected by a phone.
  const sec = await securityOf(me, deviceId);
  if (sec.verified && !sec.trusted) return json({ error: "Confirm this device with the code we text you first.", code: "device_unverified" }, 403);

  // One transaction: if any delete fails, none of them happen, so a coach is
  // never left with a profile and sign-in but no plays.
  const [prof] = await db.select().from(profiles).where(eq(profiles.id, me.id));
  // A director's team files: read where they are now, delete them once the rows are gone.
  const [ownOrg] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.ownerId, me.id));
  const fileKeys = ownOrg ? await orgFileKeys(ownOrg.id) : [];
  const [have] = await db.select({ n: sql<number>`count(*)::int` }).from(plays).where(eq(plays.ownerId, me.id));
  await db.transaction(async (tx) => {
    // The owner's signup history keeps a fingerprint of the account, never the plays or the phone number itself.
    await tx
      .insert(accountLedger)
      .values({
        userId: me.id,
        email: me.email,
        name: me.name,
        phoneHash: prof?.phone ? sha(prof.phone) : "",
        lastPlan: prof?.plan ?? "",
        playCount: have?.n ?? 0,
        signedUpAt: prof?.createdAt ?? null,
      })
      .onConflictDoNothing();
    await tx.delete(plays).where(eq(plays.ownerId, me.id));
    await tx.delete(playSaves).where(eq(playSaves.userId, me.id));
    await tx.delete(playbooks).where(eq(playbooks.ownerId, me.id));
    await tx.delete(playbookShares).where(eq(playbookShares.ownerId, me.id));
    // A director's Front Office (its member list and shared copies) goes with them; coaches keep what they cloned.
    await tx.delete(organizations).where(eq(organizations.ownerId, me.id));
    await tx.delete(orgMembers).where(eq(orgMembers.userId, me.id));
    await tx.delete(callSheets).where(eq(callSheets.ownerId, me.id));
    await tx.delete(myTeams).where(eq(myTeams.ownerId, me.id));
    await tx.delete(trustedDevices).where(eq(trustedDevices.ownerId, me.id));
    await tx.delete(aiUsage).where(eq(aiUsage.ownerId, me.id));
    await tx.delete(events).where(eq(events.ownerId, me.id));
    await tx.delete(profiles).where(eq(profiles.id, me.id));
  });
  await dropBlobs(fileKeys).catch((e) => console.error("team-files cleanup", e));
  try {
    await admin.deleteUser(me.id);
  } catch {
    return fail("Your plays and details are deleted, but the sign-in could not be closed. Try Delete again in a minute.", 502);
  }
  return json({ ok: true });
}

async function securityOf(me: Session, deviceId: string): Promise<Security> {
  if (!phoneRequired()) return { required: false, verified: true, trusted: true, phone: null, devices: 0 };
  const [profile] = await db.select({ phone: profiles.phone, at: profiles.phoneVerifiedAt }).from(profiles).where(eq(profiles.id, me.id));
  const verified = Boolean(profile?.phone && profile.at);
  const since = new Date(Date.now() - DEVICE_DAYS * 86400_000);
  let trusted = false;
  if (verified && deviceId) {
    const [row] = await db
      .update(trustedDevices)
      .set({ lastSeen: new Date() })
      .where(and(eq(trustedDevices.ownerId, me.id), eq(trustedDevices.deviceHash, hashDevice(deviceId)), gt(trustedDevices.lastSeen, since)))
      .returning({ id: trustedDevices.id });
    trusted = Boolean(row);
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(trustedDevices).where(eq(trustedDevices.ownerId, me.id));
  return { required: true, verified, trusted, phone: profile?.phone ? maskPhone(profile.phone) : null, devices: n };
}

/** Remembers this device; past the limit, the device used longest ago is signed out. */
async function trustDevice(me: Session, deviceId: string, label: string) {
  if (!deviceId) throw new PhoneError("This browser didn't send a device id. Reload the page and try again.");
  await db
    .insert(trustedDevices)
    .values({ ownerId: me.id, deviceHash: hashDevice(deviceId), label: label.slice(0, 80) })
    .onConflictDoUpdate({ target: [trustedDevices.ownerId, trustedDevices.deviceHash], set: { lastSeen: new Date(), label: label.slice(0, 80) } });
  const rows = await db.select({ id: trustedDevices.id }).from(trustedDevices).where(eq(trustedDevices.ownerId, me.id)).orderBy(desc(trustedDevices.lastSeen));
  const extra = rows.slice(DEVICE_LIMIT).map((r) => r.id);
  if (extra.length) await db.delete(trustedDevices).where(inArray(trustedDevices.id, extra));
}

async function phoneRoute(me: Session, deviceId: string, action: string | undefined, body: Record<string, unknown>) {
  if (!phoneRequired()) return json({ security: await securityOf(me, deviceId) });
  const label = String(body.label ?? "");
  const [profile] = await db.select({ phone: profiles.phone, at: profiles.phoneVerifiedAt }).from(profiles).where(eq(profiles.id, me.id));
  const sec = await securityOf(me, deviceId);
  // Only codes that actually go out count toward the daily limit.
  const text = async (to: string) => {
    if (!(await spend(me, "texts"))) {
      await refund(me, "texts");
      throw new PhoneError(`That's ${SMS_PER_DAY} codes today — the daily limit. Try again tomorrow.`, 429);
    }
    try {
      await sendCode(to);
    } catch (e) {
      await refund(me, "texts");
      throw e;
    }
  };

  // Add or change the account's number (changing it needs a device that's already confirmed).
  if (action === "start" || action === "check") {
    if (sec.verified && !sec.trusted) throw new PhoneError("Confirm this device first, then change your number.", 403);
    const phone = normalizePhone(String(body.phone ?? ""));
    if (!phone) throw new PhoneError("Enter a mobile number, like 555-123-4567. Outside the US and Canada, start with + and the country code.");
    const [taken] = await db.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.phone, phone), ne(profiles.id, me.id)));
    if (taken) throw new PhoneError("That number is already on another GridIronVault account. Each coach needs their own number.", 409);
    if (action === "start") {
      await text(phone);
      return json({ sentTo: maskPhone(phone) });
    }
    if (!(await checkCode(phone, String(body.code ?? "")))) throw new PhoneError("That code isn't right. Check the text and try again.");
    await db.update(profiles).set({ phone, phoneVerifiedAt: new Date() }).where(eq(profiles.id, me.id));
    await verifiedPhone(me, phone);
    await trustDevice(me, deviceId, label);
    return json({ security: await securityOf(me, deviceId) });
  }

  // Confirm a new device with a code to the number on file.
  if (action === "device-start" || action === "device-check") {
    if (!profile?.phone || !profile.at) throw new PhoneError("Add your mobile number first.", 403);
    if (action === "device-start") {
      await text(profile.phone);
      return json({ sentTo: maskPhone(profile.phone) });
    }
    if (!(await checkCode(profile.phone, String(body.code ?? "")))) throw new PhoneError("That code isn't right. Check the text and try again.");
    await trustDevice(me, deviceId, label);
    return json({ security: await securityOf(me, deviceId) });
  }

  // Sign out every other device.
  if (action === "forget-others") {
    if (!sec.trusted) throw new PhoneError("Confirm this device first.", 403);
    await db.delete(trustedDevices).where(and(eq(trustedDevices.ownerId, me.id), ne(trustedDevices.deviceHash, hashDevice(deviceId))));
    return json({ security: await securityOf(me, deviceId) });
  }

  return fail("That address is not part of the playbook API.", 404);
}

function sanitisePlay(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? "Untitled play").slice(0, 160),
    formation: String(body.formation ?? ""),
    playType: String(body.playType ?? "pass"),
    personnel: String(body.personnel ?? "5v5"),
    description: String(body.description ?? ""),
    tags: Array.isArray(body.tags) ? (body.tags as string[]).slice(0, 12) : [],
    fieldView: String(body.fieldView ?? "full"),
    scene: body.scene ?? {},
    preview: String(body.preview ?? "").slice(0, 200000),
    isPublic: Boolean(body.isPublic),
  };
}

/**
 * Only the fields a PUT sends. A scene-only update (a Griddy bulk edit, a
 * Vault format paint) must leave the play's name, tags and sharing alone,
 * not reset them to the defaults a new play gets.
 */
function sanitisePlayPatch(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(sanitisePlay(body)).filter(([key]) => key in body)) as Partial<ReturnType<typeof sanitisePlay>>;
}

export const config: Config = {
  path: "/api/*",
  // Rate-limit rule 1 (Pro allows 5; rule 2, the feedback form, is in netlify.toml).
  // Per visitor IP: generous for a coach working fast, a wall for a script. The
  // daily AI and SMS caps above still apply per account.
  rateLimit: { windowLimit: 180, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
