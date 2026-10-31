import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Vault and the Wristbands page at phone width (Pixel 7, 412 px): play
 * cards stay inside the screen, search narrows them, picking a play brings up
 * the bulk bar with its buttons on the screen, and the wristband cards and
 * their settings can be used by tap; neither page scrolls sideways.
 */
test.beforeEach(async ({ context }) => quiet(context));

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test("the Vault and Wristbands work by tap on a phone @phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "needs the phone project");
  const errors = errorsOf(page);
  await seedReady(page);
  const width = page.viewportSize()!.width;
  const cards = page.locator(".play-card");

  // Vault: every card sits inside the screen, and search narrows them.
  await expect(cards).toHaveCount(24);
  for (const i of [0, 1, 23]) {
    const b = (await cards.nth(i).boundingBox())!;
    expect(b.x, `card ${i} starts off the screen`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `card ${i} runs past the screen`).toBeLessThanOrEqual(width);
  }
  await page.getByLabel("Search the Vault").fill("stick");
  await expect(cards).toHaveCount(1);
  await page.getByLabel("Search the Vault").fill("");
  await expect(cards).toHaveCount(24);

  // Picking plays by tap brings up the bulk bar, with its buttons inside the screen.
  await page.getByLabel("Select 17 · Stick").tap();
  await page.getByLabel("Select 03 · Mesh").tap();
  const bar = page.getByRole("group", { name: "Selected plays" });
  await expect(bar).toContainText("2 plays selected");
  for (const name of ["Add to playbook", "Export or print"]) {
    const b = (await bar.getByRole("button", { name }).boundingBox())!;
    expect(b.x + b.width, `${name} runs past the screen`).toBeLessThanOrEqual(width);
  }
  await bar.getByRole("button", { name: "Clear" }).tap();
  await expect(bar).toHaveCount(0);
  expect(await sideways(page), "the Vault scrolls sideways").toBeLessThanOrEqual(0);

  // Wristbands: the preview's cards and the settings chips fit and answer a tap.
  await page.goto("/wristbands");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const wb = page.locator('.wb-preview [aria-label^="Card "]');
  await expect(wb.first()).toBeVisible();
  const first = (await wb.first().boundingBox())!;
  expect(first.x).toBeGreaterThanOrEqual(0);
  expect(first.x + first.width, "a wristband card runs past the screen").toBeLessThanOrEqual(width);
  const per = page.getByRole("group", { name: "Plays per card (columns × rows)" });
  await per.getByRole("button", { name: "4 plays, 2 across and 2 down" }).tap();
  await expect(wb).toHaveCount(6);
  await per.getByRole("button", { name: "8 plays, 4 across and 2 down" }).tap();
  await expect(wb).toHaveCount(3);
  expect(await sideways(page), "Wristbands scrolls sideways").toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
