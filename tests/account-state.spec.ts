import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * What the account tells every page about itself: a trial's days left in the
 * side menu, the failed-payment banner and its Update card button, the
 * switched-off banner (also when a call is refused mid-session), and on the
 * Account page with billing on, Pause instead of cancel (a refusal in the
 * server's words, a pause, Resume) and Manage billing.
 */
test.beforeEach(async ({ context }) => quiet(context));

const me = (extra: Record<string, unknown>) => ({ user: { id: "u1", email: "coach@example.com", name: "Coach" }, ...extra });

test("a trial shows its days left in the side menu, then that it ends today", async ({ page, context }) => {
  const errors = errorsOf(page);
  let endsAt = new Date(Date.now() + 4.5 * 86_400_000).toISOString();
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      await route.fulfill({ json: me({ plan: "trial", trialEndsAt: endsAt }) });
      return true;
    }
  });
  await page.goto("/vault");
  const plan = page.locator(".rail-plan");
  await expect(plan).toContainText("5 days left of Head Coach. Your plays stay after it ends.");
  await expect(plan.getByRole("link", { name: "Keep Head Coach" })).toHaveAttribute("href", "/pricing");
  await page.goto("/account");
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Head Coach trial");

  endsAt = new Date(Date.now() - 60_000).toISOString();
  await page.reload();
  await expect(page.locator(".rail-plan")).toContainText("Your Head Coach trial ends today.");
  expect(errors).toEqual([]);
});

test("a failed payment shows the banner on every page and Update card goes to Stripe's portal", async ({ page, context }) => {
  const errors = errorsOf(page);
  let portalDown = true;
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      await route.fulfill({ json: me({ plan: "free", billing: true, subscribed: true, paymentFailed: true }) });
      return true;
    }
    if (path === "billing/portal" && method === "POST") {
      if (portalDown) await route.fulfill({ status: 502, json: { error: "Stripe didn't answer. Try again in a minute." } });
      else await route.fulfill({ json: { url: "/account?billing=portal-mock" } });
      return true;
    }
  });
  await page.goto("/vault");
  const banner = page.locator(".pay-banner");
  await expect(banner).toContainText("Your last payment didn't go through.");
  await expect(banner).toContainText("every play is still here");

  // A failed payment is fixed in Stripe, not paused: the pause card stays off the Account page.
  await page.goto("/account");
  await expect(page.locator(".pay-banner")).toContainText("Your last payment didn't go through.");
  await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();
  await expect(page.locator(".pause-plan")).toHaveCount(0);

  // Stripe down: the server's words, and the button is back for another try. Then it opens.
  const fix = page.locator(".pay-banner").getByRole("button", { name: "Update card" });
  await fix.click();
  await expect(page.locator(".toast.is-bad")).toHaveText("Stripe didn't answer. Try again in a minute.");
  await expect(fix).toBeEnabled();
  portalDown = false;
  await fix.click();
  await expect(page).toHaveURL(/\/account\?billing=portal-mock$/);
  expect(errors).toEqual([]);
});

test("an account switched off mid-session shows the banner as soon as a call is refused", async ({ page, context }) => {
  const errors = errorsOf(page);
  let off = false;
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      await route.fulfill({ json: me({ plan: "beta", suspended: off }) });
      return true;
    }
    if (path === "me/plan" && method === "PUT") {
      off = true;
      await route.fulfill({ status: 403, json: { error: "This account is switched off.", code: "account_suspended" } });
      return true;
    }
  });
  await page.goto("/account");
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Beta Coach");
  await expect(page.locator(".pay-banner")).toHaveCount(0);

  await page.getByRole("group", { name: "Switch plan" }).getByRole("button", { name: "Head Coach", exact: true }).click();
  await expect(page.locator(".toast.is-bad")).toHaveText("This account is switched off.");
  const banner = page.locator(".pay-banner");
  await expect(banner).toContainText("This account is switched off.");
  await expect(banner).toContainText("Plays in this browser are still here.");
  await expect(banner.getByRole("link", { name: "support@gridiron-vault.com" })).toHaveAttribute("href", "mailto:support@gridiron-vault.com");
  // The plan didn't change.
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Beta Coach");
  // It stays on every page.
  await page.goto("/vault");
  await expect(page.locator(".pay-banner")).toContainText("This account is switched off.");
  expect(errors).toEqual([]);
});

test("with billing on, the Account page pauses a plan instead of cancelling, resumes it, and opens Stripe's portal", async ({ page, context }) => {
  const errors = errorsOf(page);
  let pausedUntil: string | undefined;
  let yearly = true;
  const posts: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      await route.fulfill({ json: me({ plan: pausedUntil ? "free" : "solo", billing: true, subscribed: true, pausedUntil }) });
      return true;
    }
    if (path === "billing/pause" && method === "POST") {
      posts.push(route.request().postData() ?? "");
      if (yearly) await route.fulfill({ status: 400, json: { error: "Pause is for monthly plans. A yearly plan runs to the end of its year." } });
      else {
        pausedUntil = "2027-04-01T12:00:00.000Z";
        await route.fulfill({ json: { pausedUntil } });
      }
      return true;
    }
    if (path === "billing/resume" && method === "POST") {
      pausedUntil = undefined;
      await route.fulfill({ json: { ok: true } });
      return true;
    }
    if (path === "billing/portal" && method === "POST") {
      await route.fulfill({ json: { url: "/account?billing=portal-mock" } });
      return true;
    }
  });
  await page.goto("/account");
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Head Coach");
  const pause = page.getByRole("group", { name: "Season over? Pause instead of cancelling" });
  await expect(pause.getByRole("button", { pressed: true })).toHaveText("3 months");
  await pause.getByRole("button", { name: "6 months" }).click();
  const go = pause.getByRole("button", { name: "Pause for 6 months" });

  // A yearly plan is refused in the server's words; a monthly one pauses.
  await go.click();
  await expect(page.locator(".toast.is-bad")).toHaveText("Pause is for monthly plans. A yearly plan runs to the end of its year.");
  expect(posts).toEqual(['{"months":6}']);
  await expect(pause).toBeVisible();
  yearly = false;
  await go.click();
  await expect(page.locator(".toast").filter({ hasText: "Paused." })).toHaveText("Paused. No charges until April 1, 2027.");
  const paused = page.locator(".pause-plan");
  await expect(paused).toContainText("Plan paused");
  await expect(paused).toContainText("No charges until April 1, 2027.");
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Sideline");

  // Back early.
  await paused.getByRole("button", { name: "Resume my plan now" }).click();
  await expect(page.locator(".toast").filter({ hasText: "Welcome back" })).toHaveText("Welcome back. Your plan is on again.");
  await expect(page.getByRole("group", { name: "Season over? Pause instead of cancelling" })).toBeVisible();
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Head Coach");

  await page.getByRole("button", { name: "Manage billing" }).click();
  await expect(page).toHaveURL(/\/account\?billing=portal-mock$/);
  expect(errors).toEqual([]);
});
