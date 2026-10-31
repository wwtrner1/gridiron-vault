import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * Auto-connect joins two players with a line that follows them: the first
 * click starts it (a click on the same player again lets go), the second
 * player finishes it, and the line stays glued when either one is moved. A
 * label on the field is renamed by a double-click and Enter, and an emptied
 * box falls back to "Label". Everything is checked in the saved play.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

type Node = { id: string; kind: string; label?: string; text?: string; x: number; y: number; fromId?: string | null; toId?: string | null; points?: { x: number; y: number }[] };

const spotOf = (page: Page, selector: string, text: string) =>
  page.evaluate(
    ([selector, text]) => {
      const g = Array.from(document.querySelectorAll(selector)).find((el) => el.querySelector("text")?.textContent === text) as SVGGElement;
      const box = g.getBBox();
      const p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(g.getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    [selector, text],
  );

test("Auto-connect glues a line between two players, and a double-click renames a label", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const id = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const play = ws.plays.find((p: { name: string }) => /Stick/.test(p.name));
    for (const n of play.scene.nodes) if (n.kind === "player") n.groupId = null;
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    return play.id as string;
  });
  await page.goto(`/build/${id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");
  const save = page.locator('[data-tour="dz-save"]');
  const nodes = async () => (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes as unknown as Node[];
  const saved = async () => {
    await save.click();
    await expect(save).toContainText("Saved");
  };
  const player = (n: Node[], l: string) => n.find((p) => p.kind === "player" && p.label === l)!;
  const spotOfPlayer = (l: string) => spotOf(page, ".stage-frame svg g[data-kind=player]", l);
  const paths0 = (await nodes()).filter((n) => n.kind === "path").length;

  // The line tool: first click starts, the same player again lets go, then X to Y joins them.
  await page.getByRole("tab", { name: "Draw" }).click();
  await page.getByRole("button", { name: "Auto-connect line" }).click();
  const x = await spotOfPlayer("X");
  await page.mouse.click(x.x, x.y);
  await expect(status).toContainText("Started at");
  await page.mouse.click(x.x, x.y);
  await page.mouse.click(x.x, x.y);
  const y = await spotOfPlayer("Y");
  await page.mouse.click(y.x, y.y);
  await expect(status).toContainText("Back to Select"); // the tool is done after one line
  await saved();
  let all = await nodes();
  const link = all.filter((n) => n.kind === "path").slice(paths0)[0];
  expect(all.filter((n) => n.kind === "path")).toHaveLength(paths0 + 1);
  expect(link.fromId).toBe(player(all, "X").id);
  expect(link.toId).toBe(player(all, "Y").id);

  // Drag Y away: the line's far end goes with him.
  const endBefore = link.points![link.points!.length - 1];
  const yNow = await spotOfPlayer("Y");
  await page.mouse.move(yNow.x, yNow.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(yNow.x + i * 6, yNow.y + i * 8);
  await page.mouse.up();
  await saved();
  all = await nodes();
  const moved = all.find((n) => n.id === link.id)!;
  const endAfter = moved.points![moved.points!.length - 1];
  expect(Math.hypot(endAfter.x - endBefore.x, endAfter.y - endBefore.y)).toBeGreaterThan(20);
  expect(moved.fromId).toBe(link.fromId);

  // A label: double-click, type, Enter; then empty it and it reads "Label".
  const label = all.find((n) => n.kind === "text")!;
  const at = await spotOf(page, ".stage-frame svg g[data-kind=text]", label.text!);
  await page.mouse.dblclick(at.x, at.y);
  const box = page.getByRole("textbox", { name: "Label text" });
  await box.fill("Check down");
  await page.keyboard.press("Enter");
  await saved();
  expect((await nodes()).find((n) => n.id === label.id)!.text).toBe("Check down");
  const again = await spotOf(page, ".stage-frame svg g[data-kind=text]", "Check down");
  await page.mouse.dblclick(again.x, again.y);
  await box.fill("   ");
  await page.keyboard.press("Enter");
  await saved();
  expect((await nodes()).find((n) => n.id === label.id)!.text).toBe("Label");
  expect(errors).toEqual([]);
});
