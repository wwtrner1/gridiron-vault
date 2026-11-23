import { expect, test } from "@playwright/test";
import { quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("the home page says what a new account gets and its trial buttons open Create account", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator("section").filter({ has: page.locator("#hero-h") });
  await expect(hero.locator(".home-eyebrow")).toHaveText("Free to start · 14-day Head Coach trial · no card");
  // The first button still lets a coach draw with no account; the trial link is the second way in.
  await expect(hero.locator('a[href="/build"]').first()).toBeVisible();
  const heroTrial = hero.getByRole("link", { name: "Start your 14-day trial" });
  await expect(heroTrial).toHaveAttribute("href", "/signin?tab=up");

  const closing = page.locator("section").filter({ has: page.locator("#cta-h") });
  await expect(closing).toContainText("14 days of Head Coach with every tool on, no card");
  await expect(closing.getByRole("link", { name: "Start your 14-day trial" })).toHaveAttribute("href", "/signin?tab=up");

  await heroTrial.click();
  await expect(page).toHaveURL(/\/signin\?tab=up$/);
  const tabs = page.locator(".tab-row");
  await expect(tabs.getByRole("button", { name: "Create account" })).toHaveAttribute("aria-pressed", "true");
  await expect(tabs.getByRole("button", { name: "Sign in" })).toHaveAttribute("aria-pressed", "false");
});

test("the sign-in page names the trial on Create account and opens on Sign in with no tab asked for", async ({ page }) => {
  await page.goto("/signin?tab=up");
  await expect(page.getByText("Your 14-day Head Coach trial starts when you finish. Every tool on, no card.")).toBeVisible();
  await expect(page.locator(".auth-points")).toContainText("14 days of Head Coach to start, then free Sideline. No card");

  await page.goto("/signin");
  const tabs = page.locator(".tab-row");
  await expect(tabs.getByRole("button", { name: "Sign in" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Welcome back, Coach" })).toBeVisible();
});

test("a signed-out coach is asked for an account on the first save only", async ({ page }) => {
  await seedReady(page);
  await page.locator('.play-card button[aria-label^="Open"]').nth(2).click();
  await expect(page).toHaveURL(/\/build\//);
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);

  const nudge = async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(async () => {
      await page.keyboard.press("n");
      await expect(page.locator(".dz-status [role=status]")).toContainText("Selected", { timeout: 1000 });
    }).toPass();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".dz-status [role=status]")).toContainText("Moved");
  };
  const askFlag = () => page.evaluate(() => localStorage.getItem("grid1ronvault.saveask.v1"));

  await nudge();
  expect(await askFlag()).toBeNull();
  await page.locator('[data-tour="dz-save"]').click();
  const ask = page.locator(".toast").filter({ hasText: "Create an account to keep it on every device and start your 14-day Head Coach trial. No card." });
  await expect(ask).toBeVisible();
  expect(await askFlag()).toBe("1");

  // The toast's button goes to the Create account tab.
  await ask.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signin\?tab=up$/);

  // A second save, in a browser that has already been asked, gets the plain note and no button.
  await page.goBack();
  await expect(page).toHaveURL(/\/build\//);
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  await nudge();
  await page.locator('[data-tour="dz-save"]').click();
  await expect(page.locator(".toast").filter({ hasText: "Sign in to keep it across devices." })).toBeVisible();
  await expect(page.locator(".toast .toast-act")).toHaveCount(0);
});
