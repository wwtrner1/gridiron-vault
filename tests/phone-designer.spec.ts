import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The Designer on a phone (Pixel 7, touch): the thumb bar's Route starts a
 * line, three finger taps place its points, Finish line ends it, and Save
 * keeps it; Players slides the tools sheet up on the token tray, Done puts
 * it away, and a token pick drops a player and steps the sheet aside.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

test("a route drawn with taps and the Players sheet on a phone @phone", async ({ page }, testInfo) => {
  // The desktop project runs every test too; the thumb bar and sheet only exist at phone width.
  test.skip(testInfo.project.name !== "phone", "needs the phone project");
  const errors = errorsOf(page);
  await seedReady(page);
  const { id, paths } = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const play = ws.plays.find((p: { name: string }) => /Stick/.test(p.name));
    return { id: play.id as string, paths: play.scene.nodes.filter((n: { kind: string }) => n.kind === "path").length as number };
  });
  await page.goto(`/build/${id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(400);
  const dock = page.getByRole("navigation", { name: "Quick tools" });
  const tools = page.locator("#dz-tools");
  const save = page.locator('[data-tour="dz-save"]');
  const nodes = async () => (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes as unknown as { kind: string; points?: unknown[]; style?: string }[];

  // The sheet starts away; Route is on after a tap, and three taps on empty field make a line.
  await expect(dock.getByRole("button", { name: "Tools" })).toHaveAttribute("aria-expanded", "false");
  await dock.getByRole("button", { name: "Route" }).tap();
  await expect(dock.getByRole("button", { name: "Route" })).toHaveAttribute("aria-pressed", "true");
  const box = (await svg.boundingBox())!;
  // A second tap within a third of a second and 30px ends a line (the double-tap), so each tap waits.
  const tapAt = async (fx: number, fy: number) => {
    await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(450);
  };
  for (const [fx, fy] of [[0.35, 0.85], [0.5, 0.75], [0.8, 0.8]]) await tapAt(fx, fy);
  const line = page.getByRole("group", { name: "Line being drawn" });
  await expect(line.getByRole("button", { name: /Finish line/ })).toBeEnabled();
  await line.getByRole("button", { name: /Undo point/ }).tap();
  await tapAt(0.65, 0.85);
  await line.getByRole("button", { name: /Finish line/ }).tap();
  await expect(line).toHaveCount(0);
  await save.tap();
  await expect(save).toContainText("Saved");
  const after = (await nodes()).filter((n) => n.kind === "path");
  expect(after).toHaveLength(paths + 1);
  expect(after[after.length - 1].points).toHaveLength(3);

  // Players slides the sheet up on the token tray.
  await dock.getByRole("button", { name: "Players" }).tap();
  await expect(tools).toBeVisible();
  await expect(page.locator("#dz-token-tray")).toBeVisible();
  await expect(dock.getByRole("button", { name: "Tools" })).toHaveAttribute("aria-expanded", "true");
  // Done puts it away; a token picked from the tray drops on the field and the sheet steps aside by itself.
  await tools.getByRole("button", { name: "Done" }).tap();
  await expect(dock.getByRole("button", { name: "Tools" })).toHaveAttribute("aria-expanded", "false");
  const players = svg.locator("g[data-kind=player]");
  const before = await players.count();
  await dock.getByRole("button", { name: "Players" }).tap();
  await page.locator("#dz-token-tray button").first().tap();
  await expect(players).toHaveCount(before + 1);
  await expect(dock.getByRole("button", { name: "Tools" })).toHaveAttribute("aria-expanded", "false");
  expect(errors).toEqual([]);
});
