import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  aiUsage,
  callSheets,
  playbookPlays,
  playbooks,
  plays,
  playSaves,
  profiles,
} from "../../db/schema.js";
import { AiError, callTool, MODELS } from "../ai/claude.js";
import {
  ASSISTANT_TOOL,
  assistantSystem,
  BLOCK_IDS,
  MAX_CALL,
  ROUTE_IDS,
  type AssistantRead,
  type AssistantRequest,
} from "../../src/lib/assistant.js";
import { FORMATION_NAMES, GAME_TYPES } from "../../src/lib/formations.js";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const fail = (message: string, status = 400) => json({ error: message }, status);

type Session = { id: string; email: string; name: string };

async function session(): Promise<Session | null> {
  try {
    const user = await getUser();
    if (!user) return null;
    const meta = (user.userMetadata ?? {}) as Record<string, string>;
    return {
      id: user.id,
      email: user.email ?? "",
      name: user.name || meta.full_name || (user.email ?? "").split("@")[0] || "Coach",
    };
  } catch {
    return null;
  }
}

async function ensureProfile(user: Session) {
  await db
    .insert(profiles)
    .values({ id: user.id, email: user.email, displayName: user.name })
    .onConflictDoNothing();
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [resource, id, action] = parts;
  const me = await session();

  try {
    if (resource === "me") {
      if (!me) return json({ user: null });
      await ensureProfile(me);
      return json({ user: me });
    }

    /* ------------------------------------------------------------- ai --- */
    if (resource === "ai") {
      if (req.method !== "POST") return fail("That address is not part of the playbook API.", 404);
      if (!me) return fail("Sign in to use the Play assistant. It is free with every plan.", 401);
      if (id === "assistant") return await assistant(me, await req.json());
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
          .set({ ...sanitisePlay(body), updatedAt: new Date() })
          .where(and(eq(plays.id, id), eq(plays.ownerId, me.id)))
          .returning();
        if (!row) return fail("You can only edit your own plays.", 403);
        return json({ play: row });
      }

      if (req.method === "DELETE" && id) {
        await db
          .delete(plays)
          .where(and(eq(plays.id, id), eq(plays.ownerId, me.id)));
        return json({ ok: true });
      }
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
        const members = await db
          .select()
          .from(playbookPlays)
          .innerJoin(plays, eq(playbookPlays.playId, plays.id));
        return json({ playbooks: books, members });
      }

      if (!me) return fail("Sign in to organise playbooks.", 401);
      await ensureProfile(me);

      if (req.method === "POST" && !id) {
        const body = await req.json();
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
        const [row] = await db
          .insert(playbookPlays)
          .values({ playbookId: id, playId, sortOrder: sortOrder ?? 0 })
          .returning();
        return json({ member: row }, 201);
      }

      if (req.method === "PUT" && id) {
        const body = await req.json();
        const [row] = await db
          .update(playbooks)
          .set({
            name: body.name,
            description: body.description,
            color: body.color,
            isPublic: body.isPublic,
            updatedAt: new Date(),
          })
          .where(and(eq(playbooks.id, id), eq(playbooks.ownerId, me.id)))
          .returning();
        return json({ playbook: row });
      }

      if (req.method === "DELETE" && id) {
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
        return json({ sheet: row });
      }
      if (req.method === "DELETE" && id) {
        await db
          .delete(callSheets)
          .where(and(eq(callSheets.id, id), eq(callSheets.ownerId, me.id)));
        return json({ ok: true });
      }
    }

    return fail("That address is not part of the playbook API.", 404);
  } catch (error) {
    if (error instanceof AiError) return fail(error.message, error.status);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return json({ error: "The playbook service could not complete that request.", detail }, 500);
  }
};

/** Most AI calls one coach can make in a day, whatever their plan: the hard stop on cost. */
const DAILY_AI = { assistant: 60, photo: 15 } as const;

/** Counts this call against today's limit; false when the coach is over it. */
async function spend(me: Session, kind: keyof typeof DAILY_AI) {
  const day = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .insert(aiUsage)
    .values({ ownerId: me.id, day, kind, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.ownerId, aiUsage.day, aiUsage.kind],
      set: { count: sql`${aiUsage.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: aiUsage.count });
  return (row?.count ?? 0) <= DAILY_AI[kind];
}

async function assistant(me: Session, body: Partial<AssistantRequest>) {
  const call = String(body.call ?? "").trim().slice(0, MAX_CALL);
  if (!call) return fail("Type or say a play call first.");
  const game = GAME_TYPES.some((g) => g.id === body.game) ? body.game! : "5v5";
  const terms = (Array.isArray(body.terms) ? body.terms : [])
    .slice(0, 80)
    .map((t) => ({ term: String(t?.term ?? "").slice(0, 60), means: String(t?.means ?? "").slice(0, 200) }))
    .filter((t) => t.term);

  if (!(await spend(me, "assistant")))
    return fail(`That's ${DAILY_AI.assistant} assistant calls today — the daily limit. It resets at midnight UTC.`, 429);

  const raw = await callTool<AssistantRead>({
    model: MODELS.assistant,
    system: assistantSystem({ call, game, terms }),
    content: [{ type: "text", text: call }],
    tool: ASSISTANT_TOOL,
    maxTokens: 900,
  });

  // Trust nothing the model returns without checking it against our own lists.
  const actions = new Set([...ROUTE_IDS, ...BLOCK_IDS, "motion"]);
  let read = false;
  const assignments = (Array.isArray(raw.assignments) ? raw.assignments : [])
    .filter((a) => a && typeof a.player === "string" && actions.has(a.action))
    .slice(0, 11)
    .map((a) => {
      const first = Boolean(a.firstRead) && !read && a.kind === "route";
      if (first) read = true;
      return {
        player: a.player.slice(0, 3).toUpperCase(),
        kind: (["route", "block", "motion"].includes(a.kind) ? a.kind : "route") as AssistantRead["assignments"][number]["kind"],
        action: a.action,
        toward: a.toward === "in" || a.toward === "out" ? a.toward : undefined,
        firstRead: first || undefined,
        heard: String(a.heard ?? "").slice(0, 80),
      };
    });
  const result: AssistantRead = {
    formation: FORMATION_NAMES.includes(raw.formation) ? raw.formation : FORMATION_NAMES[0],
    game: GAME_TYPES.some((g) => g.id === raw.game) ? raw.game : game,
    personnel: typeof raw.personnel === "string" ? raw.personnel.slice(0, 2) : undefined,
    name: String(raw.name ?? call).slice(0, 80),
    assignments,
    unsure: (Array.isArray(raw.unsure) ? raw.unsure : []).map((q) => String(q).slice(0, 200)).slice(0, 4),
  };
  return json({ read: result });
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

export const config: Config = { path: "/api/*" };
