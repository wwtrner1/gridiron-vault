import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Call Sheet's view tools: Find, Hide empty, Compact, Minimize rows and
 * Open all rows, a minimized column and its Show button, Copy row and
 * Renumber, Show everything, Add column, the print preview, and the view
 * kept per sheet in this browser after a reload. Linking plays and the rows
 * themselves are in call-sheet.spec.ts.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("Find, Hide empty, Compact, minimized rows and columns, Copy row, Renumber and the print preview", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/grid");
  const table = page.locator("table").first();
  const rows = table.locator("tbody tr");
  const status = page.locator(".sheet-status");
  const name = (r: number) => page.getByRole("combobox", { name: `Play Name, row ${r}`, exact: true });
  const number = (r: number) => page.getByLabel(`#, row ${r}`, { exact: true });
  await expect(rows).toHaveCount(12);
  await name(1).fill("17 · Stick");
  await name(1).press("Tab");
  await expect(page.locator(".toast", { hasText: "17 · Stick is in your Vault, so this row is linked" })).toBeVisible();
  await name(2).fill("03 · Mesh");
  await name(2).press("Tab");
  await expect(page.locator(".toast", { hasText: "03 · Mesh is in your Vault, so this row is linked" })).toBeVisible();

  // Find narrows the rows; Hide empty keeps only the typed ones.
  const find = page.getByLabel("Find in this call sheet");
  await find.fill("mesh");
  await expect(rows).toHaveCount(1);
  await expect(status).toContainText("Showing 1 of 12 rows.");
  await find.fill("");
  await expect(rows).toHaveCount(12);
  await expect(status).toHaveCount(0);
  const hideEmpty = page.getByRole("button", { name: "Hide empty" });
  await hideEmpty.click();
  await expect(hideEmpty).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(2);
  await expect(status).toContainText("Showing 2 of 12 rows.");
  await hideEmpty.click();
  await expect(rows).toHaveCount(12);

  // Compact tightens the table; Minimize rows folds every row and Open all rows brings them back.
  const compact = page.getByRole("button", { name: "Compact" });
  await compact.click();
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  await expect(table).toHaveClass(/is-compact/);
  await page.getByRole("button", { name: "Minimize rows" }).click();
  await expect(table.locator("tr.row-min")).toHaveCount(12);
  await expect(status).toContainText("Showing 12 of 12 rows · 12 rows minimized.");
  await page.getByRole("button", { name: "Open all rows" }).click();
  await expect(table.locator("tr.row-min")).toHaveCount(0);

  // A minimized column becomes a thin strip with a Show button.
  await page.getByRole("button", { name: "Minimize Pass" }).click();
  await expect(table.locator("th.col-min")).toHaveText("Pass");
  await expect(status).toContainText("Showing 12 of 12 rows · 1 column minimized.");
  await expect(page.getByRole("button", { name: "Show Pass" })).toBeVisible();

  // Copy row puts a copy below with a blank #; Renumber fills the # column in order.
  await page.getByRole("button", { name: "Copy row 1", exact: true }).click();
  await expect(page.locator(".toast", { hasText: "Row copied below. Renumber puts the # column back in order." })).toBeVisible();
  await expect(rows).toHaveCount(13);
  await expect(name(2)).toHaveValue("17 · Stick");
  await expect(number(1)).toHaveValue("1");
  await expect(number(2)).toHaveValue("");
  await expect(number(3)).toHaveValue("2");
  await page.getByRole("button", { name: "Renumber" }).click();
  await expect(page.locator(".toast", { hasText: "Numbered 13 rows in your order." })).toBeVisible();
  await expect(number(2)).toHaveValue("2");
  await expect(number(3)).toHaveValue("3");
  await expect(number(13)).toHaveValue("13");

  // Show everything opens the column again; Add column adds one before the row tools.
  await page.getByRole("button", { name: "Show everything" }).click();
  await expect(status).toHaveCount(0);
  await expect(table.locator("th.col-min")).toHaveCount(0);
  await expect(table.locator("thead th")).toHaveCount(13);
  await page.getByRole("button", { name: "Add column" }).click();
  await expect(table.locator("thead th")).toHaveCount(14);

  // The view is this browser's, per sheet, and kept after a reload.
  await page.getByRole("button", { name: "Minimize Run" }).click();
  await page.reload();
  await expect(rows).toHaveCount(13);
  await expect(status).toContainText("Showing 13 of 13 rows · 1 column minimized.");
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  await expect(table.locator("th.col-min")).toHaveText("Run");
  const view = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.sheetview.v1") ?? "{}") as Record<string, { cols: string[]; rows: string[]; compact: boolean; hideEmpty: boolean }>);
  expect(Object.values(view)).toHaveLength(1);
  expect(Object.values(view)[0]).toMatchObject({ rows: [], compact: true, hideEmpty: false });
  expect(Object.values(view)[0].cols).toHaveLength(1);
  await page.getByRole("button", { name: "Show Run" }).click();
  await expect(table.locator("th.col-min")).toHaveCount(0);

  // Print opens the page preview with the sheet's name.
  await page.getByRole("button", { name: "Print", exact: true }).click();
  const preview = page.getByRole("dialog", { name: /^Print preview: Call Sheet · / });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Close" }).click();
  await expect(preview).toHaveCount(0);
  expect(errors).toEqual([]);
});
