import { expect, test } from "@playwright/test";
import { quiet, seedReady } from "./helpers";

/**
 * Wristbands page settings: the source, plays per card, numbering, a one-click
 * style, the bottom border text, moving a call, and every setting kept after
 * a reload. The PDF itself is covered in export.spec.ts.
 */
test.beforeEach(async ({ context }) => quiet(context));

const chip = (page: import("@playwright/test").Page, group: string, name: string | RegExp) =>
  page.getByRole("group", { name: group }).getByRole("button", { name });

test("wristband settings lay out the cards, number the calls and are kept after a reload", async ({ page }) => {
  await seedReady(page);
  await page.goto("/wristbands");
  await expect(page.locator("h1")).toHaveText("Wristbands");

  // Pull the Ready-to-Go playbook: 24 calls.
  const source = page.locator('[data-tour="wb-source"] select');
  await source.selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const cards = page.locator('.wb-preview [aria-label^="Card "]');
  await expect(cards.first()).toBeVisible();

  // Plays per card: 8 a card makes three cards, 4 a card makes six.
  await chip(page, "Plays per card (columns × rows)", "8 plays, 4 across and 2 down").click();
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute("aria-label", /^Card A, 8 plays/);
  await expect(cards.last()).toHaveAttribute("aria-label", /^Card C, 8 plays/);
  await chip(page, "Plays per card (columns × rows)", "4 plays, 2 across and 2 down").click();
  await expect(cards).toHaveCount(6);
  await chip(page, "Plays per card (columns × rows)", "8 plays, 4 across and 2 down").click();

  // Numbering: in print order from 10, then by card (11… on A, 21… on B, 31… on C).
  const numbering = page.getByRole("group", { name: "Numbering" });
  await numbering.getByRole("button", { name: "1, 2, 3 in print order" }).click();
  await numbering.getByLabel("Start at").fill("10");
  await expect(numbering).toContainText("Your calls run 10 to 33.");
  await numbering.getByRole("button", { name: "By card" }).click();
  await numbering.getByLabel("First card starts at").fill("1");
  await expect(numbering).toContainText("Your calls run 11 to 38.");
  await expect(page.locator('.wb-preview button[aria-label^="Move 11 "]').first()).toBeVisible();

  // A one-click style: Sideline 2×4 is pressed and keeps the grid at eight.
  await chip(page, "One-click styles", "Sideline 2×4").click();
  await expect(chip(page, "One-click styles", "Sideline 2×4")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Plays per card (columns × rows)", "8 plays, 4 across and 2 down")).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(3);

  // The bottom border text shows on every card, with {card} filled in.
  await page.getByLabel("Bottom border").fill("Mustangs · card {card}");
  await expect(cards.first()).toContainText("Mustangs · card A");
  await expect(cards.last()).toContainText("Mustangs · card C");

  // Moving a call later changes the order and Original order puts it back.
  const first = cards.first().locator('button[aria-label^="Move "][aria-label$=" later"]').first();
  const label = (await first.getAttribute("aria-label"))!;
  const name = label.replace(/^Move \d+ /, "").replace(/ later$/, "");
  await first.click();
  await expect(page.getByRole("button", { name: "Original order" })).toBeVisible();
  await expect(cards.first().locator('button[aria-label$=" later"]').nth(1)).toHaveAttribute("aria-label", new RegExp(`Move \\d+ ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} later`));
  await page.getByRole("button", { name: "Original order" }).click();
  await expect(page.getByRole("button", { name: "Original order" })).toHaveCount(0);
  await expect(cards.first().locator('button[aria-label$=" later"]').first()).toHaveAttribute("aria-label", label);

  // Card size: a youth window says what it fits.
  await page.getByRole("combobox", { name: "Card size" }).selectOption("fpc-youth");
  await expect(page.getByRole("group", { name: "Card size" })).toContainText("Fits a 3.75 × 2.25 in youth window");

  // Everything is kept after a reload.
  await page.reload();
  await expect(cards.first()).toBeVisible();
  await expect(cards).toHaveCount(3);
  await expect(chip(page, "Plays per card (columns × rows)", "8 plays, 4 across and 2 down")).toHaveAttribute("aria-pressed", "true");
  await expect(numbering.getByRole("button", { name: "By card" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Bottom border")).toHaveValue("Mustangs · card {card}");
  await expect(page.getByRole("combobox", { name: "Card size" })).toHaveValue("fpc-youth");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.wristbands.v1") ?? "{}"));
  expect(saved).toMatchObject({ grid: "4x2", sizeId: "fpc-youth", footer: "Mustangs · card {card}", numbering: { mode: "card" } });
});

test("plays picked by hand make the cards, and nothing picked says so", async ({ page }) => {
  await seedReady(page);
  await page.goto("/wristbands");
  const source = page.locator('[data-tour="wb-source"] select');
  await source.selectOption("hand");
  await expect(page.getByText("No plays to print yet")).toBeVisible();
  const picks = page.getByRole("group", { name: "Plays to print" }).getByRole("checkbox");
  await picks.nth(0).check();
  await picks.nth(1).check();
  await picks.nth(2).check();
  const cards = page.locator('.wb-preview [aria-label^="Card "]');
  await expect(cards.first()).toHaveAttribute("aria-label", /^Card A, 3 plays/);
  await picks.nth(1).uncheck();
  await expect(cards.first()).toHaveAttribute("aria-label", /^Card A, 2 plays/);
});
