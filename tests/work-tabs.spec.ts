import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The work tabs (Designer · Playbook · Wristbands · Call Sheet) carry one
 * context between the pages a coach works across in one sitting: the play
 * and playbook last open in the Designer, and the Call Sheet last open. The
 * current tab is marked and goes nowhere; in the Designer a tab saves unsaved
 * changes before it leaves; the context is kept in this browser.
 */
test.beforeEach(async ({ context }) => quiet(context));

const BOOK = "Ready-to-Go 5v5 Playbook";
const work = (page: import("@playwright/test").Page) => page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.worktabs.v1") ?? "null") as { playId: string | null; bookId: string | null; sheetId: string | null } | null);

test("the work tabs keep the play, playbook and Call Sheet between the Designer, Playbooks, Wristbands and the Call Sheet, saving on the way out of the Designer", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const book = (await workspace(page)).playbooks!.find((b) => b.name === BOOK)!;
  const bookQ = `?book=${encodeURIComponent(book.id)}`;
  const bandsHref = `/wristbands?source=${encodeURIComponent(`book:${book.id}`)}`;

  // Open a Ready-to-Go play: the Designer's tabs point at its playbook, and at a Call Sheet that doesn't exist yet.
  await page.locator('.play-card button[aria-label^="Open"]').nth(2).click();
  await expect(page).toHaveURL(/\/build\//);
  const playId = page.url().split("/build/")[1].split(/[?#]/)[0];
  const tabs = page.getByRole("navigation", { name: "Work tabs" });
  await expect(tabs.getByRole("link")).toHaveText(["Designer", "Playbook", "Wristbands", "Call Sheet"]);
  await expect(tabs.getByRole("link", { name: "Designer" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "Playbook" })).toHaveAttribute("href", `/playbooks${bookQ}`);
  await expect(tabs.getByRole("link", { name: "Wristbands" })).toHaveAttribute("href", bandsHref);
  await expect(tabs.getByRole("link", { name: "Call Sheet" })).toHaveAttribute("href", "/grid");
  await expect.poll(() => work(page)).toEqual({ playId, bookId: book.id, sheetId: null });

  // The current tab goes nowhere.
  await tabs.getByRole("link", { name: "Designer" }).click();
  await expect(page).toHaveURL(new RegExp(`/build/${playId}`));

  // Move a player, then leave by the Playbook tab: the play is saved first, and the playbook opens.
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.locator(".dz-status [role=status]")).toContainText("Selected", { timeout: 1000 });
  }).toPass();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".dz-status [role=status]")).toContainText("Moved");
  const before = (await workspace(page)).plays!.find((p) => p.id === playId)!;
  await tabs.getByRole("link", { name: "Playbook" }).click();
  await expect(page).toHaveURL(`/playbooks${bookQ}`);
  await expect(page.getByRole("dialog", { name: BOOK })).toBeVisible();
  const saved = (await workspace(page)).plays!.find((p) => p.id === playId)!;
  expect(saved.updatedAt).not.toBe(before.updatedAt);
  expect(saved.scene.nodes.some((n) => n.x !== before.scene.nodes.find((o) => o.id === n.id)?.x)).toBe(true);

  // Playbooks' tabs: Designer goes back to that play in this playbook; Wristbands to this playbook's cards.
  const shellTabs = page.getByRole("navigation", { name: "Work tabs" });
  await expect(shellTabs.getByRole("link", { name: "Playbook" })).toHaveAttribute("aria-current", "page");
  await expect(shellTabs.getByRole("link", { name: "Designer" })).toHaveAttribute("href", `/build/${playId}${bookQ}`);
  await page.getByRole("dialog", { name: BOOK }).getByRole("button", { name: "Close", exact: true }).click();
  await shellTabs.getByRole("link", { name: "Wristbands" }).click();
  await expect(page).toHaveURL(bandsHref);
  await expect(page.locator('[data-tour="wb-source"] select')).toHaveValue(`book:${book.id}`);
  await expect(page.locator('[data-tour="wb-source"] select option:checked')).toHaveText(`Playbook · ${BOOK}`);

  // Call Sheet: the first visit lays a sheet out, and from then on every tab opens that sheet.
  await shellTabs.getByRole("link", { name: "Call Sheet" }).click();
  await expect(page).toHaveURL("/grid");
  await expect(page.getByRole("combobox", { name: "Play Name, row 1", exact: true })).toBeVisible();
  const sheetId = await page.evaluate(() => (JSON.parse(localStorage.getItem("snapline.workspace.v1")!).sheets as { id: string }[])[0].id);
  await expect.poll(() => work(page)).toEqual({ playId, bookId: book.id, sheetId });
  await expect(shellTabs.getByRole("link", { name: "Call Sheet" })).toHaveAttribute("aria-current", "page");
  await shellTabs.getByRole("link", { name: "Designer" }).click();
  await expect(page).toHaveURL(`/build/${playId}${bookQ}`);
  await expect(tabs.getByRole("link", { name: "Call Sheet" })).toHaveAttribute("href", `/grid?sheet=${encodeURIComponent(sheetId)}`);

  // The context is this browser's: after a reload the Playbooks page still knows the play and the sheet.
  await page.goto("/playbooks");
  await expect(shellTabs.getByRole("link", { name: "Designer" })).toHaveAttribute("href", `/build/${playId}${bookQ}`);
  await expect(shellTabs.getByRole("link", { name: "Call Sheet" })).toHaveAttribute("href", `/grid?sheet=${encodeURIComponent(sheetId)}`);
  expect(errors).toEqual([]);
});
