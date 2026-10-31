import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("a browser that can't keep the workspace says so once, instead of losing new work quietly", async ({ page, context }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // The browser refuses the workspace write from now on (what a full storage does).
  await context.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "snapline.workspace.v1") throw new DOMException("quota", "QuotaExceededError");
      return real.call(this, key, value);
    };
  });
  await page.goto("/vault");
  await page.locator(".play-card").first().waitFor();
  await expect(page.locator(".toast")).toHaveCount(0);

  // Copying a starter writes the workspace: the warning shows once, and the play is still on screen.
  await page.goto("/starters");
  await page.locator('.play-card button[aria-label$="to your Vault"]').first().click();
  await expect(page.locator(".toast.is-bad")).toContainText("This browser's storage is full");
  await expect(page.locator(".toast.is-bad")).toHaveCount(1);
  expect(errors).toEqual([]);
});
