/**
 * Call Sheets on the account: a create sent twice with the same browser id (a
 * retry after a lost answer, a second tab or device, a stale copy of the sheet)
 * gets the row it already made instead of a duplicate, the list says whose it
 * is, and an id that was never the account's is refused without an error.
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

const sheet = (name: string, clientId?: string) => ({ name, columns: [{ id: "c1", label: "Play Name" }], rows: [], clientId });

before(async () => {
  await migrate();
});

after(async () => {
  await client.close();
});

test("the same browser sheet sent twice makes one row; another id makes another", async () => {
  const me = await coach();
  const first = await call("POST", "call-sheets", sheet("Call Sheet", "sheet_abc"));
  assert.equal(first.status, 201);
  const again = await call("POST", "call-sheets", sheet("Call Sheet", "sheet_abc"));
  assert.equal(again.status, 200);
  assert.equal(again.data.sheet.id, first.data.sheet.id);

  // Both at once (two tabs, or a retry beside the first try) still make one.
  const [x, y] = await Promise.all([call("POST", "call-sheets", sheet("Saturday", "sheet_race")), call("POST", "call-sheets", sheet("Saturday", "sheet_race"))]);
  assert.ok([200, 201].includes(x.status) && [200, 201].includes(y.status));
  assert.equal(x.data.sheet.id, y.data.sheet.id);

  const other = await call("POST", "call-sheets", sheet("Call Sheet", "sheet_xyz"));
  assert.notEqual(other.data.sheet.id, first.data.sheet.id);
  // An older browser that sends no id still works.
  assert.equal((await call("POST", "call-sheets", sheet("No id"))).status, 201);

  const list = await call("GET", "call-sheets");
  assert.equal(list.data.owner, me);
  assert.equal(list.data.sheets.filter((s: any) => s.name === "Call Sheet").length, 2);
  assert.equal(list.data.sheets.filter((s: any) => s.name === "Saturday").length, 1);
  assert.equal(list.data.sheets.find((s: any) => s.id === first.data.sheet.id).clientId, "sheet_abc");
});

test("a repeated create answers with the sheet as the account holds it, edits and all", async () => {
  await coach();
  const first = await call("POST", "call-sheets", sheet("Week 1", "sheet_edit"));
  const put = await call("PUT", `call-sheets/${first.data.sheet.id}`, { ...sheet("Week 1 final"), rows: [{ id: "r1", cells: { c1: "Mesh" } }] });
  assert.equal(put.status, 200);
  const again = await call("POST", "call-sheets", sheet("Week 1", "sheet_edit"));
  assert.equal(again.data.sheet.id, first.data.sheet.id);
  assert.equal(again.data.sheet.name, "Week 1 final");
  assert.equal(again.data.sheet.rows.length, 1);
});

test("one coach's browser id never finds another coach's sheet", async () => {
  await coach();
  const mine = await call("POST", "call-sheets", sheet("Mine", "sheet_shared"));
  await coach();
  const theirs = await call("POST", "call-sheets", sheet("Theirs", "sheet_shared"));
  assert.equal(theirs.status, 201);
  assert.notEqual(theirs.data.sheet.id, mine.data.sheet.id);
  assert.equal(theirs.data.sheet.name, "Theirs");
});

test("a sheet deleted on the account stays gone: the list no longer holds it and its id answers not-yours", async () => {
  await coach();
  const made = await call("POST", "call-sheets", sheet("Gone", "sheet_gone"));
  assert.equal((await call("DELETE", `call-sheets/${made.data.sheet.id}`)).status, 200);
  const list = await call("GET", "call-sheets");
  assert.equal(list.data.sheets.some((s: any) => s.id === made.data.sheet.id), false);
  const put = await call("PUT", `call-sheets/${made.data.sheet.id}`, sheet("Gone"));
  assert.equal(put.status, 404);
  assert.match(put.data.error, /isn't in your account/);
});

test("an id that was never the account's is refused cleanly, not as a server error", async () => {
  await coach();
  const put = await call("PUT", "call-sheets/sheet_local_only", sheet("Local"));
  assert.equal(put.status, 404);
  assert.match(put.data.error, /isn't in your account/);
  const del = await call("DELETE", "call-sheets/sheet_local_only");
  assert.equal(del.status, 200);
});

test("another coach's sheet can't be changed or deleted by its id", async () => {
  await coach();
  const theirs = await call("POST", "call-sheets", sheet("Private", "sheet_priv"));
  await coach();
  assert.equal((await call("PUT", `call-sheets/${theirs.data.sheet.id}`, sheet("Taken"))).status, 404);
  await call("DELETE", `call-sheets/${theirs.data.sheet.id}`);
  const list = await call("GET", "call-sheets");
  assert.equal(list.data.sheets.length, 0);
});
