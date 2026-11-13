import { expect, test } from "@playwright/test";
import { quiet, seedReady } from "./helpers";

/**
 * Practice planner: the script's periods and clock, plays picked from the
 * Vault (one at a time or a whole playbook), the two printouts, and the
 * script kept after a reload. All of it lives in this browser.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
});

test("a practice script is built from the Vault, printed and kept after a reload", async ({ page }) => {
  await seedReady(page);
  await page.goto("/practice");
  await expect(page.locator("h1")).toHaveText("Practice");

  // The fresh script: five periods, 70 minutes, no clock until a start time is set.
  const periods = page.locator(".pr-period");
  await expect(periods).toHaveCount(5);
  await expect(page.locator(".pr-total")).toHaveText("70 minutes");
  const clocks = page.locator(".pr-period .pr-clock");
  await expect(clocks.first()).toHaveText("—");
  // The timeline: one bar per period, colored by its type.
  await expect(page.locator(".pr-timeline li")).toHaveCount(5);
  await expect(page.locator(".pr-timeline li").first()).toHaveClass(/pk-warmup/);

  // A start time puts a clock on every period: 6:00, 6:10 (after a 10-minute warm-up) …, and an end time.
  await page.getByLabel("Start time", { exact: true }).fill("18:00");
  await expect(clocks.first()).toHaveText("6:00 PM");
  await expect(clocks.nth(1)).toHaveText("6:10 PM");
  await expect(page.locator(".pr-stats")).toContainText("7:10 PM");

  // Every field says what it's for: the ⓘ beside Start time pops up its hint.
  await page.getByRole("button", { name: "About Start time" }).hover();
  await expect(page.getByRole("tooltip")).toContainText("clock time");

  // Minutes change the total and the clock behind them.
  await page.getByLabel("Minutes for Warm-up").fill("5");
  await expect(page.locator(".pr-total")).toHaveText("65 minutes");
  await expect(clocks.nth(1)).toHaveText("6:05 PM");
  // The + and − buttons step by five minutes.
  await page.getByRole("button", { name: "Five minutes more for Warm-up" }).click();
  await expect(page.getByLabel("Minutes for Warm-up")).toHaveValue("10");
  await page.getByRole("button", { name: "Five minutes less for Warm-up" }).click();
  await expect(page.locator(".pr-total")).toHaveText("65 minutes");

  // A period's name and note: the labels around it follow the new name.
  await periods.first().getByLabel("Period name").fill("Stretch and form");
  await expect(page.getByRole("region", { name: "Stretch and form" })).toBeVisible();
  await expect(page.getByLabel("Minutes for Stretch and form")).toHaveValue("5");
  await expect(page.getByLabel("Minutes for Warm-up")).toHaveCount(0);
  await page.getByLabel("Note for Stretch and form").fill("Hamstrings first, then form running");

  // A period's type sets its color.
  const individual = page.getByRole("region", { name: "Individual" });
  await individual.getByLabel("Type of Individual").selectOption("special");
  await expect(individual).toHaveClass(/pk-special/);

  // A drill from the Drill Vault into Individual; its name links to the drill.
  await individual.getByLabel("Add a drill to Individual").selectOption({ label: "Backpedal Breaks · Defensive backs" });
  await expect(individual.locator(".pr-drills li")).toHaveCount(1);
  await expect(individual.getByRole("link", { name: "Backpedal Breaks" })).toHaveAttribute("href", "/drills?drill=drill-backpedal-breaks");
  await expect(page.locator(".pr-stats")).toContainText("1");

  // Move down swaps two periods.
  await individual.getByRole("button", { name: "Move Individual down" }).click();
  await expect(page.locator(".pr-period").nth(2)).toHaveAttribute("aria-label", "Individual");
  await page.getByRole("region", { name: "Individual" }).getByRole("button", { name: "Move Individual up" }).click();
  await expect(page.locator(".pr-period").nth(1)).toHaveAttribute("aria-label", "Individual");

  // One play into Team, a whole playbook into Skelly.
  const team = page.getByRole("region", { name: "Team" });
  await team.getByLabel("Add a play to Team").selectOption({ label: "17 · Stick" });
  await expect(team.locator(".pr-plays li")).toHaveCount(1);
  await expect(team.locator(".pr-plays li")).toContainText("17 · Stick");
  const skelly = page.getByRole("region", { name: "Skelly" });
  await skelly.getByLabel("Add a playbook to Skelly").selectOption({ label: "Ready-to-Go 5v5 Playbook (24)" });
  await expect(skelly.locator(".pr-plays li")).toHaveCount(24);

  // Taking a play out and removing a period.
  await team.getByRole("button", { name: "Take 17 · Stick out of Team" }).click();
  await expect(team.locator(".pr-plays li")).toHaveCount(0);
  await page.getByRole("region", { name: "Situational" }).getByRole("button", { name: "Remove" }).click();
  await expect(periods).toHaveCount(4);
  await page.getByRole("button", { name: "Add a period" }).click();
  await expect(periods).toHaveCount(5);
  await expect(page.locator(".pr-total")).toHaveText("65 minutes");

  // Print script: a preview of the one-page script with the clock and every play.
  await page.getByRole("button", { name: "Print script" }).click();
  const preview = page.getByRole("dialog", { name: "Print preview: Practice script" });
  await expect(preview).toBeVisible();
  const sheet = page.locator(".pr-sheet");
  await expect(sheet.locator("h1")).toHaveText("Practice script");
  await expect(sheet).toContainText("65 minutes · starts 6:00 PM");
  await expect(sheet.locator("section")).toHaveCount(5);
  await expect(sheet.locator("section h2").first()).toContainText("6:00 PM · Stretch and form");
  await expect(sheet.locator(".pr-note").first()).toHaveText("Hamstrings first, then form running");
  await expect(sheet.locator("ol li")).toHaveCount(24);
  await expect(sheet.locator(".pr-sheet-drills li")).toHaveText([/Drill: Backpedal Breaks/]);
  await preview.getByRole("button", { name: "Close" }).click();
  await expect(preview).toHaveCount(0);
  await expect(sheet).toHaveCount(0);

  // Print scout cards: one card per play in the script, named for its period, plus each drill's diagram.
  await page.getByRole("button", { name: "Print scout cards" }).click();
  await expect(page.getByRole("dialog", { name: "Print preview: Scout cards" })).toBeVisible();
  await expect(page.locator(".pr-card")).toHaveCount(25);
  await expect(page.locator(".pr-card").last()).toContainText("Backpedal Breaks");
  await expect(page.locator(".pr-card").first()).toContainText("Skelly");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pr-card")).toHaveCount(0);

  // Everything is still there after a reload.
  await page.reload();
  await expect(page.locator(".pr-period")).toHaveCount(5);
  await expect(page.locator(".pr-total")).toHaveText("65 minutes");
  await expect(page.getByLabel("Start time", { exact: true })).toHaveValue("18:00");
  await expect(page.getByRole("region", { name: "Individual" }).locator(".pr-drills li")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Individual" })).toHaveClass(/pk-special/);
  await expect(page.getByLabel("Note for Stretch and form")).toHaveValue("Hamstrings first, then form running");
  await expect(page.getByRole("region", { name: "Skelly" }).locator(".pr-plays li")).toHaveCount(24);
  await expect(page.getByRole("region", { name: "Situational" })).toHaveCount(0);
});

test("an empty Vault points the coach at the starters and keeps the printouts off", async ({ page }) => {
  await page.goto("/practice");
  await expect(page.getByRole("link", { name: "Browse starter plays" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print scout cards" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Print script" })).toBeEnabled();
});
