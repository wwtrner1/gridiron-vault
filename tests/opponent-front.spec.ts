import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The Opponent front panel beyond the stock looks (those are in
 * rules-check.spec.ts): a flag look chip pressed again takes the look off,
 * one of the coach's own plays picked under "Or one of your defenses" fades
 * under the play, Take it off clears the box, and none of it is saved into
 * the play (its players stay the same after Save).
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

test("a flag look toggles off, a saved play goes under the play, Take it off clears it, nothing is saved", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  const front = page.locator(".panel").filter({ has: page.locator(".panel-head", { hasText: "Opponent front" }) });
  const overlay = page.locator('.stage-frame svg g[opacity="0.36"]');
  const save = page.locator('[data-tour="dz-save"]');
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const nodeCount = async () => (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes.length;
  const before = await nodeCount();

  // A look chip is a switch: once on, pressing it again takes the look off.
  const look = front.getByRole("button", { name: "1 rush · Man", exact: true });
  await look.click();
  await expect(look).toHaveAttribute("aria-pressed", "true");
  await expect(overlay).toHaveCount(1);
  await look.click();
  await expect(look).toHaveAttribute("aria-pressed", "false");
  await expect(overlay).toHaveCount(0);
  await expect(front.locator(".hint")).toContainText("Pick a look to see the play against it.");

  // One of the coach's own plays goes under this one; the look chips let go of it.
  const mine = front.getByLabel("Or one of your defenses");
  await expect(mine.locator("option").first()).toHaveText("Pick a saved play");
  await mine.selectOption({ label: "03 · Mesh" });
  await expect(front.locator(".hint")).toContainText("Showing 03 · Mesh faded under the play.");
  await expect(overlay).toHaveCount(1);
  await expect(front.locator(".panel-count")).toHaveText("03 · Mesh");
  await expect(look).toHaveAttribute("aria-pressed", "false");

  // Saving keeps the play as it was: the overlay never goes into it.
  await save.click();
  await expect(save).toContainText("Saved");
  expect(await nodeCount()).toBe(before);

  // Take it off, then a look chip takes over again.
  await front.getByRole("button", { name: "Take it off" }).click();
  await expect(overlay).toHaveCount(0);
  await expect(mine).toHaveValue("");
  await front.getByRole("button", { name: "1 rush · Cover 2", exact: true }).click();
  await expect(front.locator(".hint")).toContainText("Showing 1 rush · Cover 2 faded under the play.");
  await expect(overlay).toHaveCount(1);
  expect(await nodeCount()).toBe(before);
  expect(errors).toEqual([]);
});
