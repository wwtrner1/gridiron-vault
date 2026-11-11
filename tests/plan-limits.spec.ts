import { expect, test, type Page } from "@playwright/test";
import { quiet, seedReady } from "./helpers";

/**
 * What Sideline and beta keep back so the library can't walk out the door:
 * five sample starters (the rest show their formation only), no Ready-to-Go
 * playbook, exports three plays at a time, and library plays already in a
 * Vault kept but never exported. A signed-out browser starts on Sideline and
 * can't pick a bigger plan without an account.
 */
test.beforeEach(async ({ context }) => quiet(context));

const onPlan = (page: Page, plan: string) => page.evaluate((p) => localStorage.setItem("nextplay.tier.v1", p), plan);

test("Sideline opens five sample starters, previews the rest as a formation only, and exports three plays at a time", async ({ page }) => {
  await page.goto("/starters");
  await onPlan(page, "free");
  await page.reload();

  await expect(page.getByText("Five starter plays are open on Sideline.")).toBeVisible();
  await expect(page.locator(".play-card:not(.is-locked)")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Copy Spread — Mesh to your Vault" })).toBeDisabled();

  // A held-back play: players only, no routes, reads or coaching intel.
  await page.getByRole("button", { name: "Preview Spread — Mesh" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("The routes, reads and coaching notes for this play come with Head Coach.");
  await expect(dialog.getByText("Why it works")).toHaveCount(0);
  await expect(dialog.locator("[data-kind='player']").first()).toBeAttached();
  await expect(dialog.locator("[data-kind='path']")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Copy to Vault" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  // A sample: the whole play.
  await page.getByRole("button", { name: "Preview Trips — Flood" }).click();
  await expect(dialog.getByText("Why it works")).toBeVisible();
  await expect(dialog.locator("[data-kind='path']").first()).toBeAttached();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  // Four plays in one export is past the Sideline run; three goes.
  for (const name of ["Single Back — Base", "Spread — Double Slants", "Trips — Flood", "HB Dive"]) await page.getByLabel(`Select ${name}`).check();
  await page.getByRole("button", { name: "Export or print" }).click();
  await expect(dialog).toContainText("Sideline exports and prints 3 plays at a time.");
  await expect(dialog.getByRole("button", { name: "Preview and print" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Select HB Dive").uncheck();
  await page.getByRole("button", { name: "Export or print" }).click();
  await expect(dialog.getByRole("button", { name: "Preview and print" })).toBeEnabled();
});

test("beta has no Ready-to-Go playbook, and Ready-to-Go plays already in a Vault stay but don't export", async ({ page }) => {
  // Added while the browser was on a bigger plan.
  await seedReady(page);
  await onPlan(page, "beta");
  await page.reload();
  await expect(page.locator(".play-card")).toHaveCount(24);

  await page.getByRole("button", { name: "Select 01 · All Curls" }).click();
  await page.getByRole("button", { name: "Select 03 · Mesh" }).click();
  await page.getByRole("group", { name: "Selected plays" }).getByRole("button", { name: "Export or print" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("These are library plays (Ready-to-Go or a Head Coach starter).");
  await expect(dialog.getByRole("button", { name: "Preview and print" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // A Vault without it is offered the playbook only as a plan.
  await page.evaluate(() => localStorage.removeItem("snapline.workspace.v1"));
  await page.reload();
  const ready = page.locator(".vault-ready");
  await expect(ready.getByRole("link", { name: "Comes with Head Coach" })).toHaveAttribute("href", "/pricing");
  await expect(ready.getByRole("button")).toHaveCount(0);
});

test("a signed-out browser starts on Sideline and a bigger plan asks for a sign-in", async ({ page }) => {
  await page.goto("/pricing");
  await page.evaluate(() => localStorage.removeItem("nextplay.tier.v1"));
  await page.reload();
  const cards = page.locator(".home-plan");
  const sideline = cards.filter({ has: page.getByRole("heading", { name: "Sideline", exact: true }) });
  await expect(sideline.getByRole("button", { name: "Your current plan" })).toBeDisabled();

  await page.getByRole("button", { name: "Choose Head Coach" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByText("Sign in first. Plans live on your account")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nextplay.tier.v1"))).toBeNull();
});
