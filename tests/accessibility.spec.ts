import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { quiet, seedReady, signIn } from "./helpers";

/**
 * An axe sweep (WCAG 2.0/2.1 A and AA rules) over every screen with plays in
 * the Vault, the Designer with a play open, the side menu's playbook tree
 * opened, and the Griddy panel, signed out and signed in; the screens also at
 * phone width. docs/accessibility.md records what earlier sweeps found and
 * fixed; this keeps them from coming back. Diagram-label exceptions are documented below.
 */
test.beforeEach(async ({ context }) => quiet(context));

const SCREENS = ["/", "/vault", "/playbooks", "/grid", "/starters", "/pricing", "/account", "/signin", "/help", "/wristbands", "/language", "/upload", "/assignments", "/practice", "/drills", "/coverage", "/tools", "/front-office", "/roster", "/tutorials", "/privacy", "/terms", "/nope", "/build"];

type Violation = { id: string; impact: string | null | undefined; help: string; nodes: { target: unknown[]; html: string }[] };

/**
 * Allows the diagram-label exception:
 * - "label in name" on a button whose only visible text is a play diagram's yard numbers and letters
 *   (Starters previews, Assignments cards, Playbook language's example buttons), and on a playbook folder opened in the tree, whose
 *   children's names axe counts as the folder's visible text.
 */
function real(violations: Violation[]) {
  const diagram = (t: string) => /play-thumb|asg-card|lang-thumb|aria-expanded="true"/.test(t);
  return violations
    .map((v) => (v.id === "label-content-name-mismatch" ? { ...v, nodes: v.nodes.filter((n) => !diagram(n.target.join(" ")) && !diagram(n.html)) } : v))
    .filter((v) => v.nodes.length);
}

async function sweep(page: import("@playwright/test").Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const found = real(res.violations as Violation[]);
  expect(
    found.map((v) => `${label} [${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`),
    label,
  ).toEqual([]);
}

test("every screen passes axe's WCAG A and AA rules, signed out @phone", async ({ page }) => {
  test.setTimeout(300_000);
  await seedReady(page);
  for (const path of SCREENS) {
    await page.goto(path);
    await expect(page.locator("[data-page-loading]")).toHaveCount(0);
    await sweep(page, path);
  }
});

test("the open states pass: the playbook tree, the Designer with a play and Extras, and Griddy", async ({ page }) => {
  test.setTimeout(120_000);
  await seedReady(page);

  // The side menu's playbook tree with a folder open and its plays listed.
  const folder = page.locator("aside#rail-nav .pbt-item").first();
  await folder.locator(".pbt-row").first().click();
  await expect(page.locator("aside#rail-nav .pbt-play").first()).toBeVisible();
  await sweep(page, "/vault with the tree open");

  // The Designer with a play on the field, its Extras menu, and the Griddy panel on the Vault.
  await page.locator('.play-card button[aria-label^="Open"]').first().click();
  await expect(page).toHaveURL(/\/build\//);
  await page.locator(".stage-frame svg").first().waitFor();
  await sweep(page, "/build with a play");
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await expect(page.locator("#dz-more-menu")).toBeVisible();
  await sweep(page, "/build with Extras open");
  await page.goto("/vault");
  await page.locator("button.gd-launch").click();
  await expect(page.locator("#griddy-panel")).toBeVisible();
  await sweep(page, "/vault with Griddy open");
});

test("the signed-in screens pass too", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(context, () => false);
  await seedReady(page);
  for (const path of ["/vault", "/playbooks", "/account", "/front-office", "/roster", "/grid", "/wristbands"]) {
    await page.goto(path);
    await expect(page.locator("[data-page-loading]")).toHaveCount(0);
    await sweep(page, `${path} signed in`);
  }
});
