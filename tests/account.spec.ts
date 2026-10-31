import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { quiet, seedReady, signIn, workspace } from "./helpers";

/**
 * The Account page: the profile, the usage meters, a backup download, the
 * clear-workspace box, and deleting the account (the typed email, a refusal
 * from the account in coach words, then the real thing).
 */
test.beforeEach(async ({ context }) => quiet(context));

test("signed in, the Account page shows the coach, their usage, and backs up or clears the workspace", async ({ page, context }) => {
  await signIn(context, () => {});
  await seedReady(page);
  await page.goto("/account");
  await expect(page.locator("h1")).toHaveText("Your account");

  // Profile and meters.
  await expect(page.locator('[data-tour="acct-profile"]')).toContainText("coach@example.com");
  const plays = page.getByRole("progressbar", { name: "Plays in your Vault" });
  await expect(plays).toHaveAttribute("aria-valuenow", "24");
  await expect(page.getByRole("link", { name: "1 playbook" })).toBeVisible();

  // The backup is a JSON file holding every play.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download a backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gridironvault-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile((await download.path())!, "utf8")) as { plays: unknown[]; playbooks: unknown[] };
  expect(backup.plays).toHaveLength(24);
  expect(backup.playbooks).toHaveLength(1);

  // Clear local workspace says what goes and can be kept; cleared, the Vault is empty.
  await page.getByRole("button", { name: "Clear local workspace" }).click();
  const wipe = page.getByRole("dialog", { name: "Clear this browser's workspace?" });
  await expect(wipe).toContainText("This removes 24 plays, 1 playbook and 0 Call Sheets from this browser.");
  await expect(wipe).toContainText("Anything already synced to your account stays safe");
  await wipe.getByRole("button", { name: "Keep my work" }).click();
  await expect(wipe).toHaveCount(0);
  expect((await workspace(page)).plays).toHaveLength(24);
  await page.getByRole("button", { name: "Clear local workspace" }).click();
  await wipe.getByRole("button", { name: "Clear it" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await workspace(page)).plays ?? []).toHaveLength(0);
});

test("deleting the account needs the typed email, shows the account's refusal in coach words, then signs the coach out", async ({ page, context }) => {
  let attempts = 0;
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "DELETE") {
      attempts++;
      if (attempts === 1) {
        await route.fulfill({ status: 400, json: { error: "Your Stripe subscription couldn't be cancelled. Try again in a minute." } });
      } else {
        await route.fulfill({ json: { ok: true } });
      }
      return true;
    }
  });
  await seedReady(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const box = page.getByRole("dialog", { name: "Delete your account?" });
  const go = box.getByRole("button", { name: "Delete everything" });
  await expect(go).toBeDisabled();
  await box.getByLabel("Type coach@example.com to confirm").fill("someone@else.com");
  await expect(go).toBeDisabled();
  await box.getByLabel("Type coach@example.com to confirm").fill("Coach@Example.com");
  await expect(go).toBeEnabled();

  // The account refuses once, in its own words, and the box stays open.
  await go.click();
  await expect(box.getByRole("alert")).toHaveText("Your Stripe subscription couldn't be cancelled. Try again in a minute.");
  await expect(go).toBeEnabled();

  // Then it goes through: workspace cleared, signed out, home.
  await go.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Your account and everything in it are deleted.")).toBeVisible();
  expect((await workspace(page)).plays ?? []).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("gotrue.user"))).toBeNull();
  expect(attempts).toBe(2);
});

test("signed out, the Account page says the work is local and offers an account", async ({ page }) => {
  await page.goto("/account");
  await expect(page.locator('[data-tour="acct-profile"]')).toContainText("You are working locally");
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
  await page.getByRole("button", { name: "Clear local workspace" }).click();
  await expect(page.getByRole("dialog", { name: "Clear this browser's workspace?" })).toContainText("You are not signed in, so this cannot be undone.");
});
