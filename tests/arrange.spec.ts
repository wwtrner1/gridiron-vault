import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Extras → Select all and the Selection drawer's Arrange panel: Flip sides
 * mirrors the whole play, an align edge lines the players up, Undo takes each
 * back, Group, Hide, Lock (the arrows refuse a locked element and move an
 * unlocked one), Space across and Delete, with the panel gone once nothing
 * is selected.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("Select all and the Arrange panel flip, align, space, lock and delete the whole play", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const status = page.locator(".dz-status [role=status]");
  const spots = () =>
    svg.locator("[data-kind=player]").evaluateAll((els) =>
      els.map((el) => {
        const m = /translate\(([\d.-]+) ([\d.-]+)\)/.exec(el.getAttribute("transform") ?? "")!;
        return [Number(m[1]), Number(m[2])];
      }),
    );
  const start = [
    [520, 430],
    [520, 490],
    [180, 434],
    [690, 436],
    [860, 434],
  ];
  expect(await spots()).toEqual(start);

  // Extras → Select all picks all 11 elements; Arrange is folded until the coach opens it.
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.locator("#dz-more-menu").getByRole("button", { name: "Select all" }).click();
  await expect(page.locator("#insp-tab-selection")).toHaveText("Selection11");
  await expect(page.locator("#insp-pane .panel-head").first()).toHaveText("11 elements");
  const panel = page.locator(".panel").filter({ has: page.locator(".panel-head", { hasText: "Arrange" }) });
  await expect(panel.locator(".panel-head")).toHaveAttribute("aria-expanded", "false");
  await panel.locator(".panel-head").click();
  const chip = (name: string) => panel.getByRole("button", { name, exact: true });

  // Flip sides mirrors every player; "top" lines them up on one line; Undo takes each back.
  await chip("Flip sides").click();
  await expect(status).toHaveText("Flip");
  expect(await spots()).toEqual([
    [624, 430],
    [624, 490],
    [964, 434],
    [454, 436],
    [284, 434],
  ]);
  await chip("top").click();
  expect((await spots()).map(([, y]) => y)).toEqual([323.4, 323.4, 323.4, 323.4, 323.4]);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect.poll(spots).toEqual(start);

  // Group and Hide each land as one step; Undo takes Hide back.
  await chip("Group").click();
  await expect(status).toHaveText("Group");
  await chip("Hide").click();
  await expect(status).toHaveText("Hide");
  await page.keyboard.press("Control+z");
  await expect(svg.locator("[data-kind]")).toHaveCount(11);

  // Locked elements refuse the arrow keys; unlocked ones move.
  await chip("Lock").click();
  await expect(status).toHaveText("Lock");
  await page.keyboard.press("ArrowRight");
  await expect(status).toHaveText("That's locked. Unlock it to move it.");
  expect((await spots())[0]).toEqual([520, 430]);
  await chip("Lock").click();
  await page.keyboard.press("ArrowRight");
  await expect(status).toHaveText("Moved 11 elements.");
  expect((await spots())[0]).toEqual([524, 430]);

  // Space across spreads the selection evenly between its two ends.
  await chip("Space across").click();
  expect(await spots()).toEqual([
    [340.4, 430],
    [418.6, 490],
    [184, 434],
    [575, 436],
    [809.6, 434],
  ]);

  // Delete clears the field and the selection, and the panel goes with it; Undo brings the play back.
  await chip("Delete").click();
  await expect(svg.locator("[data-kind]")).toHaveCount(0);
  await expect(page.locator("#insp-tab-selection")).toHaveText("Selection");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(svg.locator("[data-kind]")).toHaveCount(11);
  expect(errors).toEqual([]);
});
