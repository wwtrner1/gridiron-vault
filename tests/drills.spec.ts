import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { quiet } from "./helpers";

/**
 * The Drill Vault: the built-in drills and their filters, a drill opened with
 * its animated diagram and film link, Add to practice filing it in a period,
 * Star, Copy and make it mine, a coach's own drill written, edited, deleted
 * and brought back with Undo, all kept after a reload.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the Drill Vault finds, plays, files and keeps drills", async ({ page }) => {
  await page.goto("/drills");
  await expect(page.locator("h1")).toHaveText("Drill Vault");
  await expect(page.getByRole("navigation", { name: "Practice tabs" }).getByRole("link", { name: "Drill Vault" })).toHaveAttribute("aria-current", "page");
  const cards = page.locator(".dr-card");
  const all = await cards.count();
  expect(all).toBeGreaterThanOrEqual(20);

  // Filters: a position group, a side of the ball, a search with no match.
  await page.getByRole("group", { name: "Position group" }).getByRole("button", { name: "Defensive backs" }).click();
  await expect(cards.first()).toContainText("Defensive backs");
  await expect(cards.filter({ hasText: "Trail Technique" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "Gauntlet" })).toHaveCount(0);
  await page.getByRole("group", { name: "Position group" }).getByRole("button", { name: "Every group" }).click();
  await page.getByRole("group", { name: "Side of the ball" }).getByRole("button", { name: "Offense" }).click();
  await expect(cards.filter({ hasText: "Trail Technique" })).toHaveCount(0);
  await expect(cards.filter({ hasText: "Gauntlet" })).toHaveCount(1);
  await page.getByRole("group", { name: "Side of the ball" }).getByRole("button", { name: "All" }).click();
  await page.getByLabel("Find a drill", { exact: true }).fill("zzzz no drill");
  await expect(page.getByRole("heading", { name: "No drill matches" })).toBeVisible();
  await page.getByLabel("Find a drill", { exact: true }).fill("cones backpedal");
  await page.getByLabel("Find a drill", { exact: true }).fill("backpedal");
  await expect(cards.filter({ hasText: "Backpedal Breaks" })).toHaveCount(1);

  // Star it; the Starred chip shows only starred drills.
  await page.getByRole("button", { name: "Star Backpedal Breaks" }).click();
  await page.getByLabel("Find a drill", { exact: true }).fill("");
  await page.getByRole("button", { name: "★ Starred" }).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole("button", { name: "★ Starred" }).click();

  // Open it: the diagram plays, with the steps, points and a film link.
  await page.getByRole("button", { name: "Open Backpedal Breaks" }).click();
  const detail = page.getByRole("dialog", { name: "Backpedal Breaks" });
  await expect(page).toHaveURL(/drill=drill-backpedal-breaks/);
  await expect(detail.getByRole("img", { name: "Backpedal Breaks diagram" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Pause" })).toBeVisible();
  const def = detail.locator(".dr-def rect").first();
  const before = await def.getAttribute("y");
  await expect.poll(async () => def.getAttribute("y")).not.toBe(before);
  await detail.getByRole("button", { name: "Pause" }).click();
  await expect(detail.getByRole("button", { name: "Play the drill" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Coaching points" })).toBeVisible();
  await expect(detail.getByRole("link", { name: /Find film on YouTube/ })).toHaveAttribute("href", /youtube\.com\/results/);
  const axe = await new AxeBuilder({ page }).include(".modal").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // Add to practice files it in a period of the script.
  await detail.getByLabel("Add Backpedal Breaks to a practice period", { exact: true }).selectOption({ label: "Individual (15 min)" });
  await expect(page.getByText("Backpedal Breaks added to Individual.")).toBeVisible();

  // Copy and make it mine opens the editor with the drill's words.
  await detail.getByRole("button", { name: "Copy and make it mine" }).click();
  const editor = page.getByRole("dialog", { name: "New drill" });
  await expect(editor.getByLabel("Drill name", { exact: true })).toHaveValue("Backpedal Breaks (my version)");
  await editor.getByLabel("Film link", { exact: true }).fill("ftp://bad");
  await editor.getByRole("button", { name: "Save drill" }).click();
  await expect(editor.getByRole("alert")).toContainText("https://");
  await editor.getByLabel("Film link", { exact: true }).fill("https://www.youtube.com/watch?v=abcdefghijk");
  await editor.getByRole("button", { name: "Save drill" }).click();
  const mine = page.getByRole("dialog", { name: "Backpedal Breaks (my version)" });
  await expect(mine).toBeVisible();
  await expect(mine.getByRole("img", { name: "Backpedal Breaks (my version) diagram" })).toBeVisible();
  await expect(mine.getByRole("button", { name: "Watch the film here" })).toBeVisible();
  await mine.getByRole("button", { name: "Close Backpedal Breaks (my version)" }).click();

  // A drill of the coach's own, from nothing.
  await page.getByRole("button", { name: "New drill" }).first().click();
  const fresh = page.getByRole("dialog", { name: "New drill" });
  await fresh.getByRole("button", { name: "Save drill" }).click();
  await expect(fresh.getByRole("alert")).toHaveText("Give the drill a name, coach.");
  await fresh.getByLabel("Drill name", { exact: true }).fill("Bag Weave");
  await fresh.getByLabel("Position group", { exact: true }).selectOption("Running backs");
  await fresh.getByLabel("Steps (one per line)", { exact: true }).fill("Weave through the bags\nBurst past the last bag");
  await fresh.getByLabel("Coaching points (one per line)", { exact: true }).fill("Ball high and tight");
  await fresh.getByRole("button", { name: "Save drill" }).click();
  const bag = page.getByRole("dialog", { name: "Bag Weave" });
  await expect(bag.getByRole("img", { name: "Bag Weave: no diagram yet" })).toBeVisible();
  await expect(bag.locator("ol li")).toHaveText(["Weave through the bags", "Burst past the last bag"]);
  await bag.getByRole("button", { name: "Edit drill" }).click();
  await page.getByRole("dialog", { name: "Edit Bag Weave" }).getByLabel("Diagram", { exact: true }).selectOption({ label: "Cone Cut" });
  await page.getByRole("dialog", { name: "Edit Bag Weave" }).getByRole("button", { name: "Save drill" }).click();
  await expect(page.getByRole("dialog", { name: "Bag Weave" }).getByRole("img", { name: "Bag Weave diagram" })).toBeVisible();

  // Delete, then Undo brings it back.
  await page.getByRole("dialog", { name: "Bag Weave" }).getByRole("button", { name: "Delete" }).click();
  await expect(cards.filter({ hasText: "Bag Weave" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cards.filter({ hasText: "Bag Weave" })).toHaveCount(1);
  await expect(cards).toHaveCount(all + 2);

  // Kept after a reload, and the drill waits in the practice script.
  await page.reload();
  await expect(cards).toHaveCount(all + 2);
  await expect(page.getByRole("button", { name: "Star Backpedal Breaks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("navigation", { name: "Practice tabs" }).getByRole("link", { name: "Practice plan" }).click();
  await expect(page.getByRole("region", { name: "Individual" }).getByRole("link", { name: "Backpedal Breaks", exact: true })).toBeVisible();
});
