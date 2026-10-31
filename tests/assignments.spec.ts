import { expect, test } from "@playwright/test";
import { quiet, seedReady } from "./helpers";

/**
 * Assignments: one player's job across a playbook. Picking a letter, the
 * roster names that title each sheet, both printouts, switching to the whole
 * Vault and opening a play in the Designer.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
});

test("a position sheet follows the letter and the roster name, prints, and opens its plays", async ({ page }) => {
  await seedReady(page);
  await page.goto("/assignments");
  await expect(page.locator("h1")).toHaveText("Assignments");

  // The Ready-to-Go playbook is picked first; every letter on its plays is a chip.
  await expect(page.locator(".asg-pick select")).toHaveValue(/^(?!vault$)/);
  const chips = page.getByRole("group", { name: "Player" }).getByRole("button");
  await expect(chips.first()).toBeVisible();
  const letters = await chips.allTextContents();
  expect(letters.length).toBeGreaterThan(1);
  const on = page.getByRole("group", { name: "Player" }).getByRole("button", { pressed: true });
  await expect(on).toHaveCount(1);
  const first = (await on.textContent())!.trim();
  await expect(page.locator(".asg-title")).toContainText(`${first} in Ready-to-Go 5v5 Playbook`);
  await expect(page.locator(".asg-card").first()).toBeVisible();

  // Another letter: the address carries it and the sheet follows.
  const other = letters.find((l) => l !== first)!;
  await chips.filter({ hasText: new RegExp(`^${other}$`) }).click();
  await expect(page).toHaveURL(new RegExp(`player=${other}`));
  await expect(page.locator(".asg-title")).toContainText(`${other} in Ready-to-Go 5v5 Playbook`);
  const count = await page.locator(".asg-card").count();
  expect(count).toBeGreaterThan(0);
  await expect(page.locator(".asg-title .pill")).toHaveText(`${count} ${count === 1 ? "play" : "plays"}`);

  // A roster name and number title the sheet and are kept on this device.
  await page.getByText("Roster: who wears each letter").click();
  await page.getByLabel(`Player at ${other}`).fill("Marcus Hill");
  await page.getByLabel(`Jersey number for ${other}`).fill("1x2");
  await expect(page.getByLabel(`Jersey number for ${other}`)).toHaveValue("12");
  await expect(page.locator(".asg-title")).toContainText(`Marcus Hill #12 · ${other} in`);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.roster.v1") ?? "{}"))).toMatchObject({ [other]: { name: "Marcus Hill", number: "12" } });

  // Print this sheet shows the one-player sheet as it prints.
  await page.getByRole("button", { name: "Print this sheet" }).click();
  const one = page.getByRole("dialog", { name: "Print preview: Position sheet" });
  await expect(one).toBeVisible();
  await expect(page.locator(".asg-card")).toHaveCount(count);
  await one.getByRole("button", { name: "Close" }).click();
  await expect(one).toHaveCount(0);

  // Print every player lays out one sheet per offensive letter, each titled with its name.
  await page.getByRole("button", { name: "Print every player" }).click();
  await expect(page.getByRole("dialog", { name: "Print preview: Every player's sheet" })).toBeVisible();
  const sheets = page.locator(".asg-sheet");
  expect(await sheets.count()).toBeGreaterThan(1);
  await expect(sheets.filter({ hasText: `Marcus Hill #12 · ${other} in` })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(sheets).toHaveCount(0);
  await expect(page.locator(".asg-card").first()).toBeVisible();

  // The whole Vault is a source too, and the name survives a reload.
  await page.locator(".asg-pick select").selectOption({ label: "Whole Vault (24)" });
  await expect(page).toHaveURL(/book=vault/);
  await expect(page.locator(".asg-title")).toContainText("in the whole Vault");
  await page.reload();
  await expect(page.locator(".asg-pick select")).toHaveValue("vault");
  await page.getByText("Roster: who wears each letter").click();
  await expect(page.getByLabel(`Player at ${other}`)).toHaveValue("Marcus Hill");

  // A card opens that play in the Designer.
  const card = page.locator(".asg-card").first();
  const play = (await card.locator(".asg-name").textContent())!;
  await card.click();
  await expect(page).toHaveURL(/\/build\//);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(play);
});

test("an empty Vault says where to draw the first play", async ({ page }) => {
  await page.goto("/assignments");
  await expect(page.getByText("No players to show yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the Designer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print this sheet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Print every player" })).toBeDisabled();
});
