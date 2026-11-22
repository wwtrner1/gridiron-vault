import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { errorsOf, menuButton, quiet, seedReady, workspace } from "./helpers";

/**
 * The sides of the ball: Flip sides (the Field menu, the chip in the field's corner and the right-click menu)
 * turns the whole play half a circle about the middle of the card on every field, so the defense sits at the
 * bottom (and back), routes and blocks go with their players, and New play setup opens a defense at the bottom.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

const spots = (page: Page) =>
  page.locator(".stage-frame svg g[data-kind=player]").evaluateAll((els) =>
    els.map((e) => {
      const m = /translate\(([\d.-]+)[ ,]([\d.-]+)\)/.exec(e.getAttribute("transform") ?? "");
      return [Number(m?.[1]), Number(m?.[2])];
    }),
  );

type DraftNode = { id: string; kind: string; side?: string; label?: string; size?: number; x: number; y: number; scaleX: number; scaleY: number; rotation: number; points?: { x: number; y: number }[]; assignOf?: string; fromId?: string | null };
type DraftScene = { pov?: string; losY: number; view: string; nodes: DraftNode[] };

/** The unsaved scene the Designer keeps a moment after each edit. */
const draft = async (page: Page): Promise<DraftScene> => {
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem("grid1ronvault.draft.v1"))).toBe(true);
  return page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.draft.v1")!).scene);
};

const field = (setup: Locator, name: string) => setup.locator(`label.field:has(span:text-is("${name}")) select`);

test("Flip sides turns the play half a circle, back again, and Save keeps it", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const before = await spots(page);
  expect(before.length).toBeGreaterThan(4);

  const extras = menuButton(page, "field");
  await extras.click();
  await page.locator("#dz-menu-field").getByRole("button", { name: "Flip sides: defense to the bottom" }).click();
  const after = await spots(page);
  // Half a circle about the middle of the card: across the field and back to front.
  after.forEach(([x, y], i) => {
    expect(x).toBeCloseTo(1040 - before[i][0], 0);
    expect(y).toBeCloseTo(660 - before[i][1], 0);
  });
  // The play is turned, but every letter still reads upright (the coach's view, not the field's).
  const upright = await svg.evaluate((el) =>
    [...el.querySelectorAll('g[data-kind="player"] text, g[data-kind="text"] text')].map((t) => {
      const m = (t as SVGGraphicsElement).getScreenCTM();
      return m ? m.d > 0 : true;
    }),
  );
  expect(upright.length).toBeGreaterThan(4);
  expect(upright.every(Boolean)).toBe(true);

  // The button reads the other way and a second press puts everything back.
  await extras.click();
  await page.locator("#dz-menu-field").getByRole("button", { name: "Flip sides: offense to the bottom" }).click();
  (await spots(page)).forEach(([x, y], i) => {
    expect(x).toBeCloseTo(before[i][0], 0);
    expect(y).toBeCloseTo(before[i][1], 0);
  });

  // The chip in the field's corner does the same, and a turned play saved comes back turned.
  await page.getByRole("button", { name: "Flip sides", exact: true }).click();
  const save = page.locator('[data-tour="dz-save"]');
  await save.click();
  await expect(save).toHaveText(/Saved/);
  await expect.poll(async () => ((await workspace(page)).plays!.find((p) => /Stick/.test(p.name))!.scene as unknown as { pov?: string }).pov).toBe("defense");
  expect(errors).toEqual([]);
});

test("every route and block goes with its player when the sides flip", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  await menuButton(page, "field").click();
  await page.locator("#dz-menu-field").getByRole("button", { name: "Flip sides: defense to the bottom" }).click();
  const turned = await draft(page);
  expect(turned.pov).toBe("defense");

  const players = turned.nodes.filter((n) => n.kind === "player");
  const paths = turned.nodes.filter((n) => n.kind === "path" && (n.points?.length ?? 0) > 1);
  expect(paths.length).toBeGreaterThan(2);
  const world = (n: DraftNode, p: { x: number; y: number }) => {
    const r = (n.rotation * Math.PI) / 180;
    const sx = p.x * n.scaleX;
    const sy = p.y * n.scaleY;
    return { x: n.x + sx * Math.cos(r) - sy * Math.sin(r), y: n.y + sx * Math.sin(r) + sy * Math.cos(r) };
  };
  for (const path of paths) {
    const start = world(path, path.points![0]);
    const owner = players.find((p) => p.id === (path.assignOf ?? path.fromId));
    const nearest = (owner ? [owner] : players).reduce((best, p) => Math.min(best, Math.hypot(p.x - start.x, p.y - start.y)), Infinity);
    expect(nearest, `a ${path.id} line still starts on its player`).toBeLessThan(45);
  }
  // The play's own routes run toward the defense: down the card, now that the defense is at the bottom.
  const down = paths.filter((p) => p.points!.length > 1).map((p) => world(p, p.points![p.points!.length - 1]).y - world(p, p.points![0]).y);
  expect(down.filter((d) => d > 0).length).toBeGreaterThan(down.length / 2);
  expect(errors).toEqual([]);
});

test("the red zone field turns round too", async ({ page, context }) => {
  const errors = errorsOf(page);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false, view: "redzone" })));
  await page.goto("/build");
  await page.locator(".stage-frame svg").first().waitFor();
  await menuButton(page, "field").click();
  await page.locator("#dz-menu-field select.dz-top-select").first().selectOption("redzone");
  const flip = page.locator("#dz-menu-field").getByRole("button", { name: "Flip sides: defense to the bottom" });
  await expect(flip).toBeEnabled();
  await flip.click();
  const turned = await draft(page);
  expect(turned.view).toBe("redzone");
  expect(turned.pov).toBe("defense");
  expect(errors).toEqual([]);
});

test("New play setup asks which end to draw from, and opens the offense above the line when it is the defense's", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  const dialog = page.getByRole("dialog", { name: "New play" });
  const group = dialog.getByRole("group", { name: "Draw it from" });
  await expect(group.getByRole("button", { name: "The offense's end" })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "The defense's end" }).click();
  await expect(group.getByRole("button", { name: "The defense's end" })).toHaveAttribute("aria-pressed", "true");

  // The red zone and flag fields can be drawn from the defense's end now too.
  await field(dialog, "Field").selectOption("redzone");
  await expect(group.getByRole("button", { name: "The defense's end" })).toBeEnabled();
  await expect(group.getByRole("button", { name: "The defense's end" })).toHaveAttribute("aria-pressed", "true");
  await field(dialog, "Field").selectOption("half");

  // The field opens turned about the middle of the card: the quarterback, 70 below the line, now stands 70 above it.
  await dialog.getByRole("button", { name: "Open the field" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  const ys = (await spots(page)).map(([, y]) => y);
  expect(Math.max(...ys)).toBeLessThanOrEqual(241);
  expect(Math.min(...ys)).toBeCloseTo(170, -1);
  await page.reload();
  // The pick is remembered for the next play.
  await expect(page.getByRole("dialog", { name: "New play" }).getByRole("button", { name: "The defense's end" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("picking a defense in New play setup puts the defense at the bottom, with letters as large as the offense's", async ({ page }) => {
  const errors = errorsOf(page);
  for (const personnel of ["Base 4-3", "7v7 defense", "5-on-5 defense"]) {
    await page.goto("/build");
    const dialog = page.getByRole("dialog", { name: "New play" });
    await field(dialog, "Personnel").selectOption(personnel);
    // A defense is drawn from the defense's end unless the coach says otherwise.
    await expect(dialog.getByRole("group", { name: "Draw it from" }).getByRole("button", { name: "The defense's end" })).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Open the field" }).click();
    await page.locator(".stage-frame svg").first().waitFor();
    const scene = await draft(page);
    expect(scene.pov, personnel).toBe("defense");
    const defenders = scene.nodes.filter((n) => n.kind === "player" && n.side === "defense");
    const offense = scene.nodes.filter((n) => n.kind === "player" && n.side === "offense");
    expect(defenders.length, `${personnel} defenders`).toBeGreaterThanOrEqual(5);
    expect(offense.length, `${personnel} scout offense`).toBeGreaterThanOrEqual(5);
    const mean = (xs: DraftNode[]) => xs.reduce((a, n) => a + n.y, 0) / xs.length;
    expect(mean(defenders), `${personnel}: the defense is below the line`).toBeGreaterThan(scene.losY);
    expect(mean(offense), `${personnel}: the offense is above the line`).toBeLessThan(scene.losY);
    // Same token size, and so the same letter size, on either side of the ball.
    expect(new Set(scene.nodes.filter((n) => n.kind === "player").map((n) => n.size))).toEqual(new Set([36]));
    const letters = await page.locator('.stage-frame svg g[data-kind="player"] text:not([data-job])').evaluateAll((els) => els.map((e) => e.getAttribute("font-size")));
    expect(new Set(letters).size, `${personnel}: one letter size`).toBe(1);
    // The setup is fresh each time through.
    await page.evaluate(() => localStorage.removeItem("grid1ronvault.draft.v1"));
  }
  expect(errors).toEqual([]);
});
