import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * Drawing from the defense's end: Extras → "View from the defense" turns the
 * whole play half a circle about the ball (and back), it is kept by Save, the
 * red zone field can't be turned, and New play setup asks which end to draw
 * from.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

const spots = (page: Page) =>
  page.locator(".stage-frame svg g[data-kind=player]").evaluateAll((els) =>
    els.map((e) => {
      const m = /translate\(([\d.-]+)[ ,]([\d.-]+)\)/.exec(e.getAttribute("transform") ?? "");
      return [Number(m?.[1]), Number(m?.[2])];
    }),
  );

test("View from the defense turns the play round, back again, and Save keeps it", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const before = await spots(page);
  expect(before.length).toBeGreaterThan(4);

  const extras = page.locator('button[aria-controls="dz-more-menu"]');
  await extras.click();
  await page.locator("#dz-more-menu").getByRole("button", { name: "View from the defense" }).click();
  const after = await spots(page);
  // Half a circle about the ball: across the field and back to front.
  expect(after.map(([x]) => x)).toEqual(before.map(([x]) => 1040 - x));
  const sums = after.map(([, y], i) => y + before[i][1]);
  sums.forEach((v) => expect(v).toBeCloseTo(sums[0], 0));
  expect(after.some(([, y], i) => Math.abs(y - before[i][1]) > 20)).toBe(true);
  // The play is turned, but every letter still reads upright (the coach's view, not the field's).
  const upright = await svg.evaluate((el) =>
    [...el.querySelectorAll('g[data-kind="player"] text, g[data-kind="text"] text')].map((t) => {
      const m = (t as SVGGraphicsElement).getScreenCTM();
      return m ? m.d > 0 : true;
    }),
  );
  expect(upright.length).toBeGreaterThan(4);
  expect(upright.every(Boolean)).toBe(true);

  // The button reads the other way and a second press puts everything back.
  await extras.click();
  const back = page.locator("#dz-more-menu").getByRole("button", { name: "View from the offense" });
  await expect(back).toHaveAttribute("aria-pressed", "true");
  await back.click();
  expect(await spots(page)).toEqual(before);

  // Turned again and saved, the play comes back turned.
  await extras.click();
  await page.locator("#dz-more-menu").getByRole("button", { name: "View from the defense" }).click();
  const save = page.locator('[data-tour="dz-save"]');
  await save.click();
  await expect(save).toHaveText(/Saved/);
  await expect.poll(async () => ((await workspace(page)).plays!.find((p) => /Stick/.test(p.name))!.scene as unknown as { pov?: string }).pov).toBe("defense");
  expect(errors).toEqual([]);
});

test("the red zone field can't be turned round", async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false, view: "redzone" })));
  await page.goto("/build");
  await page.locator(".stage-frame svg").first().waitFor();
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.locator("#dz-more-menu select.dz-top-select").first().selectOption("redzone");
  await expect(page.locator("#dz-more-menu").getByRole("button", { name: /View from the defense/ })).toBeDisabled();
});

test("New play setup asks which end to draw from", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  const dialog = page.getByRole("dialog", { name: "New play" });
  const group = dialog.getByRole("group", { name: "Draw it from" });
  await expect(group.getByRole("button", { name: "The offense's end" })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "The defense's end" }).click();
  await expect(group.getByRole("button", { name: "The defense's end" })).toHaveAttribute("aria-pressed", "true");

  // On the red zone field the defense's end is off.
  await dialog.locator("label.field:has(span:text-is(\"Field\")) select").selectOption("redzone");
  await expect(group.getByRole("button", { name: "The defense's end" })).toBeDisabled();
  await expect(group.getByRole("button", { name: "The offense's end" })).toHaveAttribute("aria-pressed", "true");
  await dialog.locator("label.field:has(span:text-is(\"Field\")) select").selectOption("half");
  await group.getByRole("button", { name: "The defense's end" }).click();

  // The field opens turned: the quarterback sits above the center.
  await dialog.getByRole("button", { name: "Open the field" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const all = await spots(page);
  const ys = all.map(([, y]) => y);
  // Turned about the line of scrimmage (420): the quarterback, 70 below it, now stands 70 above.
  expect(Math.max(...ys)).toBeLessThanOrEqual(421);
  expect(Math.min(...ys)).toBeCloseTo(350, -1);
  await page.reload();
  // The pick is remembered for the next play.
  await expect(page.getByRole("dialog", { name: "New play" }).getByRole("button", { name: "The defense's end" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
