import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Front Office → Schedule, with the hub API mocked: the record and next game,
 * list and month views, adding a weekly practice, a game's score, and removing
 * an event in the app's own box.
 */
test.beforeEach(async ({ context }) => quiet(context));

const org = { id: "org1", name: "Vaultline Youth", seats: 3, members: [], shares: [] };
const team = { id: "t1", name: "U10 Mustangs", level: "U10", season: "Fall 2026", color: "#1d4ed8", coachIds: [], allCoaches: true, players: 0 };
const day = (offset: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
type Ev = { id: string; teamId: string | null; kind: string; title: string; startsAt: string; endsAt: string | null; location: string; opponent: string; homeAway: string; notes: string; sheetId: string; scoreUs: number | null; scoreThem: number | null; canceled: boolean };
const event = (p: Partial<Ev> & { id: string; title: string; startsAt: string }): Ev => ({
  teamId: "t1", kind: "practice", endsAt: null, location: "", opponent: "", homeAway: "", notes: "", sheetId: "", scoreUs: null, scoreThem: null, canceled: false, ...p,
});

test("the schedule shows the record and next event, adds a weekly practice, scores a game and removes an event", async ({ page, context }) => {
  const errors = errorsOf(page);
  let events: Ev[] = [
    event({ id: "e1", kind: "game", title: "vs Hawks", startsAt: day(-7, 10), opponent: "Hawks", homeAway: "home", scoreUs: 21, scoreThem: 14 }),
    event({ id: "e2", kind: "practice", title: "Tuesday practice", startsAt: day(3, 18), endsAt: day(3, 19), location: "Field 3" }),
    event({ id: "e3", kind: "game", title: "at Bears", startsAt: day(6, 10), opponent: "Bears", homeAway: "away" }),
    event({ id: "e4", kind: "meeting", title: "Parent meeting", startsAt: day(9, 19), canceled: true }),
  ];
  const posted: { event: Partial<Ev>; repeatWeeks: number }[] = [];
  let n = 10;
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: org, joined: [], invites: [] } }), true);
    if (path === "hub/org1" && method === "GET") return (await route.fulfill({ json: { org: { id: "org1", name: "Vaultline Youth" }, role: "director", teams: [team], coaches: [] } }), true);
    if (path === "hub/org1/events" && method === "GET") return (await route.fulfill({ json: { events } }), true);
    if (path === "hub/org1/events" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { event: Ev; repeatWeeks: number };
      posted.push(body);
      const added: Ev[] = [];
      for (let i = 0; i <= body.repeatWeeks; i++) {
        const start = new Date(body.event.startsAt);
        start.setDate(start.getDate() + 7 * i);
        added.push({ ...body.event, id: `e${n++}`, startsAt: start.toISOString() });
      }
      events = [...events, ...added];
      return (await route.fulfill({ json: { events, added: added.length } }), true);
    }
    if (path.startsWith("hub-events/") && method === "PUT") {
      const id = path.slice("hub-events/".length);
      const { event: patch } = JSON.parse(route.request().postData() ?? "{}") as { event: Partial<Ev> };
      events = events.map((e) => (e.id === id ? { ...e, ...patch } : e));
      return (await route.fulfill({ json: { events } }), true);
    }
    if (path.startsWith("hub-events/") && method === "DELETE") {
      const id = path.slice("hub-events/".length);
      events = events.filter((e) => e.id !== id);
      return (await route.fulfill({ json: { events } }), true);
    }
  });

  await page.goto("/front-office?tab=schedule");
  const panel = page.getByRole("region", { name: "U10 Mustangs schedule" });
  await expect(panel).toBeVisible();

  // The record counts the played game; Next up is the first upcoming event that isn't canceled.
  const stats = panel.locator(".hub-stats");
  await expect(stats).toContainText("1-0");
  await expect(stats).toContainText("21 / 14");
  await expect(stats.locator(".hub-next")).toContainText("Tuesday practice");
  await expect(stats.locator(".hub-next")).toContainText("Field 3");

  // The month view shows the calendar; the list view shows what's coming, past games only on request.
  await expect(panel.getByRole("grid", { name: "Calendar" })).toBeVisible();
  await panel.getByRole("group", { name: "View" }).getByRole("button", { name: "List" }).click();
  const rows = panel.locator(".hub-agenda > li");
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "Parent meeting" })).toContainText("Canceled");
  await panel.getByLabel("Show past events").check();
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: "vs Hawks" })).toContainText("W 21-14");

  // Add a weekly practice: three events in one go.
  await panel.getByRole("button", { name: "Add event" }).click();
  const add = page.getByRole("dialog", { name: "Add to the schedule" });
  await add.getByRole("group", { name: "Kind of event" }).getByRole("button", { name: "Practice" }).click();
  await add.getByLabel("Title").fill("Thursday practice");
  const inTwo = new Date();
  inTwo.setDate(inTwo.getDate() + 2);
  await add.getByLabel("Date").fill(`${inTwo.getFullYear()}-${String(inTwo.getMonth() + 1).padStart(2, "0")}-${String(inTwo.getDate()).padStart(2, "0")}`);
  await add.getByLabel("Starts").fill("17:30");
  await add.getByLabel("Location").fill("Riverside Park");
  await add.getByLabel("Repeat").selectOption({ label: "Every week for 3 weeks" });
  await add.getByRole("button", { name: "Add 3 events" }).click();
  await expect(page.getByText("3 events added, one a week.")).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0].repeatWeeks).toBe(2);
  expect(posted[0].event).toMatchObject({ kind: "practice", title: "Thursday practice", location: "Riverside Park", teamId: "t1" });
  await expect(rows).toHaveCount(7);
  await expect(rows.filter({ hasText: "Thursday practice" })).toHaveCount(3);

  // Score the away game: the record and pill follow.
  await rows.filter({ hasText: "at Bears" }).getByRole("button", { name: "Open at Bears" }).click();
  const game = page.getByRole("dialog", { name: "at Bears" });
  await game.getByLabel("Our score").fill("7");
  await game.getByLabel("Their score").fill("13");
  await game.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(rows.filter({ hasText: "at Bears" })).toContainText("L 7-13");
  await expect(stats).toContainText("1-1");
  await expect(stats).toContainText("28 / 27");

  // Remove the canceled meeting: Remove asks once, in the box, then it's gone.
  await rows.filter({ hasText: "Parent meeting" }).getByRole("button", { name: "Open Parent meeting" }).click();
  const meeting = page.getByRole("dialog", { name: "Parent meeting" });
  await meeting.getByRole("button", { name: "Remove" }).click();
  await meeting.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(page.getByText("Removed from the schedule.")).toBeVisible();
  await expect(rows).toHaveCount(6);
  await expect(rows.filter({ hasText: "Parent meeting" })).toHaveCount(0);

  // The calendar file carries every event.
  const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Add to my calendar" }).click()]);
  expect(download.suggestedFilename()).toBe("U10 Mustangs schedule.ics");
  expect(errors).toEqual([]);
});
