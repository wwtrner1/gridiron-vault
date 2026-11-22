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

  // The 3D camera rides on the brand too: a camera we know, an end, and whether it goes with the ball.
  const cam = await call("PUT", "brand", { brand: { ...brand, filmCam: { camera: "qb", side: "defense", pass: false, extra: 1 }, updatedAt: new Date(Date.now() + 5200).toISOString() } });
  assert.deepEqual(cam.data.brand.filmCam, { camera: "qb", side: "defense", pass: false });
  assert.deepEqual((await call("GET", "brand")).data.brand.filmCam, { camera: "qb", side: "defense", pass: false });
  const oddCam = await call("PUT", "brand", { brand: { ...brand, filmCam: { camera: "drone" }, updatedAt: new Date(Date.now() + 5400).toISOString() } });
  assert.equal("filmCam" in oddCam.data.brand, false);

  // Player look history: each letter's color rides on the brand; bad letters and colors are dropped.
  const letters = await call("PUT", "brand", { brand: { ...brand, letterColors: { X: "#123abc", "Q!": "#000000", Y: "red" }, updatedAt: new Date(Date.now() + 6000).toISOString() } });
  assert.deepEqual(letters.data.brand.letterColors, { X: "#123ABC" });
  assert.deepEqual((await call("GET", "brand")).data.brand.letterColors, { X: "#123ABC" });

  // Another coach starts with no brand at all.
  const two = await coach();
  assert.notEqual(one, two);
  assert.equal((await call("GET", "brand")).data.brand, null);
});

test("the owner's team logo stays on the owner's account: another account is never served it and can't store it", async () => {
  const logo = `data:image/png;base64,${randomUUID().replace(/-/g, "")}`;
  const stamp = () => new Date().toISOString();
  const dolphins = { name: "Dolphins", logo, primary: "#008E97", secondary: "#FC4C02", logoOnField: true, endZones: true, prints: true, updatedAt: stamp() };

  // The owner (a listed, confirmed address) keeps the logo as theirs.
  const owner = randomUUID();
  signInAs({ id: owner, email: "wwtrner1@gmail.com" });
  assert.equal((await call("GET", "me")).data.owner, true);
  const kept = await call("PUT", "brand", { brand: dolphins });
  assert.equal(kept.status, 200);
  assert.equal(kept.data.brand.logo, logo);
  assert.equal((await call("GET", "brand")).data.brand.logo, logo);

  // Another coach sending the same logo (an old shared browser) gets the plain look, and nothing is stored.
  const other = await coach();
  const refused = await call("PUT", "brand", { brand: dolphins });
  assert.equal(refused.status, 200);
  assert.equal(refused.data.brand, null);
  assert.equal(refused.data.withheld, true);
  assert.deepEqual((await call("GET", "brand")).data, { brand: null });

  // A row that picked the logo up before this rule is withheld, and stays in the table untouched.
  await client.query(`insert into team_brands (owner_id, data, updated_at) values ($1, $2, now()) on conflict (owner_id) do update set data = excluded.data`, [other, JSON.stringify(dolphins)]);
  const got = await call("GET", "brand");
  assert.equal(got.data.brand, null);
  assert.equal(got.data.withheld, true);
  const rows = await client.query<{ logo: string }>(`select data->>'logo' as logo from team_brands where owner_id = $1`, [other]);
  assert.equal(rows.rows[0].logo, logo);

  // The same coach's own logo goes through, replaces the held row and is served back.
  const own = { ...dolphins, name: "Hawks", logo: `data:image/png;base64,${randomUUID().replace(/-/g, "")}`, updatedAt: new Date(Date.now() + 1000).toISOString() };
  const saved = await call("PUT", "brand", { brand: own });
  assert.equal(saved.data.brand.logo, own.logo);
  assert.equal((await call("GET", "brand")).data.brand.logo, own.logo);

  // And the owner still sees theirs.
  signInAs({ id: owner, email: "wwtrner1@gmail.com" });
  assert.equal((await call("GET", "brand")).data.brand.logo, logo);
});
