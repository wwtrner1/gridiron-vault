import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Front Office → Messages, with the hub API mocked and server sending off:
 * the coaches' board (post, remove, a note for the whole Front Office) and
 * the family announcements (the roster's contacts, the email and text links,
 * Save announcement) plus a refusal in coach words.
 */
test.beforeEach(async ({ context }) => quiet(context));

const org = { id: "org1", name: "Vaultline Youth", seats: 3, members: [], shares: [] };
const team = { id: "t1", name: "U10 Mustangs", level: "U10", season: "Fall 2026", color: "#1d4ed8", coachIds: [], allCoaches: true, players: 2 };
const player = (id: string, first: string, email: string, phone: string) => ({
  id, teamId: "t1", updatedAt: "2026-10-30T10:00:00Z",
  firstName: first, lastName: "Hill", jersey: "12", positions: "QB", grade: "5", birthDate: "", height: "", weight: "", status: "active", phone: "", email: "", text: false,
  guardians: [{ name: `${first}'s mom`, relation: "Mother", phone, email, text: true }],
  medical: "", notes: "",
});
type Msg = { id: string; teamId: string | null; channel: "staff" | "family"; authorName: string; mine: boolean; subject: string; body: string; emailed: number; texted: number; createdAt: string };

test("the coaches' board posts and removes notes, and family announcements use the roster's contacts", async ({ page, context }) => {
  const errors = errorsOf(page);
  let messages: Msg[] = [
    { id: "m1", teamId: "t1", channel: "staff", authorName: "Coach Dee", mine: false, subject: "", body: "I'll bring the cones Tuesday.", emailed: 0, texted: 0, createdAt: "2026-10-30T15:00:00Z" },
    { id: "m2", teamId: "t1", channel: "family", authorName: "Coach", mine: true, subject: "Picture day", body: "Pictures are Saturday at 9.", emailed: 0, texted: 0, createdAt: "2026-10-29T15:00:00Z" },
  ];
  const posted: Record<string, unknown>[] = [];
  let n = 10;
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: org, joined: [], invites: [] } }), true);
    if (path === "hub/org1" && method === "GET") return (await route.fulfill({ json: { org: { id: "org1", name: "Vaultline Youth" }, role: "director", teams: [team], coaches: [] } }), true);
    if (path === "teams/t1/players" && method === "GET") return (await route.fulfill({ json: { players: [player("p1", "Marcus", "mom1@example.com", "6155550101"), player("p2", "Jalen", "mom2@example.com", "6155550102")] } }), true);
    if (path === "teams/t1/texts" && method === "GET") return (await route.fulfill({ json: { signups: [], joinToken: "tok", url: "https://gridiron-vault.com/join/tok" } }), true);
    if (path === "hub/org1/messages" && method === "GET") return (await route.fulfill({ json: { messages, delivery: { email: false, sms: false } } }), true);
    if (path === "hub/org1/messages" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      posted.push(body);
      if (body.body === "refuse me") return (await route.fulfill({ status: 429, json: { error: "That's today's limit for announcements. Try again tomorrow." } }), true);
      messages = [{ id: `m${n++}`, teamId: body.teamId as string | null, channel: body.channel as Msg["channel"], authorName: "Coach", mine: true, subject: String(body.subject ?? ""), body: String(body.body), emailed: 0, texted: 0, createdAt: new Date().toISOString() }, ...messages];
      return (await route.fulfill({ json: { messages, delivery: { email: false, sms: false }, emailed: 0, texted: 0 } }), true);
    }
    if (path.startsWith("hub-messages/") && method === "DELETE") {
      const id = path.slice("hub-messages/".length);
      messages = messages.filter((m) => m.id !== id);
      return (await route.fulfill({ json: { messages, delivery: { email: false, sms: false } } }), true);
    }
  });

  await page.goto("/front-office?tab=messages");
  const panel = page.getByRole("region", { name: "U10 Mustangs messages" });
  await expect(panel).toBeVisible();
  const channels = panel.getByRole("group", { name: "Who the messages are for" });
  await expect(channels.getByRole("button", { name: /Coaches' board/ })).toHaveAttribute("aria-pressed", "true");
  await expect(channels.getByRole("button", { name: /Coaches' board/ })).toContainText("1 new");

  // The board: one note from another coach, then the director's own note for the whole Front Office.
  const feed = panel.locator(".hub-feed > li");
  await expect(feed).toHaveCount(1);
  await expect(feed.first()).toContainText("Coach Dee");
  await expect(feed.first()).toContainText("I'll bring the cones Tuesday.");
  await expect(panel.getByRole("button", { name: "Post" })).toBeDisabled();
  await panel.getByLabel("Note for the coaches").fill("Install Trips Right Bunch this week.");
  await panel.getByLabel(/Every coach in Vaultline Youth/).check();
  await panel.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText("Posted to the coaches' board.")).toBeVisible();
  expect(posted[0]).toMatchObject({ teamId: null, channel: "staff", body: "Install Trips Right Bunch this week.", email: false, sms: false });
  await expect(feed).toHaveCount(2);
  await expect(feed.first()).toContainText("Whole Front Office");
  await expect(panel.getByLabel("Note for the coaches")).toHaveValue("");

  // The director can remove any note.
  await feed.filter({ hasText: "Coach Dee" }).getByRole("button", { name: "Remove this message" }).click();
  await expect(feed).toHaveCount(1);
  await expect(feed.first()).toContainText("Install Trips Right Bunch");

  // Families: the roster's two guardian emails and phones, sending is from the coach's own apps while server sending is off.
  await channels.getByRole("button", { name: /Players & families/ }).click();
  await expect(panel.locator(".hub-feed > li")).toHaveCount(1);
  await expect(panel.locator(".hub-feed > li").first()).toContainText("Picture day");
  await expect(panel).toContainText("U10 Mustangs has 2 email addresses on the roster and 0 phones signed up for team texts.");
  await expect(panel.getByLabel(/Email families/)).toBeDisabled();
  await expect(panel.getByLabel(/Text families who signed up/)).toBeDisabled();
  // An <a> with no href is not a link yet, so find it by its words.
  const mail = panel.locator("a", { hasText: "Open my email (Bcc families)" });
  await expect(mail).toHaveAttribute("aria-disabled", "true");
  await panel.getByLabel("Subject").fill("Saturday's game moved to 10 AM");
  await panel.getByLabel("Message to players and families").fill("Arrive by 9:15 in white jerseys.");
  await expect(mail).toHaveAttribute("aria-disabled", "false");
  const href = (await mail.getAttribute("href"))!;
  expect(href.startsWith("mailto:?bcc=")).toBe(true);
  expect(decodeURIComponent(href)).toContain("mom1@example.com,mom2@example.com");
  expect(decodeURIComponent(href)).toContain("subject=Saturday's game moved to 10 AM");
  expect(decodeURIComponent(href)).toContain("— U10 Mustangs coaches");
  const sms = panel.locator("a", { hasText: "Open Messages" });
  expect(decodeURIComponent((await sms.getAttribute("href"))!)).toContain("sms:6155550101,6155550102?&body=U10 Mustangs: Arrive by 9:15 in white jerseys.");

  // Save announcement keeps it for the staff.
  await panel.getByRole("button", { name: "Save announcement" }).click();
  await expect(page.getByText("Announcement saved for your staff.")).toBeVisible();
  expect(posted[1]).toMatchObject({ teamId: "t1", channel: "family", subject: "Saturday's game moved to 10 AM", body: "Arrive by 9:15 in white jerseys.", email: false, sms: false });
  await expect(panel.locator(".hub-feed > li")).toHaveCount(2);
  await expect(panel.locator(".hub-feed > li").first()).toContainText("Saturday's game moved to 10 AM");

  // A refusal from the account reads in coach words and the message stays in the box.
  await panel.getByLabel("Message to players and families").fill("refuse me");
  await panel.getByRole("button", { name: "Save announcement" }).click();
  await expect(panel.getByRole("alert")).toHaveText("That's today's limit for announcements. Try again tomorrow.");
  await expect(panel.getByLabel("Message to players and families")).toHaveValue("refuse me");
  expect(errors).toEqual([]);
});
