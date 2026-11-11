/**
 * The owner's per-coach "Skip the phone code" switch: with phone codes on, a coach the owner let through uses the app
 * with no number and no device code, everyone else still meets the gate, and the switch is the owner's alone.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.STRIPE_SECRET_KEY;

const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");

const OWNER_EMAIL = "wwtrner1@gmail.com";

/** Phone codes on (no text is sent by these calls) or off, read by the function on every request. */
function codes(on: boolean) {
  for (const [k, v] of Object.entries({ TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "token", TWILIO_VERIFY_SID: "VAtest" })) {
    if (on) process.env[k] = v;
    else delete process.env[k];
  }
}

async function call(method: string, path: string, body?: unknown) {
  const res = await api(
    new Request(`https://gridiron-vault.com/api/${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Device-Id": "device-1" },
      body: body === undefined ? undefined : JSON.stringify(body),
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

before(async () => {
  await migrate();
});

after(async () => {
  codes(false);
  await client.close();
});

describe("Skip the phone code", () => {
  test("a coach the owner lets through uses the app with codes on; switching it back brings the gate back", async () => {
    const owner = randomUUID();
    const coach = randomUUID();
    const other = randomUUID();
    codes(false);
    signInAs({ id: owner, email: OWNER_EMAIL });
    await call("GET", "me");

    codes(true);
    for (const id of [coach, other]) {
      signInAs({ id, email: `${id}@example.com` });
      const me = await call("GET", "me");
      assert.equal(me.data.security.required, true);
      const plays = await call("GET", "plays");
      assert.equal(plays.status, 403);
      assert.equal(plays.data.code, "phone_required");
    }

    // A coach can't switch it on for themselves: the admin routes answer 404 to anyone but the owner.
    codes(false);
    signInAs({ id: coach, email: `${coach}@example.com` });
    assert.equal((await call("POST", `admin/users/${coach}/phone-skip`, { on: true })).status, 404);

    signInAs({ id: owner, email: OWNER_EMAIL });
    const on = await call("POST", `admin/users/${coach}/phone-skip`, { on: true });
    assert.equal(on.status, 200, JSON.stringify(on.data));
    const users = await call("GET", "admin/users");
    assert.equal(users.data.users.find((u: { id: string }) => u.id === coach).phoneSkip, true);
    assert.equal(users.data.users.find((u: { id: string }) => u.id === other).phoneSkip, false);
    const detail = await call("GET", `admin/users/${coach}`);
    assert.ok(detail.data.profile.phoneSkipAt);
    const log = await call("GET", "admin/audit");
    assert.ok(log.data.entries.some((e: { action: string; targetId: string }) => e.action === "phone_skip_on" && e.targetId === coach));

    codes(true);
    signInAs({ id: coach, email: `${coach}@example.com` });
    const me = await call("GET", "me");
    assert.equal(me.data.security.required, false);
    assert.equal((await call("GET", "plays")).status, 200);
    // Everyone else still meets the gate.
    signInAs({ id: other, email: `${other}@example.com` });
    assert.equal((await call("GET", "plays")).data.code, "phone_required");

    codes(false);
    signInAs({ id: owner, email: OWNER_EMAIL });
    assert.equal((await call("POST", `admin/users/${coach}/phone-skip`, { on: false })).status, 200);
    codes(true);
    signInAs({ id: coach, email: `${coach}@example.com` });
    assert.equal((await call("GET", "plays")).data.code, "phone_required");
  });

});
