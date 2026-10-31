import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Vault page: the two tabs, search, the formation and type filters, the
 * label chips, Clear filters, sorting, and picking plays for the bulk bar.
 * Delete with Undo, Export and Add to playbook have their own tests.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the Vault searches, filters, sorts and picks plays", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const cards = page.locator(".play-card");
  const tabs = page.getByRole("group", { name: "Which plays to show" });
  const search = page.getByLabel("Search the Vault");
  const clear = page.locator(".filters").getByRole("button", { name: "Clear filters" });

  await expect(tabs.getByRole("button", { name: "Your plays (24)" })).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(24);

  // Adding the playbook left its label chip on, so the new plays are what shows; Clear filters takes it off.
  const ready = page.locator(".chip-row .chip", { hasText: "ready-to-go" }).first();
  await expect(ready).toHaveClass(/is-on/);
  await clear.click();
  await expect(ready).not.toHaveClass(/is-on/);
  await expect(clear).toHaveCount(0);

  // Search reads names, formations and labels; nothing found offers Clear filters.
  await search.fill("stick");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("17 · Stick");
  await search.fill("zzz");
  await expect(page.getByRole("heading", { name: "Nothing matches that" })).toBeVisible();
  await page.locator(".empty").getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(cards).toHaveCount(24);

  // Formation and type filters narrow the grid; the label chips too.
  await page.getByLabel("Filter by formation").selectOption("Trips Right");
  await expect(cards).toHaveCount(5);
  await expect(cards.locator(".play-meta, .card-meta, p").first()).toContainText("Trips Right");
  await page.getByLabel("Filter by type").selectOption("Run");
  await expect.poll(() => cards.count()).toBeLessThan(5);
  await clear.click();
  await expect(cards).toHaveCount(24);
  await page.getByLabel("Filter by type").selectOption("Run");
  await expect(cards).toHaveCount(5);
  for (const text of await cards.allTextContents()) expect(text).toContain("run");
  await clear.click();
  const chip = page.locator(".chip-row .chip", { hasText: "twins" }).first();
  await chip.click();
  await expect(chip).toHaveClass(/is-on/);
  const twins = await cards.count();
  expect(twins).toBeGreaterThan(0);
  expect(twins).toBeLessThan(24);
  for (const text of await cards.allTextContents()) expect(text).toContain("twins");
  await chip.click();
  await expect(chip).not.toHaveClass(/is-on/);
  await expect(cards).toHaveCount(24);

  // Sorting reorders without changing what is there.
  await page.getByLabel("Sort").selectOption("Play name A–Z");
  await expect(cards.first()).toContainText("01 · All Curls");
  await expect(cards.last()).toContainText("24 · Toss Sweep Left");
  await expect(cards).toHaveCount(24);
  await page.getByLabel("Sort").selectOption("Formation");
  await expect(cards.first()).toContainText("Jet");
  await page.getByLabel("Sort").selectOption("Newest first");

  // Picking plays opens the bulk bar; Clear and a tab change empty it.
  await page.getByRole("button", { name: "Select 01 · All Curls" }).click();
  await page.getByRole("button", { name: "Select 03 · Mesh" }).click();
  const bulk = page.getByRole("group", { name: "Selected plays" });
  await expect(bulk).toContainText("2 plays selected");
  await expect(page.getByRole("button", { name: "Select 03 · Mesh" })).toHaveAttribute("aria-pressed", "true");
  await expect(bulk.getByRole("button", { name: "Export or print" })).toBeVisible();
  await bulk.getByRole("button", { name: "Clear" }).click();
  await expect(bulk).toHaveCount(0);
  await page.getByRole("button", { name: "Select 01 · All Curls" }).click();
  await expect(page.getByRole("group", { name: "Selected plays" })).toContainText("1 play selected");

  // Shared by coaches: nothing shared yet (and nothing from the account while signed out).
  await tabs.getByRole("button", { name: "Shared by coaches" }).click();
  await expect(page.getByRole("heading", { name: "No shared plays yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Draft a play to share" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Selected plays" })).toHaveCount(0);
  await tabs.getByRole("button", { name: "Your plays (24)" }).click();
  await expect(cards).toHaveCount(24);
  expect(errors).toEqual([]);
});
