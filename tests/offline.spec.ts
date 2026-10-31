import { expect, test } from "@playwright/test";
import { quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("after the first visit, other screens still open with no signal", async ({ page, context }) => {
  await seedReady(page);
  // warmPages fetches every screen a few seconds after start.
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\/assets\/(Wristbands|Practice|Coverage|SeasonGrid)-/.test(e.name)).length), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(4);
  // The PDF parts behind Print cards come after the screens.
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\/assets\/(jspdf|svg2pdf|scanPdf|pdf\.worker)/.test(e.name)).length), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(4);
  await context.setOffline(true);
  for (const [link, title] of [["Wristbands", /Wristbands/], ["Practice", /Practice/], ["Coverage report", /Coverage report/], ["Call Sheet", /Call Sheet/]] as const) {
    await page.locator(`nav a:has-text("${link}")`).first().click();
    await expect(page).toHaveTitle(title);
    await expect(page.locator(".crash")).toHaveCount(0);
  }

  // Printing wristbands at the field: the preview draws from the cached PDF libraries.
  await page.locator('nav a:has-text("Wristbands")').first().click();
  const source = page.locator('[data-tour="wb-source"] select');
  const book = source.locator('option[value^="book:"]').first();
  await expect(book).toBeAttached();
  await source.selectOption((await book.getAttribute("value"))!);
  await page.locator(".wb-head-actions .btn-primary").click();
  await expect(page.locator(".pp-page img").first()).toBeVisible({ timeout: 40_000 });
  await expect(page.locator(".pp-note").first()).toContainText(/\d+ pages?, exactly as/);
});

test("a screen whose file won't load shows a way back, and the next screen works", async ({ page, context }) => {
  await context.route(/\/assets\/Practice-.*\.js$/, (route) => route.fulfill({ contentType: "text/javascript", body: 'throw new Error("gone")' }));
  await page.goto("/vault");
  await page.evaluate(() => {
    history.pushState({}, "", "/practice");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator(".crash h1")).toHaveText("This screen hit a problem");
  await expect(page.locator(".gd-launch")).toBeVisible();
  await page.evaluate(() => {
    history.pushState({}, "", "/playbooks");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveTitle(/Playbooks/);
  await expect(page.locator(".crash")).toHaveCount(0);
});
