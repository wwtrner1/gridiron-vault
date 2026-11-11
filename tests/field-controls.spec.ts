import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Field controls (Extras → "Field controls: grid, hashes, rule lines"): the
 * snap grid, snap to players and its radius, hash marks and yard-line
 * contrast change the field at once, a rule preset switches the rule lines
 * on, Escape closes the panel, and every pick is kept in this browser.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("Field controls change the grid, hashes, yard lines and rule lines on the field, and are kept after a reload", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const field = page.locator(".stage-frame svg").first();
  await field.waitFor();
  const lines = field.locator("line");
  const open = async () => {
    await page.locator('button[aria-controls="dz-more-menu"]').click();
    await page.getByRole("button", { name: "Field controls: grid, hashes, rule lines" }).click();
    await expect(dialog).toBeVisible();
  };
  const dialog = page.getByRole("dialog", { name: "Field controls" });
  const group = (name: string) => dialog.getByRole("radiogroup", { name });
  const checked = (name: string) => group(name).getByRole("radio", { checked: true });

  await open();
  await expect(checked("Snap to grid")).toHaveText("Off");
  await expect(checked("Hash marks")).toHaveText("High school");
  await expect(checked("Yard lines")).toHaveText("Standard");
  await expect(dialog.getByLabel("Snap lines to players")).toBeChecked();
  await expect(checked("Snap radius")).toHaveText("Normal");

  // Hash marks come off and go back on the field as the chips change.
  const withHashes = await lines.count();
  await group("Hash marks").getByRole("radio", { name: "None" }).click();
  await expect.poll(() => lines.count()).toBeLessThan(withHashes - 40);
  await group("Hash marks").getByRole("radio", { name: "Pro" }).click();
  await expect.poll(() => lines.count()).toBe(withHashes);

  // The snap grid draws over the field; snap to players hides its radius when off.
  await group("Snap to grid").getByRole("radio", { name: "Fine" }).click();
  await expect.poll(() => lines.count()).toBeGreaterThan(withHashes + 100);
  await dialog.getByLabel("Snap lines to players").uncheck();
  await expect(group("Snap radius")).toHaveCount(0);
  await group("Yard lines").getByRole("radio", { name: "High" }).click();

  // The LOS tag sits in the side margin, off the field, and switches off and on.
  const losTag = field.locator("[data-los-tag]");
  await expect(losTag).toHaveCount(1);
  await expect(losTag).toHaveText("LOS");
  await expect(field.locator("text", { hasText: "LINE OF SCRIMMAGE" })).toHaveCount(0);
  await dialog.getByLabel("Show the LOS tag beside the field").uncheck();
  await expect(losTag).toHaveCount(0);

  // A rule preset switches the rule lines on with its distances.
  await expect(dialog.getByLabel("Show the rush line and no-run zone")).not.toBeChecked();
  await dialog.locator(".fc-presets").getByRole("button", { name: "Rush line only" }).click();
  await expect(dialog.getByLabel("Show the rush line and no-run zone")).toBeChecked();
  await expect(dialog.getByLabel("Rush line (yds)")).toHaveValue("7");
  await expect(dialog.getByLabel("No-run zone (yds)")).toHaveValue("0");
  await expect(field.locator("text", { hasText: /RUSH LINE/ })).toHaveText("RUSH LINE · 7 YDS");

  // A distance typed one key at a time stays in the box (the panel never pulls focus back while the field redraws).
  const rush = dialog.getByLabel("Rush line (yds)");
  await rush.click();
  await rush.press("Control+a");
  await rush.pressSequentially("10");
  await expect(rush).toBeFocused();
  await expect(rush).toHaveValue("10");
  await expect(field.locator("text", { hasText: /RUSH LINE/ })).toHaveText("RUSH LINE · 10 YDS");

  // Escape closes the panel; the picks are in this browser.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("grid1ronvault.field.v1") ?? "{}"))).toEqual({ grid: 10, snapRadius: 26, hashes: "pro", contrast: "high", losLabel: false });
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("grid1ronvault.rules.v1") ?? "{}"))).toMatchObject({ on: true, rush: 10, noRun: 0, set: "rush-only" });

  // Kept after a reload, on the field and in the panel.
  await page.reload();
  await field.waitFor();
  await expect.poll(() => lines.count()).toBeGreaterThan(withHashes + 100);
  await expect(field.locator("text", { hasText: /RUSH LINE/ })).toHaveText("RUSH LINE · 10 YDS");
  await open();
  await expect(checked("Snap to grid")).toHaveText("Fine");
  await expect(checked("Hash marks")).toHaveText("Pro");
  await expect(checked("Yard lines")).toHaveText("High");
  await expect(dialog.getByLabel("Snap lines to players")).not.toBeChecked();
  await expect(dialog.getByLabel("Show the LOS tag beside the field")).not.toBeChecked();
  await expect(field.locator("[data-los-tag]")).toHaveCount(0);
  await expect(dialog.getByLabel("Show the rush line and no-run zone")).toBeChecked();
  await dialog.getByRole("button", { name: "Close field controls" }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
