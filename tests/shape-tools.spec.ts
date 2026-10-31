import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The Designer's drawing tools beyond the route arrow, picked from the Draw
 * tab: Rectangle and Ellipse dragged out on empty field, Polygon closed on its
 * first corner, a Coverage zone ended with Enter, Freehand traced by a drag,
 * a Text label dropped by a click and typed over, and the Pivot point. Each
 * one lands in the saved play with the shape it was drawn as.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

type Node = { kind: string; shapeType?: string; w?: number; h?: number; closed?: boolean; points?: unknown[]; curve?: string; text?: string; style?: string };

test("Rectangle, Ellipse, Polygon, Coverage zone, Freehand, Text and Pivot each draw what they say", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const id = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    return ws.plays.find((p: { name: string }) => /Stick/.test(p.name)).id as string;
  });
  await page.goto(`/build/${id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const box = (await svg.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const status = page.locator(".dz-status [role=status]");
  const save = page.locator('[data-tour="dz-save"]');
  const nodes = async () => (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes as unknown as Node[];
  const saved = async () => {
    await save.click();
    await expect(save).toContainText("Saved");
  };
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
    await page.mouse.up();
  };
  const pick = async (name: string) => {
    await page.getByRole("tab", { name: "Draw" }).click();
    await page.getByRole("button", { name }).first().click();
  };
  const before = (await nodes()).length;

  await pick("Rectangle");
  await drag(at(0.6, 0.78), at(0.75, 0.9));
  await pick("Ellipse");
  await drag(at(0.8, 0.78), at(0.95, 0.9));
  await saved();
  const shapes = (await nodes()).filter((n) => n.kind === "shape");
  expect(shapes.map((s) => s.shapeType)).toEqual(["rect", "ellipse"]);
  for (const s of shapes) expect(s.w!).toBeGreaterThan(40);
  // Polygon: three corners, closed by clicking back on the first.
  await pick("Polygon tool");
  for (const [fx, fy] of [[0.62, 0.55], [0.72, 0.55], [0.67, 0.65], [0.62, 0.55]]) await page.mouse.click(at(fx, fy).x, at(fx, fy).y);
  // Coverage zone: click the corners, Enter ends it as a closed spline.
  await pick("Coverage zone");
  for (const [fx, fy] of [[0.8, 0.5], [0.92, 0.5], [0.92, 0.65], [0.8, 0.65]]) await page.mouse.click(at(fx, fy).x, at(fx, fy).y);
  await page.keyboard.press("Enter");
  // Freehand: a drag is the line.
  await pick("Free-style line");
  await drag(at(0.4, 0.8), at(0.52, 0.92));
  // Text: a click drops a label already open for typing.
  await pick("Text label");
  await page.mouse.click(at(0.4, 0.6).x, at(0.4, 0.6).y);
  await page.getByRole("textbox", { name: "Label text" }).fill("Hot route");
  await page.keyboard.press("Enter");
  // Pivot point.
  await page.keyboard.press("8");
  await page.mouse.click(at(0.5, 0.7).x, at(0.5, 0.7).y);
  await expect(status).toContainText("Pivot dropped");
  await saved();
  const after = await nodes();
  const paths = after.filter((n) => n.kind === "path").slice(-3);
  expect(paths.map((n) => n.closed)).toEqual([true, true, false]);
  expect(paths[0].points).toHaveLength(4); // the three corners and the first again
  expect(paths[1].curve).toBe("spline");
  expect(paths[2].curve).toBe("spline");
  expect(after.filter((n) => n.kind === "text").map((n) => n.text)).toContain("Hot route");
  const scene = (await workspace(page)).plays!.find((p) => p.id === id)!.scene as unknown as { pivot: { x: number; y: number } | null };
  expect(scene.pivot).not.toBeNull();
  expect(after.length).toBeGreaterThan(before + 5);
  expect(errors).toEqual([]);
});
