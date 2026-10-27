import { getStore } from "@netlify/blobs";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { hubFiles, hubFolders } from "../../db/schema.js";
import { FILE_LIMITS, FILE_TYPES, fileExt, type HubFolder } from "../../src/lib/teamHub.js";
import { accessTo, mayWrite, staffTeams, type Access, type Me } from "./hub.js";

/**
 * Team hub folders and files. Bytes live in the private `team-files` Blobs
 * store (never a public URL); the database row says who may see them. Staff
 * of the folder's team (or every member, for a whole-Front-Office folder) can
 * download; staff upload to their team's folders and only the director to the
 * whole Front Office's. Downloads are always attachments, so an uploaded file
 * never runs in the page.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_FILE = "That file isn't in a folder you can open.";

const store = () => getStore({ name: "team-files", consistency: "strong" });

/** Removes stored bytes; a blob already gone is fine. */
export async function dropBlobs(keys: string[]) {
  if (!keys.length) return;
  const s = store();
  await Promise.all(keys.map((k) => s.delete(k).catch(() => undefined)));
}

/**
 * Where an organisation's files are stored. Read these before the rows go
 * (closing a Front Office or deleting the director's account cascades them)
 * and pass them to `dropBlobs` afterwards.
 */
export async function orgFileKeys(orgId: string) {
  const rows = await db.select({ key: hubFiles.blobKey }).from(hubFiles).where(eq(hubFiles.orgId, orgId));
  return rows.map((r) => r.key).filter(Boolean);
}

export async function dropTeamFiles(teamId: string) {
  const rows = await db
    .select({ key: hubFiles.blobKey })
    .from(hubFiles)
    .innerJoin(hubFolders, eq(hubFolders.id, hubFiles.folderId))
    .where(eq(hubFolders.teamId, teamId));
  await dropBlobs(rows.map((r) => r.key));
}

async function folders(me: Me, access: Access): Promise<HubFolder[]> {
  const visible = await staffTeams(access);
  const list = await db
    .select()
    .from(hubFolders)
    .where(and(eq(hubFolders.orgId, access.orgId), visible.length ? or(isNull(hubFolders.teamId), inArray(hubFolders.teamId, visible)) : isNull(hubFolders.teamId)))
    .orderBy(asc(hubFolders.name));
  const files = list.length
    ? await db
        .select()
        .from(hubFiles)
        .where(inArray(hubFiles.folderId, list.map((f) => f.id)))
        .orderBy(asc(hubFiles.name))
    : [];
  return list.map((f) => ({
    id: f.id,
    teamId: f.teamId,
    name: f.name,
    files: files
      .filter((x) => x.folderId === f.id)
      .map((x) => ({
        id: x.id,
        name: x.name,
        type: x.type,
        size: x.size,
        uploaderName: x.uploaderName,
        mine: x.uploadedBy === me.id,
        createdAt: x.createdAt ? x.createdAt.toISOString() : "",
      })),
  }));
}

async function usedBytes(orgId: string) {
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${hubFiles.size}), 0)::bigint` }).from(hubFiles).where(eq(hubFiles.orgId, orgId));
  return Number(row?.n ?? 0);
}

const answer = async (me: Me, access: Access, status = 200, extra: Record<string, unknown> = {}) =>
  json({ folders: await folders(me, access), used: await usedBytes(access.orgId), ...extra }, status);

/** A folder and the coach's access, when they may see it. */
async function folderFor(me: Me, id: string | undefined) {
  if (!id || !UUID.test(id)) return null;
  const [folder] = await db.select().from(hubFolders).where(eq(hubFolders.id, id));
  const access = folder ? await accessTo(me, folder.orgId) : null;
  if (!folder || !access) return null;
  if (folder.teamId && !(await staffTeams(access)).includes(folder.teamId)) return null;
  return { folder, access };
}

const cleanName = (v: unknown, max: number) =>
  (typeof v === "string" ? v : "")
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ")
    .trim()
    .slice(0, max);

/** `/api/hub/:orgId/folders`, `/api/hub-folders/:id[/files]`, `/api/hub-files/:id`. */
export async function filesRoute(me: Me, req: Request, resource: string, id?: string, action?: string): Promise<Response> {
  const method = req.method;

  if (resource === "hub" && action === "folders") {
    const access = await accessTo(me, id);
    if (!access) return fail("That Front Office isn't one you belong to.", 404);
    if (method === "GET") return answer(me, access);
    if (method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const teamId = typeof body.teamId === "string" && body.teamId ? body.teamId : null;
      const denied = await mayWrite(me, access, teamId);
      if (denied) return denied;
      const names = (Array.isArray(body.names) ? body.names : [body.name]).map((n) => cleanName(n, 60)).filter(Boolean).slice(0, 10);
      if (!names.length) return fail("Name the folder first.");
      const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(hubFolders).where(eq(hubFolders.orgId, access.orgId));
      if ((count?.n ?? 0) + names.length > FILE_LIMITS.folders) return fail(`A Front Office holds ${FILE_LIMITS.folders} folders. Remove one first.`, 403);
      await db.insert(hubFolders).values(names.map((name) => ({ orgId: access.orgId, teamId, name })));
      return answer(me, access, 201);
    }
  }

  if (resource === "hub-folders") {
    const found = await folderFor(me, id);
    if (!found) return fail("That folder isn't one you can open.", 404);
    const { folder, access } = found;
    const denied = await mayWrite(me, access, folder.teamId);

    if (method === "PUT" && !action) {
      if (denied) return denied;
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const name = cleanName(body.name, 60);
      if (!name) return fail("Name the folder first.");
      await db.update(hubFolders).set({ name }).where(eq(hubFolders.id, folder.id));
      return answer(me, access);
    }

    if (method === "DELETE" && !action) {
      if (denied) return denied;
      const keys = await db.select({ key: hubFiles.blobKey }).from(hubFiles).where(eq(hubFiles.folderId, folder.id));
      await dropBlobs(keys.map((k) => k.key));
      await db.delete(hubFolders).where(eq(hubFolders.id, folder.id));
      return answer(me, access);
    }

    if (method === "POST" && action === "files") {
      if (denied) return denied;
      const name = cleanName(decodeURIComponent(req.headers.get("x-file-name") ?? ""), FILE_LIMITS.name);
      if (!name) return fail("That file has no name.");
      if (!FILE_TYPES.includes(fileExt(name))) return fail(`Upload documents and pictures: ${FILE_TYPES.join(", ")}.`);
      const bytes = await req.arrayBuffer();
      if (!bytes.byteLength) return fail("That file is empty.");
      if (bytes.byteLength > FILE_LIMITS.size) return fail(`Files can be up to ${FILE_LIMITS.size / 1024 / 1024} MB. Shrink it or save it as a PDF first.`, 413);
      if ((await usedBytes(access.orgId)) + bytes.byteLength > FILE_LIMITS.total)
        return fail(`Your Front Office holds ${FILE_LIMITS.total / 1024 / 1024} MB of files and it's full. Remove some you no longer need.`, 403);
      const type = (req.headers.get("content-type") ?? "application/octet-stream").slice(0, 100);
      const [row] = await db
        .insert(hubFiles)
        .values({ orgId: access.orgId, folderId: folder.id, name, type, size: bytes.byteLength, blobKey: "", uploadedBy: me.id, uploaderName: me.name || me.email })
        .returning({ id: hubFiles.id });
      const key = `${access.orgId}/${row.id}`;
      try {
        await store().set(key, bytes, { metadata: { name, type } });
      } catch (e) {
        console.error("team-files set", e);
        await db.delete(hubFiles).where(eq(hubFiles.id, row.id));
        return fail("That file didn't upload. Try again in a minute.", 502);
      }
      await db.update(hubFiles).set({ blobKey: key }).where(eq(hubFiles.id, row.id));
      return answer(me, access, 201);
    }
  }

  if (resource === "hub-files" && id && UUID.test(id)) {
    const [file] = await db.select().from(hubFiles).where(eq(hubFiles.id, id));
    const found = file ? await folderFor(me, file.folderId) : null;
    if (!file || !found || !file.blobKey) return fail(NO_FILE, 404);

    if (method === "GET") {
      const data = await store().get(file.blobKey, { type: "arrayBuffer" });
      if (!data) return fail("That file is missing. Ask whoever uploaded it to upload it again.", 404);
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
      const denied = await mayWrite(me, found.access, found.folder.teamId);
      if (denied && file.uploadedBy !== me.id) return denied;
      await dropBlobs([file.blobKey]);
      await db.delete(hubFiles).where(eq(hubFiles.id, file.id));
      return answer(me, found.access);
    }
  }

  return fail("That address is not part of the playbook API.", 404);
}
