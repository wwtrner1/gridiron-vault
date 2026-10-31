import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Coach tips in the Designer: three clicks on the empty field bring up
 * "Nothing to pick there" (twice, then never again), two presses on a locked
 * player bring up "That one is locked" whose Show Layers opens the Layers
 * list, the first pick of a line tool says what it does (once), Turn off
 * tips puts them away and Extras switches them back on with a clean slate,
 * all kept in grid1ronvault.tips.v1 after a reload.
 */
test.beforeEach(async ({ context }) => quiet(context));

type Node = { id: string; kind: string; x: number; y: number; locked?: boolean; hidden?: boolean; groupId?: string | null };

const tips = (page: import("@playwright/test").Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.tips.v1") ?? "{}") as { off?: boolean; shown?: Record<string, number> });

test("coach tips show for empty clicks, a locked player and a first tool, then switch off and on", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // One player locked before the Designer opens it, so a press on him can be refused.
  const { id, locked } = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const play = ws.plays.find((p: { name: string }) => /Stick/.test(p.name));
    const player = play.scene.nodes.find((n: Node) => n.kind === "player" && !n.hidden && !n.groupId) ?? play.scene.nodes.find((n: Node) => n.kind === "player");
    player.locked = true;
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    return { id: play.id as string, locked: player as Node };
  });
  await page.goto(`/build/${id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const tip = page.locator(".coach-tip");
  const extras = page.locator('button[aria-controls="dz-more-menu"]');
  const menu = page.getByRole("group", { name: "Extras" });

  // Three clicks on empty field in a few seconds: the tip says why nothing happened (the bottom-right corner, clear of the floating tools).
  const emptyClicks = async () => {
    const box = (await svg.boundingBox())!;
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
      await page.waitForTimeout(650);
    }
  };
  await emptyClicks();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute("role", "status");
  await expect(tip.locator(".coach-tip-title")).toHaveText("Nothing to pick there");
  await expect(tip.locator(".coach-tip-text")).toContainText("Clicking empty field only clears the selection.");
  await tip.getByRole("button", { name: "Got it" }).click();
  await expect(tip).toBeHidden();
  expect((await tips(page)).shown).toEqual({ emptyTaps: 1 });

  // It shows a second time, and then never again.
  await emptyClicks();
  await expect(tip.locator(".coach-tip-title")).toHaveText("Nothing to pick there");
  await tip.getByRole("button", { name: "Got it" }).click();
  await emptyClicks();
  await page.waitForTimeout(400);
  await expect(tip).toBeHidden();
  expect((await tips(page)).shown).toEqual({ emptyTaps: 2 });

  // Two presses on the locked player: the tip names the fix and Show Layers opens the list with him in it.
  const at = await page.evaluate(({ x, y }) => {
    const el = document.querySelector(".stage-frame svg") as SVGSVGElement;
    const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, locked);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(400);
  await page.mouse.click(at.x, at.y);
  await expect(tip.locator(".coach-tip-title")).toHaveText("That one is locked");
  await expect(tip.locator(".coach-tip-text")).toContainText("pick it in Layers, then open Details → Arrange → Lock.");
  await tip.getByRole("button", { name: "Show Layers" }).click();
  await expect(tip).toBeHidden();
  await expect(page.getByRole("tab", { name: "Sets" })).toHaveAttribute("aria-selected", "true");
  const layers = page.locator("#dz-list-tray");
  await expect(layers).toBeVisible();
  await expect(layers.locator(".layer-item")).toHaveCount(await page.evaluate((pid) => {
    const plays = JSON.parse(localStorage.getItem("snapline.workspace.v1")!).plays as { id: string; scene: { nodes: Node[] } }[];
    return plays.find((p) => p.id === pid)!.scene.nodes.length;
  }, id));
  expect((await tips(page)).shown).toEqual({ emptyTaps: 2, locked: 1 });

  // The first pick of a line tool says what it does, once.
  await page.getByRole("tab", { name: "Draw" }).click();
  const dashed = page.getByRole("button", { name: "Dashed line with arrow" });
  await dashed.click();
  await expect(tip.locator(".coach-tip-title")).toHaveText("Dashed");
  await expect(tip.locator(".coach-tip-text")).toHaveText("Same drawing action as the route arrow. Use it for the ball flight, motion assignments or man coverage.");
  await tip.getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Solid line with arrow" }).click();
  await expect(tip.locator(".coach-tip-title")).toHaveText("Solid");
  await dashed.click();
  await expect(tip.locator(".coach-tip-title")).toHaveText("Solid");
  expect((await tips(page)).shown).toEqual({ emptyTaps: 2, locked: 1, "tool-dashed": 1, "tool-line": 1 });

  // Turn off tips: the bubble goes, Extras says off, and a new tool brings nothing up.
  await tip.getByRole("button", { name: "Turn off tips" }).click();
  await expect(tip).toBeHidden();
  await extras.click();
  await expect(menu.getByRole("button", { name: "Coach tips: off" })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Blocking line" }).click();
  await page.waitForTimeout(300);
  await expect(tip).toBeHidden();
  expect((await tips(page)).off).toBe(true);

  // Still off after a reload; Extras switches them back on with every tip's count cleared.
  await page.reload();
  await svg.waitFor();
  await extras.click();
  await menu.getByRole("button", { name: "Coach tips: off" }).click();
  expect(await tips(page)).toEqual({ off: false, shown: {} });
  if (!(await menu.count())) await extras.click();
  await expect(menu.getByRole("button", { name: "Coach tips: on" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dashed line with arrow" }).click();
  await expect(tip.locator(".coach-tip-title")).toHaveText("Dashed");
  expect(errors).toEqual([]);
});
