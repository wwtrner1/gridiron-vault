import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const TOKEN = "tok-varsity-link";

/** A playbook with two starter plays, made from the Vault's batch bar. */
async function makeBook(page: import("@playwright/test").Page, name: string) {
  await seedReady(page);
  await page.locator(".play-card .play-pick").nth(0).click();
  await page.locator(".play-card .play-pick").nth(1).click();
  await page.getByRole("button", { name: "Add to new playbook" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "New playbook" }).fill(name);
  await dialog.getByRole("button", { name: "Create and add 2 plays" }).click();
  await expect(dialog).toBeHidden();
}

test("a coach makes a player link from a playbook, sees quiz scores and can turn it off", async ({ page, context }) => {
  const errors = errorsOf(page);
  let shared: { source: string; plays: number } | null = null;
  const calls: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("shares")) return;
    calls.push(`${method} ${path}`);
    if (path === "shares" && method === "GET") {
      await route.fulfill({ json: { shares: shared ? [{ token: TOKEN, source: shared.source, name: "Varsity Offense", plays: shared.plays, updatedAt: "2026-10-30T12:00:00.000Z", results: 1 }] : [] } });
      return true;
    }
    if (path === "shares" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { source: string; snapshot: { name: string; plays: unknown[] } };
      shared = { source: body.source, plays: body.snapshot.plays.length };
      await route.fulfill({ json: { token: TOKEN } });
      return true;
    }
    if (path === `shares/${TOKEN}/results` && method === "GET") {
      await route.fulfill({ json: { results: [{ id: "r1", playerName: "Mia", letter: "X", score: 4, total: 5, at: "2026-10-30T18:00:00.000Z" }] } });
      return true;
    }
    if (path === `shares/${TOKEN}` && method === "DELETE") {
      shared = null;
      await route.fulfill({ json: { ok: true } });
      return true;
    }
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await makeBook(page, "Varsity Offense");
  await page.goto("/playbooks");
  await page.getByRole("button", { name: "Player link for Varsity Offense" }).click();
  const dialog = page.getByRole("dialog", { name: "Player link: Varsity Offense" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Create the player link" }).click();

  // The link, its QR code, and the snapshot that went up.
  const link = dialog.getByRole("textbox", { name: "Link to send" });
  await expect(link).toHaveValue(new RegExp(`/team/${TOKEN}$`));
  await expect(dialog.getByRole("img", { name: "QR code for the player link" })).toBeVisible();
  await expect(dialog).toContainText("Shows 2 plays");
  expect(shared).toMatchObject({ plays: 2 });
  await expect(page.locator(".toast")).toContainText("Player link ready");

  // Copy puts the address on the clipboard.
  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/team/${TOKEN}$`));

  // Quiz scores from the players.
  await expect(dialog.locator(".pl-table")).toContainText("Mia");
  await expect(dialog.locator(".pl-table")).toContainText("4 of 5");

  // Update sends the plays again to the same address; off takes it down.
  await dialog.getByRole("button", { name: "Update with my latest plays" }).click();
  await expect.poll(() => calls.filter((c) => c === "POST shares").length).toBe(2);
  await dialog.getByRole("button", { name: "Turn the link off" }).click();
  await expect(dialog.getByRole("button", { name: "Create the player link" })).toBeVisible();
  expect(calls).toContain(`DELETE shares/${TOKEN}`);
  expect(errors).toEqual([]);
});

test("signed out, the player link dialog asks the coach to sign in", async ({ page }) => {
  const errors = errorsOf(page);
  await makeBook(page, "JV Offense");
  await page.goto("/playbooks");
  await page.getByRole("button", { name: "Player link for JV Offense" }).click();
  const dialog = page.getByRole("dialog", { name: "Player link: JV Offense" });
  await expect(dialog).toContainText("Sign in to make a player link");
  expect(errors).toEqual([]);
});
