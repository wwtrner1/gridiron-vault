import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The More tools page: Griddy's card opens his panel with a rename request
 * typed into the box (never sent), and each shortcut card goes where it says,
 * the Designer for the libraries and Saved play format, Starters and Upload.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

test("More tools: Ask Griddy types a request into his box, and every card opens its screen", async ({ page }) => {
  const errors = errorsOf(page);
  let griddyCalls = 0;
  await page.route("**/api/ai/griddy", (route) => {
    griddyCalls++;
    return route.abort();
  });
  await seedReady(page);
  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: "More tools", level: 2 })).toBeVisible();
  const cards = page.locator(".tools-card");
  await expect(cards.locator("h3")).toHaveText([
    "Griddy",
    "Formation library",
    "Defense library",
    "Route tree",
    "Saved play format",
    "Starter plays",
    "Upload plays",
  ]);

  // Ask Griddy opens the panel with the request in the box, nothing sent.
  await cards.filter({ hasText: "Griddy" }).first().getByRole("button", { name: "Ask Griddy" }).click();
  const panel = page.locator("#griddy-panel");
  await expect(panel.getByLabel("Message Griddy")).toHaveValue("Rename all plays accordingly to the diagrams");
  await expect(panel.locator(".gd-msg.is-coach")).toHaveCount(0);
  expect(griddyCalls).toBe(0);
  await page.keyboard.press("Escape");

  // Each other card links to its screen.
  const goes = [
    ["Formation library", "Open the Designer", /\/build$/],
    ["Defense library", "Open the Designer", /\/build$/],
    ["Route tree", "Open the Designer", /\/build$/],
    ["Saved play format", "Open the Designer", /\/build$/],
    ["Starter plays", "Browse starters", /\/starters$/],
    ["Upload plays", "Upload", /\/upload$/],
  ] as const;
  for (const [title, cta, url] of goes) {
    await page.goto("/tools");
    await cards.filter({ has: page.getByRole("heading", { name: title }) }).getByRole("link", { name: cta }).click();
    await expect(page).toHaveURL(url);
  }
  expect(errors).toEqual([]);
});
