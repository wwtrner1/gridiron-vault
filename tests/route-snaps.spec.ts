import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The route menu's Clean up and Snap moves and the player menu's exchanges:
 * Snap to nearest player glues a loose route to the closest player, Extend to
 * the sideline runs a diagonal's last leg to the sideline (and says why a
 * vertical one can't), Stop at the line of scrimmage cuts a line where it
 * crosses, Bend around players adds a turn around a player in the way, each
 * with its status line, Undo putting the line back and Save keeping the
 * result; Hand off from Q to a clicked player draws a line glued to both,
 * Pitch from Q to a spot ends on the field, and Escape puts a loaded one away.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

type Path = { id: string; kind: string; name?: string; x: number; y: number; points: { x: number; y: number }[]; fromId: string | null; toId: string | null; style?: string };
type Player = { id: string; kind: string; label?: string; x: number; y: number; groupId?: string | null };

/** The play's nodes as last saved. */
const saved = async (page: Page, id: string) => (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes as unknown as (Path | Player)[];

/** Screen spot part-way (the middle unless told) along the path group drawn n-th from the end. */
const pathSpot = (page: Page, fromEnd: number, along = 0.5) =>
  page.evaluate(([fromEnd, along]) => {
    const groups = Array.from(document.querySelectorAll('.stage-frame svg g[data-kind=path]:not([pointer-events="none"])'));
    const el = groups[groups.length - fromEnd].querySelector('path[fill="none"]') as SVGPathElement;
    const p = el.getPointAtLength(el.getTotalLength() * along).matrixTransform(el.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, [fromEnd, along]);

const playerSpot = (page: Page, letter: string) =>
  page.evaluate((letter) => {
    const g = Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=player]")).find((el) => el.querySelector("text")?.textContent === letter) as SVGGElement;
    const box = g.getBBox();
    const p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(g.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, letter);

test("Snap to nearest player, Extend to the sideline, Stop at the line and Bend around players fix a line each, with Undo and Save", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // Four lines drawn by hand onto Stick, each with one thing wrong: loose beside X, a diagonal short of the
  // sideline, a line across the line of scrimmage, and one straight through Z.
  const seed = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const play = ws.plays.find((p: { name: string }) => /Stick/.test(p.name));
    const by = (l: string) => play.scene.nodes.find((n: { kind: string; label?: string }) => n.kind === "player" && n.label === l);
    const x = by("X");
    const z = by("Z");
    const line = (id: string, name: string, pts: { x: number; y: number }[], z: number) => ({
      id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, z, groupId: null, locked: false, hidden: false, name,
      kind: "path", points: pts, handles: {}, style: "solid", curve: "straight", startCap: "none", endCap: "arrow",
      stroke: "#0B1524", width: 3.4, closed: false, fill: "none", fillOpacity: 0.16, fromId: null, toId: null,
    });
    play.scene.nodes.push(
      line("p_loose", "Loose", [{ x: x.x + 40, y: x.y }, { x: x.x + 40, y: x.y - 160 }], 1001),
      line("p_diag", "Diagonal", [{ x: 520, y: 560 }, { x: 620, y: 510 }], 1002),
      line("p_cross", "Across", [{ x: 300, y: play.scene.losY + 100 }, { x: 300, y: play.scene.losY - 100 }], 1003),
      line("p_through", "Through", [{ x: z.x, y: z.y + 150 }, { x: z.x, y: z.y - 150 }], 1004),
    );
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    return { id: play.id as string, xId: x.id as string, losY: play.scene.losY as number };
  });
  await page.goto(`/build/${seed.id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");
  const menu = page.getByRole("menu", { name: "Selected element" });
  const undo = page.getByRole("group", { name: "Undo and redo" }).getByRole("button", { name: "Undo" });
  const save = page.locator('[data-tour="dz-save"]');
  const path = async (id: string) => (await saved(page, seed.id)).find((n) => n.id === id) as Path;
  const open = async (fromEnd: number, along = 0.5) => {
    const at = await pathSpot(page, fromEnd, along);
    await page.mouse.click(at.x, at.y, { button: "right" });
    await expect(menu).toBeVisible();
  };

  // The loose line: Snap to nearest player moves its start onto X and glues it to him; Undo lets go; again, then Save keeps it.
  await open(4);
  await menu.getByRole("menuitem", { name: "Snap to nearest player" }).click();
  await expect(status).toHaveText("Snapped to X. The route now moves with him.");
  await undo.click();
  await open(4);
  await menu.getByRole("menuitem", { name: "Snap to nearest player" }).click();
  await save.click();
  await expect(save).toHaveText(/Saved/);
  const loose = await path("p_loose");
  expect(loose.fromId).toBe(seed.xId);
  expect(loose.x).toBeCloseTo(-40, 0);
  // Glued to a player, the line is no longer loose: that move is gone from its menu.
  await open(4);
  await expect(menu.getByRole("menuitem", { name: "Snap to nearest player" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The diagonal: Extend to the sideline runs its last leg on to the right sideline.
  await open(3);
  await menu.getByRole("menuitem", { name: "Extend to the sideline" }).click();
  await expect(status).toHaveText("Ran 1 line on to the sideline. Undo puts it back.");
  await save.click();
  await expect(save).toHaveText(/Saved/);
  const diag = await path("p_diag");
  expect(diag.points[1]).toEqual({ x: 1000, y: 320 });

  // The line across the line of scrimmage: cut where it crosses; a vertical line has no sideline to reach.
  await open(2);
  await menu.getByRole("menuitem", { name: "Extend to the sideline" }).click();
  await expect(status).toHaveText("Nothing to extend: a route has to be heading toward a sideline, not straight up the field.");
  await open(2);
  await menu.getByRole("menuitem", { name: "Stop at the line of scrimmage" }).click();
  await expect(status).toHaveText("Cut 1 line off at the line of scrimmage. Undo puts it back.");
  await save.click();
  await expect(save).toHaveText(/Saved/);
  const cross = await path("p_cross");
  expect(cross.points).toEqual([{ x: 300, y: seed.losY + 100 }, { x: 300, y: seed.losY }]);
  await open(2);
  await menu.getByRole("menuitem", { name: "Stop at the line of scrimmage" }).click();
  await expect(status).toHaveText("That line doesn't cross the line of scrimmage, so there's nothing to cut.");

  // The line through Z (picked short of him, since its middle is Z himself): Bend around players puts a turn just outside him; Undo takes it out.
  await open(1, 0.2);
  await menu.getByRole("menuitem", { name: "Bend around players" }).click();
  await expect(status).toHaveText("Bent 1 line around the players in the way. Undo puts it back.");
  await save.click();
  await expect(save).toHaveText(/Saved/);
  expect((await path("p_through")).points.length).toBeGreaterThan(2);
  await undo.click();
  await open(1, 0.2);
  await menu.getByRole("menuitem", { name: "Bend around players" }).click();
  await expect(status).toContainText("Bent 1 line");
  await save.click();
  await expect(save).toHaveText(/Saved/);
  // The loose one, cut short of any player, has nothing to bend around.
  await open(4);
  await menu.getByRole("menuitem", { name: "Bend around players" }).click();
  await expect(status).toHaveText("That line doesn't run through anyone. Nothing to bend.");
  expect(errors).toEqual([]);
});

test("Hand off from Q to a clicked player and Pitch from Q to a spot draw the exchange; Escape puts a loaded one away", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // The starter's players are one group; Q and Y on their own, so a right-click picks one player.
  const seed = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const play = ws.plays.find((p: { name: string }) => /Stick/.test(p.name));
    const by = (l: string) => play.scene.nodes.find((n: { kind: string; label?: string }) => n.kind === "player" && n.label === l);
    by("Q").groupId = null;
    by("Y").groupId = null;
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    return { id: play.id as string, q: by("Q").id as string, y: by("Y").id as string };
  });
  await page.goto(`/build/${seed.id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");
  const menu = page.getByRole("menu", { name: "Selected element" });
  const save = page.locator('[data-tour="dz-save"]');
  // A picked player's routes are drawn a second time as a highlight (no pointer events), so count only the real ones.
  const lines = svg.locator('g[data-kind=path]:not([pointer-events="none"])');
  const paths = await lines.count();
  const q = await playerSpot(page, "Q");
  const y = await playerSpot(page, "Y");

  // Hand off from Q, then a click on Y: one line glued to both, named for them.
  await page.mouse.click(q.x, q.y, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Hand off from Q" }).click();
  await expect(status).toHaveText("Handoff from Q. Now click who gets it, or a spot on the field. Esc cancels.");
  await page.mouse.click(y.x, y.y);
  await expect(status).toHaveText("Handoff from Q to Y. It follows them when they move.");
  await expect(lines).toHaveCount(paths + 1);
  await save.click();
  await expect(save).toHaveText(/Saved/);
  const handoff = (await saved(page, seed.id)).find((n) => n.kind === "path" && (n as Path).name === "Handoff Q to Y") as Path;
  expect(handoff).toBeTruthy();
  expect(handoff.fromId).toBe(seed.q);
  expect(handoff.toId).toBe(seed.y);
  expect(handoff.style).toBe("solid");

  // Pitch from Q to a spot on the field: a dashed line from Q that ends there.
  await page.mouse.click(q.x, q.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "Pitch from Q" }).click();
  await expect(status).toHaveText("Pitch from Q. Now click who gets it, or a spot on the field. Esc cancels.");
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60);
  await expect(status).toHaveText("Pitch from Q. It follows them when they move.");
  await expect(lines).toHaveCount(paths + 2);
  await save.click();
  await expect(save).toHaveText(/Saved/);
  const pitch = (await saved(page, seed.id)).find((n) => n.kind === "path" && (n as Path).name === "Pitch Q to spot") as Path;
  expect(pitch).toBeTruthy();
  expect(pitch.fromId).toBe(seed.q);
  expect(pitch.toId).toBeNull();
  expect(pitch.style).toBe("dashed");

  // A loaded exchange is put away by Escape, and the field menu offers to put it away too.
  await page.mouse.click(q.x, q.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "Hand off from Q" }).click();
  await expect(status).toContainText("Handoff from Q. Now click");
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30, { button: "right" });
  await expect(page.getByRole("menu", { name: "Tools" }).getByRole("menuitem").first()).toHaveText("Put away Handoff");
  await page.keyboard.press("Escape");
  await page.mouse.click(q.x, q.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "Hand off from Q" }).click();
  await page.keyboard.press("Escape");
  await expect(status).toHaveText("Route put away.");
  await page.mouse.click(y.x, y.y);
  await expect(lines).toHaveCount(paths + 2);
  expect(errors).toEqual([]);
});
