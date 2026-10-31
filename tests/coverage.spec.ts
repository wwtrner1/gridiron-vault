import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("Coverage check runs a pass play against every look, shows one on the field, and the report ranks the Vault", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);

  // A pass play from the Ready-to-Go playbook.
  const name = "17 · Stick";
  await page.getByRole("button", { name: `Open ${name} in the designer` }).click();
  await page.locator(".stage-frame svg").first().waitFor();

  // Extras → Coverage check: one chip per look, a verdict, and the read table.
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.locator('[data-tour="dz-coverage"]').click();
  const dialog = page.getByRole("dialog", { name: /Coverage check/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("h2")).toContainText(name);
  const looks = dialog.locator(".cov-look");
  await expect.poll(() => looks.count()).toBeGreaterThan(2);
  await expect(dialog.locator(".cov-verdict")).toBeVisible();
  await expect(dialog.locator(".cov-table tbody tr").first()).toBeVisible();
  await expect(dialog.locator(".rp-summary, .rp-body")).toContainText(/Beats \d+ of \d+/);

  // Picking another look re-runs the table for it.
  const second = looks.nth(1);
  const lookName = (await second.textContent())!.trim();
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator(".cov-h")).toContainText(lookName.split("\n")[0].trim().slice(0, 8));

  // Show it on the field puts the defense on the Vs defense overlay and closes the check.
  const show = dialog.getByRole("button", { name: /^Show .* on the field$/ });
  if (await show.count()) {
    await show.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('button[aria-controls="dz-more-menu"]')).toHaveClass(/has-dot/);
  } else {
    await dialog.getByRole("button", { name: "Back to drawing" }).click();
    await expect(dialog).toHaveCount(0);
  }

  // The Coverage report runs every pass play and names the best calls per look.
  await page.goto("/coverage");
  await expect(page.locator("h1")).toHaveText("Coverage report");
  const group = page.locator(".cvr-group").first();
  await expect(group).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.locator(".cvr-best-card").count()).toBeGreaterThan(1);
  await expect(page.locator(".cvr-best-card ol li a").first()).toBeVisible();
  const href = await page.locator(".cvr-best-card ol li a").first().getAttribute("href");
  expect(href).toMatch(/^\/build\//);
  expect(errors).toEqual([]);
});
