import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const CLOUD = "55555555-5555-4555-8555-555555555555";
const NEW = "66666666-6666-4666-8666-666666666666";

test("signing in brings the account's playbooks, and a new one goes to the account once", async ({ page, context }) => {
  const errors = errorsOf(page);
  const writes: { method: string; path: string; body: { name?: string; playIds?: string[] } }[] = [];
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("playbooks")) return;
    if (method === "GET") {
      await route.fulfill({ json: { playbooks: [{ id: CLOUD, name: "Red Zone", description: "", color: "#1f8fff", isPublic: false, updatedAt: "2026-10-01T00:00:00.000Z" }], members: [] } });
      return true;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    writes.push({ method, path, body });
    const id = method === "POST" ? NEW : path.split("/")[1];
    await route.fulfill({ json: { playbook: { id, name: body.name ?? "x", description: "", color: "#1f8fff", isPublic: false, updatedAt: new Date().toISOString() } } });
    return true;
  });
  await page.goto("/playbooks");
  await expect(page.getByText("Red Zone").first()).toBeVisible();
  // The pulled copy isn't sent straight back.
  await page.waitForTimeout(2000);
  expect(writes).toEqual([]);

  await page.locator('[data-tour="new-playbook"]').click();
  await page.getByLabel("Playbook name").fill("Week 1 install");
  await page.getByRole("button", { name: "Create playbook" }).click();
  await expect.poll(() => writes.filter((w) => w.method === "POST").length).toBe(1);
  expect(writes.find((w) => w.method === "POST")!.body.name).toBe("Week 1 install");
  await expect.poll(async () => (await workspace(page)).playbooks!.find((b) => b.name === "Week 1 install") as unknown as { cloudId?: string } | undefined).toMatchObject({ cloudId: NEW });
  await page.waitForTimeout(2000);
  expect(writes.filter((w) => w.method === "POST").length).toBe(1);
  expect(errors).toEqual([]);
});

const BOOK_A = "77777777-7777-4777-8777-777777777777";
const BOOK_B = "88888888-8888-4888-8888-888888888888";

/** Puts playbooks in this browser before the app starts (once, so a reload keeps what the app wrote). */
async function seedBooks(context: import("@playwright/test").BrowserContext, playbooks: object[]) {
  await context.addInitScript((books) => {
    if (sessionStorage.getItem("books-seeded")) return;
    sessionStorage.setItem("books-seeded", "1");
    localStorage.setItem("snapline.workspace.v1", JSON.stringify({ plays: [], playbooks: books, sheets: [] }));
  }, playbooks);
}

const book = (over: object) => ({ description: "", color: "#1f8fff", isPublic: false, updatedAt: "2026-10-01T00:00:00.000Z", playIds: [], ...over });

test("a playbook deleted on another device stays deleted here, and a new one is sent with its browser id", async ({ page, context }) => {
  const errors = errorsOf(page);
  const writes: { method: string; path: string; body: { name?: string; clientId?: string } }[] = [];
  await seedBooks(context, [
    book({ id: "book_gone", name: "Old install", cloudId: BOOK_A, cloudOwner: "u1" }),
    book({ id: "book_kept", name: "Red Zone", cloudId: BOOK_B }),
    book({ id: "book_new", name: "Week 2" }),
  ]);
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("playbooks")) return;
    if (method === "GET") {
      // The account has only Red Zone: Old install was removed on the coach's phone.
      await route.fulfill({ json: { owner: "u1", playbooks: [{ id: BOOK_B, name: "Red Zone", description: "", color: "#1f8fff", isPublic: false, updatedAt: "2026-10-01T00:00:00.000Z" }], members: [] } });
      return true;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    writes.push({ method, path, body });
    const id = method === "POST" ? NEW : path.split("/")[1];
    await route.fulfill({ json: { playbook: { id, name: body.name ?? "x", description: "", color: "#1f8fff", isPublic: false, updatedAt: new Date().toISOString() } } });
    return true;
  });
  await page.goto("/playbooks");
  await expect(page.getByText("Red Zone").first()).toBeVisible();
  await expect.poll(async () => (await workspace(page)).playbooks!.map((b) => b.name).sort()).toEqual(["Red Zone", "Week 2"]);
  await expect.poll(() => writes.filter((w) => w.method === "POST").length).toBe(1);
  expect(writes.find((w) => w.method === "POST")!.body).toMatchObject({ name: "Week 2", clientId: "book_new" });
  await page.waitForTimeout(2000);
  // Old install is never saved again, and nothing is sent to delete it (the account already has).
  expect(writes.filter((w) => w.method === "POST").length).toBe(1);
  expect(writes.some((w) => w.method === "DELETE")).toBe(false);
  expect(writes.some((w) => w.body.name === "Old install")).toBe(false);
  await page.reload();
  await expect(page.getByText("Red Zone").first()).toBeVisible();
  await expect(page.getByText("Old install")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a list with no owner (the account didn't see a sign-in) takes nothing out of this browser", async ({ page, context }) => {
  await seedBooks(context, [book({ id: "book_a", name: "Old install", cloudId: BOOK_A, cloudOwner: "u1" })]);
  await signIn(context, () => undefined); // the helper answers GET playbooks with an empty list and no owner
  await page.goto("/playbooks");
  await expect(page.getByText("Old install").first()).toBeVisible();
  await page.waitForTimeout(2000);
  expect((await workspace(page)).playbooks!.map((b) => b.name)).toEqual(["Old install"]);
});

test("renaming a saved playbook updates the account's copy instead of saving a second one", async ({ page, context }) => {
  const writes: { method: string; path: string; body: { name?: string } }[] = [];
  await seedBooks(context, [book({ id: "book_a", name: "MID TN BLUE", cloudId: BOOK_A, cloudOwner: "u1" })]);
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("playbooks")) return;
    if (method === "GET") {
      await route.fulfill({ json: { owner: "u1", playbooks: [{ id: BOOK_A, name: "MID TN BLUE", description: "", color: "#1f8fff", isPublic: false, updatedAt: "2026-10-01T00:00:00.000Z" }], members: [] } });
      return true;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    writes.push({ method, path, body });
    await route.fulfill({ json: { playbook: { id: method === "POST" ? NEW : path.split("/")[1], name: body.name ?? "x", description: "", color: "#1f8fff", isPublic: false } } });
    return true;
  });
  await page.goto("/playbooks");
  await page.getByRole("button", { name: "Rename MID TN BLUE" }).click();
  await page.getByLabel("Playbook name").fill("Mid TN Blue 2027");
  // A double tap on Save files it once.
  await page.getByRole("button", { name: "Save changes" }).dblclick();
  await expect.poll(() => writes.filter((w) => w.method === "PUT" && w.body.name === "Mid TN Blue 2027").length).toBe(1);
  expect(writes.find((w) => w.method === "PUT")!.path).toBe(`playbooks/${BOOK_A}`);
  await page.waitForTimeout(2000);
  expect(writes.filter((w) => w.method === "POST")).toEqual([]);
  expect((await workspace(page)).playbooks!.map((b) => b.name)).toEqual(["Mid TN Blue 2027"]);
});

test("Tidy up removes empty and same-play copies, keeps a copy with plays of its own, and Undo brings them back", async ({ page, context }) => {
  await seedBooks(context, [
    book({ id: "b1", name: "MID TN BLUE" }),
    book({ id: "b2", name: "MID TN BLUE" }),
    book({ id: "b3", name: "mid tn blue " }),
    book({ id: "r1", name: "Ready-to-Go 5v5 Playbook", playIds: ["p1", "p2", "p3"] }),
    book({ id: "r2", name: "Ready-to-Go 5v5 Playbook", playIds: ["p1", "p2"] }),
    book({ id: "r3", name: "Ready-to-Go 5v5 Playbook", playIds: ["p9"] }),
    book({ id: "solo", name: "Dolphins" }),
  ]);
  await page.goto("/vault");
  const bar = page.locator(".pbt-dupes").first();
  await expect(bar).toContainText("3 duplicate playbooks");
  await bar.getByRole("button", { name: "Tidy up" }).click();
  await expect(page.getByText(/3 duplicate playbooks removed\. No plays were deleted\. 1 more with the same name holds plays of its own/)).toBeVisible();
  await expect.poll(async () => (await workspace(page)).playbooks!.map((b) => b.id).sort()).toEqual(["b1", "r1", "r3", "solo"]);
  await expect(page.locator(".pbt-dupes")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await workspace(page)).playbooks!.length).toBe(7);
});
