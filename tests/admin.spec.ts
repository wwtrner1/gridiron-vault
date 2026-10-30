import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const COACH = "c0ffee00-0000-4000-8000-000000000001";
const user = {
  id: COACH, email: "spy@example.com", name: "Spy", signedUpAt: "2026-10-01T00:00:00.000Z", confirmed: true, provider: "email",
  lastSignInAt: null, lastActiveAt: null, plan: "solo", phone: "none", deleted: false, deletedAt: null, plays: 3, griddyMonth: 0,
  griddyPeakDay: 0, photosMonth: 0, exports: 2, exports24h: 0, devices: 1, phoneSignups: 0, devicePeers: 0, griddyFirstDay: 0,
  captures7d: 31, suspended: false, flags: ["Lots of prints, screenshots or copies this week"],
};
const activity = [
  { id: "a1", ownerId: COACH, email: "spy@example.com", kind: "screenshot_key", browser: "Chrome on Windows", deviceHash: "abcdef123456", ipPrefix: "203.0.113.x", place: "Nashville, TN, US", detail: { how: "Print Screen", page: "/build" }, at: "2026-10-30T08:00:00.000Z" },
  { id: "a2", ownerId: COACH, email: "spy@example.com", kind: "sign_in", browser: "Chrome on Windows", deviceHash: "abcdef123456", ipPrefix: "203.0.113.x", place: "Nashville, TN, US", detail: {}, at: "2026-10-30T07:59:00.000Z" },
];
const detail = {
  profile: { id: COACH, email: "spy@example.com", displayName: "Spy", plan: "solo", phone: null, phoneVerifiedAt: null, createdAt: null, lastActiveAt: null, suspendedAt: null, suspendedReason: "", stripeSubscriptionId: "sub_1" },
  identity: { email: "spy@example.com" }, plays: [], playbooks: [], sheets: [], trash: [], devices: [], usage: [], history: [], activity, trashDays: 30,
};

test("the owner sees sign-ins and captures, switches an account off and deletes it after typing the email", async ({ page, context }) => {
  const errors = errorsOf(page);
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await signIn(context, async (route, path, method) => {
    const answer = async (json: unknown) => (await route.fulfill({ json }), true);
    if (path === "me") return answer({ user: { id: "u1", email: "coach@example.com", name: "Coach" }, owner: true, plan: "master" });
    if (path === "admin/users" && method === "GET") return answer({ users: [user], identity: true });
    if (path === `admin/users/${COACH}` && method === "GET") return answer(detail);
    if (path.startsWith("admin/activity")) return answer({ rows: activity, totals: [{ ownerId: COACH, email: "spy@example.com", kind: "screenshot_key", n: 31 }] });
    if (path.startsWith("admin/") && method === "POST") {
      posts.push({ path, body: JSON.parse(route.request().postData() ?? "{}") });
      return answer({ ok: true, billing: "cancelled" });
    }
  });

  await page.goto("/admin");
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.locator(".adm-table")).toContainText("Print Screen");
  await expect(page.locator(".adm-table")).toContainText("203.0.113.x");
  await expect(page.getByText("can't detect a screenshot taken by the operating system")).toBeVisible();

  await page.getByRole("tab", { name: "Users" }).click();
  await page.getByRole("button", { name: "spy@example.com" }).click();
  await expect(page.getByText("Sign-ins and capture activity")).toBeVisible();

  await page.getByRole("button", { name: "Switch off…" }).click();
  await page.getByLabel("Reason (only you see it)").fill("shared login");
  await page.getByRole("button", { name: "Switch off", exact: true }).click();
  await expect.poll(() => posts.find((p) => p.path.endsWith("/suspend"))?.body).toEqual({ reason: "shared login", cancelBilling: true });

  await page.getByRole("button", { name: "Delete account…" }).click();
  const del = page.getByRole("dialog").getByRole("button", { name: "Delete account" });
  await expect(del).toBeDisabled();
  await page.getByLabel("Type their email to confirm").fill("spy@example.com");
  await del.click();
  await expect.poll(() => posts.find((p) => p.path.endsWith("/delete"))?.body.confirm).toBe("spy@example.com");
  expect(errors).toEqual([]);
});

test("a signed-in coach's Print Screen and print are reported to the activity log", async ({ page, context }) => {
  const sent: { kind: string }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "activity" && method === "POST") {
      sent.push(...(JSON.parse(route.request().postData() ?? "[]") as { kind: string }[]));
      await route.fulfill({ status: 204, body: "" });
      return true;
    }
  });
  await page.goto("/vault");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("PrintScreen");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  // Leaving the tab sends what's queued straight away.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => sent.map((s) => s.kind).sort()).toEqual(["print", "screenshot_key"]);
});
