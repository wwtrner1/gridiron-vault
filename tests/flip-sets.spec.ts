import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * The Formation and Defense libraries' Flip left/right switch: the preview
 * and the drop turn left to right about the ball, the dropped formation takes
 * the mirrored name (Trips Right becomes Trips Left), a flipped defense
 * matches up on the receivers where they now stand, and the switch is kept
 * after a reload.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false })));
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

async function reach(page: Page, button: Locator) {
  await page.locator("#dz-tools").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await button.click();
}

test("Flip left/right mirrors a dropped formation and a defense, and is kept after a reload", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const panel = page.locator("#dz-tabpanel");
  const players = svg.locator("g[data-kind=player]");
  const xs = async () => (await players.evaluateAll((els) => els.map((e) => Number(/translate\(([\d.-]+)/.exec(e.getAttribute("transform") ?? "")?.[1])))).sort((a, b) => a - b);

  await page.getByRole("tab", { name: "Sets" }).click();
  await panel.getByRole("button", { name: "Formations" }).click();
  const flip = page.getByRole("group", { name: "Flip left/right" }).getByRole("button", { name: "Flipped" });
  await expect(page.getByRole("button", { name: "As drawn" })).toHaveAttribute("aria-pressed", "true");
  await flip.click();
  await expect(flip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "5v5 flag Trips Right, flipped left to right" })).toBeVisible();
  await reach(page, page.getByRole("button", { name: "Drop Trips Left" }));
  await expect(players).toHaveCount(5);
  // Trips Right put its three at 720, 810 and 920; flipped they stand at 320, 230 and 120 across.
  expect(await xs()).toEqual([120, 230, 320, 520, 520]);

  // A flipped defense: Man lines up on the receivers where they stand now.
  await panel.getByRole("button", { name: "Defense", exact: true }).click();
  const dflip = page.getByRole("group", { name: "Flip left/right" }).getByRole("button", { name: "Flipped" });
  await dflip.click();
  await page.locator("#dz-list-tray select").nth(1).selectOption("Man");
  await reach(page, page.getByRole("button", { name: "Drop 4-3 Man" }));
  await expect(players).toHaveCount(16);

  // Kept after a reload.
  await page.reload();
  await svg.waitFor();
  await page.getByRole("tab", { name: "Sets" }).click();
  await panel.getByRole("button", { name: "Formations" }).click();
  await expect(page.getByRole("group", { name: "Flip left/right" }).getByRole("button", { name: "Flipped" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
