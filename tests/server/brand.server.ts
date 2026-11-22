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

  // The Film Room tips, once seen, stay seen on the account; anything but false is dropped.
  const tipped = await call("PUT", "brand", { brand: { ...brand, filmTips: false, updatedAt: new Date(Date.now() + 1000).toISOString() } });
  assert.equal(tipped.data.brand.filmTips, false);
  assert.equal((await call("GET", "brand")).data.brand.filmTips, false);
  const again = await call("PUT", "brand", { brand: { ...brand, filmTips: "yes", updatedAt: new Date(Date.now() + 2000).toISOString() } });
  assert.equal("filmTips" in again.data.brand, false);

  // The 3D view follows the coach to every device; flat is the default, so only "3d" is kept.
  const view = await call("PUT", "brand", { brand: { ...brand, filmView: "3d", updatedAt: new Date(Date.now() + 3000).toISOString() } });
  assert.equal(view.data.brand.filmView, "3d");
  assert.equal((await call("GET", "brand")).data.brand.filmView, "3d");
  const flat = await call("PUT", "brand", { brand: { ...brand, filmView: "flat", updatedAt: new Date(Date.now() + 4000).toISOString() } });
  assert.equal("filmView" in flat.data.brand, false);
  const odd3 = await call("PUT", "brand", { brand: { ...brand, filmView: "vr", updatedAt: new Date(Date.now() + 5000).toISOString() } });
  assert.equal("filmView" in odd3.data.brand, false);

  // Player look history: each letter's color rides on the brand; bad letters and colors are dropped.
  const letters = await call("PUT", "brand", { brand: { ...brand, letterColors: { X: "#123abc", "Q!": "#000000", Y: "red" }, updatedAt: new Date(Date.now() + 6000).toISOString() } });
  assert.deepEqual(letters.data.brand.letterColors, { X: "#123ABC" });
  assert.deepEqual((await call("GET", "brand")).data.brand.letterColors, { X: "#123ABC" });

  // Another coach starts with no brand at all.
  const two = await coach();
  assert.notEqual(one, two);
  assert.equal((await call("GET", "brand")).data.brand, null);
});
