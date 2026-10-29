import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const xs = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("grid1ronvault.draft.v1") ?? "null") as { scene: { nodes: { x: number }[] } } | null)?.scene.nodes.map((n) => n.x));

test("unsaved Designer changes survive a closed tab and can be brought back or discarded", async ({ page }) => {
  const errors = errorsOf(page);
  page.on("dialog", (d) => void d.accept());
  await seedReady(page);
  await page.locator('.play-card button[aria-label^="Open"]').nth(2).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.locator(".dz-status [role=status]")).toContainText("Selected", { timeout: 1000 });
  }).toPass();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect.poll(() => xs(page)).toBeTruthy();
  const drafted = await xs(page);

  await page.reload();
  const bar = page.locator(".dz-draftbar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Bring them back" }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator('[data-tour="dz-save"]')).toHaveText("Save play");

  // Saving clears the safety copy.
  await page.locator('[data-tour="dz-save"]').click();
  await expect(page.locator('[data-tour="dz-save"]')).toContainText("Saved");
  expect(await xs(page)).toBeUndefined();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("snapline.workspace.v1")!).plays as { id: string; scene: { nodes: { x: number }[] } }[]);
  const id = page.url().split("/build/")[1].split(/[?#]/)[0];
  expect(saved.find((p) => p.id === id)!.scene.nodes.map((n) => n.x)).toEqual(drafted);

  // Discard: the bar goes and stays gone.
  await page.keyboard.press("n");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => xs(page)).toBeTruthy();
  await page.reload();
  await bar.getByRole("button", { name: "Discard" }).click();
  await page.reload();
  await page.locator(".stage-frame svg").first().waitFor();
  await expect(bar).toHaveCount(0);
  expect(errors).toEqual([]);
});
