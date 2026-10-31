import { expect, test } from "@playwright/test";
import { quiet, signIn } from "./helpers";

/**
 * Two Account page cards: "GridIronVault on your phone" (the browser's
 * install prompt when it offers one, the Safari steps on an iPhone, the
 * installed app, else the manual words) and "Phone and devices" (the masked
 * number, the device count, Sign out other devices with a refusal in the
 * server's words; hidden while phone codes are off).
 */
test.beforeEach(async ({ context }) => quiet(context));

const SEC = { required: true, verified: true, trusted: true, phone: "+1 ••• ••• 4321", devices: 3 };

test("the install card follows the browser's install prompt, and Sign out other devices asks the account", async ({ page, context }) => {
  const posts: string[] = [];
  let refuse = true;
  let devices = SEC.devices;
  await signIn(context, async (route, path, method) => {
    if (path === "me") {
      await route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "beta", security: { ...SEC, devices } } });
      return true;
    }
    if (path === "phone/forget-others" && method === "POST") {
      posts.push(path);
      if (refuse) {
        await route.fulfill({ status: 503, json: { error: "Texting codes is down on our side. Try again in a few minutes." } });
      } else {
        devices = 1;
        await route.fulfill({ json: { security: { ...SEC, devices } } });
      }
      return true;
    }
  });
  await page.goto("/account");
  await expect(page.locator("h1")).toHaveText("Your account");

  // Phone and devices: the masked number and the count; a refusal keeps the card as it was; then the real thing.
  const devicesCard = page.locator("section.card", { has: page.getByRole("heading", { name: "Phone and devices" }) });
  await expect(devicesCard).toContainText("Codes go to +1 ••• ••• 4321. 3 of 5 devices confirmed.");
  const forget = devicesCard.getByRole("button", { name: "Sign out other devices" });
  await expect(forget).toBeEnabled();
  await forget.click();
  await expect(page.locator(".toast.is-bad", { hasText: "Texting codes is down on our side. Try again in a few minutes." })).toBeVisible();
  await expect(devicesCard).toContainText("3 of 5 devices confirmed.");
  await expect(forget).toBeEnabled();
  refuse = false;
  await forget.click();
  await expect(page.locator(".toast", { hasText: "Every other device is signed out. They'll need a code to get back in." })).toBeVisible();
  await expect(devicesCard).toContainText("1 of 5 devices confirmed.");
  await expect(forget).toBeDisabled();
  expect(posts).toEqual(["phone/forget-others", "phone/forget-others"]);

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

test("the devices card stays hidden while phone codes are off", async ({ page, context }) => {
  await signIn(context, () => {});
  await page.goto("/account");
  await expect(page.locator("h1")).toHaveText("Your account");
  await expect(page.getByRole("heading", { name: "GridIronVault on your phone" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Phone and devices" })).toHaveCount(0);
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
