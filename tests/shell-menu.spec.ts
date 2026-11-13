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

const GROUPS: [string, string[]][] = [
  ["Plays", ["The Vault", "Playbooks", "Upload plays", "Starter plays"]],
  ["Game plan", ["Call Sheet", "Wristbands", "Coverage report"]],
  ["Practice", ["Practice", "Drill Vault", "Assignments"]],
  ["Team", ["My team", "Front Office"]],
  ["Tools", ["Playbook language", "More tools"]],
];
const TOOLS = GROUPS.flatMap(([, t]) => t);

test("the side menu lists every tool, marks the screen, opens from the phone button and matches the home page grid", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const rail = page.locator("aside#rail-nav");
  const playbook = rail.getByRole("navigation", { name: "Playbook" });
  const account = rail.getByRole("navigation", { name: "Account" });

  // Draft a play, then five groups: Plays open on a first visit, the rest closed with their counts.
  await expect(rail.getByRole("link", { name: "Draft a play" })).toHaveAttribute("href", "/build");
  const head = (g: string) => playbook.getByRole("button", { name: new RegExp(`^${g}`) });
  for (const [g] of GROUPS) await expect(head(g)).toHaveAttribute("aria-expanded", g === "Plays" ? "true" : "false");
  await expect(head("Game plan")).toContainText("3");
  await expect(playbook.getByRole("link")).toHaveText(["The Vault24", "Playbooks", "Upload plays", "Starter plays"]);
  // Opening every group shows all fourteen tools, and the open groups are kept after a reload.
  for (const [g] of GROUPS.slice(1)) await head(g).click();
  await expect(playbook.getByRole("link")).toHaveText(TOOLS.map((t) => (t === "The Vault" ? `${t}24` : t)));
  await head("Tools").click();
  await expect(head("Tools")).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(head("Team")).toHaveAttribute("aria-expanded", "true");
  await expect(head("Tools")).toHaveAttribute("aria-expanded", "false");
  // The group holding the screen opens itself: Playbook language lives under Tools.
  await page.goto("/language");
  await expect(head("Tools")).toHaveAttribute("aria-expanded", "true");
  await expect(playbook.getByRole("link", { name: "Playbook language" })).toHaveAttribute("aria-current", "page");
  await page.goto("/vault");
  await page.locator(".play-card").first().waitFor();
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
