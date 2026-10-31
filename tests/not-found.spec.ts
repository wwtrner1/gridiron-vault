import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * Addresses off the map: an unknown address gets the "not in the book" page
 * (noindex, titled, four ways back that land), /login and the retired Game
 * Day addresses forward to Sign in and the Call Sheet, and the Privacy and
 * Terms pages open with their headings, the company and the support address.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("an unknown address gets the not-found page with links that land, and old addresses forward", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/nowhere/at/all");
  const main = page.locator("main.notfound");
  await expect(main.locator("h1")).toHaveText("That page is not in the book");
  await expect(main).toContainText("Fourth and long");
  await expect(page).toHaveTitle(/GridIronVault/);
  // A dead address is kept out of search; a real page is not.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  for (const [name, href] of [
    ["Open the designer", "/build"],
    ["The Vault", "/vault"],
    ["Call Sheet", "/grid"],
    ["Back to the front page", "/"],
  ]) {
    await expect(main.getByRole("link", { name })).toHaveAttribute("href", href);
  }
  await main.getByRole("link", { name: "The Vault" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://gridiron-vault.com/");

  // Old addresses forward: /login to Sign in, Game Day to the Call Sheet (a sheet id carried along).
  await page.goto("/login");
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto("/game");
  await expect(page).toHaveURL(/\/grid$/);
  await page.goto("/game/sheet-42");
  await expect(page).toHaveURL(/\/grid\?sheet=sheet-42$/);
  expect(errors).toEqual([]);
});

test("the Privacy and Terms pages open with the company and a way to ask", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/privacy");
  await expect(page.locator("h1")).toHaveText("Your playbook stays yours.");
  await expect(page.locator(".home-eyebrow")).toHaveText("Privacy Policy");
  await expect(page.locator(".help-hero")).toContainText("a Tennessee company");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://gridiron-vault.com/privacy");
  await expect(page.locator(".legal-body").getByRole("link", { name: "support@gridiron-vault.com" }).first()).toHaveAttribute("href", "mailto:support@gridiron-vault.com");
  await expect(page.locator(".legal-body").getByRole("link", { name: "Help & feedback" }).first()).toHaveAttribute("href", "/help");

  // The footer's Terms link lands on the Terms page.
  await page.locator("footer.mkt").getByRole("link", { name: "Terms of Use" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.locator("h1")).toHaveText("The ground rules.");
  await expect(page.locator(".home-eyebrow")).toHaveText("Terms of Use");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://gridiron-vault.com/terms");
  expect(errors).toEqual([]);
});
