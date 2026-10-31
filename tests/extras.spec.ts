import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Designer's Extras drop-down: Undo and Redo, Clean up lines, Route
 * depths (kept per browser), Select all, the field select (routes kept to
 * the yard), the Vs defense overlay, and Flip and save as a new play, which
 * mirrors a copy, files it beside the original and opens it.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("Extras undoes, cleans, shows depths, changes the field, lays a defense under the play and flips a copy", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const status = page.locator(".dz-status [role=status]");
  const extras = page.locator('button[aria-controls="dz-more-menu"]');
  const menu = page.getByRole("group", { name: "Extras" });
  const open = async () => {
    if (!(await menu.count())) await extras.click();
    await expect(menu).toBeVisible();
  };
  const vault = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}") as {
          plays: { id: string; name: string; fieldView?: string; isPublic?: boolean; remote?: boolean; scene: { view: string } }[];
          playbooks: { id: string; playIds: string[] }[];
        },
    );
  const depths = svg.locator("g[pointer-events=none][aria-hidden=true] text");
  /** The play's own players (not the Vs defense overlay's), as [x, y]. */
  const spots = () =>
    svg.locator("g[data-kind=player]").evaluateAll((els) =>
      els
        .filter((e) => !e.closest('g[opacity="0.36"]'))
        .map((e) => e.getAttribute("transform")!.match(/translate\(([\d.]+) ([\d.]+)\)/)!.slice(1).map(Number)),
    );

  // Nothing to undo yet; Route depths puts the yards on every route and marks the button.
  await open();
  await expect(menu.getByRole("button", { name: /^Undo/ })).toBeDisabled();
  await expect(menu.getByRole("button", { name: /^Redo/ })).toBeDisabled();
  await expect(depths).toHaveCount(0);
  await menu.getByRole("button", { name: "Route depths: off" }).click();
  await expect(menu).toHaveCount(0);
  await expect(depths).toHaveText(["7", "4", "2"]);
  await expect(extras).toHaveClass(/has-dot/);
  expect(await page.evaluate(() => localStorage.getItem("grid1ronvault.depths.v1"))).toBe("1");

  // Select all, a nudge, then Undo and Redo from the menu.
  await open();
  await menu.getByRole("button", { name: "Select all" }).click();
  await expect(page.locator("#insp-tab-selection")).toContainText("11");
  await page.keyboard.press("ArrowRight");
  await expect(status).toHaveText("Moved 11 elements.");
  expect((await spots())[0]).toEqual([524, 430]);
  await open();
  await menu.getByRole("button", { name: /^Undo/ }).click();
  await expect(status).toHaveText("Undid move.");
  await expect(menu).toHaveCount(0);
  expect((await spots())[0]).toEqual([520, 430]);
  await open();
  await menu.getByRole("button", { name: /^Redo/ }).click();
  await expect.poll(async () => (await spots())[0]).toEqual([524, 430]);

  // Clean up lines on a starter has nothing to do, and says so.
  await open();
  await menu.getByRole("button", { name: "Clean up lines" }).click();
  await expect(status).toHaveText("Every line on this play is already clean.");

  // The field select keeps routes true to the yard: depths rescale, the menu stays open for more, Escape closes it.
  await open();
  await menu.getByRole("combobox").first().selectOption("redzone");
  await expect(status).toHaveText("Red zone, routes kept to the yard.");
  await expect(menu).toBeVisible();
  expect((await spots())[1][0]).toBe(524);
  expect((await spots())[1][1]).toBeCloseTo(516.67, 1);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Vs defense lays another play faded under this one, as a guide only.
  await open();
  await menu.getByRole("combobox").nth(1).selectOption({ label: "03 · Mesh" });
  await expect(status).toHaveText("Showing 03 · Mesh under this play. It's only a guide: it won't print or save into the play.");
  await expect(svg.locator('g[opacity="0.36"]')).toHaveCount(1);
  await page.keyboard.press("Escape");

  // Flip and save: a mirrored copy, filed right after the original, opened in the Designer.
  const bookId = (await vault()).playbooks[0].id;
  const was = new URL(page.url()).pathname;
  await open();
  await menu.getByRole("button", { name: "Flip and save as a new play" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/build/") && u.pathname !== was && u.search === `?book=${bookId}`);
  await expect(page.locator(".dz-name")).toHaveText("17 · Stick (flipped)");
  await expect(page.getByText("Saved 17 · Stick (flipped) in Ready-to-Go 5v5 Playbook. You're on the flipped copy now.")).toBeVisible();
  await expect.poll(async () => (await spots()).slice(0, 3).map(([x]) => x)).toEqual([516, 516, 856]);
  const ws = await vault();
  const original = ws.plays.find((p) => p.name === "17 · Stick")!;
  const flipped = ws.plays.find((p) => p.name === "17 · Stick (flipped)")!;
  expect(flipped).toMatchObject({ fieldView: "redzone", isPublic: false, remote: false });
  expect(flipped.scene.view).toBe("redzone");
  const ids = ws.playbooks[0].playIds;
  expect(ids.indexOf(flipped.id)).toBe(ids.indexOf(original.id) + 1);

  // Route depths are kept after a reload.
  await page.reload();
  await svg.waitFor();
  await expect(depths).toHaveCount(3);
  await expect(extras).toHaveClass(/has-dot/);
  expect(errors).toEqual([]);
});
