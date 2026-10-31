import { expect, test, type BrowserContext } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "coach@example.com", exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
const USER = { id: "u1", email: "coach@example.com", confirmed_at: "2026-01-01", app_metadata: { provider: "email" }, user_metadata: { full_name: "Coach Reyes" } };

/** Netlify Identity as the sign-in page talks to it: settings, the password grant, the user, signup and recovery. */
async function identity(context: BrowserContext, calls: string[]) {
  await context.route("**/api/**", (route) => route.fulfill({ status: 204, body: "" }));
  await context.route("**/.netlify/identity/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/\.netlify\/identity\//, "");
    const method = route.request().method();
    calls.push(`${method} ${path}`);
    if (path === "settings") return route.fulfill({ json: { external: {}, disable_signup: false, autoconfirm: false } });
    if (path === "token" && method === "POST") {
      const body = new URLSearchParams(route.request().postData() ?? "");
      if (body.get("grant_type") === "password" && body.get("password") === "fourth-and-long!")
        return route.fulfill({ json: { access_token: JWT, refresh_token: "r", expires_in: 3600, token_type: "bearer" } });
      return route.fulfill({ status: 400, json: { error: "invalid_grant", error_description: "No user found with that email, or password invalid." } });
    }
    if (path === "user") return route.fulfill({ json: USER });
    if (path === "signup" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { email?: string };
      if (body.email === "taken@example.com") return route.fulfill({ status: 422, json: { code: 422, msg: "A user with this email address has already been registered" } });
      return route.fulfill({ json: { ...USER, id: "u2", confirmed_at: null, email: "new@example.com" } });
    }
    if (path === "recover" && method === "POST") return route.fulfill({ json: {} });
    return route.fulfill({ status: 404, json: { msg: "not mocked" } });
  });
}

test("a coach signs in with email and password and lands in the Vault; a wrong password says so", async ({ page, context }) => {
  const errors = errorsOf(page);
  const calls: string[] = [];
  await identity(context, calls);

  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Welcome back, Coach" })).toBeVisible();
  await page.getByLabel("Email").fill("coach@example.com");
  await page.getByLabel("Password").fill("wrong-pass");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByRole("alert")).toContainText("That email and password do not match.");
  await expect(page).toHaveURL(/\/signin$/);

  await page.getByLabel("Password").fill("fourth-and-long!");
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/vault$/);
  expect(calls).toContain("POST token");
  expect(calls).toContain("GET user");

  // Signed in: the side menu names the coach, and the session is kept for the next visit.
  await expect(page.getByRole("button", { name: "Sign out of Coach Reyes" })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gotrue.user") ?? "null") as { email?: string } | null);
  expect(saved?.email).toBe("coach@example.com");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out of Coach Reyes" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("creating an account and a password reset each tell the coach what happens next", async ({ page, context }) => {
  const errors = errorsOf(page);
  const calls: string[] = [];
  await identity(context, calls);

  await page.goto("/signin");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Your name").fill("Coach Reyes");
  await page.getByLabel("Email").fill("new@example.com");
  await page.getByLabel("Password").fill("short");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByRole("alert")).toContainText("Use at least 8 characters.");
  expect(calls).not.toContain("POST signup");

  // An email that already has an account is told so, not "check the format".
  await page.getByLabel("Email").fill("taken@example.com");
  await page.getByLabel("Password").fill("fourth-and-long!");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByRole("alert")).toContainText("That email already has an account.");

  await page.getByLabel("Email").fill("new@example.com");
  await page.locator("form button[type=submit]").click();
  await expect(page.locator("form [role=status]")).toContainText("Check your inbox and confirm your email");
  expect(calls).toContain("POST signup");

  await page.getByRole("group", { name: "Sign in or create an account" }).getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email").fill("coach@example.com");
  await page.locator("form button[type=submit]").click();
  await expect(page.locator("form [role=status]")).toContainText("Reset link sent.");
  expect(calls).toContain("POST recover");
  expect(errors).toEqual([]);
});
