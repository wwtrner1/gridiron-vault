import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const book = async (page: import("@playwright/test").Page, name: string) =>
  ((await workspace(page)).playbooks ?? []).find((b) => b.name === name) as { name: string; playIds: string[] } | undefined;

test("Add to new playbook names a playbook and files the picked plays in one step, from the Vault bar, a play card and the Designer", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);

  // Vault batch bar: pick two plays, name a new playbook.
  await page.locator(".play-card .play-pick").nth(0).click();
  await page.locator(".play-card .play-pick").nth(1).click();
  await page.getByRole("button", { name: "Add to new playbook" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Add to a new playbook");
  await dialog.getByRole("textbox", { name: "New playbook" }).fill("Red Zone Packages");
  await dialog.getByRole("button", { name: "Create and add 2 plays" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".bulk-bar")).toBeHidden();
  await expect.poll(async () => (await book(page, "Red Zone Packages"))?.playIds.length).toBe(2);

  // One play card's folder: the same name goes into that playbook, never a twin.
  await page.locator('.play-card button[aria-label$="to a playbook"]').nth(2).click();
  await dialog.getByRole("textbox", { name: "New playbook" }).fill("red zone packages");
  await expect(dialog).toContainText("You already have Red Zone Packages");
  await dialog.getByRole("button", { name: "Add 1 play to it" }).click();
  await expect.poll(async () => (await book(page, "Red Zone Packages"))?.playIds.length).toBe(3);
  expect(((await workspace(page)).playbooks ?? []).filter((b) => b.name.toLowerCase() === "red zone packages")).toHaveLength(1);

  // Designer: Extras → Add to a new playbook…
  await page.locator('.play-card button[aria-label^="Open"]').nth(3).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.getByRole("button", { name: "Add to a new playbook…" }).click();
  await dialog.getByRole("textbox", { name: "New playbook" }).fill("Two-Minute");
  await dialog.getByRole("button", { name: "Create and add 1 play" }).click();
  await expect.poll(async () => (await book(page, "Two-Minute"))?.playIds.length).toBe(1);

  expect(errors).toEqual([]);
});
