/**
 * The Beta Coach plan ends (migration 20261126061947): every Beta coach moves to Sideline, the owner's audit log
 * records how many moved, and nobody else's plan changes. Runs the migrations before it, puts coaches on the old plans,
 * then runs it, the way production's data meets it.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.STRIPE_SECRET_KEY;

const END_BETA = "20261126061947";
const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");

const coaches = { beta1: randomUUID(), beta2: randomUUID(), free: randomUUID(), solo: randomUUID() };

before(async () => {
  await migrate({ before: END_BETA });
  for (const [name, id] of Object.entries(coaches)) {
    const plan = name.startsWith("beta") ? "beta" : name;
    await client.query("insert into profiles (id, email, plan) values ($1, $2, $3)", [id, `${name}@example.com`, plan]);
  }
  await migrate({ from: END_BETA });
});
after(() => signInAs(null));

const planOf = async (id: string) => (await client.query<{ plan: string }>("select plan from profiles where id = $1", [id])).rows[0].plan;

describe("Ending the Beta Coach plan", () => {
  test("Beta coaches are on Sideline; other plans are untouched", async () => {
    assert.equal(await planOf(coaches.beta1), "free");
    assert.equal(await planOf(coaches.beta2), "free");
    assert.equal(await planOf(coaches.free), "free");
    assert.equal(await planOf(coaches.solo), "solo");
    assert.equal((await client.query("select 1 from profiles where plan = 'beta'")).rows.length, 0);
  });

  test("the owner's audit log says how many moved", async () => {
    const { rows } = await client.query<{ actor_id: string; detail: Record<string, unknown> }>("select actor_id, detail from audit_log where action = 'end_beta_plan'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_id, "system");
    assert.deepEqual(rows[0].detail, { movedToSideline: 2 });
  });

  test("a former Beta coach's app shows Sideline, and a new coach starts on Sideline", async () => {
    signInAs({ id: coaches.beta1, email: "beta1@example.com", name: "Beta One" });
    assert.equal((await (await api(new Request("https://gridiron-vault.com/api/me"))).json()).plan, "free");
    signInAs({ id: randomUUID(), email: "new@example.com", name: "New Coach" });
    assert.equal((await (await api(new Request("https://gridiron-vault.com/api/me"))).json()).plan, "free");
  });
});
