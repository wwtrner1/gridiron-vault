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
  ["/drills", /Drill Vault/],
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

// The parts below the fold (Featured tools, the camera gallery, the every-tool grid)
// load as they scroll into view, so the loop above never sees them; and a Pixel 7 is
// 412px wide while the smallest phones are 360px. One pass to the bottom at 360px.
test("the home page fits a 360px phone to the bottom @phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  for (const id of ["featured", "cameras", "everything"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id}`), `${id} section`).toBeVisible();
  }
  // A featured tool's tab and its Watch button must sit inside the screen: a control that
  // runs past the right edge is what used to widen the page.
  await page.locator("#featured").scrollIntoViewIfNeeded();
  const tab = page.locator("#featured").getByRole("tab").first();
  await expect(tab).toBeVisible();
  const box = await tab.boundingBox();
  expect(box && box.x, "a Featured tools tab starts off the screen").toBeGreaterThanOrEqual(0);
  expect(box && box.x + box.width, "a Featured tools tab runs off the screen").toBeLessThanOrEqual(360);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow, "the home page scrolls sideways").toBeLessThanOrEqual(0);
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
