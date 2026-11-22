import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { designerMenu, errorsOf, quiet, railSection } from "./helpers";

/**
 * One-click blocks, assignments and pressures (Wes, 2026-11-22): a click on a
 * lineman, back, tight end or receiver offers blocks beside his routes; a
 * click on a defender offers rush and coverage jobs; the Sets section's
 * Blocking and Pressures lists do a whole line or a whole defense at once.
 * Every pick is one Undo step and the line it draws is the player's own.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true })));
});

type Spot = { label: string; x: number; y: number };

const spots = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=player]"))
      .filter((g) => !g.closest('g[opacity="0.36"]'))
      .map((g) => {
        const r = g.getBoundingClientRect();
        return { label: g.querySelector("text")?.textContent ?? "", x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }),
  ) as Promise<Spot[]>;

async function clickPlayer(page: Page, label: string) {
  const s = (await spots(page)).find((p) => p.label === label);
  expect(s, `a player lettered ${label}`).toBeTruthy();
  await page.mouse.click(s!.x, s!.y);
  return s!;
}

const lines = (page: Page) => page.locator(".stage-frame svg").first().locator("g[data-kind=path]:not([pointer-events=none])");

/** The blank 11-man field with a defense lined up over it (the Edit menu's Turn this offense into a defense). */
async function withDefense(page: Page) {
  await page.goto("/build");
  await page.getByRole("button", { name: "Open the field" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  await (await designerMenu(page, "edit")).getByRole("button", { name: "Turn this offense into a defense" }).click();
  await page.waitForTimeout(200);
}

/** The defender closest above this offensive player. */
async function defenderOver(page: Page, over: Spot) {
  const all = await spots(page);
  return all.filter((s) => s.y < over.y - 5).sort((a, b) => Math.hypot(a.x - over.x, a.y - over.y) - Math.hypot(b.x - over.x, b.y - over.y))[0];
}

test("a lineman's block menu draws the block he picks, flips its side, and takes it back", async ({ page }) => {
  const errors = errorsOf(page);
  await withDefense(page);
  const status = page.locator(".dz-status [role=status]");
  const before = await lines(page).count();

  await clickPlayer(page, "T");
  const menu = page.getByRole("dialog", { name: "Block for T" });
  await expect(menu).toBeVisible();
  // The old way still works beside the new tiles.
  await expect(menu.getByRole("button", { name: "Block straight ahead" })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Blocks for T" }).getByRole("button")).toHaveCount(13);
  await menu.getByRole("button", { name: /^Reach/ }).click();
  await expect(status).toContainText("T reaches");
  await expect(menu).toHaveCount(0);
  await expect(lines(page)).toHaveCount(before + 1);

  const bar = page.getByRole("dialog", { name: "Adjust T's reach" });
  await bar.getByRole("button", { name: "Flip side" }).click();
  await expect(status).toContainText("Switched to the");
  await expect(lines(page)).toHaveCount(before + 1);
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(bar).toHaveCount(0);

  // A second pick replaces the first, and his line ends in a T either way.
  await clickPlayer(page, "T");
  await page.getByRole("dialog", { name: "Block for T" }).getByRole("button", { name: /^Combo/ }).click();
  await expect(status).toContainText("T doubles with his neighbor");
  await page.getByRole("dialog", { name: "Adjust T's combo" }).getByRole("button", { name: "Done" }).click();
  expect(errors).toEqual([]);
});

test("a back, tight end or receiver's Blocks button offers his blocks beside his routes", async ({ page }) => {
  const errors = errorsOf(page);
  await withDefense(page);
  const status = page.locator(".dz-status [role=status]");
  await clickPlayer(page, "Z");
  const routes = page.getByRole("dialog", { name: "Routes for Z" });
  await routes.getByRole("button", { name: "Blocks" }).click();
  const menu = page.getByRole("dialog", { name: "Blocks for Z" });
  await expect(menu.getByRole("group", { name: "Blocks for Z" }).getByRole("button")).toHaveCount(8);
  await menu.getByRole("button", { name: /^Stalk/ }).click();
  await expect(status).toContainText("Z stalks the defensive back");
  await page.getByRole("dialog", { name: "Adjust Z's stalk" }).getByRole("button", { name: "Done" }).click();

  // Routes instead goes back to the route menu.
  await clickPlayer(page, "Z");
  await page.getByRole("dialog", { name: "Routes for Z" }).getByRole("button", { name: "Blocks" }).click();
  await page.getByRole("dialog", { name: "Blocks for Z" }).getByRole("button", { name: "Routes instead" }).click();
  await expect(page.getByRole("dialog", { name: "Routes for Z" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("a click on a defender offers rush and coverage jobs, man coverage asks for the receiver, and Clear takes the job off", async ({ page }) => {
  const errors = errorsOf(page);
  await withDefense(page);
  const status = page.locator(".dz-status [role=status]");
  const t = (await spots(page)).find((s) => s.label === "T")!;
  const d = await defenderOver(page, t);
  expect(d, "a defender over the tackle").toBeTruthy();

  await page.mouse.click(d.x, d.y);
  const menu = page.getByRole("dialog", { name: `Assignments for ${d.label}` });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("group", { name: `Rush assignments for ${d.label}` }).getByRole("button")).toHaveCount(9);
  await expect(menu.getByRole("group", { name: `Coverage assignments for ${d.label}` }).getByRole("button")).toHaveCount(11);
  await menu.getByRole("button", { name: /^A gap/ }).click();
  await expect(status).toContainText("blitzes the A gap");
  const bar = page.getByRole("dialog", { name: `Adjust ${d.label}'s a gap` });
  // Flip has to change the line, not only the words: the A gap rush goes to the other side of the center.
  const shape = () => lines(page).last().locator("path").first().getAttribute("d");
  const drawn = await shape();
  await bar.getByRole("button", { name: "Flip side" }).click();
  await expect(status).toContainText("Switched to the");
  expect(await shape()).not.toBe(drawn);
  await bar.getByRole("button", { name: "Done" }).click();

  // The same defender again: Clear assignment is there now.
  await page.mouse.click(d.x, d.y);
  await page.getByRole("dialog", { name: `Assignments for ${d.label}` }).getByRole("button", { name: "Clear assignment" }).click();
  await expect(status).toContainText("assignment is cleared");

  // Man coverage: the tile, then a click on the receiver.
  await page.mouse.click(d.x, d.y);
  await page.getByRole("dialog", { name: `Assignments for ${d.label}` }).getByRole("button", { name: /^Man/ }).click();
  await expect(page.getByRole("dialog", { name: `Man coverage for ${d.label}` })).toBeVisible();
  await expect(status).toContainText("Click the receiver");
  await clickPlayer(page, "X");
  await expect(status).toContainText(`${d.label} covers X man to man.`);
  await page.getByRole("dialog", { name: new RegExp(`Adjust ${d.label}'s man`) }).getByRole("button", { name: "Done" }).click();

  // Escape puts the ask away; Nearest receiver does it without a second click.
  await page.mouse.click(d.x, d.y);
  await page.getByRole("dialog", { name: `Assignments for ${d.label}` }).getByRole("button", { name: /^Man/ }).click();
  await page.keyboard.press("Escape");
  await expect(status).toHaveText("Assignment put away.");
  // A press on empty field puts the ask away too, so the next tap on a player opens his own menu and doesn't answer the old question.
  await page.mouse.click(d.x, d.y);
  await page.getByRole("dialog", { name: `Assignments for ${d.label}` }).getByRole("button", { name: /^Man/ }).click();
  const box = (await page.locator(".stage-frame svg").first().boundingBox())!;
  await page.mouse.click(box.x + box.width - 30, box.y + 30);
  await expect(status).toHaveText("Assignment put away.");
  await clickPlayer(page, "X");
  await expect(page.getByRole("dialog", { name: "Routes for X" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.click(d.x, d.y);
  await page.getByRole("dialog", { name: `Assignments for ${d.label}` }).getByRole("button", { name: /^Man/ }).click();
  await page.getByRole("dialog", { name: `Man coverage for ${d.label}` }).getByRole("button", { name: "Nearest receiver" }).click();
  await expect(status).toContainText("man to man");
  expect(errors).toEqual([]);
});

test("the Sets section's Blocking and Pressures lists do a whole line and a whole defense, and open one at a time", async ({ page }) => {
  const errors = errorsOf(page);
  await withDefense(page);
  const status = page.locator(".dz-status [role=status]");
  const rail = await railSection(page, "sets");
  const blocking = rail.getByRole("button", { name: "Blocking", exact: true });
  const pressures = rail.getByRole("button", { name: "Pressures", exact: true });
  await expect(blocking).toHaveAttribute("aria-expanded", "false");

  await blocking.click();
  await expect(blocking).toHaveAttribute("aria-expanded", "true");
  const before = await lines(page).count();
  await rail.getByRole("button", { name: /^Power/ }).click();
  await expect(status).toContainText("Power to the right:");
  expect(await lines(page).count()).toBeGreaterThanOrEqual(before + 5);
  await rail.getByRole("button", { name: "Left", exact: true }).click();
  await rail.getByRole("button", { name: /^Inside zone/ }).click();
  await expect(status).toContainText("Inside zone to the left:");
  await rail.getByRole("button", { name: "Clear blocks" }).click();
  await expect(status).toHaveText("Blocks cleared. Routes stay.");

  // Opening Pressures closes Blocking.
  await pressures.click();
  await expect(pressures).toHaveAttribute("aria-expanded", "true");
  await expect(blocking).toHaveAttribute("aria-expanded", "false");
  await rail.getByRole("button", { name: /^SOB/ }).click();
  await expect(status).toContainText("SOB:");
  await expect(status).toContainText("rush");
  await rail.getByRole("button", { name: "Free", exact: true }).click();
  await rail.getByRole("button", { name: /^Swing/ }).click();
  await expect(status).toContainText("Swing:");
  await expect(status).toContainText("the rover is free");
  await rail.getByRole("button", { name: "Clear all assignments" }).click();
  await expect(status).toHaveText("Defender assignments cleared, lines and tags.");
  expect(errors).toEqual([]);
});

test("a pressure with no defense on the field says what to do, and a scheme works from the defense's end too", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  await page.getByRole("button", { name: "Open the field" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  const status = page.locator(".dz-status [role=status]");
  const rail = await railSection(page, "sets");
  await rail.getByRole("button", { name: "Pressures", exact: true }).click();
  await rail.getByRole("button", { name: /^SOB/ }).click();
  await expect(status).toContainText("Drop one from the Defense library first");

  await (await designerMenu(page, "edit")).getByRole("button", { name: "Turn this offense into a defense" }).click();
  await (await designerMenu(page, "field")).getByRole("button", { name: /Flip sides: defense to the bottom/ }).click();
  await rail.getByRole("button", { name: "Blocking", exact: true }).click();
  await rail.getByRole("button", { name: /^Outside zone/ }).click();
  await expect(status).toContainText("Outside zone to the right:");
  await (await designerMenu(page, "field")).getByRole("button", { name: /Flip sides: offense to the bottom/ }).click();
  expect(errors).toEqual([]);
});

test("the defender menu and the Blocking list pass the accessibility check", async ({ page }) => {
  await withDefense(page);
  const t = (await spots(page)).find((s) => s.label === "T")!;
  const d = await defenderOver(page, t);
  await page.mouse.click(d.x, d.y);
  await expect(page.getByRole("dialog", { name: `Assignments for ${d.label}` })).toBeVisible();
  const menu = await new AxeBuilder({ page }).include(".dz-quick").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(menu.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  await page.keyboard.press("Escape");

  const rail = await railSection(page, "sets");
  await rail.getByRole("button", { name: "Blocking", exact: true }).click();
  const list = await new AxeBuilder({ page }).include("#dz-list-tray").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(list.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
