import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Two table screens at phone width (Pixel 7, 412 px): the Call Sheet keeps
 * its # and Play Name columns on the screen and can still be typed into, and
 * Playbook language turns each row into a card (term and meaning stacked,
 * Edit and Delete under them, the header kept for screen readers only), with
 * neither page scrolling sideways.
 */
test.beforeEach(async ({ context }) => quiet(context));

const sideways = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test("the Call Sheet and Playbook language fit a phone @phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "needs the phone project");
  const errors = errorsOf(page);
  await seedReady(page);
  const width = page.viewportSize()!.width;

  // Call Sheet: the first two columns are on the screen, and a play name can be typed and linked.
  await page.goto("/grid");
  const table = page.locator("table").first();
  await expect(table.locator("tbody tr")).toHaveCount(12);
  const heads = table.locator("thead th");
  const second = (await heads.nth(1).boundingBox())!;
  expect(second.x + second.width, "# and Play Name run past the screen").toBeLessThanOrEqual(width);
  const name = page.getByRole("combobox", { name: "Play Name, row 1", exact: true });
  await name.tap();
  await name.fill("17 · Stick");
  await name.press("Tab");
  await expect(page.locator(".toast", { hasText: "17 · Stick is in your Vault, so this row is linked" })).toBeVisible();
  expect(await sideways(page), "the Call Sheet scrolls the whole page sideways").toBeLessThanOrEqual(0);

  // Playbook language: rows are cards, the header is hidden from the eye, and the actions sit under the meaning.
  await page.goto("/language");
  const rows = page.locator(".lang-table tbody tr");
  await expect(rows).toHaveCount(33);
  const head = (await page.locator(".lang-table thead").boundingBox())!;
  expect(head.width).toBeLessThanOrEqual(1);
  const card = (await rows.first().boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width, "a term card runs past the screen").toBeLessThanOrEqual(width);
  const term = (await rows.first().locator("th").boundingBox())!;
  const meaning = (await rows.first().locator("td").nth(0).boundingBox())!;
  const acts = (await rows.first().locator("td.lang-acts").boundingBox())!;
  expect(meaning.y, "the meaning sits under the term").toBeGreaterThan(term.y + term.height - 2);
  expect(acts.y, "Edit and Delete sit under the meaning").toBeGreaterThan(meaning.y);
  expect(await sideways(page), "Playbook language scrolls sideways").toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
