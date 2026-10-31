import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Your tools (the Designer's Tools guide): Essentials and Everything sets,
 * a group or one tool switched off leaving the rail (never deleted), the
 * count in the rail foot and the Extras menu, a hand-made mix, kept after a
 * reload, and Show me how it works opening the designer tour.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the Tools guide hides and shows groups and tools, counts them, keeps the mix after a reload, and opens the tour", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.locator('.play-card button[aria-label^="Open"]').first().click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("tab", { name: "Draw" }).click();
  const shapes = page.locator('section[aria-labelledby="dz-shapes-title"]');
  const bezier = page.getByRole("button", { name: "Bezier node pen" });
  const solid = page.getByRole("button", { name: "Solid line with arrow" });
  const foot = page.locator(".dz-rail-foot");
  await expect(shapes).toBeVisible();
  await expect(bezier).toBeVisible();
  await expect(foot).toContainText("Too many tools?");
  await expect(foot.getByRole("button", { name: "Hide the ones you don't use" })).toBeAttached();

  // Extras → Your tools: Everything is on; Essentials switches the format and shapes groups and ten tools off.
  const extras = page.locator('button[aria-controls="dz-more-menu"]');
  const openGuide = async () => {
    await extras.click();
    await page.locator("#dz-more-menu").getByRole("button", { name: /^Your tools: show or hide/ }).click();
    return page.getByRole("dialog", { name: "Your tools" });
  };
  let guide = await openGuide();
  const sets = guide.getByRole("radiogroup", { name: "Tool set" });
  await expect(sets.getByRole("radio", { name: /^Everything/ })).toHaveAttribute("aria-checked", "true");
  const row = (name: string) => guide.locator("label.tg-row", { has: page.locator(`.tg-name:text-is("${name}")`) }).getByRole("checkbox");
  await expect(row("Saved play format")).toBeChecked();
  await sets.getByRole("radio", { name: /^Essentials/ }).click();
  await expect(sets.getByRole("radio", { name: /^Essentials/ })).toHaveAttribute("aria-checked", "true");
  await expect(row("Saved play format")).not.toBeChecked();
  await expect(row("Shapes · Zones")).not.toBeChecked();
  await expect(row("Bezier")).not.toBeChecked();
  await expect(row("Solid")).toBeChecked();
  await expect(guide.locator(".tg-set.is-static")).toContainText("Flip any switch below to make one.");
  await guide.getByRole("button", { name: "Done" }).click();
  await expect(guide).toBeHidden();

  // The rail: no Shapes group, no Bezier, Solid still there; the Sets tab has no Saved play format; the counts say 12.
  await expect(shapes).toHaveCount(0);
  await expect(bezier).toHaveCount(0);
  await expect(solid).toBeVisible();
  await expect(foot).toContainText("12 hidden.");
  await expect(foot.getByRole("button", { name: "Show or hide tools" })).toBeAttached();
  await page.getByRole("tab", { name: "Sets" }).click();
  await expect(page.locator('section[aria-labelledby="dz-sets-title"]')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="dz-format-title"]')).toHaveCount(0);
  await extras.click();
  await expect(page.locator("#dz-more-menu")).toContainText("Your tools: show or hide (12 hidden)");
  await page.keyboard.press("Escape");

  // A hand-made mix: Shapes back on makes it "Your own mix"; a group off greys its tools.
  guide = await openGuide();
  await row("Shapes · Zones").check();
  await expect(guide.locator(".tg-set.is-static")).toHaveClass(/is-on/);
  await expect(guide.locator(".tg-set.is-static")).toContainText("11 hidden. Change any switch below.");
  await expect(sets.getByRole("radio", { checked: true })).toHaveCount(0);
  await row("Lines").uncheck();
  await expect(row("Solid")).toBeDisabled();
  await expect(guide.locator(".tg-set.is-static")).toContainText("12 hidden.");
  await row("Lines").check();
  await expect(row("Solid")).toBeEnabled();
  await guide.getByRole("button", { name: "Done" }).click();
  await page.getByRole("tab", { name: "Draw" }).click();
  await expect(shapes).toBeVisible();
  await expect(bezier).toHaveCount(0);
  await expect(foot).toContainText("11 hidden.");

  // Kept after a reload, in this browser.
  await page.reload();
  await page.locator(".stage-frame svg").first().waitFor();
  await expect(foot).toContainText("11 hidden.");
  await expect(bezier).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.toolPrefs.v1")!))).toEqual({
    hiddenGroups: ["format"],
    hiddenTools: ["arc", "block", "pen", "connect", "pivot", "multiSelect", "duplicate", "clickThrough", "rotate", "scale"],
  });

  // Everything brings it all back, and Show me how it works opens the designer tour.
  guide = await openGuide();
  await sets.getByRole("radio", { name: /^Everything/ }).click();
  await expect(row("Bezier")).toBeChecked();
  await guide.getByRole("button", { name: "Show me how it works" }).click();
  await expect(guide).toBeHidden();
  const tour = page.getByRole("dialog", { name: "How the designer works" });
  await expect(tour).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect(bezier).toBeVisible();
  await expect(foot).toContainText("Too many tools?");
  expect(errors).toEqual([]);
});
