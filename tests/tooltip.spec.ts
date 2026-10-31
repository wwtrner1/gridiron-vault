import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * The Designer's coach-marks (`Tooltip`): a mouse over a rail tool shows its
 * name, shortcut and hint, wired to the button with aria-describedby; the
 * mouse leaving hides it; keyboard focus shows it too, Escape hides it with
 * focus kept on the tool, and leaving the tool hides it.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false })));
});

test("a tool's hint shows on hover and keyboard focus, names the shortcut, and Escape puts it away", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("tab", { name: "Draw" }).click();
  const dashed = page.getByRole("button", { name: "Dashed line with arrow" });
  const tip = page.getByRole("tooltip");
  await expect(tip).toHaveCount(0);
  await expect(dashed).not.toHaveAttribute("aria-describedby", /./);

  // Hover: the hint, named and wired to the button.
  await dashed.hover();
  await expect(tip).toBeVisible();
  await expect(tip.locator("strong")).toContainText("Dashed line with arrow");
  await expect(tip.locator("kbd")).toHaveText("2");
  await expect(tip.locator("em")).toHaveText("Same drawing action as the route arrow. Use it for the ball flight, motion assignments or man coverage.");
  await expect(dashed).toHaveAttribute("aria-describedby", (await tip.getAttribute("id"))!);
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
  await expect(dashed).not.toHaveAttribute("aria-describedby", /./);

  // Keyboard: Tab onto a tool shows it; Escape hides it and leaves focus on the tool; Tab away hides it.
  const solid = page.getByRole("button", { name: "Solid line with arrow" });
  await solid.focus();
  await expect(solid).toBeFocused();
  await expect(tip).toHaveCount(0);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(solid).toBeFocused();
  await expect(tip).toBeVisible();
  await expect(tip.locator("strong")).toContainText("Solid line with arrow");
  await expect(tip.locator("kbd")).toHaveText("1");
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
  await expect(solid).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(tip).toBeVisible();
  await expect(tip.locator("strong")).not.toContainText("Solid line with arrow");
  const next = (await tip.locator("strong").textContent())!;
  await page.keyboard.press("Tab");
  await expect(tip.locator("strong")).not.toHaveText(next);
  expect(errors).toEqual([]);
});
