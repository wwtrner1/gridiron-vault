/**
 * Playbooks on the account: a create sent twice with the same browser id (a
 * retry after a lost answer, a second tab, a stale copy of the playbook) gets
 * the row it already made instead of a duplicate, and the list says whose it is.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
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

async function coach() {
  const id = randomUUID();
  signInAs({ id, email: `${id.slice(0, 8)}@example.com` });
  await call("GET", "me");
  // Head Coach, so these tests aren't held to Sideline's one playbook and one Call Sheet (new coaches start on Sideline).
  await client.query("update profiles set plan = 'solo' where id = $1", [id]);
  return id;
}

before(async () => {
  await migrate();
});

after(async () => {
  await client.close();
});

test("the same browser playbook sent twice makes one row; another id makes another", async () => {
  const me = await coach();
  const first = await call("POST", "playbooks", { name: "MID TN BLUE", color: "#1f8fff", clientId: "book_abc" });
  assert.equal(first.status, 201);
  const again = await call("POST", "playbooks", { name: "MID TN BLUE", color: "#1f8fff", clientId: "book_abc" });
  assert.equal(again.status, 200);
  assert.equal(again.data.playbook.id, first.data.playbook.id);
  // Both at once (two tabs) still make one.
  const [x, y] = await Promise.all([
    call("POST", "playbooks", { name: "Red Zone", clientId: "book_race" }),
    call("POST", "playbooks", { name: "Red Zone", clientId: "book_race" }),
  ]);
  assert.equal(x.data.playbook.id, y.data.playbook.id);
  const other = await call("POST", "playbooks", { name: "MID TN BLUE", clientId: "book_xyz" });
  assert.notEqual(other.data.playbook.id, first.data.playbook.id);
  // An older browser that sends no id still works.
  assert.equal((await call("POST", "playbooks", { name: "No id" })).status, 201);

  const list = await call("GET", "playbooks");
  assert.equal(list.data.owner, me);
  assert.equal(list.data.playbooks.filter((b: any) => b.name === "MID TN BLUE").length, 2);
  assert.equal(list.data.playbooks.filter((b: any) => b.name === "Red Zone").length, 1);
  assert.equal(list.data.playbooks.find((b: any) => b.id === first.data.playbook.id).clientId, "book_abc");
});

test("one coach's browser id never finds another coach's playbook", async () => {
  await coach();
  const mine = await call("POST", "playbooks", { name: "Mine", clientId: "book_shared" });
  await coach();
  const theirs = await call("POST", "playbooks", { name: "Theirs", clientId: "book_shared" });
  assert.equal(theirs.status, 201);
  assert.notEqual(theirs.data.playbook.id, mine.data.playbook.id);
  assert.equal(theirs.data.playbook.name, "Theirs");
});
