/**
 * The starter library on the server: Sideline and beta accounts can't take the Ready-to-Go playbook or the starters
 * past the five samples into the account, by a save or by a copy from the public Vault; Head Coach can.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.TWILIO_VERIFY_SID;
delete process.env.STRIPE_SECRET_KEY;

const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");

async function call(method: string, path: string, body?: unknown) {
  const res = await api(
    new Request(`https://gridiron-vault.com/api/${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* empty */
  }
  return { status: res.status, data };
}

/** A signed-in coach on `plan`. */
async function coach(plan: string) {
  const id = randomUUID();
  signInAs({ id, email: `${id.slice(0, 8)}@example.com` });
  await call("GET", "me");
  await client.query("update profiles set plan = $1 where id = $2", [plan, id]);
  return id;
}

const play = (name: string, tags: string[]) => ({ name, tags, scene: { version: 2, nodes: [] } });

before(async () => {
  await migrate();
});

after(async () => {
  await client.close();
});

describe("Library plays by plan", () => {
  for (const plan of ["beta", "free"]) {
    test(`${plan}: a Ready-to-Go play and a held-back starter are refused, a sample starter and the coach's own play save`, async () => {
      await coach(plan);
      const ready = await call("POST", "plays", play("01 · All Curls", ["ready-to-go", "spread"]));
      assert.equal(ready.status, 403);
      assert.equal(ready.data.code, "plan_limit");
      assert.match(ready.data.error, /library/);

      const mesh = await call("POST", "plays", play("Spread — Mesh", ["starter", "spread"]));
      assert.equal(mesh.status, 403);

      const sample = await call("POST", "plays", play("Trips — Flood", ["starter", "trips"]));
      assert.equal(sample.status, 201, JSON.stringify(sample.data));

      const own = await call("POST", "plays", play("Our Flood", ["trips"]));
      assert.equal(own.status, 201);
    });
  }

  test("Head Coach saves Ready-to-Go; a beta coach can't copy it from the public Vault", async () => {
    await coach("solo");
    const ready = await call("POST", "plays", { ...play("01 · All Curls", ["ready-to-go"]), isPublic: true });
    assert.equal(ready.status, 201);

    await coach("beta");
    const copy = await call("POST", `plays/${ready.data.play.id}/copy`);
    assert.equal(copy.status, 403);
    assert.equal(copy.data.code, "plan_limit");
  });
});
