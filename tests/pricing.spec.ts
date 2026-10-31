import { expect, test } from "@playwright/test";
import { quiet, signIn } from "./helpers";

/**
 * Pricing: the beta plan switcher in this browser, the account's refusal in
 * coach words, and, once billing is open, plan buttons that go to Stripe.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("during beta a coach switches plans in the browser, and the pick is kept", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("note")).toContainText("You are on Beta Coach");
  const cards = page.locator(".home-plan");
  expect(await cards.count()).toBeGreaterThan(2);
  await expect(page.getByRole("button", { name: "Your current plan" })).toHaveCount(0);

  await page.getByRole("button", { name: "Choose Head Coach" }).click();
  await expect(page.getByText("Switched to Head Coach. Every tool is unlocked.")).toBeVisible();
  const head = cards.filter({ has: page.getByRole("heading", { name: "Head Coach", exact: true }) });
  await expect(head.getByRole("button", { name: "Your current plan" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("nextplay.tier.v1"))).toBe("solo");

  await page.getByRole("button", { name: "Start on Sideline" }).click();
  await expect(page.getByText("Switched to Sideline. The extra drawing tools are locked now.")).toBeVisible();
  await page.reload();
  const sideline = cards.filter({ has: page.getByRole("heading", { name: "Sideline", exact: true }) });
  await expect(sideline.getByRole("button", { name: "Your current plan" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Choose Head Coach" })).toBeEnabled();
});

test("signed in, the account keeps the plan, and its refusal shows in coach words", async ({ page, context }) => {
  const sent: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "me/plan" && method === "PUT") {
      const { plan } = JSON.parse(route.request().postData() ?? "{}") as { plan: string };
      sent.push(plan);
      if (plan === "crew") {
        await route.fulfill({ status: 403, json: { error: "Staff plans open with billing. Until then, Head Coach has every tool." } });
      } else {
        await route.fulfill({ json: { plan } });
      }
      return true;
    }
  });
  await page.goto("/pricing");
  await page.getByRole("button", { name: "Choose Head Coach" }).click();
  await expect(page.getByText("Switched to Head Coach. Every tool is unlocked.")).toBeVisible();
  await expect.poll(() => sent).toEqual(["solo"]);

  await page.getByRole("button", { name: "Choose Staff" }).click();
  await expect(page.getByText("Staff plans open with billing. Until then, Head Coach has every tool.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose Staff" })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("nextplay.tier.v1"))).toBe("solo");
});

test("with billing open, a plan button goes to Stripe Checkout and the offers show their buttons", async ({ page, context }) => {
  const offers: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      await route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "beta", billing: true } });
      return true;
    }
    if (path === "billing/checkout" && method === "POST") {
      offers.push((JSON.parse(route.request().postData() ?? "{}") as { offer: string }).offer);
      await route.fulfill({ json: { url: "/account?billing=checkout-mock" } });
      return true;
    }
  });
  await page.goto("/pricing");
  await expect(page.getByRole("button", { name: "Buy the Season Pass" })).toBeVisible();
  await page.getByRole("button", { name: "Choose Head Coach" }).click();
  await expect(page).toHaveURL(/\/account\?billing=checkout-mock/);
  expect(offers).toEqual(["solo_month"]);
});
