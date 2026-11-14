/**
 * The Drill Vault and practice script on the account: one coach's copy is stored cleaned
 * and private, a second device's PUT merges with it (each drill's newer save
 * wins, a delete reaches every device, the newer script and stars win), a
 * signed-out browser can't write, and deleting the account removes it.
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

const drill = (id: string, name: string, updatedAt: string) => ({
  id,
  name,
  category: "Defensive backs",
  side: "defense",
  minutes: 10,
  players: "",
  equipment: [],
  setup: "",
  steps: ["Go"],
  points: [],
  updatedAt,
});
const period = (id: string, title: string) => ({ id, title, minutes: 10, note: "", playIds: [], drillIds: ["drill-trail-technique"], kind: "individual" });

test("drills and the practice script follow the coach to every device and merge, never overwrite", async () => {
  const a = await coach();
  const empty = await call("GET", "practice");
  assert.equal(empty.data.vault, null);
  assert.equal(empty.cache, "private, no-store");

  // The laptop writes two drills (plus junk the server drops), stars one and saves a script.
  const laptop = {
    drills: [
      drill("drl_a", "Bag Weave", "2026-11-13T08:00:00.000Z"),
      drill("drl_b", "Mirror", "2026-11-13T08:05:00.000Z"),
      drill("no-prefix", "Dropped", "2026-11-13T08:00:00.000Z"),
      { id: "drl_c", name: "" },
    ],
    deleted: [],
    favorites: ["drill-backpedal-breaks"],
    favoritesAt: "2026-11-13T08:00:00.000Z",
    script: { name: "Tuesday", start: "16:00", periods: [period("per_1", "Warm-up"), { id: "bad id!", title: "x" }], evil: "<script>" },
    scriptAt: "2026-11-13T08:00:00.000Z",
  };
  const put = await call("PUT", "practice", { vault: laptop });
  assert.equal(put.status, 200);
  assert.deepEqual(
    put.data.vault.drills.map((d: any) => d.name),
    ["Mirror", "Bag Weave"],
  );
  assert.deepEqual(put.data.vault.script.periods.map((p: any) => p.title), ["Warm-up"]);
  assert.equal(put.data.vault.script.evil, undefined);

  // The phone only knew an older Bag Weave, adds its own drill, deletes Mirror,
  // un-stars everything later and saved an older script.
  const phone = {
    drills: [drill("drl_a", "Bag Weave (old)", "2026-11-13T07:00:00.000Z"), drill("drl_d", "Tip Drill", "2026-11-13T09:00:00.000Z")],
    deleted: [{ id: "drl_b", at: "2026-11-13T09:01:00.000Z" }],
    favorites: [],
    favoritesAt: "2026-11-13T09:02:00.000Z",
    script: { name: "Old Tuesday", start: "", periods: [period("per_9", "Team")] },
    scriptAt: "2026-11-13T07:00:00.000Z",
  };
  const merged = (await call("PUT", "practice", { vault: phone })).data.vault;
  assert.deepEqual(
    merged.drills.map((d: any) => d.name),
    ["Tip Drill", "Bag Weave"],
  );
  assert.deepEqual(merged.deleted, [{ id: "drl_b", at: "2026-11-13T09:01:00.000Z" }]);
  assert.deepEqual(merged.favorites, []);
  assert.equal(merged.script.name, "Tuesday");
  assert.equal(merged.script.start, "16:00");

  // A device that still had Mirror can't bring it back with its old copy.
  const stale = (await call("PUT", "practice", { vault: laptop })).data.vault;
  assert.equal(stale.drills.some((d: any) => d.id === "drl_b"), false);
  assert.deepEqual((await call("GET", "practice")).data.vault, stale);

  // A newer script from the phone wins whole.
  const newer = (await call("PUT", "practice", { vault: { ...phone, script: { name: "Friday walkthrough", start: "", periods: [] }, scriptAt: "2026-11-14T07:00:00.000Z" } })).data.vault;
  assert.equal(newer.script.name, "Friday walkthrough");

  // A body with no vault is refused in coach words.
  const bad = await call("PUT", "practice", { nope: 1 });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /didn't come through/);

  // Another coach sees none of it.
  await coach();
  assert.equal((await call("GET", "practice")).data.vault, null);

  // Signed out: nothing to read, and a write is refused in coach words.
  signInAs(null);
  assert.equal((await call("GET", "practice")).data.vault, null);
  const refused = await call("PUT", "practice", { vault: phone });
  assert.equal(refused.status, 401);
  assert.match(refused.data.error, /Sign in to keep your drills/);

  // Deleting the account takes them with it.
  signInAs({ id: a.id, email: a.email });
  const del = await call("DELETE", "me", { confirm: a.email });
  assert.ok(del.status < 300, `delete answered ${del.status}: ${JSON.stringify(del.data)}`);
  const rows = await client.query("select 1 from practice_vaults where owner_id = $1", [a.id]);
  assert.equal(rows.rows.length, 0);
});
