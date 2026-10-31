import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Designer's Play drawer: the Rules check reads the drawing against the
 * coach's rule set (blocks, carries, rushers in the Vs defense), "Show me on
 * the field" picks the players an item is about, the Opponent front lays a
 * stock look under the play, the rule lines draw on the field with the
 * coach's own distances, and all of it is kept after a reload.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the Rules check reads a play against each rule set, shows a breaker on the field and draws the rule lines", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 24 · Toss Sweep Left in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();

  const panel = (name: string) => page.locator(".panel").filter({ has: page.locator(".panel-head", { hasText: name }) });
  const rules = panel("Rules check");
  const front = panel("Opponent front");
  const item = (title: string) => rules.locator(".rc-item").filter({ has: page.locator("b", { hasText: title }) });
  const overlay = page.locator('.stage-frame svg g[opacity="0.36"]');
  const ruleText = page.locator(".stage-frame svg text", { hasText: /RUSH LINE/ });

  // Read from the drawing: a T-capped block breaks NFL FLAG; the motion man is legal.
  await expect(rules.locator(".panel-head")).toHaveAttribute("aria-expanded", "true");
  await expect(rules.getByRole("button", { name: "NFL FLAG 5-on-5" })).toHaveAttribute("aria-pressed", "true");
  await expect(rules.locator(".panel-count")).toHaveText("1 to fix");
  await expect(item("No blocking")).toHaveClass(/is-fail/);
  await expect(item("No blocking")).toContainText("C has a block (a T-capped line)");
  await expect(item("Motion")).toHaveClass(/is-ok/);
  await expect(item("Motion")).toContainText("X in motion, sideways or back. Legal.");
  await expect(item("Players on the field")).toContainText("5 on offense. NFL FLAG 5-on-5 plays 5 a side.");

  // Another rule set re-reads the same drawing: 7-on-7 has no run plays.
  await rules.getByRole("button", { name: "7-on-7 passing" }).click();
  await expect(rules.locator(".panel-count")).toHaveText("2 to fix");
  await expect(item("Pass plays only")).toHaveClass(/is-fail/);
  await expect(item("Pass plays only")).toContainText("Y carries the ball across the line; 7-on-7 passing has no run plays.");

  // "Show me on the field" picks the carrier and his line; the drawer stays on the check.
  await item("Pass plays only").getByRole("button", { name: "Show me on the field" }).click();
  await expect(page.locator("#insp-tab-selection .insp-tab-count")).not.toHaveText("");
  await expect(page.locator("#insp-tab-play")).toHaveAttribute("aria-selected", "true");
  await expect(rules).toBeVisible();

  // Opponent front: a flag look goes faded under the play, and the check reads its rusher.
  await expect(front.locator(".hint")).toContainText("Pick a look to see the play against it.");
  await front.getByRole("button", { name: "1 rush · Man" }).click();
  await expect(front.locator(".hint")).toContainText("Showing 1 rush · Man faded under the play.");
  await expect(front.locator(".panel-count")).toHaveText("1 rush · Man");
  await expect(overlay).toHaveCount(1);
  await expect(page.locator('button[aria-controls="dz-more-menu"]')).toHaveClass(/has-dot/);
  await expect(item("No rush")).toHaveClass(/is-warn/);
  await expect(item("No rush")).toContainText("R rushes in the Vs defense; 7-on-7 passing has no pass rush.");
  await expect(item("Players on the field")).toContainText("5 on offense, 5 on defense.");
  await rules.getByRole("button", { name: "NFL FLAG 5-on-5" }).click();
  await expect(item("Rush distance")).toHaveClass(/is-ok/);
  await expect(item("Rush distance")).toContainText("1 rusher, all 7+ yards off the ball.");

  // The rule lines draw on the field, at the coach's own distance.
  await expect(ruleText).toHaveCount(0);
  await rules.getByLabel("Draw the rush line and no-run zone on the field").check();
  await expect(ruleText).toHaveText("RUSH LINE · 7 YDS");
  await rules.getByRole("button", { name: "Change the distances" }).click();
  await rules.getByLabel("Rush line (yds)").fill("10");
  await expect(ruleText).toHaveText("RUSH LINE · 10 YDS");
  await rules.getByRole("button", { name: "Done" }).click();

  // Take the look off; a tackle rule set offers fronts and coverages instead of looks.
  await front.getByRole("button", { name: "Take it off" }).click();
  await expect(overlay).toHaveCount(0);
  await expect(front.locator(".hint")).toContainText("Pick a look to see the play against it.");
  await rules.getByRole("button", { name: "Tackle 11" }).click();
  await expect(front.getByLabel("Front")).toHaveValue("4-3");
  await front.getByLabel("Coverage").selectOption("Cover 2");
  await expect(front.locator(".hint")).toContainText("Showing 4-3 Cover 2 faded under the play.");
  await expect(overlay).toHaveCount(1);
  await expect(item("Players on the field")).toContainText("5 on offense, 11 on defense. Tackle 11 plays 11 a side.");

  // Kept after a reload. A tackle set has no rush line or no-run zone, so picking it
  // switched the lines off; a flag set brings its own distances back.
  await page.reload();
  await page.locator(".stage-frame svg").first().waitFor();
  await expect(rules.getByRole("button", { name: "Tackle 11" })).toHaveAttribute("aria-pressed", "true");
  await expect(rules.getByLabel("Draw the rush line and no-run zone on the field")).not.toBeChecked();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("grid1ronvault.rules.v1") ?? "{}"))).toMatchObject({ on: false, set: "tackle-11", rush: 0, noRun: 0 });
  await rules.getByRole("button", { name: "NFL FLAG 5-on-5" }).click();
  await rules.getByLabel("Draw the rush line and no-run zone on the field").check();
  await expect(ruleText).toHaveText("RUSH LINE · 7 YDS");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("grid1ronvault.rules.v1") ?? "{}"))).toMatchObject({ on: true, set: "nfl-flag", rush: 7, noRun: 5 });
  expect(errors).toEqual([]);
});
