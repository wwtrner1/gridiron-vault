import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

type Shared = { id: string; name: string; formation: string; playType: string; personnel?: string; description: string; tags: string[]; scene: unknown };

test("a player opens the team link, sees only his job, runs a play and takes the Griddy Quiz", async ({ page, context }) => {
  const errors = errorsOf(page);

  // The coach's own plays, frozen the way Players → share sends them.
  await seedReady(page);
  const plays = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem("snapline.workspace.v1")!).plays as (Shared & { description?: string; tags?: string[] })[];
    return all.slice(0, 6).map((p) => ({ id: p.id, name: p.name, formation: p.formation ?? "", playType: p.playType ?? "pass", personnel: p.personnel, description: p.description ?? "", tags: p.tags ?? [], scene: p.scene }));
  });
  const scores: { name: string; letter: string; score: number; total: number }[] = [];
  await context.route("**/api/shares/tok-varsity/results", (route) => {
    scores.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await context.route("**/api/shares/tok-varsity", (route) => route.fulfill({ json: { share: { name: "Varsity Offense", plays, updatedAt: "2026-10-31T00:00:00Z" } } }));
  await context.route("**/api/shares/tok-gone", (route) => route.fulfill({ status: 404, json: { error: "That link has been turned off by the coach." } }));

  // A new tab with nothing of the coach's in it: the page needs no sign-in and no Shell.
  await context.clearCookies();
  await page.goto("/team/tok-varsity");
  await expect(page.getByRole("heading", { level: 1, name: "Varsity Offense" })).toBeVisible();
  await expect(page.locator(".rail, .topbar, .gd-launch")).toHaveCount(0);
  await expect(page.getByText("Tap your letter above")).toBeVisible();

  // Pick a letter: only that player's plays, with his route tags.
  const letters = page.getByRole("group", { name: "Your letter" });
  await letters.getByRole("button", { name: "X", exact: true }).click();
  await expect(page.getByRole("tab", { name: /My plays/ })).toHaveAttribute("aria-selected", "true");
  const cards = page.locator(".tm-card");
  await expect.poll(() => cards.count()).toBeGreaterThan(0);
  await expect(cards.first().locator("svg[aria-hidden=true]")).toBeVisible();

  // Run one: the play animates in a dialog, X in color, and closes.
  await cards.first().click();
  const run = page.getByRole("dialog");
  await expect(run).toBeVisible();
  await expect(run.getByRole("img", { name: /running, X in color/ })).toBeVisible();
  await run.getByRole("button", { name: "Close" }).click();
  await expect(run).toBeHidden();

  // The quiz: as many questions as six plays give (up to eight), then the score goes to the coach.
  await page.getByRole("tab", { name: "Griddy Quiz" }).click();
  await page.getByLabel("Your name").fill("Jordan");
  await page.getByRole("button", { name: "Start the quiz" }).click();
  await expect(page.locator(".tm-count")).toHaveText(/Question 1 of \d+/);
  const total = Number((await page.locator(".tm-count").textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThanOrEqual(3);
  for (let i = 1; i <= total; i++) {
    await expect(page.locator(".tm-count")).toHaveText(`Question ${i} of ${total}`);
    await page.locator(".tm-opt").first().click();
    await expect(page.locator(".tm-opt.is-right")).toHaveCount(1);
    await page.getByRole("button", { name: i === total ? "See my score" : "Next" }).click();
  }
  await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^\\d+ of ${total}$`) })).toBeVisible();
  await expect(page.locator(".tm-quiz [role=status]")).toContainText("Your score went to your coach.");
  expect(scores).toHaveLength(1);
  expect(scores[0]).toMatchObject({ name: "Jordan", letter: "X", total });
  expect(scores[0].score).toBeGreaterThanOrEqual(0);

  // Coming back lands on the same letter and name.
  await page.reload();
  await expect(letters.getByRole("button", { name: "X", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Griddy Quiz" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("Jordan");

  // No signal at the field: the plays from the last visit still open, and the page says so.
  await context.route("**/api/shares/tok-varsity", (route) => route.abort("internetdisconnected"));
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Varsity Offense" })).toBeVisible();
  await expect(page.locator(".tm-note[role=status]")).toContainText("No signal right now");
  await expect.poll(() => page.locator(".tm-card").count()).toBeGreaterThan(0);

  // A link the coach turned off says so in plain words.
  await page.goto("/team/tok-gone");
  await expect(page.getByRole("heading", { level: 1, name: "This link isn't working" })).toBeVisible();
  await expect(page.getByText("That link has been turned off by the coach.")).toBeVisible();

  expect(errors).toEqual([]);
});
