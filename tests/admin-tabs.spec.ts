import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * The owner console's other tabs, with /api/admin mocked: Visitors (the
 * period chips asking for 7, 30 or 90 days, the tiles, the per-day table,
 * the tops, the no-visits row and a refusal), the Watch list (only flagged
 * coaches, Download CSV fetching the sheet), the Audit log (newest actions
 * and the empty state), and Find a PDF's owner (a hit opening the coach, a
 * miss, a refusal). A coach who isn't the owner is sent to the Account page.
 */
test.beforeEach(async ({ context }) => quiet(context));

const COACH = "c0ffee00-0000-4000-8000-000000000001";
const OTHER = "c0ffee00-0000-4000-8000-000000000002";
const baseUser = {
  signedUpAt: "2026-10-01T00:00:00.000Z", confirmed: true, provider: "email", lastSignInAt: null, lastActiveAt: null, plan: "solo", phone: "none",
  deleted: false, deletedAt: null, plays: 3, griddyMonth: 0, griddyPeakDay: 0, photosMonth: 0, exports: 2, exports24h: 0, devices: 1, phoneSignups: 0,
  devicePeers: 0, griddyFirstDay: 0, captures7d: 0, suspended: false, flags: [] as string[],
};
const users = [
  { ...baseUser, id: COACH, email: "spy@example.com", name: "Spy", captures7d: 31, flags: ["Lots of prints, screenshots or copies this week"] },
  { ...baseUser, id: OTHER, email: "calm@example.com", name: "Calm" },
];
const detail = {
  profile: { id: COACH, email: "spy@example.com", displayName: "Spy", plan: "solo", phone: null, phoneVerifiedAt: null, createdAt: null, lastActiveAt: null, suspendedAt: null, suspendedReason: "", stripeSubscriptionId: null },
  identity: { email: "spy@example.com" }, plays: [], playbooks: [], sheets: [], trash: [], devices: [], usage: [], history: [], activity: [], trashDays: 30,
};
const stats = (days: number) => ({
  days,
  liveNow: 2,
  totals: { sessions: 40 * (days / 30), visitorDays: 25, avgSeconds: 200, medianSeconds: 75, totalSeconds: 8000, signedInSessions: 10, pagesPerVisit: 3.2 },
  perDay: days === 90 ? [] : [
    { day: "2026-10-29", visitors: 5, sessions: 7, avgSeconds: 90, bounced: 1, signups: 0 },
    { day: "2026-10-30", visitors: 10, sessions: 14, avgSeconds: 3700, bounced: 2, signups: 1 },
  ],
  landing: [{ name: "/", n: 12 }, { name: "/vault", n: 5 }],
  referrers: days === 90 ? [] : [{ name: "google.com", n: 4 }],
  devices: [{ name: "Phone", n: 9 }, { name: "Desktop", n: 8 }],
});
const audit = [
  { id: "e1", actorEmail: "coach@example.com", action: "trace_lookup", targetId: COACH, detail: { code: "GV-1A2B3C4D5E", found: true }, at: "2026-10-30T09:00:00.000Z" },
  { id: "e2", actorEmail: "coach@example.com", action: "export_users_csv", targetId: "", detail: { rows: 2 }, at: "2026-10-30T08:00:00.000Z" },
];

test("Visitors, Watch list, Audit log and Find a PDF's owner, with the console's answers mocked", async ({ page, context }) => {
  const errors = errorsOf(page);
  const asked: string[] = [];
  let auditEntries = audit;
  let visitorsFail = false;
  await signIn(context, async (route, path, method) => {
    const answer = async (json: unknown) => (await route.fulfill({ json }), true);
    if (path === "me") return answer({ user: { id: "u1", email: "coach@example.com", name: "Coach" }, owner: true, plan: "master" });
    if (path === "admin/users" && method === "GET") return answer({ users, identity: true });
    if (path === "admin/users.csv") {
      asked.push(path);
      await route.fulfill({ status: 200, contentType: "text/csv", body: "email,plan\nspy@example.com,solo\n" });
      return true;
    }
    if (path === `admin/users/${COACH}` && method === "GET") return answer(detail);
    if (path === "admin/visitors") {
      const days = Number(new URL(route.request().url()).searchParams.get("days"));
      asked.push(`visitors ${days}`);
      if (visitorsFail) return (await route.fulfill({ status: 503, json: { error: "The visit counter is resting. Try again in a minute." } }), true);
      return answer(stats(days));
    }
    if (path === "admin/audit") return answer({ entries: auditEntries });
    if (path.startsWith("admin/activity")) return answer({ rows: [], totals: [] });
    if (path === "admin/trace" && method === "POST") {
      const { code } = route.request().postDataJSON() as { code: string };
      asked.push(`trace ${code}`);
      if (code === "GV-BROKEN0000") return (await route.fulfill({ status: 503, json: { error: "The trace index is being rebuilt." } }), true);
      return answer({ account: code === "GV-1A2B3C4D5E" ? { id: COACH, email: "spy@example.com", name: "Spy" } : null });
    }
  });

  await page.goto("/admin");
  const tabs = page.getByRole("tablist", { name: "Admin sections" });
  await expect(tabs.getByRole("tab")).toHaveText(["Users", "Visitors", "Watch list", "Activity", "Account recovery", "Audit log"]);
  await expect(page.locator(".adm-table")).toContainText("calm@example.com");

  // Visitors: 30 days by default, the tiles, the per-day table newest first, the tops.
  await tabs.getByRole("tab", { name: "Visitors" }).click();
  const period = page.getByRole("group", { name: "Period" });
  await expect(period.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
  const tiles = page.locator(".adm-tiles").first();
  await expect(tiles.locator(".stat")).toHaveText([
    "2On the site now", "25Visitor-days", "40Visits", "3m 20sAverage time per visit", "1m 15sMedian time per visit", "2h 13mTotal time on site", "3.2Pages per visit", "25%Visits signed in",
  ]);
  const rows = page.locator(".adm-table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("2026-10-30");
  await expect(rows.first().locator("td").nth(4)).toHaveText("1h 2m");
  await expect(rows.first().locator(".adm-bar-fill")).toHaveAttribute("style", /width: 100%/);
  await expect(rows.last().locator(".adm-bar-fill")).toHaveAttribute("style", /width: 50%/);
  const top = (title: string) => page.locator(".adm-card", { has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(top("Where visits start").locator("li")).toHaveText(["/12", "/vault5"]);
  await expect(top("Referring sites").locator("li")).toHaveText(["google.com4"]);
  await expect(top("Devices").locator("li")).toHaveText(["Phone9", "Desktop8"]);
  await expect(page.getByRole("heading", { name: "Before the counter" })).toBeVisible();

  // Another period asks again; with no days back, the table says so and an empty top says Nothing yet.
  await period.getByRole("button", { name: "Last 90 days" }).click();
  await expect(tiles.locator(".stat").nth(2)).toHaveText("120Visits");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("No visits recorded yet.");
  await expect(top("Referring sites")).toContainText("Nothing yet.");
  expect(asked.filter((a) => a.startsWith("visitors"))).toEqual(["visitors 30", "visitors 90"]);

  // A refusal shows in the server's words.
  visitorsFail = true;
  await period.getByRole("button", { name: "Last 7 days" }).click();
  await expect(page.locator(".adm-note.adm-bad")).toHaveText("The visit counter is resting. Try again in a minute.");

  // Watch list: only the flagged coach; Download CSV fetches the sheet.
  await tabs.getByRole("tab", { name: "Watch list" }).click();
  await expect(page.locator(".adm-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".adm-table")).toContainText("spy@example.com");
  await expect(page.locator(".adm-table")).not.toContainText("calm@example.com");
  await expect(page.locator(".adm-table .pill-amber")).toHaveText("Lots of prints, screenshots or copies this week");
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Download CSV" }).click();
  await expect.poll(() => asked.includes("admin/users.csv")).toBe(true);

  // Audit log: newest first, actions in words, the detail as written; then the empty state.
  await tabs.getByRole("tab", { name: "Audit log" }).click();
  const log = page.locator(".adm-table tbody tr");
  await expect(log).toHaveCount(2);
  await expect(log.first().locator("td").nth(2)).toHaveText("trace lookup");
  await expect(log.first().locator("td").nth(3)).toHaveText(COACH);
  await expect(log.first().locator("td").nth(4)).toHaveText('{"code":"GV-1A2B3C4D5E","found":true}');
  await expect(log.last().locator("td").nth(2)).toHaveText("export users csv");
  await expect(log.last().locator("td").nth(3)).toHaveText("—");
  auditEntries = [];
  await tabs.getByRole("tab", { name: "Users" }).click();
  await tabs.getByRole("tab", { name: "Audit log" }).click();
  await expect(page.locator(".adm-table tbody tr")).toHaveText(["No admin actions yet."]);

  // Find a PDF's owner: a miss, a refusal, then a hit that opens the coach.
  await tabs.getByRole("tab", { name: "Activity" }).click();
  const trace = page.locator(".adm-card", { has: page.getByRole("heading", { name: "Find a PDF's owner" }) });
  const code = trace.getByLabel("Trace code");
  const look = trace.getByRole("button", { name: "Look up" });
  await expect(look).toBeDisabled();
  await code.fill("GV-0000000000");
  await look.click();
  await expect(trace.getByText("No current account has that code.")).toBeVisible();
  await code.fill("GV-BROKEN0000");
  await look.click();
  await expect(trace.locator(".adm-note.adm-bad")).toHaveText("The trace index is being rebuilt.");
  await code.fill("GV-1A2B3C4D5E");
  await look.click();
  await trace.getByRole("button", { name: "spy@example.com (Spy)" }).click();
  await expect(tabs.getByRole("tab", { name: "Account recovery" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Sign-ins and capture activity")).toBeVisible();
  expect(asked.filter((a) => a.startsWith("trace"))).toEqual(["trace GV-0000000000", "trace GV-BROKEN0000", "trace GV-1A2B3C4D5E"]);
  expect(errors).toEqual([]);
});

test("a coach who isn't the owner is sent from /admin to the Account page", async ({ page, context }) => {
  const errors = errorsOf(page);
  // The server answers every console call with the plain 404 anyone else gets.
  await signIn(context, async (route, path) => {
    if (path.startsWith("admin/")) {
      await route.fulfill({ status: 404, json: { error: "That address is not part of the playbook API." } });
      return true;
    }
  });
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("tablist", { name: "Admin sections" })).toHaveCount(0);
  await expect(page.locator("h1, h2").first()).toBeVisible();
  expect(errors).toEqual([]);
});
