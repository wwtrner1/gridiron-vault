import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("the ? help lists the screen's buttons and a tour link starts the spotlight", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/vault");
  await page.locator('[data-tour="page-help"]').click();
  await expect(page.getByRole("dialog", { name: /every button/ })).toBeVisible();
  await expect(page.locator(".guide-list dt").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/vault?tour=vault");
  await expect(page.locator(".tour-layer [role=dialog]")).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});
