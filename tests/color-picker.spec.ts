import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The full color picker behind the Style card's "+": a team color, any hex
 * typed (a bad one refused and put back on blur), the color landing on the
 * picked route and in Recent, Save as team color adding it to Team colors,
 * all kept in grid1ronvault.colors.v1 after a reload.
 */
test.beforeEach(async ({ context }) => quiet(context));

const colors = (page: import("@playwright/test").Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.colors.v1") ?? "{}") as { saved?: { name: string; hex: string }[]; recent?: string[] });

test("the color picker takes a team color, any hex, remembers it and saves it as a team color", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const card = page.locator(".dz-style");
  const status = page.locator(".dz-status [role=status]");
  const row = (name: string) => card.getByRole("group", { name, exact: true });
  for (let i = 0; i < 24 && !/Selected Route,/.test((await status.textContent()) ?? ""); i++) await page.keyboard.press("n");
  await expect(status).toContainText(/Selected Route,/);
  await expect(card.locator(".dz-style-target")).toHaveText("1 line");

  // "+" opens the picker under the row; a team color goes straight onto the route.
  const more = row("Color").getByRole("button", { name: "More line colors" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const picker = card.locator(".cp");
  await expect(picker.locator(".cp-group")).toHaveText(["GridIronVault", "Team colors"]);
  const team = picker.locator(".cp-grid");
  const recent = () => picker.locator(".cp-row").last();
  await team.getByRole("button", { name: "Line Orange" }).click();
  await expect(svg.locator('[data-kind=path] path[stroke="#f28c28"]')).toHaveCount(1);
  await expect(team.getByRole("button", { name: "Line Orange" })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByLabel("Line: hex color")).toHaveValue("#F28C28");
  await expect(picker.locator(".cp-group")).toHaveText(["GridIronVault", "Team colors", "Recent"]);
  await expect(recent().getByRole("button")).toHaveAccessibleName("Line Orange");
  expect((await colors(page)).recent).toEqual(["#f28c28"]);

  // A hex that isn't one is refused and put back on blur; a real one lands on Enter, newest in Recent.
  const hex = picker.getByLabel("Line: hex color");
  await hex.fill("#12345");
  await expect(hex).toHaveAttribute("aria-invalid", "true");
  await hex.press("Enter");
  await expect(svg.locator('[data-kind=path] path[stroke="#f28c28"]')).toHaveCount(1);
  await hex.blur();
  await expect(hex).toHaveValue("#F28C28");
  await expect(hex).toHaveAttribute("aria-invalid", "false");
  await hex.fill("7b2cbf");
  await hex.press("Enter");
  await expect(svg.locator('[data-kind=path] path[stroke="#7b2cbf"]')).toHaveCount(1);
  await expect(hex).toHaveValue("#7B2CBF");
  await expect(more).toHaveAttribute("style", /background: rgb\(123, 44, 191\)/);
  expect((await colors(page)).recent).toEqual(["#7b2cbf", "#f28c28"]);
  await expect(recent().getByRole("button").first()).toHaveAccessibleName("Line #7B2CBF");
  await expect(recent().getByRole("button").first()).toHaveAttribute("aria-pressed", "true");

  // Save as team color: it joins the team colors by its hex name, and stays after a reload.
  await picker.getByRole("button", { name: "+ Save as team color" }).click();
  await expect(team.getByRole("button", { name: "Line #7B2CBF" })).toBeVisible();
  expect((await colors(page)).saved).toEqual([{ name: "#7B2CBF", hex: "#7b2cbf" }]);
  await page.reload();
  await svg.waitFor();
  await expect(svg.locator('[data-kind=path] path[stroke="#7b2cbf"]')).toHaveCount(0);
  await card.getByRole("button", { name: "More next line colors" }).click();
  await expect(team.getByRole("button", { name: "Next line #7B2CBF" })).toBeVisible();
  await expect(recent().getByRole("button")).toHaveCount(2);
  expect(errors).toEqual([]);
});
