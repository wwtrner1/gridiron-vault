import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("a Call Sheet saved with no signal goes to the account once, when the signal is back", async ({ page, context }) => {
  const errors = errorsOf(page);
  let online = false;
  const creates: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("call-sheets") || method === "GET") return;
    if (!online) {
      await route.abort("internetdisconnected");
      return true;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    if (method === "POST") creates.push(body.name);
    await route.fulfill({ json: { sheet: { id: "44444444-4444-4444-8444-444444444444", name: body.name, columns: body.columns, rows: body.rows, updatedAt: new Date().toISOString() } } });
    return true;
  });
  await page.goto("/grid");
  const save = page.getByRole("button", { name: /Save sheet/ });
  await save.click();
  await expect(page.locator(".toast", { hasText: "No signal, so the call sheet is in this browser for now." })).toBeVisible();

  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => creates.length).toBe(1);
  await save.click();
  await expect(page.locator(".toast", { hasText: "Call sheet saved to your account." })).toBeVisible();
  expect(creates.length).toBe(1);
  const sheets = await page.evaluate(() => JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}").sheets as { remoteId?: string }[]);
  expect(sheets.some((s) => s.remoteId === "44444444-4444-4444-8444-444444444444")).toBe(true);
  expect(errors).toEqual([]);
});

/*
 * The duplicates: every fresh browser used to lay out its own blank "Call Sheet" before the account's sheets arrived,
 * a create sent twice made two rows, and a sheet deleted on another device was saved again as new.
 */
const HEADERS = ["#", "Play Name", "Group", "Run", "Pass", "Down", "Distance", "Hash", "YL", "Route", "Position"];
const UPDATED = "2026-11-01T12:00:00.000Z";

/** A sheet as the store and the account hold it (ids are per sheet, so two sheets never share a column id). */
function sheet(id: string, name: string, calls: string[] = [], extra: Record<string, unknown> = {}) {
  const columns = HEADERS.map((label, i) => ({ id: `${id}-c${i}`, label, width: 96, type: "text" }));
  const play = columns.find((c) => c.label === "Play Name")!.id;
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `${id}-r${i}`,
    cells: Object.fromEntries(columns.map((c) => [c.id, c.label === "#" ? String(i + 1) : c.id === play ? (calls[i] ?? "") : ""])),
    colors: {},
    playId: null,
  }));
  return { id, name, columns, rows, updatedAt: UPDATED, ...extra };
}

const localSheets = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}").sheets ?? []) as { id: string; name: string; remoteId?: string | null; remoteOwner?: string }[]);

/** Puts a workspace in the browser once, before the app starts (a reload keeps what the app did since). */
const seedWorkspace = (page: Page, ws: object) =>
  page.context().addInitScript((w) => {
    if (sessionStorage.getItem("ws-seeded")) return;
    sessionStorage.setItem("ws-seeded", "1");
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(w));
  }, ws);

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("a new browser waits for the account's sheets and never lays out or sends a blank Call Sheet beside them", async ({ page, context }) => {
  const errors = errorsOf(page);
  const sent: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("call-sheets")) return;
    if (method === "GET") {
      // A slow answer: the old page laid its own sheet out in the meantime.
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ json: { owner: "u1", sheets: [sheet(A, "Saturday", ["Mesh", "Stick"]), sheet(B, "Dolphins Call Sheet", ["Smash"])] } });
      return true;
    }
    sent.push(`${method} ${path}`);
    await route.fulfill({ status: 500, json: { error: "should not be called" } });
    return true;
  });
  await page.goto("/grid");
  await expect(page.getByRole("heading", { name: "Setting up your call sheet" })).toBeVisible();
  expect(await localSheets(page)).toEqual([]);

  const picker = page.getByLabel("Switch call sheet");
  await expect(picker).toBeVisible();
  await expect(picker.locator("option")).toHaveText(["Saturday", "Dolphins Call Sheet"]);
  await page.waitForTimeout(2500); // past the push delay
  expect(sent).toEqual([]);
  expect((await localSheets(page)).map((s) => s.name).sort()).toEqual(["Dolphins Call Sheet", "Saturday"]);
  expect(errors).toEqual([]);
});

test("the starter sheet the page lays out is not sent until the coach does something with it", async ({ page, context }) => {
  const errors = errorsOf(page);
  const sent: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("call-sheets") || method === "GET") return;
    sent.push(`${method} ${path}`);
    await route.fulfill({ status: 500, json: { error: "should not be called" } });
    return true;
  });
  await page.goto("/grid");
  await expect(page.getByLabel("Call sheet name")).toHaveValue("Call Sheet");
  await page.waitForTimeout(2500);
  expect(sent).toEqual([]);
  expect(errors).toEqual([]);
});

test("a sheet deleted on another device comes off this browser and is not saved again", async ({ page, context }) => {
  const errors = errorsOf(page);
  const sent: string[] = [];
  const kept = sheet(A, "Saturday", ["Mesh"], { remoteId: A, remoteOwner: "u1" });
  const gone = sheet(B, "Week 3", ["Stick"], { remoteId: B, remoteOwner: "u1" });
  await seedWorkspace(page, { plays: [], playbooks: [], sheets: [kept, gone] });
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("call-sheets")) return;
    if (method === "GET") {
      await route.fulfill({ json: { owner: "u1", sheets: [{ ...kept, remoteId: undefined }] } });
      return true;
    }
    sent.push(`${method} ${path}`);
    await route.fulfill({ status: 500, json: { error: "should not be called" } });
    return true;
  });
  await page.goto("/grid");
  await expect.poll(async () => (await localSheets(page)).map((s) => s.name)).toEqual(["Saturday"]);
  await page.waitForTimeout(2500);
  expect(sent).toEqual([]);
  expect(await localSheets(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("a create that lost its answer is sent again with the same browser id, and comes back as one sheet", async ({ page, context }) => {
  const errors = errorsOf(page);
  let online = false;
  const clientIds: string[] = [];
  const row = "55555555-5555-4555-8555-555555555555";
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("call-sheets") || method === "GET") return;
    const body = JSON.parse(route.request().postData() ?? "{}");
    if (method === "POST") clientIds.push(body.clientId);
    if (!online) {
      // The account made the row, but the answer never arrived.
      await route.abort("internetdisconnected");
      return true;
    }
    // The account answers with the row that id already made.
    await route.fulfill({ json: { sheet: { id: row, name: body.name, columns: body.columns, rows: body.rows, clientId: body.clientId, updatedAt: new Date().toISOString() } } });
    return true;
  });
  await page.goto("/grid");
  await page.getByRole("button", { name: /Save sheet/ }).click();
  await expect(page.locator(".toast", { hasText: "No signal" })).toBeVisible();
  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await localSheets(page)).map((s) => s.remoteId)).toEqual([row]);
  expect(clientIds.length).toBeGreaterThanOrEqual(2);
  expect(clientIds[0]).toBeTruthy();
  expect(new Set(clientIds).size).toBe(1);
  expect(await localSheets(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});
