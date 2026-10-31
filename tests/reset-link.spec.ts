import { expect, test, type BrowserContext } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * The links Identity emails: a password-reset link signs the coach in and
 * asks for the new password (short one refused, Later keeps the session), a
 * confirmation link signs the coach in and reports the sign-in, and a link
 * Identity refuses (expired or already used) says so and points to sign in
 * instead of landing on the page as if nothing happened.
 */
test.beforeEach(async ({ context }) => quiet(context));

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "coach@example.com", exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
const USER = { id: "u1", email: "coach@example.com", confirmed_at: "2026-01-01", app_metadata: { provider: "email" }, user_metadata: { full_name: "Coach Reyes" } };

/** Identity as the links talk to it: settings, verify (the token in the link), the user, and the password update. */
async function identity(context: BrowserContext, calls: string[]) {
  await context.route("**/api/**", (route) => {
    calls.push(`API ${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ status: 204, body: "" });
  });
  await context.route("**/.netlify/identity/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/\.netlify\/identity\//, "");
    const method = route.request().method();
    const body = method === "POST" || method === "PUT" ? JSON.parse(route.request().postData() || "{}") : {};
    calls.push(`${method} ${path}${body.type ? ` ${body.type}` : ""}${body.token ? ` ${body.token}` : ""}${body.password ? ` password=${body.password}` : ""}`);
    if (path === "settings") return route.fulfill({ json: { external: {}, disable_signup: false, autoconfirm: false } });
    if (path === "verify" && method === "POST") {
      if (body.token === "good") return route.fulfill({ json: { access_token: JWT, refresh_token: "r", expires_in: 3600, token_type: "bearer" } });
      return route.fulfill({ status: 401, json: { code: 401, msg: "Token not found or has expired" } });
    }
    if (path === "user" && method === "GET") return route.fulfill({ json: USER });
    if (path === "user" && method === "PUT") return route.fulfill({ json: USER });
    return route.fulfill({ status: 404, json: { msg: "not mocked" } });
  });
}

test("a password-reset link signs the coach in and asks for the new password", async ({ page, context }) => {
  const errors = errorsOf(page);
  const calls: string[] = [];
  await identity(context, calls);
  await page.goto("/#recovery_token=good");
  const dialog = page.getByRole("dialog", { name: "Choose a new password" });
  await expect(dialog).toBeVisible();
  expect(calls).toContain("POST verify recovery good");
  // The token is out of the address bar, and the coach is signed in meanwhile.
  await expect(page).toHaveURL(/\/$/);
  expect(page.url()).not.toContain("recovery_token");

  // Too short is refused here; a real one goes to Identity and the dialog closes.
  const box = dialog.getByRole("textbox", { name: "New password" });
  await expect(box).toBeFocused();
  await box.fill("short");
  await dialog.getByRole("button", { name: "Save new password" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Use at least 8 characters.");
  await box.fill("fourth-and-long!");
  await dialog.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".toast")).toHaveText("New password saved. Use it next time you sign in.");
  await expect(dialog).toHaveCount(0);
  expect(calls).toContain("PUT user password=fourth-and-long!");
  // A reset is not a fresh sign-in for the owner's audit.
  expect(calls.filter((c) => c === "API POST /api/me/signin")).toHaveLength(0);
  await page.goto("/vault");
  await expect(page.getByRole("button", { name: "Sign out of Coach Reyes" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Escape on the new-password dialog keeps the coach signed in for now", async ({ page, context }) => {
  const errors = errorsOf(page);
  const calls: string[] = [];
  await identity(context, calls);
  await page.goto("/vault#recovery_token=good");
  const dialog = page.getByRole("dialog", { name: "Choose a new password" });
  await expect(dialog.getByRole("textbox", { name: "New password" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out of Coach Reyes" })).toBeVisible();
  expect(calls.filter((c) => c.startsWith("PUT user"))).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("a confirmation link signs the coach in and reports the sign-in", async ({ page, context }) => {
  const errors = errorsOf(page);
  const calls: string[] = [];
  await identity(context, calls);
  await page.goto("/vault#confirmation_token=good");
  await expect(page.getByRole("button", { name: "Sign out of Coach Reyes" })).toBeVisible();
  expect(calls).toContain("POST verify signup good");
  await expect.poll(() => calls.filter((c) => c === "API POST /api/me/signin").length).toBe(1);
  await expect(page).toHaveURL(/\/vault$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a link Identity refuses says so and points to sign in", async ({ page, context }) => {
  const errors = errorsOf(page);
  const calls: string[] = [];
  await identity(context, calls);
  await page.goto("/#recovery_token=expired");
  const dialog = page.getByRole("dialog", { name: "That link didn't work" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("The password-reset link you opened has expired or was already used. Ask for a new one from the sign-in page and open it within the hour.");
  expect(calls).toContain("POST verify recovery expired");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: /^Sign out of/ })).toHaveCount(0);
  await dialog.getByRole("link", { name: "Go to sign in" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A confirmation link that is refused names that link, and Not now puts the box away.
  await page.goto("/vault#confirmation_token=used");
  const again = page.getByRole("dialog", { name: "That link didn't work" });
  await expect(again).toContainText("The confirmation link you opened has expired or was already used. Sign in and we'll send you a fresh one.");
  await again.getByRole("button", { name: "Not now" }).click();
  await expect(again).toHaveCount(0);
  await expect(page).toHaveURL(/\/vault$/);
  expect(errors).toEqual([]);
});
