import { expect, test, type Locator, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The playbook tree (the side menu on every Shell screen, the Designer's
 * Plays tab): folders open and close, Find narrows the plays, a new playbook
 * from the field, a play dragged onto a folder is filed there, the tree keys
 * (arrows, End, Enter) open a play, the Designer's tree marks the open play
 * and opens another, a folder's + starts a new play filed there, and the open
 * folders are remembered after a reload.
 */
test.beforeEach(async ({ context }) => quiet(context));

type Book = { id: string; name: string; playIds: string[] };

/** A play row dropped onto a folder row, the way the browser's own drag does it. */
async function dropOnto(play: Locator, folder: Locator) {
  await play.evaluate((from, to) => {
    const dt = new DataTransfer();
    for (const type of ["dragstart", "dragover", "drop"]) (type === "dragstart" ? from : to!).dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, await folder.elementHandle());
}

const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);

test("the playbook tree files, finds and opens plays from the side menu and the Designer", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const tree = page.getByRole("tree", { name: "Your playbooks" });
  const folders = tree.locator("> li");
  const folder = (name: string) => folders.filter({ has: page.locator(`> .pbt-folder .pbt-name:text-is("${name}")`) });
  const plays = tree.locator("li.pbt-play");

  // One folder, closed; a click opens it on its 24 plays, each with its type.
  await expect(folders).toHaveCount(1);
  const ready = folder("Ready-to-Go 5v5 Playbook");
  await expect(ready).toHaveAttribute("aria-expanded", "false");
  await ready.locator("> .pbt-folder").click();
  await expect(ready).toHaveAttribute("aria-expanded", "true");
  await expect(ready).toHaveAttribute("aria-label", "Ready-to-Go 5v5 Playbook, 24 plays");
  await expect(plays).toHaveCount(24);
  await expect(plays.first()).toHaveAttribute("aria-label", "01 · All Curls, Pass");

  // Find narrows the folder to the plays that match.
  const find = page.getByLabel("Find a play in your playbooks");
  await find.fill("stick");
  await expect(plays).toHaveCount(1);
  await expect(plays).toHaveAttribute("aria-label", "17 · Stick, Pass");
  await expect(ready).toHaveAttribute("aria-label", "Ready-to-Go 5v5 Playbook, 1 play");
  await find.fill("zzz");
  await expect(page.locator(".pbt")).toContainText('No play matches "zzz".');
  await find.fill("");
  await expect(plays).toHaveCount(24);

  // A new playbook from the tree's own field, open and empty.
  await page.getByRole("button", { name: "New playbook", exact: true }).click();
  await page.getByLabel("New playbook name").fill("Week 3 installs");
  await page.keyboard.press("Enter");
  const week = folder("Week 3 installs");
  await expect(week).toHaveAttribute("aria-label", "Week 3 installs, 0 plays");
  await expect(week).toHaveAttribute("aria-expanded", "true");
  await expect(week).toContainText("Empty. Drag a play here.");
  await expect(page.locator(".toast").last()).toContainText("Week 3 installs created. Drag plays onto it, or add a new one with its +.");

  // A play dragged onto the folder is filed there and stays in its other playbooks.
  await dropOnto(plays.filter({ hasText: "17 · Stick" }).first(), week.locator("> .pbt-folder"));
  await expect(week).toHaveAttribute("aria-label", "Week 3 installs, 1 play");
  await expect(ready).toHaveAttribute("aria-label", "Ready-to-Go 5v5 Playbook, 24 plays");
  await expect(page.locator(".toast").last()).toContainText("17 · Stick added to Week 3 installs. It stays in its other playbooks too.");
  await dropOnto(plays.filter({ hasText: "17 · Stick" }).last(), week.locator("> .pbt-folder"));
  await expect(page.locator(".toast").last()).toContainText("17 · Stick is already in Week 3 installs.");
  const books = (await workspace(page)).playbooks as unknown as Book[];
  const weekBook = books.find((b) => b.name === "Week 3 installs")!;
  const readyBook = books.find((b) => b.name === "Ready-to-Go 5v5 Playbook")!;
  expect(weekBook.playIds).toHaveLength(1);
  expect(readyBook.playIds).toContain(weekBook.playIds[0]);

  // Tree keys: Left closes a folder, Right opens it and steps in, End goes to the last row, Enter opens the play.
  await ready.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(ready).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");
  await expect(ready).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toBe("01 · All Curls, Pass");
  await page.keyboard.press("End");
  await expect.poll(() => focused(page)).toBe("24 · Toss Sweep Left, Run");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/build/[^?]+\\?book=${readyBook.id}$`));
  await page.locator(".stage-frame svg").first().waitFor();
  await expect(page.locator(".dz-name")).toContainText("24 · Toss Sweep Left");

  // The Designer's Plays tab: the same tree, the open play marked, another play opened from it.
  await page.getByRole("tab", { name: "Plays: your playbooks" }).click();
  const dzTree = page.locator("#dz-tree-title + * [role=tree], .pbt:has(#dz-tree-title) [role=tree]").first();
  await expect(dzTree).toBeVisible();
  const current = dzTree.locator("li.pbt-play[aria-current=page]");
  await expect(current).toHaveAttribute("aria-label", "24 · Toss Sweep Left, Run");
  await expect(current).toHaveAttribute("aria-selected", "true");
  await dzTree.locator("li.pbt-play").filter({ hasText: "03 · Mesh" }).click();
  await expect(page).toHaveURL(new RegExp(`/build/[^?]+\\?book=${readyBook.id}$`));
  await expect(page.locator(".dz-name")).toContainText("03 · Mesh");
  await expect(dzTree.locator("li.pbt-play[aria-current=page]")).toHaveAttribute("aria-label", "03 · Mesh, Pass");

  // A folder's + starts a new play filed in that playbook.
  await dzTree.getByRole("button", { name: "New play in Week 3 installs" }).click();
  await expect(page).toHaveURL(`/build?book=${weekBook.id}`);
  const setup = page.getByRole("dialog", { name: "New play" });
  await expect(setup).toBeVisible();
  await expect(setup.locator('label.field:has(span:text-is("Playbook")) select')).toHaveValue(weekBook.id);

  // Open folders are remembered in this browser.
  await page.goto("/vault");
  await expect(folder("Week 3 installs")).toHaveAttribute("aria-expanded", "true");
  await expect(folder("Ready-to-Go 5v5 Playbook")).toHaveAttribute("aria-expanded", "true");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("grid1ronvault.tree.v1") ?? "[]"))).toEqual(expect.arrayContaining([weekBook.id, readyBook.id]));
  expect(errors).toEqual([]);
});
