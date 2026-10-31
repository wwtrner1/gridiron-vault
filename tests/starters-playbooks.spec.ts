import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const names = async (page: Page) => ((await workspace(page)).plays ?? []).map((p) => p.name);
const bookNamed = async (page: Page, name: string) =>
  ((await workspace(page)).playbooks ?? []).find((b) => b.name === name) as { name: string; playIds: string[] } | undefined;

test("Starters: search, preview, copy to the Vault, open in the Designer, and file a pick in a new playbook", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/starters");
  await page.locator(".play-card").first().waitFor();
  const all = await page.locator(".play-card").count();
  expect(all).toBeGreaterThan(20);

  // The search box narrows the grid; the first card is the play to copy.
  await page.getByLabel("Search starter plays").fill("mesh");
  await expect.poll(() => page.locator(".play-card").count()).toBeLessThan(all);
  const first = page.locator(".play-card").first();
  const name = (await first.locator("h3").textContent())!.trim();

  // Preview opens the play by name; Copy to Vault from there puts a copy in the browser's Vault.
  await first.getByRole("button", { name: `Preview ${name}` }).click();
  const preview = page.getByRole("dialog", { name });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Copy to Vault" }).click();
  await expect(preview).toBeHidden();
  await expect(page.locator(".toast").last()).toContainText(`${name} copied into your Vault.`);
  expect(await names(page)).toContain(name);

  // Edit: copies it and opens the copy in the Designer.
  await first.getByRole("button", { name: `Edit ${name} in the designer` }).click();
  await expect(page).toHaveURL(/\/build\//);
  await page.locator(".stage-frame svg").first().waitFor();
  const copies = (await names(page)).filter((n) => n === name);
  expect(copies.length).toBe(2);

  // Pick two and file them in a new playbook in one step.
  await page.goto("/starters");
  await page.locator(".play-card").first().waitFor();
  await page.getByLabel("Search starter plays").fill("");
  await page.locator(".play-card .play-pick").nth(0).click();
  await page.locator(".play-card .play-pick").nth(1).click();
  await expect(page.getByRole("group", { name: "Selected starter plays" })).toContainText("2");
  await page.getByRole("button", { name: "Copy to new playbook" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "New playbook" }).fill("Install Week 1");
  await dialog.getByRole("button", { name: "Create and add 2 plays" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await bookNamed(page, "Install Week 1"))?.playIds.length).toBe(2);
  expect(errors).toEqual([]);
});

test("Playbooks: create, add plays, reorder, remove, rename, and keep it all after a reload", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const plays = await names(page);
  expect(plays.length).toBeGreaterThan(2);
  await page.goto("/playbooks");

  // New playbook.
  await page.locator('[data-tour="new-playbook"]').click();
  const form = page.getByRole("dialog", { name: "New playbook" });
  await form.getByLabel("Playbook name").fill("Red Zone Package");
  await form.getByRole("button", { name: "Create playbook" }).click();
  await expect(form).toBeHidden();
  const card = page.locator(".book", { hasText: "Red Zone Package" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Empty");

  // Add plays: the first two of the Vault, by their names.
  await card.getByRole("button", { name: "Add plays to Red Zone Package" }).click();
  const adder = page.getByRole("dialog");
  await adder.getByRole("button", { name: `Add ${plays[0]} to Red Zone Package` }).click();
  await adder.getByRole("button", { name: `Add ${plays[1]} to Red Zone Package` }).click();
  await adder.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await bookNamed(page, "Red Zone Package"))?.playIds.length).toBe(2);

  // Open: the plays in order; Move down swaps them; Remove takes one out.
  await card.getByRole("button", { name: "Open Red Zone Package" }).click();
  const book = page.getByRole("dialog", { name: "Red Zone Package" });
  await expect(book.locator("h3").first()).toHaveText(plays[0]);
  await book.getByRole("button", { name: `Move ${plays[0]} down` }).click();
  await expect(book.locator("h3").first()).toHaveText(plays[1]);
  await book.getByRole("button", { name: `Remove ${plays[0]} from this book` }).click();
  await expect(book.locator("h3")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(book).toBeHidden();

  // Rename.
  await card.getByRole("button", { name: "Rename Red Zone Package" }).click();
  const rename = page.getByRole("dialog", { name: "Rename playbook" });
  await rename.getByLabel("Playbook name").fill("Goal Line Package");
  await rename.getByRole("button", { name: "Save changes" }).click();
  await expect(rename).toBeHidden();
  await expect(page.locator(".book", { hasText: "Goal Line Package" })).toBeVisible();

  // Everything is still there after a reload.
  await page.reload();
  const after = page.locator(".book", { hasText: "Goal Line Package" });
  await expect(after).toBeVisible();
  expect((await bookNamed(page, "Goal Line Package"))?.playIds.length).toBe(1);
  expect(await bookNamed(page, "Red Zone Package")).toBeUndefined();
  expect(errors).toEqual([]);
});
