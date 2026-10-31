import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * Tutorials: the button finder, every screen's card with its button list,
 * and Take the tour landing on that screen with the spotlight up.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the button finder answers 'where is the button that…' and a card's tour starts on its screen", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/tutorials");
  await expect(page.locator("h1")).toHaveText("Tutorials");

  // One card per screen, each with a button list that opens.
  const cards = page.locator(".tut-card");
  expect(await cards.count()).toBeGreaterThan(8);
  const vault = cards.filter({ has: page.getByRole("heading", { name: "The Vault", exact: true }) });
  await expect(vault).toHaveCount(1);
  await vault.locator("summary").click();
  await expect(vault.locator(".guide-list dt").first()).toBeVisible();

  // The finder: a word finds buttons across screens, nonsense says so, one letter asks for more.
  const find = page.getByLabel("Find a button");
  await find.fill("wristband");
  await expect(page.locator(".hint[role=status]")).toContainText(/match/);
  const hits = page.locator(".tut-hits li");
  expect(await hits.count()).toBeGreaterThan(0);
  await expect(hits.first().getByRole("link", { name: /^Show me on the .* screen$/ })).toBeVisible();
  await find.fill("qzxv");
  await expect(page.locator(".hint[role=status]")).toContainText("Nothing matches that");
  await find.fill("w");
  await expect(page.locator(".tut-hits")).toHaveCount(0);

  // Take the tour on a card opens that screen with the spotlight up.
  await vault.getByRole("link", { name: "Take the tour" }).click();
  await expect(page).toHaveURL(/\/vault\?tour=vault/);
  await expect(page.locator(".tour-layer [role=dialog]")).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("a finder hit's Show me link opens the tour of that screen", async ({ page }) => {
  await page.goto("/tutorials");
  await page.getByLabel("Find a button").fill("coverage");
  const hit = page.locator(".tut-hits li").first();
  const link = hit.getByRole("link", { name: /^Show me on the .* screen$/ });
  const screen = (await link.textContent())!.replace(/^Show me on the (.*) screen$/, "$1");
  await link.click();
  await expect(page).toHaveURL(/tour=/);
  await expect(page.locator(".tour-layer [role=dialog]")).toBeVisible({ timeout: 10_000 });
  expect(screen.length).toBeGreaterThan(0);
});
