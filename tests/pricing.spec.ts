import { expect, test } from "@playwright/test";
import { onSideline, quiet, signIn } from "./helpers";

/**
 * Pricing: the plan switcher while billing is off, the account's refusal in
 * coach words, the founding rate while any of its 50 spots are left, and,
 * once billing is open, plan buttons that go to Stripe.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("signed out, Sideline is the only plan the browser picks; a bigger one asks for a sign-in", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("note")).toContainText("Every new coach gets 14 days of Head Coach with every tool on, no card. After that you keep Sideline, free.");
  const cards = page.locator(".home-plan");
  expect(await cards.count()).toBeGreaterThan(2);

  await page.getByRole("button", { name: "Start on Sideline" }).click();
  await expect(page.getByText("Switched to Sideline. The extra drawing tools are locked now.")).toBeVisible();
  await page.reload();
  const sideline = cards.filter({ has: page.getByRole("heading", { name: "Sideline", exact: true }) });
  await expect(sideline.getByRole("button", { name: "Your current plan" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("nextplay.tier.v1"))).toBe("free");

  await page.getByRole("button", { name: "Choose Head Coach" }).click();
  await expect(page).toHaveURL(/\/signin\?tab=up$/);
  expect(await page.evaluate(() => localStorage.getItem("nextplay.tier.v1"))).toBe("free");
});

test("signed out, pricing opens on four prices and the trial; yearly and the Season Pass are behind one closed row", async ({ page }) => {
  // No founding count (it didn't load): the founding rate stays off the page.
  await page.route("**/api/billing/founding", (route) => route.fulfill({ status: 503, json: { error: "down" } }));
  await page.goto("/pricing");
  await expect(page.locator(".home-plan")).toHaveCount(4);
  const trial = page.locator(".price-trial");
  await expect(trial).toContainText("Head Coach is yours for 14 days. Nothing is charged");
  await expect(trial.getByRole("link", { name: "Start your 14-day trial" })).toHaveAttribute("href", "/signin?tab=up");
  await expect(page.locator(".price-founding")).toHaveCount(0);

  // The other prices wait behind a row that starts closed.
  const more = page.locator("details[name='pricing-offers']");
  await expect(more).not.toHaveAttribute("open", "");
  await expect(page.locator(".price-offer").first()).toBeHidden();
  await more.locator("summary").click();
  await expect(page.locator(".price-offer h3")).toHaveText(["Season Pass", "Head Coach yearly", "Staff yearly", "Program yearly"]);
});

test("the founding rate shows its spots left while any are left, and a signed-in coach takes it through Checkout", async ({ page, context }) => {
  let left = 37;
  await context.route("**/api/billing/founding", (route) => route.fulfill({ json: { total: 50, left } }));
  await page.goto("/pricing");
  const strip = page.locator(".price-founding");
  await expect(strip).toContainText("the first 50 coaches on Head Coach pay $9 a month for life.");
  await expect(strip).toContainText("37 of 50 spots left.");
  // Signed out there's nothing to buy yet: the trial strip above carries the Create account button.
  await expect(strip.getByRole("button")).toHaveCount(0);
  await page.locator("details[name='pricing-offers'] summary").click();
  await expect(page.locator(".price-offer h3")).toHaveText(["Season Pass", "Head Coach yearly", "Staff yearly", "Program yearly", "Founding coaches"]);

  // Every spot taken: neither the strip nor the offer shows.
  left = 0;
  await page.reload();
  await expect(page.locator(".home-plan")).toHaveCount(4);
  await expect(strip).toHaveCount(0);
  await page.locator("details[name='pricing-offers'] summary").click();
  await expect(page.locator(".price-offer h3")).toHaveText(["Season Pass", "Head Coach yearly", "Staff yearly", "Program yearly"]);

  // A coach on Sideline with billing open takes a spot through Checkout.
  left = 12;
  const offers: string[] = [];
  await onSideline(context);
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      await route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "free", billing: true } });
      return true;
    }
    if (path === "billing/founding") {
      await route.fulfill({ json: { total: 50, left } });
      return true;
    }
    if (path === "billing/checkout" && method === "POST") {
      offers.push((JSON.parse(route.request().postData() ?? "{}") as { offer: string }).offer);
      await route.fulfill({ json: { url: "/account?billing=checkout-mock" } });
      return true;
    }
  });
  await page.goto("/pricing");
  await expect(page.locator(".price-trial")).toHaveCount(0);
  await expect(strip).toContainText("12 of 50 spots left.");
  await strip.getByRole("button", { name: "Take the founding rate" }).click();
  await expect(page).toHaveURL(/\/account\?billing=checkout-mock/);
  expect(offers).toEqual(["founding"]);
});

test("signed in, the account keeps the plan, and its refusal shows in coach words", async ({ page, context }) => {
  const sent: string[] = [];
  await onSideline(context);
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      await route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "free" } });
      return true;
    }
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
  await onSideline(context);
  await signIn(context, async (route, path, method) => {
    if (path === "me" && method === "GET") {
      await route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "free", billing: true } });
      return true;
    }
    if (path === "billing/checkout" && method === "POST") {
      offers.push((JSON.parse(route.request().postData() ?? "{}") as { offer: string }).offer);
      await route.fulfill({ json: { url: "/account?billing=checkout-mock" } });
      return true;
    }
  });
  await page.goto("/pricing");
  await page.locator("details[name='pricing-offers'] summary").click();
  await expect(page.getByRole("button", { name: "Buy the Season Pass" })).toBeVisible();
  // Prices are tax-exclusive: every paid price says "+ tax", Sideline ($0) doesn't, and the note says where tax comes in.
  const headCoach = page.locator(".home-plan").filter({ has: page.getByRole("heading", { name: "Head Coach" }) });
  await expect(headCoach.locator(".home-plan-price small")).toHaveText("per month + tax");
  const sideline = page.locator(".home-plan").filter({ has: page.getByRole("heading", { name: "Sideline" }) });
  await expect(sideline.locator(".home-plan-price small")).not.toContainText("tax");
  await expect(page.locator(".price-offer").filter({ hasText: "Season Pass" }).locator("small")).toHaveText("for 4 months + tax");
  await expect(page.getByRole("note")).toContainText("sales tax is added at checkout");
  await page.getByRole("button", { name: "Choose Head Coach" }).click();
  await expect(page).toHaveURL(/\/account\?billing=checkout-mock/);
  expect(offers).toEqual(["solo_month"]);
});
