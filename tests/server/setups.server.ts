/**
 * Saved wristband setups on the account: one coach's list is stored cleaned
 * and private, a second device's PUT merges with it (each setup's newer save
 * wins, a delete reaches every device), a signed-out browser can't write, and
 * deleting the account removes it.
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

const setup = (id: string, name: string, savedAt: string, grid = "3x2") => ({ id, name, prefs: { grid }, savedAt });

test("wristband setups follow the coach to every device and merge, never overwrite", async () => {
  const a = await coach();
  const empty = await call("GET", "wristband-setups");
  assert.equal(empty.data.setups, null);
  assert.equal(empty.cache, "private, no-store");

  // The laptop saves two setups (one with junk the server drops).
  const laptop = {
    setups: [
      setup("setup-a", "  Varsity   Friday ", "2026-11-13T08:00:00.000Z"),
      setup("setup-b", "JV", "2026-11-13T08:05:00.000Z"),
      { id: "bad id!", name: "x", prefs: {}, savedAt: "2026-11-13T08:00:00.000Z" },
      { id: "setup-c", name: "", prefs: {}, savedAt: "2026-11-13T08:00:00.000Z" },
    ],
    deleted: [],
  };
  const put = await call("PUT", "wristband-setups", { setups: laptop });
  assert.equal(put.status, 200);
  assert.deepEqual(
    put.data.setups.setups.map((s: any) => s.name),
    ["JV", "Varsity Friday"],
  );

  // The phone, which only knew an older Varsity Friday, adds its own setup and deletes JV.
  const phone = {
    setups: [setup("setup-a", "Varsity Friday", "2026-11-13T07:00:00.000Z", "2x2"), setup("setup-d", "Scout", "2026-11-13T09:00:00.000Z")],
    deleted: [{ id: "setup-b", at: "2026-11-13T09:01:00.000Z" }],
  };
  const merged = (await call("PUT", "wristband-setups", { setups: phone })).data.setups;
  assert.deepEqual(
    merged.setups.map((s: any) => [s.name, s.prefs.grid]),
    [
      ["Scout", "3x2"],
      ["Varsity Friday", "3x2"],
    ],
  );
  assert.deepEqual(merged.deleted, [{ id: "setup-b", at: "2026-11-13T09:01:00.000Z" }]);

  // A device that still had JV can't bring it back with its old copy.
  const stale = (await call("PUT", "wristband-setups", { setups: laptop })).data.setups;
  assert.equal(stale.setups.some((s: any) => s.id === "setup-b"), false);
  assert.deepEqual((await call("GET", "wristband-setups")).data.setups, stale);

  // Another coach sees none of it.
  await coach();
  assert.equal((await call("GET", "wristband-setups")).data.setups, null);

  // Signed out: nothing to read, and a write is refused in coach words.
  signInAs(null);
  assert.equal((await call("GET", "wristband-setups")).data.setups, null);
  const refused = await call("PUT", "wristband-setups", { setups: phone });
  assert.equal(refused.status, 401);
  assert.match(refused.data.error, /Sign in to keep your wristband setups/);

  // Deleting the account takes the setups with it.
  signInAs({ id: a.id, email: a.email });
  const del = await call("DELETE", "me", { confirm: a.email });
  assert.ok(del.status < 300, `delete answered ${del.status}: ${JSON.stringify(del.data)}`);
  const rows = await client.query("select 1 from wristband_setups where owner_id = $1", [a.id]);
  assert.equal(rows.rows.length, 0);
});

test("the page's live settings follow the account: the newer change wins, an older tab never erases them, junk is dropped", async () => {
  await coach();
  const live = (grid: string, at: string) => ({ prefs: { grid }, at });

  // The laptop's settings are stored with the list.
  const first = await call("PUT", "wristband-setups", { setups: { setups: [], deleted: [], current: live("3x2-5", "2026-11-22T08:00:00.000Z") } });
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.setups.current, live("3x2-5", "2026-11-22T08:00:00.000Z"));

  // The phone changed them later: its copy replaces the laptop's.
  const later = await call("PUT", "wristband-setups", { setups: { setups: [], deleted: [], current: live("4x2", "2026-11-22T09:00:00.000Z") } });
  assert.deepEqual(later.data.setups.current, live("4x2", "2026-11-22T09:00:00.000Z"));

  // A tab that is still open on the old settings sends an older stamp: the newer one stays.
  const stale = await call("PUT", "wristband-setups", { setups: { setups: [], deleted: [], current: live("2x2", "2026-11-22T07:00:00.000Z") } });
  assert.deepEqual(stale.data.setups.current, live("4x2", "2026-11-22T09:00:00.000Z"));

  // A copy with no settings at all (an older browser) leaves them alone, and a setup saved meanwhile is kept beside them.
  const bare = await call("PUT", "wristband-setups", { setups: { setups: [setup("setup-z", "Scrimmage", "2026-11-22T09:30:00.000Z")], deleted: [] } });
  assert.deepEqual(bare.data.setups.current, live("4x2", "2026-11-22T09:00:00.000Z"));
  assert.deepEqual(bare.data.setups.setups.map((s: any) => s.name), ["Scrimmage"]);
  assert.deepEqual((await call("GET", "wristband-setups")).data.setups.current, live("4x2", "2026-11-22T09:00:00.000Z"));

  // Settings with no time, or that aren't an object, are dropped rather than stored.
  const junk = await call("PUT", "wristband-setups", { setups: { setups: [], deleted: [], current: { prefs: { grid: "x" } } } });
  assert.deepEqual(junk.data.setups.current, live("4x2", "2026-11-22T09:00:00.000Z"));
  const arrayPrefs = await call("PUT", "wristband-setups", { setups: { setups: [], deleted: [], current: { prefs: [1, 2], at: "2026-11-22T10:00:00.000Z" } } });
  assert.deepEqual(arrayPrefs.data.setups.current, live("4x2", "2026-11-22T09:00:00.000Z"));

  // Another coach starts with none.
  await coach();
  assert.equal((await call("GET", "wristband-setups")).data.setups, null);
});

test("a device whose clock is set ahead can't keep its settings on top of later changes: the stamp is cut back to the server's now", async () => {
  await coach();
  const live = (grid: string, at: string) => ({ prefs: { grid }, at });
  const before = Date.now();

  // A laptop with the wrong year stamps its settings far in the future; the account stores them at its own time.
  const ahead = await call("PUT", "wristband-setups", { setups: { setups: [], deleted: [], current: live("2x2", "2999-01-01T00:00:00.000Z") } });
  assert.equal(ahead.status, 200);
  const stored = Date.parse(ahead.data.setups.current.at);
  assert.ok(stored >= before - 1 && stored <= Date.now() + 1, `stamp ${ahead.data.setups.current.at} should be about now`);
  assert.deepEqual(ahead.data.setups.current.prefs, { grid: "2x2" });

  // A phone with the right time changes the settings a moment later: its change wins, as it should.
  await new Promise((r) => setTimeout(r, 25));
  const phone = await call("PUT", "wristband-setups", { setups: { setups: [], deleted: [], current: live("3x2-5", new Date().toISOString()) } });
  assert.deepEqual(phone.data.setups.current.prefs, { grid: "3x2-5" });
  assert.deepEqual((await call("GET", "wristband-setups")).data.setups.current.prefs, { grid: "3x2-5" });
});
