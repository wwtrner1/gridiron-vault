/**
 * The owner (All-Access Master) on the server: who /api/me calls the owner and who may open /api/admin, through the
 * real API function on an in-memory Postgres with a stand-in Identity.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.TWILIO_VERIFY_SID;
delete process.env.STRIPE_SECRET_KEY;

const { migrate, client } = await import("./fake-db.ts");
const { signInAs, identityAdmin } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");

const OWNER_EMAIL = "wwtrner1@gmail.com";

async function call(method: string, path: string) {
  const res = await api(new Request(`https://gridiron-vault.com/api/${path}`, { method }));
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* CSV or empty */
  }
  return { status: res.status, data };
}

before(async () => {
  await migrate();
});

after(async () => {
  await client.close();
});

beforeEach(() => {
  identityAdmin(false);
});

describe("Owner console access", () => {
  test("the owner keeps the console when Identity can't confirm the email, once this account was confirmed as owner", async () => {
    const id = randomUUID();
    // First sign-in with a confirmed email: owner, and the profile row is stamped master.
    signInAs({ id, email: OWNER_EMAIL, name: "Wes Turner" });
    const first = await call("GET", "me");
    assert.equal(first.data.owner, true);
    assert.equal(first.data.plan, "master");

    // Later: getUser() answers from the token only and the admin API is down (a Deploy Preview, an outage).
    identityAdmin(true);
    signInAs({ id, email: OWNER_EMAIL, name: "Wes Turner", confirmedAt: "" });
    const later = await call("GET", "me");
    assert.equal(later.data.owner, true, JSON.stringify(later.data));
    assert.equal(later.data.ownerHint, undefined);

    const users = await call("GET", "admin/users");
    assert.equal(users.status, 200, JSON.stringify(users.data));
    const row = users.data.users.find((u: { id: string }) => u.id === id);
    assert.equal(row.email, OWNER_EMAIL);
    assert.equal(row.name, "Wes Turner");
    assert.equal(row.plan, "master");
    assert.ok("phoneNumber" in row);
  });

  test("the users list carries each coach's phone number, verified or not, and the CSV has it", async () => {
    const owner = randomUUID();
    signInAs({ id: owner, email: OWNER_EMAIL });
    await call("GET", "me");
    const coach = randomUUID();
    signInAs({ id: coach, email: "phone.coach@example.com", name: "Phone Coach" });
    await call("GET", "me");
    await client.query("update profiles set phone = $1, phone_verified_at = now() where id = $2", ["+16155550123", coach]);

    signInAs({ id: owner, email: OWNER_EMAIL });
    const users = await call("GET", "admin/users");
    const row = users.data.users.find((u: { id: string }) => u.id === coach);
    assert.equal(row.phoneNumber, "+16155550123");
    assert.equal(row.phone, "verified");
    assert.equal(row.name, "Phone Coach");

    const csv = await call("GET", "admin/users.csv");
    assert.equal(csv.status, 200);
    assert.match(String(csv.data), /'\+16155550123/);
  });

  test("an unconfirmed address on the owner list is not the owner without that stamp, and says why", async () => {
    identityAdmin(true);
    signInAs({ id: randomUUID(), email: OWNER_EMAIL, confirmedAt: "" });
    const res = await call("GET", "me");
    assert.equal(res.data.owner, false);
    assert.match(res.data.ownerHint, /could not be asked/);
    assert.equal((await call("GET", "admin/users")).status, 404);
  });

  test("a coach whose row says master but whose address isn't on the owner list is not the owner", async () => {
    const id = randomUUID();
    signInAs({ id, email: "not.owner@example.com" });
    await call("GET", "me");
    await client.query("update profiles set plan = 'master' where id = $1", [id]);
    signInAs({ id, email: "not.owner@example.com", confirmedAt: "" });
    assert.equal((await call("GET", "me")).data.owner, false);
    assert.equal((await call("GET", "admin/users")).status, 404);
  });
});
