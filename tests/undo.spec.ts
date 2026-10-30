import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

type Node = { id: string; kind: string; x: number; y: number; locked?: boolean; hidden?: boolean };

/** Where each node sits now, from the Designer's safety copy (written a moment after every change). */
const spots = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem("grid1ronvault.draft.v1") ?? "null") as { scene: { nodes: Node[] } } | null;
    return draft ? Object.fromEntries(draft.scene.nodes.map((n) => [n.id, Math.round(n.x)])) : null;
  });

test("Undo takes back a whole drag and Redo puts it back, from the bar and the keyboard", async ({ page }) => {
  const errors = errorsOf(page);
  page.on("dialog", (d) => void d.accept());
  await seedReady(page);
  await page.locator('.play-card button[aria-label^="Open"]').nth(2).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);

  const id = page.url().split("/build/")[1].split(/[?#]/)[0];
  const player = await page.evaluate((pid) => {
    const plays = JSON.parse(localStorage.getItem("snapline.workspace.v1")!).plays as { id: string; scene: { nodes: Node[] } }[];
    return plays.find((p) => p.id === pid)!.scene.nodes.find((n) => n.kind === "player" && !n.locked && !n.hidden)!;
  }, id);
  const at = await page.evaluate(({ x, y }) => {
    const svg = document.querySelector(".stage-frame svg") as SVGSVGElement;
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, player);

  // Drag the player 120 px to the right in small steps, like a coach would.
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(at.x + i * 15, at.y);
  await page.mouse.up();
  await expect.poll(async () => (await spots(page))?.[player.id]).toBeGreaterThan(Math.round(player.x) + 20);
  const moved = (await spots(page))![player.id];

  const undo = page.getByRole("button", { name: "Undo", exact: true }).first();
  const redo = page.getByRole("button", { name: "Redo", exact: true }).first();
  await expect(redo).toBeDisabled();
  await undo.click();
  await expect.poll(async () => (await spots(page))?.[player.id]).toBe(Math.round(player.x));
  await expect(page.locator(".dz-status [role=status]")).toContainText("Undid move");
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(async () => (await spots(page))?.[player.id]).toBe(moved);

  // The keyboard does the same.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await spots(page))?.[player.id]).toBe(Math.round(player.x));
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await spots(page))?.[player.id]).toBe(moved);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await spots(page))?.[player.id]).toBe(moved);
  expect(errors).toEqual([]);
});
