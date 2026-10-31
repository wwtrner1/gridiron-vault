import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Designer's floating tools and Copy style: the mini-bar's tool, read
 * color, palette and weight picks go on what is selected (or the next line),
 * Undo and Redo on its head, Ctrl+Alt+C / Ctrl+Alt+V put one element's look on
 * others of the same kind and refuse another kind, the grip moves it with the
 * arrow keys and Home docks it, and its spot and open state are kept.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the floating tools color, weight and read the selection, Copy style pastes a look, and the bar remembers its spot", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const bar = page.getByRole("toolbar", { name: "Floating tools" });
  const title = bar.locator(".dz-float-title");
  const status = page.locator(".dz-status [role=status]");
  const pressed = (group: string) => bar.getByRole("group", { name: group }).locator("button[aria-pressed=true]");
  const orange = svg.locator('[data-kind=player] rect[fill="#F2A63B"], [data-kind=player] circle[fill="#F2A63B"]');
  const key = () => page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.floatbar.v1") ?? "null"));

  // Docked in the corner, set for the next line: Select, Defense ink, weight 2.
  await expect(bar).toHaveAttribute("style", /translate\(12px, 12px\)/);
  await expect(title).toHaveText("Next line");
  await expect(pressed("Tool")).toHaveText("Select");
  await expect(pressed("Read color")).toHaveText("Defense");
  await expect(pressed("Line weight")).toHaveAttribute("aria-label", "Line weight 2");
  await bar.getByRole("group", { name: "Tool" }).getByRole("button", { name: "Route" }).click();
  await expect(pressed("Tool")).toHaveText("Route");
  await bar.getByRole("group", { name: "Tool" }).getByRole("button", { name: "Select" }).click();

  // N picks the first player; the palette colors him.
  await page.keyboard.press("n");
  await expect(status).toContainText("Selected Receiver X, 1 of 11.");
  await expect(title).toHaveText("1 player");
  await expect(orange).toHaveCount(0);
  await bar.getByRole("button", { name: "Ball orange for 1 player" }).click();
  await expect(orange).toHaveCount(1);
  await expect(bar.getByRole("button", { name: "Ball orange for 1 player" })).toHaveAttribute("aria-pressed", "true");

  // Copy style takes his look; paste puts it on the next player, and refuses a line.
  await page.keyboard.press("Control+Alt+KeyC");
  await expect(status).toHaveText("Copied the style of Receiver X. Pick others of the same kind and press Ctrl+Alt+V.");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.styleclip.v1") ?? "{}"))).toMatchObject({ kind: "player", values: { fill: "#F2A63B" } });
  await page.keyboard.press("n");
  await expect(status).toContainText("Selected Center, 2 of 11.");
  await page.keyboard.press("Control+Alt+KeyV");
  await expect(status).toHaveText("Pasted the style on 1 element.");
  await expect(orange).toHaveCount(2);

  // A line: 1st read and the boldest weight from the bar, Undo and Redo on its head.
  for (let i = 0; i < 11 && !/Selected Route/.test((await status.textContent()) ?? ""); i++) await page.keyboard.press("n");
  await expect(status).toContainText("Selected Route,");
  await expect(title).toHaveText("1 line");
  await bar.getByRole("button", { name: "1st read" }).click();
  await expect(pressed("Read color")).toHaveText("1st read");
  await expect.poll(() => svg.locator('[data-kind=path] path[stroke="#0FA8C4"]').count()).toBeGreaterThan(0);
  await bar.getByRole("button", { name: "Line weight 4, boldest" }).click();
  await expect(pressed("Line weight")).toHaveAttribute("aria-label", "Line weight 4, boldest");
  await page.keyboard.press("Control+Alt+KeyV");
  await expect(status).toHaveText("That style is for players. Pick one or more to paste it on.");
  await expect(pressed("Line weight")).toHaveAttribute("aria-label", "Line weight 4, boldest");
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(pressed("Line weight")).toHaveAttribute("aria-label", "Line weight 2");
  await bar.getByRole("button", { name: "Redo" }).click();
  await expect(pressed("Line weight")).toHaveAttribute("aria-label", "Line weight 4, boldest");

  // The grip: arrow keys move the bar, Home docks it; collapse keeps only the head.
  const grip = bar.getByRole("button", { name: "Move the floating tools. Arrow keys move it, Home docks it." });
  await expect(bar.getByRole("button", { name: "Dock in the corner" })).toHaveCount(0);
  await grip.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(bar).toHaveAttribute("style", /translate\(44px, 28px\)/);
  await expect(bar.getByRole("button", { name: "Dock in the corner" })).toBeVisible();
  expect(await key()).toEqual({ x: 44, y: 28, open: true, docked: false });
  await page.keyboard.press("Home");
  await expect(bar).toHaveAttribute("style", /translate\(12px, 12px\)/);
  expect(await key()).toEqual({ x: 12, y: 12, open: true, docked: true });
  await bar.getByRole("button", { name: "Collapse the floating tools" }).click();
  await expect(title).toHaveText("Tools");
  await expect(bar.getByRole("group", { name: "Tool" })).toHaveCount(0);

  // Kept after a reload (the Designer keeps the unsaved drawing as a draft meanwhile).
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await svg.waitFor();
  await expect(title).toHaveText("Tools");
  expect(await key()).toEqual({ x: 12, y: 12, open: false, docked: true });
  await bar.getByRole("button", { name: "Open the floating tools" }).click();
  await expect(title).toHaveText("Next line");
  await expect(pressed("Tool")).toHaveText("Select");
  expect(errors).toEqual([]);
});
