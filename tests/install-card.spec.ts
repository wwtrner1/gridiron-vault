import { expect, test } from "@playwright/test";
import { quiet, signIn } from "./helpers";

/**
 * The Account page's "GridIronVault on your phone" card: the browser's
 * install prompt when it offers one, the Safari steps on an iPhone, the
 * installed app, else the manual words. And what is no longer there: a
 * signed-in coach is never asked for a mobile number or a texted code, and
 * the page has no "Phone and devices" card (sign-in phone codes were taken
 * out on 2026-11-22).
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the install card follows the browser's install prompt", async ({ page, context }) => {
  await signIn(context, () => {});
  await page.goto("/account");
  await expect(page.locator("h1")).toHaveText("Your account");

  // GridIronVault on your phone: the manual words in a plain browser, the install button once the browser offers a prompt.
  const install = page.locator("section.card", { has: page.getByRole("heading", { name: "GridIronVault on your phone" }) });
  await expect(install).toContainText("On a phone or tablet, open this site in Chrome (Android) or Safari (iPhone and iPad) and add it to the home screen.");
  await expect(install.getByRole("button")).toHaveCount(0);
  await page.evaluate(() => {
    const w = window as Window & { __prompted?: number };
    w.__prompted = 0;
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
    e.prompt = async () => {
      w.__prompted = (w.__prompted ?? 0) + 1;
    };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  await expect(install).toContainText("Add it to your home screen: it opens full screen, without the browser bar, and starts quickly at the field.");
  await install.getByRole("button", { name: "Install the app" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __prompted?: number }).__prompted)).toBe(1);
  // The prompt is one-shot: once used, the card is back to the manual words until the browser offers another.
  await expect(install.getByRole("button")).toHaveCount(0);
  await expect(install).toContainText("On a phone or tablet");
});

test("a signed-in coach is never asked for a phone number or a code, whatever the account answers", async ({ page, context }) => {
  // An answer shaped like the old phone check's ("add a number", then "confirm this device"): the app has no gate to open.
  const posts: string[] = [];
  let meCalls = 0;
  let security = { required: true, verified: false, trusted: false, phone: null as string | null, devices: 0 };
  await signIn(context, async (route, path, method) => {
    if (path === "me") {
      meCalls += 1;
      await route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "beta", security } });
      return true;
    }
    if (path.startsWith("phone/") && method === "POST") posts.push(path);
  });
  await page.goto("/account");
  await expect(page.locator("h1")).toHaveText("Your account");
  await expect(page.getByRole("heading", { name: "GridIronVault on your phone" })).toBeVisible();
  // The old gate opened only after the account answered, so wait for that answer before asserting that nothing opened.
  await expect.poll(() => meCalls).toBeGreaterThan(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Add your mobile number")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Phone and devices" })).toHaveCount(0);

  security = { required: true, verified: true, trusted: false, phone: "•••• 4321", devices: 1 };
  const before = meCalls;
  await page.goto("/vault");
  await expect(page.locator("h1")).toBeVisible();
  await expect.poll(() => meCalls).toBeGreaterThan(before);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Confirm this device")).toHaveCount(0);
  await expect(page.getByLabel("Mobile number")).toHaveCount(0);
  expect(posts).toEqual([]);
});

test.describe("on an iPhone", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  test("the install card gives the Safari steps", async ({ page }) => {
    await page.goto("/account");
    const install = page.locator("section.card", { has: page.getByRole("heading", { name: "GridIronVault on your phone" }) });
    await expect(install).toContainText("In Safari, tap Share, then Add to Home Screen.");
  });
});

test("the installed app says so", async ({ page, context }) => {
  await context.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q === "(display-mode: standalone)" ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as unknown as MediaQueryList) : real(q));
  });
  await page.goto("/account");
  const install = page.locator("section.card", { has: page.getByRole("heading", { name: "GridIronVault on your phone" }) });
  await expect(install).toContainText("You're using the installed app.");
});
