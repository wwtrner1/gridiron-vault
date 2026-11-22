import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { designerMenu, errorsOf, quiet, railSection, seedReady } from "./helpers";

/**
 * The Designer v2 shortcuts (Wes, 2026-11-21): a click on a receiver opens his
 * route menu and a tile draws the route in his color at real depths, with
 * Flip break, the end and Done on the bar that follows; the center runs
 * routes in 5-on-5 and 7-on-7 and blocks in 11-man; a lineman's click then a
 * defender's draws the block; the line of scrimmage slider moves the play
 * with it; Your sets drops a formation from the coach's own plays; and a
 * recolored letter is how the next player of that letter comes out.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true })));
});

type Spot = { label: string; x: number; y: number; fill: string | null };

/** Every player on the field with his letter and where he is on screen. */
const spots = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=player]"))
      .filter((g) => !g.closest('g[opacity="0.36"]'))
      .map((g) => {
        const r = g.getBoundingClientRect();
        const shape = g.querySelector("circle, rect, path");
        return { label: g.querySelector("text")?.textContent ?? "", x: r.x + r.width / 2, y: r.y + r.height / 2, fill: shape?.getAttribute("fill") ?? null };
      }),
  ) as Promise<Spot[]>;

async function clickPlayer(page: Page, label: string) {
  const s = (await spots(page)).find((p) => p.label === label);
  expect(s, `a player lettered ${label}`).toBeTruthy();
  await page.mouse.click(s!.x, s!.y);
  return s!;
}

const lines = (page: Page) => page.locator(".stage-frame svg").first().locator("g[data-kind=path]:not([pointer-events=none])");

test("a click on a receiver and a tile draws his route in his color, flips it, changes its end, and the center runs routes in 5-on-5", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");
  const before = await lines(page).count();

  const x = await clickPlayer(page, "X");
  const menu = page.getByRole("dialog", { name: "Routes for X" });
  await expect(menu).toBeVisible();
  await expect(menu.locator(".dz-quick-tile")).toHaveCount(14);
  await menu.getByRole("button", { name: "Slant, 3 yds" }).click();
  await expect(status).toContainText("X runs a slant (3 yds).");
  // X had no route in Stick, so one line more, and it wears his color.
  await expect(lines(page)).toHaveCount(before + 1);
  const slant = lines(page).filter({ has: page.locator(`path[stroke="${x.fill}"]`) });
  await expect(slant.first()).toBeVisible();

  const bar = page.getByRole("dialog", { name: "Adjust X's slant" });
  await bar.getByRole("button", { name: "Flip break" }).click();
  await expect(status).toHaveText("Break flipped.");
  await bar.getByRole("button", { name: /^Line end: Arrow/ }).click();
  await expect(status).toHaveText("Line end: T-block.");
  await bar.getByRole("button", { name: "Done" }).click();
  await expect(bar).toHaveCount(0);

  // A second tile replaces his route rather than adding one.
  await clickPlayer(page, "X");
  await page.getByRole("dialog", { name: "Routes for X" }).getByRole("button", { name: "Hitch, 3 yds" }).click();
  await expect(status).toContainText("X runs a hitch (3 yds).");
  await expect(lines(page)).toHaveCount(before + 1);
  await page.getByRole("dialog", { name: "Adjust X's hitch" }).getByRole("button", { name: "Done" }).click();

  // In 5-on-5 the center is a receiver: his click opens the route menu, not a block.
  await clickPlayer(page, "C");
  await expect(page.getByRole("dialog", { name: "Routes for C" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Routes for C" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a lineman's click then a defender's draws the block; the line of scrimmage slider moves the whole play", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  await page.getByRole("button", { name: "Open the field" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");
  await (await designerMenu(page, "edit")).getByRole("button", { name: "Turn this offense into a defense" }).click();

  // 11-man: the center blocks.
  await clickPlayer(page, "C");
  await expect(page.getByRole("dialog", { name: "Block for C" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(status).toHaveText("Block put away.");

  const t = await clickPlayer(page, "T");
  await expect(page.getByRole("dialog", { name: "Block for T" })).toBeVisible();
  const all = await spots(page);
  const defender = all.filter((s) => s.y < t.y - 5).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
  await page.mouse.click(defender.x, defender.y);
  await expect(status).toHaveText(`T blocks ${defender.label}.`);
  await expect(page.getByRole("dialog", { name: "Block for T" })).toHaveCount(0);
  await expect(svg.locator("g[data-kind=path] [marker-end*=tee], g[data-kind=path] line, g[data-kind=path] path").first()).toBeVisible();

  // The line of scrimmage slider: every player moves with it, one Undo puts it back.
  const los = page.getByLabel("Line of scrimmage: the play moves with it");
  const ys = async () => (await spots(page)).map((s) => Math.round(s.y));
  const was = await ys();
  await los.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  const now = await ys();
  const shift = now[0] - was[0];
  expect(Math.abs(shift)).toBeGreaterThan(0);
  expect(now.map((y, i) => y - was[i]).every((d) => Math.abs(d - shift) <= 1)).toBe(true);
  await page.getByRole("group", { name: "Undo and redo" }).getByRole("button", { name: "Undo" }).click();
  expect((await ys()).map((y, i) => Math.abs(y - was[i]) <= 1).every(Boolean)).toBe(true);
  expect(errors).toEqual([]);
});

test("Your sets drops a formation from the coach's plays, and a recolored letter is how the next one comes out on the account", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");

  // Sets → Your sets: one per formation name in the Vault, players only.
  const sets = await railSection(page, "sets");
  await sets.getByRole("button", { name: "Your sets" }).click();
  const yours = page.locator(".ys-set");
  await expect.poll(() => yours.count()).toBeGreaterThan(1);
  const players = (await spots(page)).length;
  await yours.first().click();
  await expect(status).toContainText("dropped in. Click a player to give him a route.");
  expect((await spots(page)).length).toBeGreaterThan(players);

  // Player look history: X recolored on the Style card is the color of the next X from the tray, and rides on the brand.
  await page.keyboard.press("Escape");
  await clickPlayer(page, "X");
  await page.keyboard.press("Escape");
  const style = await railSection(page, "style");
  await style.getByRole("group", { name: "Player", exact: true }).getByRole("button", { name: "Player fill Violet" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1") ?? "{}").letterColors?.X)).toBe("#7A6BD2");
  await railSection(page, "players");
  await page.locator("#dz-token-tray").getByRole("button", { name: "Receiver X" }).click();
  await expect(status).toHaveText("Receiver X added");
  const xs = (await spots(page)).filter((s) => s.label === "X");
  expect(xs.at(-1)!.fill?.toUpperCase()).toBe("#7A6BD2");
  expect(errors).toEqual([]);
});

test("on a play flipped to the defense's end, a tile runs the route toward the defense and breaks toward the middle", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  await designerMenu(page, "field");
  await page.locator("#dz-menu-field").getByRole("button", { name: "Flip sides: defense to the bottom" }).click();

  await clickPlayer(page, "X");
  const menu = page.getByRole("dialog", { name: "Routes for X" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Slant, 3 yds" }).click();
  await page.waitForTimeout(1000); // past the draft's 800 ms write
  const scene = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.draft.v1")!).scene);
  type N = { id: string; kind: string; label?: string; x: number; y: number; scaleX: number; scaleY: number; rotation: number; points?: { x: number; y: number }[]; assignOf?: string };
  const nodes = scene.nodes as N[];
  const who = nodes.find((n) => n.kind === "player" && n.label === "X")!;
  const route = nodes.find((n) => n.kind === "path" && n.assignOf === who.id)!;
  expect(scene.pov).toBe("defense");
  expect(route, "X's route is glued to him").toBeTruthy();
  const end = route.points![route.points!.length - 1];
  const at = { x: route.x + end.x * route.scaleX, y: route.y + end.y * route.scaleY };
  // The defense is at the bottom of the card, so downfield is down: the slant ends below X and nearer the middle.
  expect(at.y).toBeGreaterThan(who.y + 20);
  expect(Math.abs(at.x - 520)).toBeLessThan(Math.abs(who.x - 520));
  expect(errors).toEqual([]);
});
