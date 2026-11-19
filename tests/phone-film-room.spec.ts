import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * The Film Room on a phone (Pixel 7), upright and on its side. Upright: the
 * field is cut to its sidelines, fits the screen and stays at the top while
 * the steps scroll under it, and Hide the steps puts the panel away. On its
 * side: the field takes the height of the screen on the left and the caption,
 * controls and steps sit beside it. Neither way scrolls sideways.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the Film Room fits a phone, upright and on its side @phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "needs the phone project");
  const errors = errorsOf(page);
  await page.goto("/concepts?game=5&watch=flood");
  const room = page.getByRole("dialog", { name: /Film Room/ });
  const field = room.locator(".fr-field");
  const steps = room.getByLabel("Lesson steps");
  await expect(field.locator("svg")).toBeVisible();
  const { width, height } = page.viewportSize()!;
  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  // Upright: the picture starts just outside the sideline, not at the edge of the canvas, and fits the screen.
  const box = (await field.locator("svg").getAttribute("viewBox"))!.split(" ").map(Number);
  expect(box[0]).toBeGreaterThan(0);
  expect(box[2]).toBe(1040 - box[0] * 2);
  let f = (await field.boundingBox())!;
  expect(f.x).toBeGreaterThanOrEqual(0);
  expect(f.x + f.width).toBeLessThanOrEqual(width);
  expect(await sideways()).toBeLessThanOrEqual(0);
  expect((await new AxeBuilder({ page }).include(".fr").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);

  // A step tapped far down the page: the field is still on the screen above it.
  await steps.getByRole("button", { name: /Your job/ }).tap();
  await expect(steps.getByRole("button", { name: /Your job/ })).toHaveAttribute("aria-current", "step");
  f = (await field.boundingBox())!;
  expect(f.y).toBeGreaterThanOrEqual(0);
  expect(f.y + f.height).toBeLessThanOrEqual(height);

  // Hide the steps puts the panel away; Show the steps brings it back.
  await room.getByRole("button", { name: "Hide the steps" }).tap();
  await expect(steps).toBeHidden();
  await room.getByRole("button", { name: "Show the steps" }).tap();
  await expect(steps).toBeVisible();

  // On its side: the whole field is on the screen, with the steps beside it, not under it.
  await page.setViewportSize({ width: height, height: width });
  await expect.poll(async () => (await field.boundingBox())!.height).toBeLessThanOrEqual(width);
  f = (await field.boundingBox())!;
  expect(f.y).toBeGreaterThanOrEqual(0);
  expect(f.y + f.height).toBeLessThanOrEqual(width);
  const s = (await steps.boundingBox())!;
  expect(s.x).toBeGreaterThanOrEqual(f.x + f.width);
  await steps.getByRole("button", { name: /Zones/ }).tap();
  f = (await field.boundingBox())!;
  expect(f.y).toBeGreaterThanOrEqual(0);
  expect(f.y + f.height).toBeLessThanOrEqual(width);
  await expect(room.locator(".fr-cap p")).toBeVisible();
  expect(await sideways()).toBeLessThanOrEqual(0);
  expect((await new AxeBuilder({ page }).include(".fr").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);

  expect(errors).toEqual([]);
});
