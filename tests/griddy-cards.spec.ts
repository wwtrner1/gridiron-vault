import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

async function ask(page: import("@playwright/test").Page, text: string) {
  await page.locator(".gd-launch").click();
  const box = page.locator(".gd-panel textarea").first();
  await box.fill(text);
  await box.press("Enter");
}

/** The account's id for the nth play saved (the Ready-to-Go plays go up too, once signed in). */
const serverId = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;

test("Griddy's draw card saves the play to the Vault and the account", async ({ page, context }) => {
  const errors = errorsOf(page);
  const posted: { id: string; name?: string; scene?: { nodes?: unknown[] } }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "ai/griddy") {
      const read = {
        formation: "Trips Right",
        game: "5v5",
        name: "Trips Right Flood",
        assignments: [
          { player: "X", kind: "route", action: "go", heard: "X go" },
          { player: "Z", kind: "route", action: "corner", heard: "Z corner", firstRead: true },
          { player: "Y", kind: "route", action: "flat", heard: "Y flat" },
        ],
        unsure: [],
      };
      await route.fulfill({ json: { reply: { text: "Here's how I read it.", actions: [{ id: "d1", tool: "draw_play", read }] } } });
      return true;
    }
    if (path === "plays" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      const id = serverId(posted.length + 1);
      posted.push({ id, ...body });
      await route.fulfill({
        json: { play: { id, ownerId: "u1", ownerName: "Coach", name: body.name, formation: body.formation ?? "", playType: body.playType ?? "pass", personnel: body.personnel ?? "", description: body.description ?? "", tags: body.tags ?? [], fieldView: body.fieldView ?? "half", scene: body.scene, preview: "", isPublic: false, saveCount: 1, updatedAt: new Date().toISOString() } },
      });
      return true;
    }
  });
  await seedReady(page);
  await ask(page, "Draw: Trips Right, X go, Z corner, Y flat");
  const card = page.locator(".gd-card").last();
  await expect(card).toContainText("Trips Right Flood");
  await card.getByRole("button", { name: "Save to Vault" }).click();
  await expect(page.locator(".toast", { hasText: "saved to your Vault" })).toBeVisible();
  // The play went to the account with its drawing, and the Vault keeps the account's copy.
  const mine = posted.filter((p) => p.name === "Trips Right Flood");
  expect(mine).toHaveLength(1);
  expect(mine[0].scene?.nodes?.length).toBeGreaterThan(3);
  await expect.poll(async () => (await workspace(page)).plays!.some((p) => p.id === mine[0].id && p.remote)).toBe(true);
  // The seed left the "ready-to-go" tag chip on; the new play is tagged "griddy", so clear it to see the whole Vault.
  await page.locator(".chip.is-on").click();
  await expect(page.locator(".play-card", { hasText: "Trips Right Flood" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Griddy's bulk edit card recolors a letter across the Vault, and Undo puts it back", async ({ page, context }) => {
  const errors = errorsOf(page);
  let letter = "";
  await signIn(context, async (route, path) => {
    if (path !== "ai/griddy") return;
    await route.fulfill({
      json: { reply: { text: "Here's the change.", actions: [{ id: "b1", tool: "bulk_edit", scope: { kind: "vault" }, changes: [{ op: "recolor", letter, color: "#F5D33B" }] }] } },
    });
    return true;
  });
  await seedReady(page);
  type Player = { kind: string; label?: string; fill?: string };
  const fills = (l: string) =>
    page.evaluate((letter) => {
      const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}") as { plays: { scene: { nodes: Player[] } }[] };
      return ws.plays.flatMap((p) => p.scene.nodes.filter((n) => n.kind === "player" && n.label === letter).map((n) => (n.fill ?? "").toLowerCase()));
    }, l);
  // A letter the Ready-to-Go plays actually use.
  letter = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}") as { plays: { scene: { nodes: Player[] } }[] };
    return ws.plays[0].scene.nodes.find((n) => n.kind === "player" && n.label && n.label !== "Q")?.label ?? "X";
  });
  const before = await fills(letter);
  expect(before.length).toBeGreaterThan(0);
  expect(before).not.toContain("#f5d33b");

  await ask(page, `make every ${letter} yellow`);
  const card = page.locator(".gd-card").last();
  await card.getByRole("button", { name: /Apply to \d+ plays?/ }).click();
  await expect(page.locator(".toast", { hasText: "updated." })).toBeVisible();
  await expect.poll(() => fills(letter)).toEqual(before.map(() => "#f5d33b"));

  await card.getByRole("button", { name: "Undo this change" }).click();
  await expect(page.locator(".toast", { hasText: "back the way they were" })).toBeVisible();
  await expect.poll(() => fills(letter)).toEqual(before);
  expect(errors).toEqual([]);
});
