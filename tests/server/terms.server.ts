/**
 * Playbook language on the account: a coach's whole term list (starter terms
 * renamed or deleted included) is stored cleaned and only for that coach, a
 * signed-out browser gets nothing and can't write, and deleting the account
 * removes it.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
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
  return { status: res.status, data, cache: res.headers.get("cache-control") };
}

async function coach() {
  const id = randomUUID();
  const email = `${id.slice(0, 8)}@example.com`;
  signInAs({ id, email });
  await call("GET", "me");
  return { id, email };
}

before(async () => {
  await migrate();
});

after(async () => {
  await client.close();
});

test("a coach's terms are kept cleaned, private to them, and gone with the account", async () => {
  const a = await coach();
  assert.equal((await call("GET", "terms")).data.terms, null);

  const sent = {
    terms: [
      { id: "glossary-flood", term: "  Sail  ", means: "Our   flood", type: "concept", source: "Starter glossary", added: "2026-09-01", scope: "shared", exampleId: "p1" },
      { id: "term-x", term: "Bang", means: "Skinny post", type: "nonsense", scope: "everyone", added: "yesterday" },
      { id: "term-x", term: "Duplicate id", means: "Dropped" },
      { id: "term-y", term: "", means: "No name, dropped" },
      { id: "term-z", term: "x".repeat(200), means: "y".repeat(900), type: "gap", scope: "staff" },
    ],
    ignored: ["Bubble", 7],
    seeded: ["glossary-flood"],
    updatedAt: "2026-11-13T07:00:00.000Z",
    extra: "dropped",
  };
  const put = await call("PUT", "terms", { terms: sent });
  assert.equal(put.status, 200);
  assert.equal(put.cache, "private, no-store");
  const got = (await call("GET", "terms")).data.terms;
  assert.deepEqual(got, put.data.terms);
  assert.equal(got.terms.length, 3);
  assert.deepEqual(got.terms[0], { id: "glossary-flood", term: "Sail", means: "Our flood", type: "concept", source: "Starter glossary", added: "2026-09-01", scope: "shared", exampleId: "p1" });
  assert.deepEqual(got.terms[1], { id: "term-x", term: "Bang", means: "Skinny post", type: "concept", source: "You added", added: "2026-09-01", scope: "you" });
  assert.equal(got.terms[2].term.length, 60);
  assert.equal(got.terms[2].means.length, 300);
  assert.deepEqual(got.ignored, ["bubble"]);
  assert.deepEqual(got.seeded, ["glossary-flood"]);
  assert.equal(got.updatedAt, "2026-11-13T07:00:00.000Z");
  assert.equal("extra" in got, false);

  // Another coach sees none of it.
  await coach();
  assert.equal((await call("GET", "terms")).data.terms, null);

  // Signed out: nothing to read, and a write is refused in coach words.
  signInAs(null);
  assert.equal((await call("GET", "terms")).data.terms, null);
  const refused = await call("PUT", "terms", { terms: sent });
  assert.equal(refused.status, 401);
  assert.match(refused.data.error, /Sign in to keep your playbook language/);

  // Deleting the account takes the terms with it.
  signInAs({ id: a.id, email: a.email });
  const del = await call("DELETE", "me", { confirm: a.email });
  assert.ok(del.status < 300, `delete answered ${del.status}: ${JSON.stringify(del.data)}`);
  const rows = await client.query("select 1 from playbook_terms where owner_id = $1", [a.id]);
  assert.equal(rows.rows.length, 0);
});

test("a director's terms reach the staff read-only, without the Just you ones, until sharing is off", async () => {
  const director = await coach();
  const terms = {
    terms: [
      { id: "glossary-flood", term: "Sail", means: "Our flood", type: "concept", scope: "shared" },
      { id: "t-staff", term: "Bang", means: "Skinny post", type: "concept", scope: "staff" },
      { id: "t-me", term: "Secret", means: "Only mine", type: "tag", scope: "you" },
    ],
    ignored: [],
    updatedAt: "2026-11-13T07:00:00.000Z",
  };
  assert.equal((await call("PUT", "terms", { terms })).status, 200);
  const org = await client.query("insert into organizations (owner_id, owner_name, name) values ($1, 'Coach Rivera', 'Hawks Football') returning id", [director.id]);
  assert.equal((await call("GET", "terms")).data.director, true);
  assert.equal((await call("GET", "terms")).data.staff, null);

  const staffer = await coach();
  // Invited but not joined: nothing yet.
  await client.query("insert into org_members (org_id, email, user_id, status) values ($1, $2, $3, 'invited')", [org.rows[0].id, staffer.email, staffer.id]);
  assert.equal((await call("GET", "terms")).data.staff, null);
  await client.query("update org_members set status = 'active', joined_at = now() where user_id = $1", [staffer.id]);
  const got = (await call("GET", "terms")).data;
  assert.equal(got.director, false);
  assert.equal(got.staff.org, "Hawks Football");
  assert.equal(got.staff.from, "Coach Rivera");
  assert.deepEqual(got.staff.terms.map((t: { term: string }) => t.term), ["Sail", "Bang"]);

  // The director switches sharing off.
  signInAs({ id: director.id, email: director.email });
  assert.equal((await call("PUT", "terms", { terms: { ...terms, shareWithStaff: false, updatedAt: "2026-11-13T08:00:00.000Z" } })).status, 200);
  signInAs({ id: staffer.id, email: staffer.email });
  assert.equal((await call("GET", "terms")).data.staff, null);
});
