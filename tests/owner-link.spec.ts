import { expect, test, type BrowserContext } from "@playwright/test";
import { quiet, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const OWNER = { user: { id: "u1", email: "coach@example.com", name: "Coach" }, owner: true, plan: "master" };
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (n: number, secondsLeft: number) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "coach@example.com", n, exp: Math.floor(Date.now() / 1000) + secondsLeft })}.sig`;
const adminLink = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: /Admin/ });

test("the owner keeps the Admin link when the account first answers as if nobody were signed in", async ({ page, context }) => {
  let asked = 0;
  await signIn(context, (route, path) => {
    if (path !== "me") return;
    asked += 1;
    // The sign-in cookie ran out: the page's first questions (the phone check's and the side menu's) are answered
    // "nobody". The side menu refreshes the sign-in and asks again instead of taking that as "not the owner".
    return route.fulfill({ json: asked <= 2 ? { user: null } : OWNER }).then(() => true);
  });
  await page.goto("/vault");
  await expect(adminLink(page)).toBeVisible();
  expect(asked).toBeGreaterThanOrEqual(3);
  await adminLink(page).click();
  await expect(page).toHaveURL(/\/admin$/);
});

/** Identity that hands out a new refresh token on every refresh and retires the old one, the way Netlify's does. */
async function rotatingIdentity(context: BrowserContext, secondsLeft: number) {
  const state = { current: "r0", n: 0, refused: 0 };
  await context.addInitScript(
    ([token, left]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(
        "gotrue.user",
        JSON.stringify({
          id: "u1",
          email: "coach@example.com",
          app_metadata: { provider: "email" },
          user_metadata: { full_name: "Coach" },
          token: { access_token: token, refresh_token: "r0", expires_at: Date.now() + Number(left) * 1000, token_type: "bearer" },
          url: `${location.origin}/.netlify/identity`,
        }),
      );
    },
    [jwt(0, secondsLeft), String(secondsLeft)],
  );
  const user = { id: "u1", email: "coach@example.com", confirmed_at: "2026-01-01", app_metadata: { provider: "email" }, user_metadata: { full_name: "Coach" } };
  await context.route("**/.netlify/identity/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/settings")) return route.fulfill({ json: { external: {}, disable_signup: false, autoconfirm: false } });
    if (url.endsWith("/token")) {
      const used = new URLSearchParams(route.request().postData() ?? "").get("refresh_token");
      if (used !== state.current) {
        state.refused += 1;
        return route.fulfill({ status: 400, json: { error: "invalid_grant", error_description: "Invalid Refresh Token" } });
      }
      state.n += 1;
      state.current = `r${state.n}`;
      return route.fulfill({ json: { access_token: jwt(state.n, 3600), token_type: "bearer", expires_in: 3600, refresh_token: state.current } });
    }
    return route.fulfill({ json: user });
  });
  return state;
}

test("a sign-in that runs out is refreshed by one refresher only, so it stays signed in", async ({ page, context }) => {
  await signIn(context, (route, path) => (path === "me" ? route.fulfill({ json: OWNER }).then(() => true) : undefined));
  const identity = await rotatingIdentity(context, 130);
  await page.clock.install();
  await page.goto("/vault");
  await expect(adminLink(page)).toBeVisible();
  // The coach switches apps and comes back with under two minutes left on the sign-in. The page used to trade
  // the refresh token itself right then, while Identity still held the old one for its own refresh.
  await page.clock.fastForward(20_000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  // Identity refreshes in the sign-in's last minute. A retired refresh token would be refused there, and
  // Identity would wipe the saved sign-in: the page still looked signed in, but the account no longer saw the coach.
  await page.clock.fastForward(60_000);
  await expect.poll(() => identity.n).toBe(1);
  expect(identity.refused).toBe(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("gotrue.user") ?? "null")?.token?.refresh_token)).toBe("r1");
  const cookie = (await context.cookies()).find((c) => c.name === "nf_jwt");
  expect(cookie && JSON.parse(Buffer.from(decodeURIComponent(cookie.value).split(".")[1], "base64url").toString()).n).toBe(1);
});
