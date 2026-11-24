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

/**
 * Pairs of players whose tokens touch on the phone's field (by letter), left
 * out the pairs the play itself draws touching at the desktop size: growing
 * the tokens for a phone must never put one on another.
 */
const crowded = (svg: import("@playwright/test").Locator) =>
  svg.evaluate((el) => {
    const grow = Number(el.getAttribute("data-grow"));
    const num = (c: Element, a: string) => Number(c.getAttribute(a));
    // A token's own edge: the ring sits a little outside it (0.6 of its size against 0.5).
    const all = [
      ...[...el.querySelectorAll(".fr-ring")].map((c) => ({ x: num(c, "cx"), y: num(c, "cy"), r: (num(c, "r") * 0.5) / 0.6 / grow, who: c.parentElement?.textContent ?? "" })),
      ...[...el.querySelectorAll("[data-defender] circle")].map((c) => ({ x: num(c, "cx"), y: num(c, "cy"), r: num(c, "r") / grow, who: c.parentElement?.textContent ?? "" })),
    ];
    const out: string[] = [];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
        const reach = all[i].r + all[j].r;
        if (d < reach * grow && d >= reach) out.push(`${all[i].who}/${all[j].who}`);
      }
    return { grow, out };
  });

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

  // Upright: the picture keeps to the play (inside the sidelines, not the edge of the canvas) and fits the screen.
  const box = (await field.locator("svg").getAttribute("viewBox"))!.split(" ").map(Number);
  expect(box[0]).toBeGreaterThan(0);
  expect(box[0] + box[2]).toBeLessThan(1040);
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

test("an 11-man line on a phone stands apart, token from token @phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "needs the phone project");
  await page.goto("/concepts?game=11&watch=flood");
  const svg = page.getByRole("dialog", { name: /Film Room/ }).locator(".fr-field svg");
  await expect(svg).toBeVisible();
  // At the snap, eleven on eleven: the tokens grow a little for the small screen, and no further than keeps them apart.
  const { grow, out } = await crowded(svg);
  expect(grow).toBeGreaterThan(1);
  expect(grow).toBeLessThan(1.5);
  expect(out).toEqual([]);
});
