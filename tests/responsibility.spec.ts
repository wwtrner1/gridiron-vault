import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * Player responsibilities in the coach's own terms: the Selection drawer's
 * Responsibility panel (a quick chip, a typed term from the gap glossary,
 * Clear) tags the picked players, the tag prints under the token, and the
 * talking points name it. A coach who saved terms before the gap glossary
 * existed gets it once.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => {
    localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false }));
    localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} }));
  });
});

test("a picked player is tagged with a gap, a typed technique and Clear takes it off", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.getByRole("tab", { name: "Players" }).click();
  await page.locator("#dz-tabpanel").getByRole("button", { name: "Defense", exact: true }).click();
  await page.getByRole("button", { name: "Rusher" }).click();
  await expect(page.locator(".dz-status [role=status]")).toHaveText("Rusher added");

  const panel = page.locator(".panel").filter({ has: page.locator(".panel-head", { hasText: "Responsibility" }) });
  const tags = svg.locator("text[data-job]");
  await expect(tags).toHaveCount(0);

  // A quick chip tags the player and the panel's head says which.
  await panel.getByRole("button", { name: "B gap", exact: true }).click();
  await expect(tags).toHaveText(["B gap"]);
  await expect(panel.locator(".panel-head")).toContainText("B gap");
  await expect(panel.getByRole("button", { name: "B gap", exact: true })).toHaveAttribute("aria-pressed", "true");

  // A term typed from the glossary replaces it; the glossary's gap terms are the box's suggestions.
  const box = panel.getByLabel("Responsibility", { exact: true });
  expect(await page.locator("#player-job-ideas option").count()).toBe(21);
  await box.fill("3 technique");
  await expect(tags).toHaveText(["3 technique"]);

  // Undo steps back to the chip's tag; Clear takes it off.
  await page.keyboard.press("Control+z");
  await expect(tags).toHaveText(["B gap"]);
  await panel.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(tags).toHaveCount(0);
  await expect(box).toHaveValue("");
  expect(errors).toEqual([]);
});

test("terms saved before the gap glossary get it once, and a deleted one stays deleted", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("grid1ronvault.terms.v1")) return;
    const old = [{ id: "glossary-flood", term: "Flood", means: "Three levels to one side", type: "concept", source: "Starter glossary", added: "2026-09-01", scope: "shared" }];
    localStorage.setItem("grid1ronvault.terms.v1", JSON.stringify({ terms: old, ignored: [] }));
  });
  await page.goto("/language");
  const rows = page.locator(".lang-table tbody tr");
  await expect(rows).toHaveCount(22);
  await page.getByRole("button", { name: "Delete A gap" }).click();
  await expect(rows).toHaveCount(21);
  await page.reload();
  await expect(rows).toHaveCount(21);
  await expect(page.getByRole("button", { name: "Delete A gap" })).toHaveCount(0);
});
