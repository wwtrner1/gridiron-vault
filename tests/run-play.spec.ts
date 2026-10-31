import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Run play: the animation runs every route from the snap with a clock, Pause
 * holds it, the speed buttons change the rate, the time slider scrubs it, the
 * field reads out the time, "Run it against a defense" hands off to the
 * Coverage check, and Back to drawing or Escape closes it.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("Run play animates the routes, pauses, changes speed, scrubs and hands off to the Coverage check", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.locator('[data-tour="dz-run"]').first().click();
  const dialog = page.getByRole("dialog", { name: /Run play/ });
  const clock = dialog.locator(".rp-clock");
  const slider = dialog.getByLabel("Time after the snap");
  const firstPlayer = dialog.locator("[data-kind=player]").first();
  const where = () => firstPlayer.getAttribute("transform");

  // At the snap: clock at zero, 1× picked, the marks and the play's length on the slider.
  await expect(dialog.locator("h2")).toHaveText("Run play 17 · Stick");
  await expect(clock).toHaveText("0.0 S · 1X");
  await expect(dialog.getByRole("group", { name: "Speed" }).locator("button[aria-pressed=true]")).toHaveText("1×");
  await expect(dialog.locator(".rp-mark")).toHaveText(["SNAP", "THROW", "2.9 S"]);
  await expect(slider).toHaveAttribute("max", "2.9");
  const start = await where();

  // Run: the clock moves, the players leave their spots, the field reads the time out; Pause holds it.
  await dialog.getByRole("button", { name: "Run play" }).click();
  await expect(dialog.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(async () => Number((await clock.textContent())!.split(" ")[0])).toBeGreaterThan(0.3);
  expect(await where()).not.toBe(start);
  await expect(dialog.locator("svg[role=img]")).toHaveAttribute("aria-label", /17 · Stick running, \d\.\d seconds after the snap/);
  await dialog.getByRole("button", { name: "Pause" }).click();
  const held = await clock.textContent();
  await page.waitForTimeout(400);
  await expect(clock).toHaveText(held!);

  // Speed and the slider.
  await dialog.getByRole("group", { name: "Speed" }).getByRole("button", { name: "2×" }).click();
  await expect(clock).toHaveText(/· 2X$/);
  await slider.fill("0");
  await expect(clock).toHaveText("0.0 S · 2X");
  expect(await where()).toBe(start);
  await slider.fill("2.9");
  await expect(clock).toHaveText("2.9 S · 2X");
  expect(await where()).not.toBe(start);

  // Lets the play run out on its own at 2×: the button reads Run play again at the end.
  await slider.fill("0");
  await dialog.getByRole("button", { name: "Run play" }).click();
  await expect(dialog.getByRole("button", { name: "Run play" })).toBeVisible({ timeout: 6000 });
  await expect(clock).toHaveText("2.9 S · 2X");

  // Hands off to the Coverage check, then comes back; Escape closes it too.
  await dialog.getByRole("button", { name: "Run it against a defense" }).click();
  await expect(page.getByRole("dialog", { name: /Coverage check/ })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Back to drawing" }).click();
  await page.locator('[data-tour="dz-run"]').first().click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.locator('[data-tour="dz-run"]').first().click();
  await dialog.getByRole("button", { name: "Back to drawing" }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
