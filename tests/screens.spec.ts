import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

const SCREENS: [string, RegExp][] = [
  ["/", /Flag Football Playbook Studio/],
  ["/build", /Designer/],
  ["/vault", /The Vault/],
  ["/playbooks", /Playbooks/],
  ["/grid", /Call Sheet/],
  ["/starters", /Starter plays/],
  ["/pricing", /Plans/],
  ["/account", /Your account/],
  ["/signin", /Sign in/],
  ["/help", /Help/],
  ["/wristbands", /Wristbands/],
  ["/language", /Playbook language/],
  ["/upload", /Upload plays/],
  ["/assignments", /Assignments/],
  ["/practice", /Practice/],
  ["/coverage", /Coverage report/],
  ["/tools", /More tools/],
  ["/front-office", /Front Office/],
  ["/roster", /My team/],
  ["/tutorials", /Tutorials/],
];

test.beforeEach(async ({ context }) => quiet(context));

test("every screen opens with its title and no errors @phone", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  for (const [path, title] of SCREENS) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(title);
    await expect(page.locator("[data-page-loading]"), path).toHaveCount(0);
    await expect(page.locator(".crash"), path).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test("old Game Day links land on the Call Sheet", async ({ page }) => {
  await page.goto("/game/abc");
  await expect(page).toHaveURL(/\/grid\?sheet=abc$/);
});

test("tool screens stay out of search, public ones carry a canonical", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://gridiron-vault.com/pricing");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await page.goto("/vault");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("Starters draws a diagram once its card scrolls near the screen", async ({ page }) => {
  await seedReady(page);
  await page.goto("/starters");
  const last = page.locator(".play-card .play-thumb svg").last();
  await expect(last.locator("*")).toHaveCount(0);
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator("g, path, line, rect").first()).toBeAttached();
});
