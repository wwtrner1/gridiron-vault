import { getStore } from "@netlify/blobs";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { lessonVoices } from "../../db/schema.js";
import { isVoiceId, VOICE_LIMITS, voiceType } from "../../src/lib/voice.js";

/**
 * A coach's own voice on a Film Room lesson. `POST /api/voice` (signed in)
 * keeps one short clip and answers its id; `DELETE /api/voice/:id` removes the
 * coach's own; `GET /api/voice/:id` plays it for anyone holding the id, because
 * a player on a team link has no account. The id is a random UUID, never
 * listed anywhere, and the play that names it is the only way to find it.
 * Bytes sit in the private `lesson-voices` Blobs store.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const NOT_HERE = "That recording isn't here any more.";

const store = () => getStore({ name: "lesson-voices", consistency: "strong" });

async function drop(keys: string[]) {
  const s = store();
  await Promise.all(keys.map((k) => s.delete(k).catch((e) => console.error("voice delete", e))));
}

/** Keys of every clip a coach keeps, read before account deletion removes the rows. */
export async function ownerVoiceKeys(ownerId: string) {
  const rows = await db.select({ key: lessonVoices.blobKey }).from(lessonVoices).where(eq(lessonVoices.ownerId, ownerId));
  return rows.map((r) => r.key).filter(Boolean);
}
export const dropVoiceBlobs = drop;

/** The public half: anyone with the id hears the clip. */
export async function playVoice(id: string): Promise<Response> {
  if (!isVoiceId(id)) return fail(NOT_HERE, 404);
  const [row] = await db.select().from(lessonVoices).where(eq(lessonVoices.id, id));
  if (!row || !row.blobKey) return fail(NOT_HERE, 404);
  const data = await store().get(row.blobKey, { type: "arrayBuffer" });
  if (!data) return fail(NOT_HERE, 404);
  return new Response(data, {
    headers: {
      // Only ever one of the audio types the upload allowed, so the browser can't be talked into running it.
      "Content-Type": voiceType(row.type) || "application/octet-stream",
      "Content-Length": String(data.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

export async function voiceRoute(me: { id: string }, req: Request, id?: string): Promise<Response> {
  if (req.method === "POST" && !id) {
    const type = voiceType(req.headers.get("content-type") ?? "");
    if (!type) return fail("That isn't a voice recording. Record it here in the Film Room.");
    const ms = Math.round(Number(req.headers.get("x-voice-ms")));
    if (!Number.isFinite(ms) || ms < VOICE_LIMITS.minMs) return fail("That recording is too short to hear. Record it again.");
    if (ms > VOICE_LIMITS.ms) return fail(`A step's recording can run ${VOICE_LIMITS.ms / 1000} seconds. Say it shorter and record again.`, 413);
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength) return fail("That recording is empty. Check the microphone and record again.");
    if (bytes.byteLength > VOICE_LIMITS.size) return fail("That recording is too big to keep. Say it shorter and record again.", 413);
    const [used] = await db.select({ n: sql<number>`coalesce(sum(${lessonVoices.size}), 0)::bigint` }).from(lessonVoices).where(eq(lessonVoices.ownerId, me.id));
    if (Number(used?.n ?? 0) + bytes.byteLength > VOICE_LIMITS.total)
      return fail("Your account is full of voice recordings. Remove a few from lessons you no longer teach, then record again.", 403);
    const [row] = await db.insert(lessonVoices).values({ ownerId: me.id, type, size: bytes.byteLength, ms, blobKey: "" }).returning({ id: lessonVoices.id });
    const key = `${me.id}/${row.id}`;
    try {
      await store().set(key, bytes, { metadata: { type } });
    } catch (e) {
      console.error("voice set", e);
      await db.delete(lessonVoices).where(eq(lessonVoices.id, row.id));
      return fail("That recording didn't save. Try again in a minute.", 502);
    }
    await db.update(lessonVoices).set({ blobKey: key }).where(eq(lessonVoices.id, row.id));
    return json({ id: row.id, ms }, 201);
  }

  if (req.method === "DELETE" && id && isVoiceId(id)) {
    // Another coach's id answers the same as one that never existed.
    const [row] = await db.select().from(lessonVoices).where(and(eq(lessonVoices.id, id), eq(lessonVoices.ownerId, me.id)));
    if (!row) return fail(NOT_HERE, 404);
    if (row.blobKey) await drop([row.blobKey]);
    await db.delete(lessonVoices).where(eq(lessonVoices.id, row.id));
    return json({ ok: true });
  }

  return fail("That address is not part of the playbook API.", 404);
}
