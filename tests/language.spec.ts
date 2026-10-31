import { expect, test } from "@playwright/test";
import { quiet, seedReady } from "./helpers";

/**
 * Playbook language: the starter glossary, teaching a term (and the two
 * things the form refuses), search and the type filter, edit, delete, a term
 * suggested from the Vault, and everything kept after a reload.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
});

test("a coach teaches, finds, edits and deletes a term, and it is kept after a reload", async ({ page }) => {
  await page.goto("/language");
  await expect(page.locator("h1")).toHaveText("Playbook language");

  // The starter glossary comes with the app.
  const rows = page.locator(".lang-table tbody tr");
  await expect(rows).toHaveCount(33);
  const stats = page.locator(".lang-stats .stat b");
  await expect(stats).toHaveText(["33", "0", "0"]);

  // The form refuses an empty name, an empty meaning and a term already taught.
  await page.getByRole("button", { name: "Teach a new term" }).click();
  const form = page.getByRole("form", { name: "New term" });
  await form.getByRole("button", { name: "Save term" }).click();
  await expect(form.getByRole("alert")).toContainText("Give the term a name");
  await form.getByLabel("Term").fill("Flood");
  await form.getByRole("button", { name: "Save term" }).click();
  await expect(form.getByRole("alert")).toContainText("Say what it means");
  await form.getByLabel("Means").fill("Something else");
  await form.getByRole("button", { name: "Save term" }).click();
  await expect(form.getByRole("alert")).toContainText("“Flood” is already in your terms");

  // A new term, shared with the staff, goes to the top and the counts follow.
  await form.getByLabel("Term").fill("Sail");
  await form.getByLabel("Means").fill("Corner over an out over a flat");
  await form.getByLabel("Type").selectOption("concept");
  await form.getByLabel("Who uses it").selectOption("staff");
  await form.getByRole("button", { name: "Save term" }).click();
  await expect(form).toHaveCount(0);
  await expect(rows).toHaveCount(34);
  await expect(rows.first()).toContainText("Sail");
  await expect(rows.first()).toContainText("Corner over an out over a flat");
  await expect(rows.first()).toContainText("You + staff");
  await expect(stats).toHaveText(["34", "1", "1"]);

  // Search and the type filter narrow the table.
  await page.getByLabel("Search terms").fill("sail");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Search terms").fill("nothing like this");
  await expect(page.locator(".lang-empty")).toContainText("No terms match that");
  await page.getByLabel("Search terms").fill("");
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Formations" }).click();
  await expect(rows).toHaveCount(4);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Gaps & techniques" }).click();
  await expect(rows).toHaveCount(21);
  await expect(rows.first()).toContainText("A gap");
  await expect(rows.first()).toContainText("Between the center and a guard");
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "All" }).click();
  await expect(rows).toHaveCount(34);

  // Edit keeps the row and changes its meaning.
  await page.getByRole("button", { name: "Edit Sail" }).click();
  const editForm = page.getByRole("form", { name: "Edit Sail" });
  await expect(editForm.getByLabel("Means")).toHaveValue("Corner over an out over a flat");
  await editForm.getByLabel("Means").fill("Z corner · Y out · H flat");
  await editForm.getByRole("button", { name: "Save term" }).click();
  await expect(rows).toHaveCount(34);
  await expect(rows.first()).toContainText("Z corner · Y out · H flat");

  // Kept after a reload, then deleted.
  await page.reload();
  await expect(rows).toHaveCount(34);
  await expect(rows.first()).toContainText("Z corner · Y out · H flat");
  await page.getByRole("button", { name: "Delete Sail" }).click();
  await expect(rows).toHaveCount(33);
  await expect(page.getByRole("button", { name: "Delete Sail" })).toHaveCount(0);
  await expect(stats).toHaveText(["33", "0", "0"]);
});

test("a word used across the Vault is suggested as a term, and Ignore puts it away", async ({ page }) => {
  await seedReady(page);
  await page.goto("/language");
  const card = page.getByRole("status").filter({ hasText: "New term seen in" });
  await expect(card).toBeVisible();
  const word = (await card.locator("b").textContent())!.match(/“(.+)”/)![1];

  // Save term opens the form with the word filled in, from the Vault.
  await card.getByRole("button", { name: "Save term" }).click();
  const form = page.getByRole("form", { name: "New term" });
  await expect(form.getByLabel("Term")).toHaveValue(word);
  await form.getByLabel("Means").fill("What we call it");
  await form.getByRole("button", { name: "Save term" }).click();
  const row = page.locator(".lang-table tbody tr").first();
  await expect(row).toContainText(word);
  await expect(row).toContainText("From your Vault");
  await expect(row.locator(".mono")).not.toHaveText("0×");

  // The next suggestion can be ignored, and stays ignored after a reload.
  const next = page.getByRole("status").filter({ hasText: "New term seen in" });
  if (await next.count()) {
    const second = (await next.locator("b").textContent())!.match(/“(.+)”/)![1];
    await next.getByRole("button", { name: "Ignore" }).click();
    await expect(page.getByRole("status").filter({ hasText: `“${second}”` })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: `“${second}”` })).toHaveCount(0);
  }
});
