import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Back from Stripe Checkout (/account?billing=success): Stripe's webhook sets
 * the plan a moment after the payment, so the page says it is confirming,
 * asks the account until the plan lands, then says which plan the coach is
 * on; when it hasn't landed after the wait, it says so and names support
 * instead of going quiet.
 */
test.beforeEach(async ({ context }) => quiet(context));

const me = (plan: string) => ({ user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan, billing: true, subscribed: plan !== "beta" });

test("back from Checkout, the page confirms the payment and shows the plan once the account has it", async ({ page, context }) => {
  const errors = errorsOf(page);
  const start = Date.now();
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      // The webhook lands a couple of seconds after the coach is back.
      await route.fulfill({ json: me(Date.now() - start > 2500 ? "solo" : "beta") });
      return true;
    }
  });
  await page.goto("/account?billing=success");
  const landing = page.locator(".acct-landing");
  await expect(landing).toHaveText("Thanks, coach. Confirming your payment with Stripe — your new plan lands here in a moment.");
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Beta Coach");

  await expect(page.locator(".toast")).toHaveText("You're on Head Coach. Thanks for backing the playbook.", { timeout: 15_000 });
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Head Coach");
  await expect(landing).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nextplay.tier.v1"))).toBe("solo");
  expect(errors).toEqual([]);
});

test("when the plan hasn't landed after the wait, the page says so and names support", async ({ page, context }) => {
  const errors = errorsOf(page);
  let asks = 0;
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      asks++;
      await route.fulfill({ json: me("beta") });
      return true;
    }
  });
  await page.goto("/account?billing=success");
  const landing = page.locator(".acct-landing");
  await expect(landing).toContainText("Confirming your payment");
  await expect(landing).toContainText("Your payment went through, but the plan hasn't reached your account yet.", { timeout: 30_000 });
  await expect(landing.getByRole("link", { name: "support@gridiron-vault.com" })).toHaveAttribute("href", "mailto:support@gridiron-vault.com");
  expect(asks).toBeGreaterThanOrEqual(10);
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Beta Coach");
  await expect(page.locator(".toast")).toHaveCount(0);

  // A plain visit to the Account page says nothing about payments.
  await page.goto("/account");
  await expect(page.locator('[data-tour="acct-plan"] .card-head .pill')).toHaveText("Beta Coach");
  await expect(landing).toHaveCount(0);
  expect(errors).toEqual([]);
});
