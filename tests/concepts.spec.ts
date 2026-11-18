import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * The Concept Library (`/concepts`): a public page, so it is open to search
 * with its own address. Five concepts, each drawn for the picked game (5v5
 * first), the game kept in the address, a concept's lesson opening in the
 * Film Room with no coach tools (nothing to record or save), Back to the
 * concepts, a link straight to one lesson, and the footer's way in.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("anyone can pick a game, watch a concept's lesson and link straight to it", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/concepts");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Five pass concepts, taught step by step");
  await expect(page).toHaveTitle(/Concept Library/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://gridiron-vault.com/concepts");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

  const cards = page.locator(".cl-card");
  await expect(cards.locator("h3")).toHaveText(["Smash", "Flood", "Mesh", "Four Verts", "Stick"]);
  await expect(cards.first()).toContainText("Built to beat Cover 2 and Cover 3");
  // Every card has its own drawing: players and routes.
  for (let i = 0; i < 5; i++) await expect.poll(() => cards.nth(i).locator(".cl-thumb svg path").count()).toBeGreaterThan(3);
  const games = page.getByRole("group", { name: "Game" });
  await expect(games.getByRole("button")).toHaveText(["5v5", "7v7", "11-man"]);
  await expect(games.getByRole("button", { name: "5v5" })).toHaveAttribute("aria-pressed", "true");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);

  // The game is kept in the address and redraws the cards.
  const five = await cards.first().locator(".cl-thumb svg").innerHTML();
  await games.getByRole("button", { name: "7v7" }).click();
  await expect(page).toHaveURL(/\/concepts\?game=7$/);
  await expect(games.getByRole("button", { name: "7v7" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await cards.first().locator(".cl-thumb svg").innerHTML()) !== five).toBe(true);

  // A lesson opens in the Film Room, with nothing for a visitor to record or save.
  await cards.first().getByRole("button", { name: "Watch the Smash lesson" }).click();
  const room = page.getByRole("dialog", { name: /Film Room/ });
  await expect(room).toContainText("Smash · 7v7");
  await expect(page).toHaveURL(/game=7&watch=smash$/);
  await expect(room.locator(".fr-voice")).toHaveCount(0);
  await expect(room.getByRole("button", { name: "Make a video" })).toHaveCount(0);
  await expect(room.getByLabel("Lesson steps").getByRole("button")).toHaveCount(6);
  await room.getByRole("button", { name: "Back to the concepts" }).click();
  await expect(room).toBeHidden();
  await expect(page).toHaveURL(/\/concepts\?game=7$/);

  // A link straight to one lesson.
  await page.goto("/concepts?game=11&watch=mesh");
  await expect(page.getByRole("dialog", { name: /Film Room/ })).toContainText("Mesh · 11-man");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Game" }).getByRole("button", { name: "11-man" })).toHaveAttribute("aria-pressed", "true");

  // The way in from the home page's footer.
  await page.goto("/");
  await page.locator("footer.mkt").getByRole("link", { name: "Concept Library" }).click();
  await expect(page).toHaveURL(/\/concepts$/);
  expect(errors).toEqual([]);
});
