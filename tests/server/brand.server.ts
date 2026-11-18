/**
 * Team branding on the account carries the coach's usual Film Room look: a
 * look we know is kept and comes back on the next device, one we don't is
 * dropped, and another coach never sees it.
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
  return { status: res.status, data };
}

async function coach() {
  const id = randomUUID();
  signInAs({ id, email: `${id.slice(0, 8)}@example.com` });
  await call("GET", "me");
  return id;
}

before(async () => {
  await migrate();
});
after(async () => {
  await client.close();
});

test("the Film Room look is kept with the team brand, checked, and private to the coach", async () => {
  const one = await coach();
  const brand = { name: "Hawks", logo: null, primary: "#7A1420", secondary: "#F2C14E", logoOnField: true, endZones: true, prints: true, updatedAt: new Date().toISOString() };

  const put = await call("PUT", "brand", { brand: { ...brand, filmLook: "light" } });
  assert.equal(put.status, 200);
  assert.equal(put.data.brand.filmLook, "light");
  assert.equal((await call("GET", "brand")).data.brand.filmLook, "light");

  // A look we don't have is dropped, and the rest of the brand is kept.
  const odd = await call("PUT", "brand", { brand: { ...brand, filmLook: "neon" } });
  assert.equal(odd.status, 200);
  assert.equal("filmLook" in odd.data.brand, false);
  assert.equal(odd.data.brand.name, "Hawks");

  // Another coach starts with no brand at all.
  const two = await coach();
  assert.notEqual(one, two);
  assert.equal((await call("GET", "brand")).data.brand, null);
});
