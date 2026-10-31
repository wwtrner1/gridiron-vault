import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

/**
 * Griddy's two remaining cards, with `/api/ai/*` mocked: the call sheet card
 * (sections, a dropped row, a play id not in the Vault ignored, Create the
 * call sheet, Open Call Sheet landing on the rows) and the import card (Draw
 * all through the bulk reader, one call that fails in coach words, a renamed
 * play, Save to Vault filed in a named playbook on the account).
 */
test.beforeEach(async ({ context }) => quiet(context));

async function ask(page: import("@playwright/test").Page, text: string) {
  await page.locator(".gd-launch").click();
  const box = page.locator(".gd-panel textarea").first();
  await box.fill(text);
  await box.press("Enter");
}

const serverId = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;

test("Griddy's call sheet card builds a Call Sheet from Vault plays", async ({ page, context }) => {
  const errors = errorsOf(page);
  let lines: Record<string, unknown>[] = [];
  await signIn(context, async (route, path) => {
    if (path === "ai/griddy") return (await route.fulfill({ json: { reply: { text: "Here's a sheet for Saturday.", actions: [{ id: "c1", tool: "build_call_sheet", name: "Week 3 plan", lines }] } } }), true);
  });
  await seedReady(page);
  const plays = (await workspace(page)).plays!;
  const stick = plays.find((p) => p.name.includes("Stick"))!;
  const [a, b] = plays.filter((p) => p.id !== stick.id);
  lines = [
    { playId: a.id, group: "Openers" },
    { playId: stick.id, group: "3rd & long", down: "3rd", distance: "7+", hash: "L" },
    { playId: b.id, group: "Openers" },
    { playId: "not-in-the-vault", group: "Openers" },
  ];

  await ask(page, "Build me a call sheet for Saturday");
  const card = page.locator(".gd-card.gd-sheet").last();
  await expect(card).toContainText("Call sheet · 3 plays");
  await expect(card.locator(".gd-sheet-head")).toHaveText(["Openers", "3rd & long"]);
  await expect(card.locator(".gd-sheet-rows li")).toHaveCount(3);
  await expect(card.locator(".gd-sheet-rows li", { hasText: stick.name })).toContainText("3rd & 7+ · L");

  // Drop one, rename, create.
  await card.getByRole("button", { name: `Drop ${b.name}` }).click();
  await expect(card).toContainText("Call sheet · 2 plays");
  const name = card.locator(".gd-import-book input");
  await expect(name).toHaveValue("Week 3 plan");
  await name.fill("Saturday plan");
  await card.getByRole("button", { name: "Create the call sheet" }).click();
  await expect(page.locator(".toast", { hasText: "Saturday plan is ready in your Call Sheet." })).toBeVisible();
  await expect(card).toContainText("Grid created.");

  // Open Call Sheet lands on the new sheet with its rows linked to the plays.
  await card.getByRole("button", { name: "Open Call Sheet" }).click();
  await expect(page).toHaveURL(/\/grid/);
  // The new sheet is the one open (it is the only one, so there is no switcher).
  await expect(page.getByRole("textbox", { name: "Call sheet name" })).toHaveValue("Saturday plan");
  await expect(page.getByRole("combobox", { name: "Play Name, row 1", exact: true })).toHaveValue(a.name);
  await expect(page.getByRole("combobox", { name: "Play Name, row 2", exact: true })).toHaveValue(stick.name);
  await expect(page.getByRole("combobox", { name: "Down, row 2", exact: true })).toHaveValue("3rd");
  await expect(page.getByRole("combobox", { name: "Distance, row 2", exact: true })).toHaveValue("7+");
  await expect(page.getByRole("combobox", { name: "Group, row 1", exact: true })).toHaveValue("Openers");
  const sheets = await page.evaluate(() => (JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}").sheets ?? []) as { name: string; rows: { playId: string | null }[] }[]);
  const made = sheets.find((s) => s.name === "Saturday plan")!;
  expect(made.rows.map((r) => r.playId)).toEqual([a.id, stick.id]);
  expect(errors).toEqual([]);
});

test("Griddy's import card draws a list of calls, keeps a failed one visible, and files the rest in a playbook", async ({ page, context }) => {
  const errors = errorsOf(page);
  const reads: { call: string; bulk?: boolean }[] = [];
  const posted: { name: string; tags: string[] }[] = [];
  const books: string[] = [];
  const read = (name: string) => ({
    formation: "Trips Right",
    game: "5v5",
    name,
    assignments: [
      { player: "X", kind: "route", action: "go", heard: "X go" },
      { player: "Z", kind: "route", action: "corner", heard: "Z corner", firstRead: true },
      { player: "Y", kind: "route", action: "flat", heard: "Y flat" },
    ],
    unsure: [],
  });
  await signIn(context, async (route, path, method) => {
    if (path === "ai/griddy") {
      const plays = [
        { name: "Trips Right Flood", call: "Trips Right: X go, Z corner, Y flat" },
        { name: "Bunch Left Mesh", call: "Bunch Left: X drag, Y drag, Z go" },
        { name: "Mystery", call: "Nobody knows" },
      ];
      return (await route.fulfill({ json: { reply: { text: "I found 3 plays in your list.", actions: [{ id: "i1", tool: "import_plays", plays, playbook: "Week 3 installs" }] } } }), true);
    }
    if (path === "ai/assistant" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { call: string; bulk?: boolean };
      reads.push({ call: body.call, bulk: body.bulk });
      if (body.call === "Nobody knows") return (await route.fulfill({ status: 400, json: { error: "That call doesn't name any routes. Add who runs what." } }), true);
      return (await route.fulfill({ json: { read: read(body.call.split(":")[0]) } }), true);
    }
    if (path === "plays" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { name: string; tags: string[]; scene: unknown };
      posted.push({ name: body.name, tags: body.tags });
      const id = serverId(posted.length);
      return (
        await route.fulfill({
          json: { play: { id, ownerId: "u1", ownerName: "Coach", name: body.name, formation: "Trips Right", playType: "pass", personnel: "", description: "", tags: body.tags, fieldView: "half", scene: body.scene, preview: "", isPublic: false, saveCount: 1, updatedAt: new Date().toISOString() } },
        }),
        true
      );
    }
    if (path === "playbooks" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { name: string };
      books.push(body.name);
      return (await route.fulfill({ json: { playbook: { id: serverId(90 + books.length), ...body, updatedAt: new Date().toISOString() } } }), true);
    }
  });
  await seedReady(page);
  const before = (await workspace(page)).plays!.length;

  await ask(page, "Import these plays: Trips Right Flood ...");
  const card = page.locator(".gd-card.gd-import").last();
  await expect(card).toContainText("3 plays from your list · 0 drawn");
  await expect(card.locator(".gd-import-row")).toHaveCount(3);
  await expect(card.getByRole("button", { name: "Save 0 to Vault" })).toBeDisabled();
  await expect(card.locator(".gd-import-book input")).toHaveValue("Week 3 installs");
  await card.getByRole("textbox", { name: "Play name" }).nth(1).fill("Bunch Left Mesh Z");

  await card.getByRole("button", { name: "Draw all 3" }).click();
  await expect(card).toContainText("3 plays from your list · 2 drawn");
  const rows = card.locator(".gd-import-row");
  await expect(rows.nth(0)).toHaveClass(/is-ready/);
  await expect(rows.nth(1)).toHaveClass(/is-ready/);
  await expect(rows.nth(2)).toHaveClass(/is-failed/);
  await expect(rows.nth(2)).toContainText("Couldn't draw");
  await expect(rows.nth(2)).toContainText("That call doesn't name any routes. Add who runs what.");
  expect(reads.map((r) => r.bulk)).toEqual([true, true, true]);
  await expect(card.getByRole("button", { name: "Draw the rest" })).toBeEnabled();

  await card.getByRole("button", { name: "Save 2 to Vault" }).click();
  await expect(page.locator(".toast", { hasText: "2 plays saved to your Vault." })).toBeVisible();
  // The seeded plays go up to the account too once signed in; only the imported two carry Griddy's tags.
  const mine = () => posted.filter((p) => p.tags.includes("griddy"));
  await expect.poll(() => mine().map((p) => p.name).sort()).toEqual(["Bunch Left Mesh Z", "Trips Right Flood"]);
  expect(mine()[0].tags).toEqual(["griddy", "imported"]);
  await expect.poll(async () => (await workspace(page)).plays!.length).toBe(before + 2);
  const ws = await workspace(page);
  const book = ws.playbooks!.find((b) => b.name === "Week 3 installs") as { playIds: string[] } | undefined;
  expect(book?.playIds).toHaveLength(2);
  // The seeded playbook goes up too; the new one is created on the account once.
  await expect.poll(() => books.filter((b) => b === "Week 3 installs").length).toBe(1);
  expect(errors).toEqual([]);
});
