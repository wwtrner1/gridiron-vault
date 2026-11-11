import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * The Designer's tool rail tabs on a blank field: Players drops one token at
 * a time, Sets drops a whole formation (grouped, selected, named in Play
 * intel) and a defense against it, Layers lists and picks what is on the
 * field, and Routes gives a library route to the picked player or loads a
 * tile for the next click. The tab and route set are kept after a reload.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  // Open a blank field straight away, as a coach who switched New play setup off does.
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false })));
});

/** The Style card is pinned over the foot of the rail, so a button near the bottom is reached by scrolling the rail to its end first. */
async function reach(page: Page, button: Locator) {
  await page.locator("#dz-tools").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await button.click();
}

test("the rail's Players, Sets, Layers and Routes tabs build a play on a blank field", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const status = page.locator(".dz-status [role=status]");
  const panel = page.locator("#dz-tabpanel");
  const nodes = svg.locator("g[data-kind]");
  const players = svg.locator("g[data-kind=player]");
  // A picked line also draws a faded halo copy, so count only the lines themselves.
  const paths = svg.locator("g[data-kind=path]:not([pointer-events=none])");
  const selectionTab = page.locator("#insp-tab-selection");
  const transforms = () => players.evaluateAll((els) => els.map((e) => e.getAttribute("transform")?.replace(/ rotate.*$/, "")));
  /** Clicks the field at canvas coordinates, since an armed tile puts a hit area over the players. */
  const at = async (cx: number, cy: number) => {
    const box = (await svg.boundingBox())!;
    await page.mouse.click(box.x + (cx * box.width) / 1040, box.y + (cy * box.height) / 660);
  };

  await expect(status).toHaveText("Drop a formation, then draw the routes. Hover any tool to see how it works.");
  await expect(nodes).toHaveCount(0);

  // Players: the offense tray is open; a token drops at the snap and is selected. Defense has its own tray.
  await page.getByRole("tab", { name: "Players" }).click();
  await expect(panel.getByRole("button", { name: "Offense", exact: true })).toHaveAttribute("aria-expanded", "true");
  const tray = page.locator("#dz-token-tray button");
  await expect(tray).toHaveCount(8);
  await expect(tray.first()).toHaveAttribute("aria-label", "Quarterback");
  await page.getByRole("button", { name: "Receiver X" }).click();
  await expect(status).toHaveText("Receiver X added");
  expect(await transforms()).toEqual(["translate(452 374)"]);
  await expect(selectionTab).toContainText("1");
  await panel.getByRole("button", { name: "Defense", exact: true }).click();
  await expect(tray).toHaveCount(6);
  await page.getByRole("button", { name: "Rusher" }).click();
  await expect(status).toHaveText("Rusher added");
  await expect(players).toHaveCount(2);

  // Sets → Formations: the preview names the pick; Drop lands the five, selected, with the note and the formation filled in.
  await page.getByRole("tab", { name: "Sets" }).click();
  await panel.getByRole("button", { name: "Formations" }).click();
  await expect(page.locator("#dz-list-tray [role=group] button")).toHaveText(["5v5 flag", "7v7", "11-man", "As drawn", "Flipped"]);
  await expect(page.getByRole("img", { name: "5v5 flag Trips Right" })).toBeVisible();
  await reach(page, page.getByRole("button", { name: "Drop Trips Right" }));
  await expect(status).toHaveText("Three receivers to the right — floods a third of the field fast.");
  await expect(players).toHaveCount(7);
  expect((await transforms()).slice(2)).toEqual(["translate(520 438)", "translate(520 490)", "translate(920 438)", "translate(810 464)", "translate(720 438)"]);
  await expect(selectionTab).toContainText("5");
  await page.locator("#insp-tab-play").click();
  await expect(page.locator('label.field:has(span:text-is("Formation")) select')).toHaveValue("Trips Right");
  await page.locator("#insp-tab-selection").click();

  // Layers: everything on the field, top first, the five picked; one click picks one.
  await panel.getByRole("button", { name: /^Layers/ }).click();
  await expect(panel.getByRole("button", { name: /^Layers/ })).toContainText("7");
  const layers = page.locator("#dz-list-tray button");
  await expect(layers).toHaveText(["Receiver Y", "Second back / wing (S)", "Receiver Z", "Quarterback", "Center", "Rusher", "Receiver X"]);
  await expect(page.locator("#dz-list-tray button[aria-pressed=true]")).toHaveCount(5);
  await layers.filter({ hasText: "Receiver Z" }).click();
  await expect(page.locator("#dz-list-tray button[aria-pressed=true]")).toHaveText(["Receiver Z"]);
  await expect(selectionTab).toContainText("1");

  // Routes: a tile goes to the picked player; with nobody picked it loads and the next click gives it.
  await page.getByRole("tab", { name: "Routes" }).click();
  const tiles = page.locator(".rl-tile");
  await expect(tiles).toHaveCount(15);
  await expect(tiles.nth(6)).toHaveAttribute("aria-label", "7 Corner");
  await expect(tiles.last()).toHaveAttribute("aria-label", "Rush (defenders)");
  await tiles.nth(6).click();
  await expect(status).toHaveText("Corner for Z.");
  await expect(paths).toHaveCount(1);
  await expect(paths.first()).toHaveAttribute("transform", /^translate\(920 438\)/);
  await expect(paths.first().locator("path").first()).toHaveAttribute("d", "M 0 0 L 0 -120 L 104 -234");
  await at(44, 632);
  await expect(selectionTab).not.toContainText("1");
  const go = tiles.filter({ hasText: "Go" });
  await go.click();
  await expect(status).toHaveText("Go loaded. Click a player to give it to him, or click the field to drop it there.");
  await expect(go).toHaveAttribute("aria-pressed", "true");
  await at(810, 464);
  await expect(status).toHaveText("Go for S.");
  await expect(paths).toHaveCount(2);
  await expect(go).toHaveAttribute("aria-pressed", "false");
  const motion = tiles.filter({ hasText: "Motion" });
  await motion.click();
  await expect(motion).toHaveAttribute("aria-pressed", "true");
  await motion.click();
  await expect(motion).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+z");
  await expect(paths).toHaveCount(1);
  await page.getByRole("button", { name: "5v5 set" }).click();
  await expect(tiles.first()).toHaveAttribute("aria-label", "Bubble");

  // Sets → Defense: a front and coverage line up against the offense.
  await page.getByRole("tab", { name: "Sets" }).click();
  await panel.getByRole("button", { name: "Defense", exact: true }).click();
  const picks = page.locator("#dz-list-tray select");
  await expect(picks.nth(0)).toHaveValue("4-3");
  await expect(picks.nth(1)).toHaveValue("Cover 3");
  await picks.nth(1).selectOption("Man");
  await reach(page, page.getByRole("button", { name: "Drop 4-3 Man" }));
  await expect(status).toContainText("4-3 Man");
  await expect(players).toHaveCount(18);

  // The tab and the route set are kept.
  await page.reload();
  await svg.waitFor();
  await expect(page.locator("#dz-tab-sets")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Routes" }).click();
  await expect(page.getByRole("button", { name: "5v5 set" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
