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
  // The side menu's groups (Game plan, Practice …) open so every tool's link is on screen.
  const shut = page.locator('.rail-sec-head[aria-expanded="false"]');
  while ((await shut.count()) > 0) await shut.first().click();
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

test("a new release drops the chunks of earlier releases from the cache", async ({ page, context }) => {
  // A chunk left by an earlier release, put in the cache before this release's worker installs.
  await context.addInitScript(() => {
    if (!("caches" in window)) return;
    void caches.open("g1v-2").then((c) => c.put("/assets/Vault-oldrelease.js", new Response("stale", { headers: { "Content-Type": "text/javascript" } })));
  });
  await page.goto("/vault");
  const sw = await page.evaluate(() => fetch("/sw.js").then((r) => r.text()));
  expect(sw).toMatch(/const RELEASE = "[0-9a-f]{10}"/);
  expect(sw).toContain("/assets/index-");
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.ready.then((r) => Boolean(r.active)))).toBe(true);
  await expect
    .poll(() => page.evaluate(() => caches.open("g1v-2").then((c) => c.keys()).then((keys) => keys.map((k) => new URL(k.url).pathname))), { timeout: 15_000 })
    .not.toContain("/assets/Vault-oldrelease.js");
  // This release's own files stay (the screens warmPages fetched once the worker took over).
  await expect
    .poll(() => page.evaluate(() => caches.open("g1v-2").then((c) => c.keys()).then((keys) => keys.filter((k) => /\/assets\/(Wristbands|Practice|Coverage|SeasonGrid)-/.test(k.url)).length)), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1);
});
