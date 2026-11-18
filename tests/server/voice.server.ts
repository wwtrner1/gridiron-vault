/**
 * A coach's own voice on a Film Room lesson, on the server: a clip is kept only for a signed-in coach and only when
 * it is a short audio recording, anyone holding its id can play it (a player on a team link has no account), only
 * its coach can remove it, and deleting the account removes every clip. The API function itself runs against PGlite,
 * a stand-in Identity and in-memory Blobs.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.TWILIO_VERIFY_SID;

const { migrate } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { stores } = await import("./fake-blobs.ts");
const { default: api } = await import("../../netlify/functions/api.ts");

const blobs = () => [...(stores.get("lesson-voices")?.keys() ?? [])];

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const raw = body instanceof Uint8Array;
  const res = await api(
    new Request(`https://gridiron-vault.com/api/${path}`, {
      method,
      headers: { "content-type": raw ? "audio/webm;codecs=opus" : "application/json", ...headers },
      body: (body === undefined ? undefined : raw ? body : JSON.stringify(body)) as BodyInit | undefined,
    }),
  );
  const bytes = new Uint8Array(await res.arrayBuffer());
  let data: any = null;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    /* the clip itself */
  }
  return { status: res.status, data, bytes, headers: res.headers };
}

let n = 0;
async function newCoach() {
  const coach = { id: randomUUID(), email: `voice${++n}@example.com` };
  signInAs(coach);
  await call("GET", "me");
  return coach;
}

const clip = new TextEncoder().encode("\x1aE\xdf\xa3 a coach saying find the safeties");
const record = (ms = 3200, headers: Record<string, string> = {}) => call("POST", "voice", clip, { "x-voice-ms": String(ms), ...headers });

before(async () => {
  await migrate();
});

describe("A lesson's voice recording", () => {
  test("is kept for a signed-in coach and plays for anyone holding its id", async () => {
    const coach = await newCoach();
    const made = await record();
    assert.equal(made.status, 201);
    assert.match(made.data.id, /^[0-9a-f-]{36}$/);
    assert.equal(made.data.ms, 3200);
    assert.deepEqual(blobs(), [`${coach.id}/${made.data.id}`]);

    // A player on a team link has no account.
    signInAs(null);
    const heard = await call("GET", `voice/${made.data.id}`);
    assert.equal(heard.status, 200);
    assert.equal(heard.headers.get("content-type"), "audio/webm");
    assert.equal(heard.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual([...heard.bytes], [...clip]);

    // Nobody signed in can't record or remove.
    assert.equal((await record()).status, 401);
    assert.equal((await call("DELETE", `voice/${made.data.id}`)).status, 401);
  });

  test("is refused when it isn't a short audio clip", async () => {
    await newCoach();
    assert.equal((await record(3200, { "content-type": "text/html" })).status, 400);
    assert.equal((await record(3200, { "content-type": "video/mp4" })).status, 400);
    assert.equal((await record(100)).status, 400);
    assert.equal((await record(Number.NaN)).status, 400);
    assert.equal((await record(46_000)).status, 413);
    const big = await call("POST", "voice", new Uint8Array(1024 * 1024 + 1), { "x-voice-ms": "3000" });
    assert.equal(big.status, 413);
    const empty = await call("POST", "voice", new Uint8Array(0), { "x-voice-ms": "3000" });
    assert.equal(empty.status, 400);
    assert.equal((await call("GET", "voice/not-an-id")).status, 404);
    assert.equal((await call("GET", `voice/${randomUUID()}`)).status, 404);
  });

  test("only its coach removes it", async () => {
    const coach = await newCoach();
    const made = await record();
    await newCoach();
    assert.equal((await call("DELETE", `voice/${made.data.id}`)).status, 404);
    assert.equal((await call("GET", `voice/${made.data.id}`)).status, 200);

    signInAs(coach);
    assert.equal((await call("DELETE", `voice/${made.data.id}`)).status, 200);
    assert.equal((await call("GET", `voice/${made.data.id}`)).status, 404);
    assert.equal(blobs().some((k) => k.endsWith(made.data.id)), false);
  });

  test("goes when the account is deleted", async () => {
    const coach = await newCoach();
    const a = await record();
    const b = await record(5000);
    assert.equal(blobs().filter((k) => k.startsWith(coach.id)).length, 2);
    assert.equal((await call("DELETE", "me", { confirm: coach.email })).status < 300, true);
    assert.equal(blobs().filter((k) => k.startsWith(coach.id)).length, 0);
    assert.equal((await call("GET", `voice/${a.data.id}`)).status, 404);
    assert.equal((await call("GET", `voice/${b.data.id}`)).status, 404);
  });

  test("keeps a step the Film Room voice read (a WAV) and plays it back as one", async () => {
    await newCoach();
    const made = await record(4100, { "content-type": "audio/wav" });
    assert.equal(made.status, 201);
    const heard = await call("GET", `voice/${made.data.id}`);
    assert.equal(heard.headers.get("content-type"), "audio/wav");
    assert.equal((await record(4100, { "content-type": "text/html" })).status, 400);
  });
});
