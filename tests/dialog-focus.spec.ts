import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Keyboard focus in dialogs: opening one moves focus inside (an autofocused
 * box keeps it), Tab stays inside, Escape closes it, and focus goes back to the
 * button that opened it — including dialogs opened from the Designer's Extras
 * menu, whose item is gone by the time the dialog closes. Typing in Field
 * controls keeps focus in the box.
 */
test.beforeEach(async ({ context }) => quiet(context));

const active = (page: Page) =>
  page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e || e === document.body) return "body";
    return `${e.tagName.toLowerCase()}:${e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 40) ?? ""}`;
  });

/** Tab around the dialog: focus never leaves it. */
async function stays(page: Page, times = 12) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  }
}

test("Playbooks and Call Sheet dialogs keep their autofocused box and hand focus back to their opener", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);

  await page.goto("/playbooks");
  const newBook = page.locator('[data-tour="new-playbook"]');
  await newBook.click();
  const dialog = page.getByRole("dialog", { name: "New playbook" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Playbook name")).toBeFocused();
  await stays(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(newBook).toBeFocused();

  await page.goto("/grid");
  await page.locator("table").first().waitFor();
  const link = page.getByRole("button", { name: "Link a saved play" }).first();
  await link.click();
  const linking = page.getByRole("dialog", { name: "Link a saved play" });
  await expect(linking).toBeVisible();
  await expect(linking.getByLabel("Search your plays")).toBeFocused();
  await stays(page, 6);
  await page.keyboard.press("Escape");
  await expect(linking).toHaveCount(0);
  await expect(link).toBeFocused();
  expect(errors).toEqual([]);
});

test("Run play, Coverage check and Field controls take focus, keep it inside and return it, and typing in a box keeps focus", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  const extras = page.locator('button[aria-controls="dz-more-menu"]');
  const menu = page.getByRole("group", { name: "Extras" });

  // Run play: focus lands inside, Tab stays, Escape goes back to the Run play button.
  const run = page.locator('[data-tour="dz-run"]');
  await run.click();
  const running = page.getByRole("dialog", { name: /^Run play/ });
  await expect(running).toBeVisible();
  expect(await active(page)).not.toBe("body");
  expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  await stays(page);
  await page.keyboard.press("Escape");
  await expect(running).toHaveCount(0);
  await expect(run).toBeFocused();

  // Coverage check from Extras: the menu item is gone on close, so focus returns to the Extras button.
  await extras.click();
  await menu.locator('[data-tour="dz-coverage"]').click();
  const cov = page.getByRole("dialog", { name: /^Coverage check/ });
  await expect(cov).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  await stays(page, 8);
  await page.keyboard.press("Escape");
  await expect(cov).toHaveCount(0);
  await expect(extras).toBeFocused();
  // Escape closed the dialog only: the Extras menu did not open and the Designer's own Escape did not run.
  await expect(menu).toHaveCount(0);

  // Field controls: focus moves to the panel, typing a distance keeps focus in the box, Escape returns to Extras.
  await extras.click();
  await menu.getByRole("button", { name: "Field controls: grid, hashes, rule lines" }).click();
  const fc = page.getByRole("dialog", { name: "Field controls" });
  await expect(fc).toBeVisible();
  await expect(fc.getByRole("button", { name: "Close field controls" })).toBeFocused();
  await fc.locator(".fc-presets").getByRole("button", { name: "Rush line only" }).click();
  const rush = fc.getByLabel("Rush line (yds)");
  await rush.click();
  await rush.press("Control+a");
  await rush.pressSequentially("10");
  await expect(rush).toBeFocused();
  await expect(rush).toHaveValue("10");
  await expect(page.locator(".stage-frame svg").first().locator("text", { hasText: /RUSH LINE/ })).toHaveText("RUSH LINE · 10 YDS");
  await stays(page, 6);
  await page.keyboard.press("Escape");
  await expect(fc).toHaveCount(0);
  await expect(extras).toBeFocused();
  expect(errors).toEqual([]);
});
