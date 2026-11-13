import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The side menu on every signed-in screen (Shell): Draft a play, the Playbook
 * tools with the Vault's play count and the current screen marked, the Account
 * group (no Admin for a coach), the guest foot with Sign in, the skip link,
 * the menu button on a phone opening and closing it, and the home page's
 * "Every tool, one click away" grid listing the same tools.
 */
test.beforeEach(async ({ context }) => quiet(context));

const TOOLS = ["The Vault", "Upload plays", "Playbooks", "My team", "Front Office", "Assignments", "Call Sheet", "Coverage report", "Practice", "Coaching videos", "Wristbands", "Starter plays", "Playbook language", "More tools"];

test("the side menu lists every tool, marks the screen, opens from the phone button and matches the home page grid", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const rail = page.locator("aside#rail-nav");
  const playbook = rail.getByRole("navigation", { name: "Playbook" });
  const account = rail.getByRole("navigation", { name: "Account" });

  // Draft a play, the fourteen tools with the Vault's count, and the Account links without Admin.
  await expect(rail.getByRole("link", { name: "Draft a play" })).toHaveAttribute("href", "/build");
  await expect(playbook.getByRole("link")).toHaveText(TOOLS.map((t) => (t === "The Vault" ? `${t}24` : t)));
  await expect(playbook.getByRole("link", { name: /^The Vault/ })).toHaveAttribute("aria-current", "page");
  await expect(playbook.getByRole("link", { name: "Call Sheet" })).not.toHaveAttribute("aria-current", "page");
  await expect(account.getByRole("link")).toHaveText(["Plans", "Your account", "Tutorials", "Help & feedback"]);
  // The tests' browser is on Head Coach, which needs no plan card.
  await expect(rail.locator(".rail-plan")).toHaveCount(0);
  await expect(rail.locator(".rail-user")).toContainText("Guest coach");
  await expect(rail.locator(".rail-user")).toContainText("Saved in this browser");
  await expect(rail.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");

  // A tool opens its screen and the mark moves with it.
  await playbook.getByRole("link", { name: "Call Sheet" }).click();
  await expect(page.locator("h1")).toHaveText("Call Sheet");
  await expect(playbook.getByRole("link", { name: "Call Sheet" })).toHaveAttribute("aria-current", "page");
  await expect(playbook.getByRole("link", { name: /^The Vault/ })).not.toHaveAttribute("aria-current", "page");
  await playbook.getByRole("link", { name: "Starter plays" }).click();
  await expect(page).toHaveURL(/\/starters$/);
  await expect(playbook.getByRole("link", { name: "Starter plays" })).toHaveAttribute("aria-current", "page");

  // The skip link is the first stop and jumps to the main content.
  await page.goto("/vault");
  await page.locator(".play-card").first().waitFor();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);

  // On a phone the menu is tucked away behind its button; a pick closes it again.
  await page.setViewportSize({ width: 390, height: 800 });
  const menu = page.getByRole("button", { name: "Playbook navigation" });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(rail).not.toHaveClass(/is-open/);
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(rail).toHaveClass(/is-open/);
  await playbook.getByRole("link", { name: "Playbooks" }).click();
  await expect(page.locator("h1")).toHaveText("Playbooks");
  await expect(rail).not.toHaveClass(/is-open/);
  await expect(menu).toHaveAttribute("aria-expanded", "false");

  // The home page's grid is built from the same list: the Designer first, then every tool.
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  const grid = page.getByRole("region", { name: "Every tool, one click away" });
  await expect(grid.locator("li b")).toHaveText(["Designer", ...TOOLS]);
  expect(errors).toEqual([]);
});
