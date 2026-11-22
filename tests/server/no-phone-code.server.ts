/**
 * No phone code at sign-in (taken out on 2026-11-22). With every Twilio key set on the site, as the live site has
 * them, a coach with no mobile number uses the account, nothing asks Twilio to text a code, a tab still on the old
 * gate is told to reload, an account deletes from any device, and the owner's skip switch is gone. The owner's device
 * counts and the repeat-trial flag now come from the sign-in audit, and nobody is flagged for having no phone.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.STRIPE_SECRET_KEY;
// The keys that used to switch the phone check on. The last one is read by nothing any more.
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "token";
process.env.TWILIO_VERIFY_SID = "VAtest";
// A stand-in owner for the console checks, added through the owner list's own setting.
const OWNER = "owner.console@example.com";
process.env.OWNER_EMAILS = OWNER;

const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");

/** Every address the function asks for while a test runs: none of them may be Twilio's. */
const asked: string[] = [];
const realFetch = globalThis.fetch;

async function call(method: string, path: string, body?: unknown, device = "device-one-0001") {
  const res = await api(
    new Request(`https://gridiron-vault.com/api/${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Device": device },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* CSV or empty */
  }
  return { status: res.status, data };
}

/** A new signed-in coach; the first /api/me makes the profile, as the app's first call does. */
async function coach(device?: string) {
  const id = randomUUID();
  const email = `${id.slice(0, 8)}@example.com`;
  signInAs({ id, email });
  const me = await call("GET", "me", undefined, device);
  return { id, email, me };
}

const play = (name: string) => ({ name, tags: [], scene: { version: 2, nodes: [] } });

before(async () => {
  await migrate();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    asked.push(String(input instanceof Request ? input.url : input));
    return realFetch(input, init);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SID", "OWNER_EMAILS"]) delete process.env[k];
  await client.close();
});

describe("No phone code at sign-in", () => {
  test("with the Twilio keys set, a new coach with no number uses the account and no code is texted", async () => {
    const { me } = await coach();
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email.endsWith("@example.com"), true);
    // The old answer told the app to open the gate; there is nothing like it now.
    assert.equal("security" in me.data, false);

    const list = await call("GET", "plays");
    assert.equal(list.status, 200, JSON.stringify(list.data));
    const made = await call("POST", "plays", play("Trips Right Flood"));
    assert.equal(made.status, 201, JSON.stringify(made.data));
    assert.equal((await call("GET", "playbooks")).status, 200);
    // A second device is as good as the first: no "confirm this device".
    const other = await call("GET", "plays", undefined, "device-two-0002");
    assert.equal(other.status, 200);
    assert.equal(other.data.code, undefined);

    assert.deepEqual(asked.filter((u) => /twilio/i.test(u)), []);
  });

  test("a tab still on the old gate is told to reload, and nothing is sent or saved", async () => {
    const { id } = await coach();
    for (const action of ["start", "check", "device-start", "device-check", "forget-others"]) {
      const res = await call("POST", `phone/${action}`, { phone: "615-555-0123", code: "123456" });
      assert.equal(res.status, 410, action);
      assert.match(res.data.error, /no longer asks for a phone code\. Reload this page/);
    }
    const { rows } = await client.query<{ phone: string | null; phone_verified_at: Date | null }>("select phone, phone_verified_at from profiles where id = $1", [id]);
    assert.equal(rows[0].phone, null);
    assert.equal(rows[0].phone_verified_at, null);
    assert.deepEqual(asked.filter((u) => /twilio/i.test(u)), []);
  });

  test("a coach who added a number back when codes were used still gets in from a new device, and can delete the account there", async () => {
    const { id, email } = await coach();
    await client.query("update profiles set phone = $1, phone_verified_at = now() where id = $2", ["+16155550188", id]);
    // A device this account never confirmed.
    const plays = await call("GET", "plays", undefined, "borrowed-laptop-9");
    assert.equal(plays.status, 200);
    const gone = await call("DELETE", "me", { confirm: email }, "borrowed-laptop-9");
    assert.equal(gone.status, 200, JSON.stringify(gone.data));
    const { rows } = await client.query("select id from profiles where id = $1", [id]);
    assert.equal(rows.length, 0);
  });

  test("the owner's skip switch is gone, and the users list and CSV no longer carry it", async () => {
    const { id } = await coach();
    signInAs({ id: randomUUID(), email: OWNER });
    await call("GET", "me");
    assert.equal((await call("POST", `admin/users/${id}/phone-skip`, { on: true })).status, 404);
    const users = await call("GET", "admin/users");
    assert.equal(users.status, 200, JSON.stringify(users.data));
    assert.equal("phoneSkip" in users.data.users.find((u: { id: string }) => u.id === id), false);
    const csv = await call("GET", "admin/users.csv");
    assert.equal(csv.status, 200);
    assert.doesNotMatch(String(csv.data).split("\n")[0], /Skips phone code/);
    assert.match(String(csv.data).split("\n")[0], /Devices/);
  });

  test("devices and the repeat-trial flag come from the sign-in audit, and no coach is flagged for having no phone", async () => {
    // One coach on two devices; three more accounts that all first show up on one shared device this week.
    const solo = await coach("solo-phone-0001");
    await call("GET", "me", undefined, "solo-laptop-0002");
    const shared = [await coach("shared-device-77"), await coach("shared-device-77"), await coach("shared-device-77")];

    // A coach who signed up two weeks ago, has a play and has never had a phone: that used to raise a flag.
    signInAs({ id: solo.id, email: solo.email });
    assert.equal((await call("POST", "plays", play("Mesh"), "solo-phone-0001")).status, 201);
    await client.query("update profiles set created_at = now() - interval '14 days' where id = $1", [solo.id]);

    signInAs({ id: randomUUID(), email: OWNER });
    await call("GET", "me", undefined, "owner-desk-00001");
    const users = await call("GET", "admin/users");
    assert.equal(users.status, 200, JSON.stringify(users.data));
    const row = (id: string) => users.data.users.find((u: { id: string }) => u.id === id);

    assert.equal(row(solo.id).devices, 2);
    assert.equal(row(solo.id).devicePeers, 1);
    assert.equal(row(solo.id).phone, "none");
    assert.deepEqual(row(solo.id).flags, []);
    for (const c of shared) {
      assert.equal(row(c.id).devices, 1);
      assert.equal(row(c.id).devicePeers, 3);
      assert.deepEqual(row(c.id).flags, ["3 accounts on one device this week"]);
    }
    for (const u of users.data.users) assert.equal(u.flags.includes("Using the app with no verified phone"), false);

    // The coach's detail lists the devices used lately, newest first.
    const detail = await call("GET", `admin/users/${solo.id}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.data));
    assert.equal(detail.data.devices.length, 2);
    assert.ok(detail.data.devices[0].lastSeen);
    assert.equal(typeof detail.data.devices[0].label, "string");

    // A device not seen for more than 30 days stops counting; an account first seen on a device before this week isn't a new one there.
    await client.query(
      "update account_activity set at = now() - interval '45 days' where owner_id = $1 and device_hash = (select device_hash from account_activity where owner_id = $1 order by at desc limit 1)",
      [solo.id],
    );
    await client.query("update account_activity set at = now() - interval '10 days' where owner_id = $1", [shared[0].id]);
    const later = await call("GET", "admin/users");
    const after = (id: string) => later.data.users.find((u: { id: string }) => u.id === id);
    assert.equal(after(solo.id).devices, 1);
    assert.equal(after(shared[0].id).devicePeers, 2);
    assert.equal(after(shared[1].id).devicePeers, 2);
    assert.deepEqual(after(shared[1].id).flags, []);
  });
});
