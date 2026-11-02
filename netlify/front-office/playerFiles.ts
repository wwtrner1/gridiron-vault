import { getStore } from "@netlify/blobs";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { hubFiles, playerFiles, teamPlayers } from "../../db/schema.js";
import { FILE_LIMITS, FILE_TYPES, fileExt, PLAYER_FILE_LIMITS, PLAYER_SCOPE, type PlayerFile } from "../../src/lib/teamHub.js";
import { dropBlobs } from "./files.js";
import { teamFor, type Me } from "./hub.js";

/**
 * Documents and pictures kept with one player: `/api/player-files/:scope/:playerId`
 * (GET list, POST upload, DELETE all of that player's), `/api/player-files/:scope`
 * (DELETE every file of a removed My team team) and `/api/player-file/:id`
 * (GET download, DELETE). A `my.<team>` scope is the coach's own My team and
 * only they see it; a Front Office team's id is open to that team's staff.
 * Bytes sit in the private `team-files` Blobs store, downloads are always
 * attachments with `nosniff`, and every answer is `private, no-store`.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYER = /^[A-Za-z0-9-]{1,40}$/;
const NO_PLAYER = "That player isn't on a roster you can open.";

const store = () => getStore({ name: "team-files", consistency: "strong" });

/** Who may see a scope's files: the coach alone for My team, a team's staff in a Front Office. */
async function scopeFor(me: Me, scope: string): Promise<{ orgId: string | null } | null> {
  if (!PLAYER_SCOPE.test(scope)) return null;
  if (scope.startsWith("my.")) return { orgId: null };
  const found = await teamFor(me, scope);
  return found ? { orgId: found.team.orgId } : null;
}

/** Rows a coach can see in one scope: their own for My team, everyone's for a Front Office team. */
const inScope = (me: Me, scope: string) => (scope.startsWith("my.") ? and(eq(playerFiles.scope, scope), eq(playerFiles.ownerId, me.id)) : eq(playerFiles.scope, scope));

async function list(me: Me, scope: string, playerId: string): Promise<PlayerFile[]> {
  const rows = await db
    .select()
    .from(playerFiles)
    .where(and(inScope(me, scope), eq(playerFiles.playerId, playerId)))
    .orderBy(asc(playerFiles.name));
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, size: r.size, uploaderName: r.uploaderName, createdAt: r.createdAt ? r.createdAt.toISOString() : "" }));
}

/** Drops the stored bytes and rows of the files matching `where`. */
async function dropWhere(where: ReturnType<typeof and>) {
  const rows = await db.select({ id: playerFiles.id, key: playerFiles.blobKey }).from(playerFiles).where(where);
  if (!rows.length) return;
  await dropBlobs(rows.map((r) => r.key).filter(Boolean));
  await db.delete(playerFiles).where(inArray(playerFiles.id, rows.map((r) => r.id)));
}

/** A Front Office player's files, when the player leaves the roster. */
export const dropPlayersFiles = (teamId: string, playerIds: string[]) =>
  playerIds.length ? dropWhere(and(eq(playerFiles.scope, teamId), inArray(playerFiles.playerId, playerIds))) : Promise.resolve();

/** Keys of a coach's own (My team) player files, read before account deletion removes the rows. */
export async function ownerPlayerFileKeys(ownerId: string) {
  const rows = await db.select({ key: playerFiles.blobKey }).from(playerFiles).where(and(eq(playerFiles.ownerId, ownerId), isNull(playerFiles.orgId)));
  return rows.map((r) => r.key).filter(Boolean);
}

async function usedBy(orgId: string | null, ownerId: string) {
  const own = orgId ? eq(playerFiles.orgId, orgId) : and(eq(playerFiles.ownerId, ownerId), isNull(playerFiles.orgId));
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${playerFiles.size}), 0)::bigint` }).from(playerFiles).where(own);
  let n = Number(row?.n ?? 0);
  if (orgId) {
    const [hub] = await db.select({ n: sql<number>`coalesce(sum(${hubFiles.size}), 0)::bigint` }).from(hubFiles).where(eq(hubFiles.orgId, orgId));
    n += Number(hub?.n ?? 0);
  }
  return n;
}

const cleanName = (v: string) =>
  v
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ")
    .trim()
    .slice(0, FILE_LIMITS.name);

export async function playerFilesRoute(me: Me, req: Request, resource: string, id?: string, action?: string): Promise<Response> {
  const method = req.method;

  if (resource === "player-files") {
    const scope = decodeURIComponent(id ?? "");
    const where = await scopeFor(me, scope);
    if (!where) return fail(NO_PLAYER, 404);

    // A whole My team team was removed: its files go too.
    if (!action) {
      if (method === "DELETE" && scope.startsWith("my.")) {
        await dropWhere(inScope(me, scope));
        return json({ ok: true });
      }
      return fail("That address is not part of the playbook API.", 404);
    }

    const playerId = decodeURIComponent(action);
    if (!PLAYER.test(playerId)) return fail(NO_PLAYER, 404);
    // A Front Office player must be on that team's roster.
    if (where.orgId) {
      if (!UUID.test(playerId)) return fail(NO_PLAYER, 404);
      const [p] = await db.select({ id: teamPlayers.id }).from(teamPlayers).where(and(eq(teamPlayers.id, playerId), eq(teamPlayers.teamId, scope)));
      if (!p) return fail(NO_PLAYER, 404);
    }

    if (method === "GET") return json({ files: await list(me, scope, playerId) });

    if (method === "DELETE") {
      await dropWhere(and(inScope(me, scope), eq(playerFiles.playerId, playerId)));
      return json({ ok: true });
    }

    if (method === "POST") {
      const name = cleanName(decodeURIComponent(req.headers.get("x-file-name") ?? ""));
      if (!name) return fail("That file has no name.");
      if (!FILE_TYPES.includes(fileExt(name))) return fail(`Upload documents and pictures: ${FILE_TYPES.join(", ")}.`);
      const have = await list(me, scope, playerId);
      if (have.length >= PLAYER_FILE_LIMITS.perPlayer) return fail(`A player keeps ${PLAYER_FILE_LIMITS.perPlayer} files. Remove one first.`, 403);
      const bytes = await req.arrayBuffer();
      if (!bytes.byteLength) return fail("That file is empty.");
      if (bytes.byteLength > FILE_LIMITS.size) return fail(`Files can be up to ${FILE_LIMITS.size / 1024 / 1024} MB. Shrink it or save it as a PDF first.`, 413);
      const cap = where.orgId ? FILE_LIMITS.total : PLAYER_FILE_LIMITS.total;
      if ((await usedBy(where.orgId, me.id)) + bytes.byteLength > cap)
        return fail(`You keep up to ${cap / 1024 / 1024} MB of files and it's full. Remove some you no longer need.`, 403);
      const type = (req.headers.get("content-type") ?? "application/octet-stream").slice(0, 100);
      const [row] = await db
        .insert(playerFiles)
        .values({ ownerId: me.id, orgId: where.orgId, scope, playerId, name, type, size: bytes.byteLength, blobKey: "", uploaderName: me.name || me.email })
        .returning({ id: playerFiles.id });
      const key = where.orgId ? `${where.orgId}/players/${row.id}` : `players/${me.id}/${row.id}`;
      try {
        await store().set(key, bytes, { metadata: { name, type } });
      } catch (e) {
        console.error("player-files set", e);
        await db.delete(playerFiles).where(eq(playerFiles.id, row.id));
        return fail("That file didn't upload. Try again in a minute.", 502);
      }
      await db.update(playerFiles).set({ blobKey: key }).where(eq(playerFiles.id, row.id));
      return json({ files: await list(me, scope, playerId) }, 201);
    }
  }

  if (resource === "player-file" && id && UUID.test(id)) {
    const [file] = await db.select().from(playerFiles).where(eq(playerFiles.id, id));
    const allowed = file && (file.scope.startsWith("my.") ? file.ownerId === me.id : await scopeFor(me, file.scope));
    if (!file || !allowed || !file.blobKey) return fail("That file isn't one you can open.", 404);

    if (method === "GET") {
      const data = await store().get(file.blobKey, { type: "arrayBuffer" });
      if (!data) return fail("That file is missing. Upload it again.", 404);
      const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
      return new Response(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (method === "DELETE") {
      await dropBlobs([file.blobKey]);
      await db.delete(playerFiles).where(eq(playerFiles.id, file.id));
      return json({ files: await list(me, file.scope, file.playerId) });
    }
  }

  return fail("That address is not part of the playbook API.", 404);
}
