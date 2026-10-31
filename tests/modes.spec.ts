import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The rail's modes (the Modes toolbar): Multi-select adds and removes a
 * player per click and a box dragged on empty field picks what it covers
 * (Shift does the same from plain Select); Duplicate pulls a copy out of a
 * dragged player and leaves the original; Click-through grabs one player of
 * a group where Select takes the group; Rotate spins a picked player (Shift
 * snapping to 15°); Scale grows him away from the anchor picked in the grid.
 * A mode picked again is off, and every change lands in the saved play.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

type Player = { id: string; kind: string; label?: string; x: number; y: number; rotation: number; scaleX: number; scaleY: number; groupId?: string | null };

const playerSpot = (page: Page, letter: string) =>
  page.evaluate((letter) => {
    const g = Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=player]")).find((el) => el.querySelector("text")?.textContent === letter) as SVGGElement;
    const box = g.getBBox();
    const p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(g.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, letter);

const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
};

test("Multi-select, Duplicate, Click-through, Rotate and Scale each change what a click or drag does", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // X, Y and Z on their own; Q and C stay one group, for Click-through.
  const id = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const play = ws.plays.find((p: { name: string }) => /Stick/.test(p.name));
    for (const n of play.scene.nodes) if (n.kind === "player" && ["X", "Y", "Z"].includes(n.label)) n.groupId = null;
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    return play.id as string;
  });
  await page.goto(`/build/${id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const modes = page.getByRole("toolbar", { name: "Modes" });
  const mode = (name: string) => modes.getByRole("button", { name, exact: true });
  const status = page.locator(".dz-status [role=status]");
  const target = page.locator(".dz-style-target");
  const save = page.locator('[data-tour="dz-save"]');
  const players = async () => (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes.filter((n) => (n as unknown as Player).kind === "player") as unknown as Player[];
  const byLabel = async (l: string) => (await players()).find((p) => p.label === l)!;
  const x = await playerSpot(page, "X");
  const y = await playerSpot(page, "Y");
  const z = await playerSpot(page, "Z");
  const q = await playerSpot(page, "Q");
  const box = (await svg.boundingBox())!;
  const empty = { x: box.x + box.width - 30, y: box.y + box.height - 30 };

  // Select: a click picks one; a second click elsewhere swaps. Shift-click adds without leaving Select.
  await expect(mode("Select")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(x.x, x.y);
  await expect(target).toHaveText("1 player");
  await page.mouse.click(y.x, y.y);
  await expect(target).toHaveText("1 player");
  await page.keyboard.down("Shift");
  await page.mouse.click(z.x, z.y);
  await page.keyboard.up("Shift");
  await expect(target).toHaveText("2 players");
  await page.mouse.click(empty.x, empty.y);
  await expect(target).toHaveText("Next line");

  // Multi-select: each click adds, a click on a picked player takes him out, and a box picks what it covers.
  await mode("Multi").click();
  await expect(mode("Multi")).toHaveAttribute("aria-pressed", "true");
  await expect(mode("Select")).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(x.x, x.y);
  await page.mouse.click(y.x, y.y);
  await page.mouse.click(z.x, z.y);
  await expect(target).toHaveText("3 players");
  await page.mouse.click(y.x, y.y);
  await expect(target).toHaveText("2 players");
  await page.mouse.click(empty.x, empty.y);
  await expect(target).toHaveText("2 players");
  await drag(page, { x: x.x - 40, y: x.y - 40 }, { x: x.x + 40, y: x.y + 40 });
  await expect(status).toHaveText("2 elements selected.");
  await mode("Multi").click();
  await expect(mode("Multi")).toHaveAttribute("aria-pressed", "false");
  await expect(mode("Select")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(empty.x, empty.y);
  await drag(page, { x: x.x - 40, y: x.y - 40 }, { x: x.x + 40, y: x.y + 40 });
  await expect(status).toHaveText("1 element selected.");
  await expect(target).toHaveText("1 player");
  await page.mouse.click(empty.x, empty.y);

  // Click-through: Select takes Q with his group; Click-through takes Q alone.
  await page.mouse.click(q.x, q.y);
  await expect(target).toHaveText("2 players");
  await page.mouse.click(empty.x, empty.y);
  await mode("Click-thru").click();
  await page.mouse.click(q.x, q.y);
  await expect(target).toHaveText("1 player");
  await mode("Click-thru").click();
  await page.mouse.click(empty.x, empty.y);

  // Duplicate: dragging X pulls a copy out and leaves him where he was.
  const count = await svg.locator("g[data-kind=player]").count();
  await mode("Duplicate").click();
  await drag(page, x, { x: x.x + 120, y: x.y + 60 });
  await expect(svg.locator("g[data-kind=player]")).toHaveCount(count + 1);
  await expect(target).toHaveText("1 player");
  await mode("Duplicate").click();
  await save.click();
  await expect(save).toHaveText(/Saved/);
  const xs = (await players()).filter((p) => p.label === "X").sort((a, b) => a.x - b.x);
  expect(xs).toHaveLength(2);
  expect(xs[1].x - xs[0].x).toBeGreaterThan(80);
  expect(xs[1].y - xs[0].y).toBeGreaterThan(30);

  // Rotate: a drag around Z spins him; with Shift the turn snaps to 15° steps.
  await mode("Rotate").click();
  await page.mouse.click(z.x, z.y);
  await page.keyboard.down("Shift");
  // The press starts on Z (just right of his centre, angle 0) and ends 100° round; Shift rounds that to 105.
  const turn = (100 * Math.PI) / 180;
  await drag(page, { x: z.x + 12, y: z.y }, { x: z.x + 40 * Math.cos(turn), y: z.y + 40 * Math.sin(turn) });
  await page.keyboard.up("Shift");
  await mode("Rotate").click();
  await save.click();
  await expect(save).toHaveText(/Saved/);
  const turned = (await byLabel("Z")).rotation;
  expect(turned).toBe(105);

  // Scale: the anchor grid shows, the top-left dot is picked, and a drag away from it grows Y.
  await page.mouse.click(y.x, y.y);
  await mode("Scale").click();
  const grid = page.locator(".anchor-grid");
  await expect(grid.getByRole("button", { name: "Anchor at middle centre" })).toHaveAttribute("aria-pressed", "true");
  await grid.getByRole("button", { name: "Anchor at top left" }).click();
  await expect(grid.getByRole("button", { name: "Anchor at top left" })).toHaveAttribute("aria-pressed", "true");
  await drag(page, { x: y.x + 10, y: y.y + 10 }, { x: y.x + 40, y: y.y + 40 });
  await mode("Scale").click();
  await expect(grid).toBeHidden();
  await save.click();
  await expect(save).toHaveText(/Saved/);
  const grown = await byLabel("Y");
  expect(grown.scaleX).toBeGreaterThan(1.3);
  expect(grown.scaleY).toBeGreaterThan(1.3);
  expect(errors).toEqual([]);
});
