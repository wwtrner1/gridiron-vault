import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

/** Opens the third Ready-to-Go play and moves its first player with the keyboard (N, then arrows). */
async function openAndNudge(page: import("@playwright/test").Page) {
  await seedReady(page);
  await page.locator('.play-card button[aria-label^="Open"]').nth(2).click();
  await expect(page).toHaveURL(/\/build\//);
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.locator(".dz-status [role=status]")).toContainText("Selected", { timeout: 1000 });
  }).toPass();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".dz-status [role=status]")).toContainText("Moved");
}

test("a signed-out coach's edit saves to this browser and survives a reload", async ({ page }) => {
  const errors = errorsOf(page);
  await openAndNudge(page);
  const before = (await workspace(page)).plays!;
  const id = page.url().split("/build/")[1].split(/[?#]/)[0];
  const was = before.find((p) => p.id === id)!;
  await page.locator('[data-tour="dz-save"]').click();
  await expect.poll(async () => (await workspace(page)).plays!.find((p) => p.id === id)?.updatedAt).not.toBe(was.updatedAt);
  const saved = (await workspace(page)).plays!.find((p) => p.id === id)!;
  const moved = saved.scene.nodes.filter((n) => {
    const old = was.scene.nodes.find((o) => o.id === n.id);
    return old && old.x !== n.x;
  });
  expect(moved.length).toBeGreaterThan(0);
  await page.reload();
  expect((await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes).toEqual(saved.scene.nodes);
  expect(errors).toEqual([]);
});

test("a signed-in save goes to the account and the Vault keeps the server copy", async ({ page, context }) => {
  const sent: { method: string; body: { name?: string; scene?: unknown } }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path.startsWith("plays") && (method === "POST" || method === "PUT")) {
      const body = JSON.parse(route.request().postData() ?? "{}");
      sent.push({ method, body });
      const now = new Date().toISOString();
      await route.fulfill({
        json: { play: { id: "11111111-1111-4111-8111-111111111111", ownerId: "u1", ownerName: "Coach", name: body.name ?? "Play", formation: body.formation ?? "", playType: body.playType ?? "pass", personnel: body.personnel ?? "", description: body.description ?? "", tags: body.tags ?? [], fieldView: body.fieldView ?? "half", scene: body.scene, preview: body.preview ?? "", isPublic: false, saveCount: 1, updatedAt: now } },
      });
      return true;
    }
  });
  await openAndNudge(page);
  await page.locator('[data-tour="dz-save"]').click();
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(sent[0].body.scene).toBeTruthy();
  await expect.poll(async () => (await workspace(page)).plays!.some((p) => p.id === "11111111-1111-4111-8111-111111111111" && p.remote)).toBe(true);
});
