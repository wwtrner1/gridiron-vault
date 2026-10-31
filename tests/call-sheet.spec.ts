import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

type Sheet = { id: string; name: string; rows: { id: string; playId: string | null; cells: Record<string, string> }[]; columns: { id: string; label: string }[] };
const sheets = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}").sheets ?? []) as Sheet[]);

test("Call Sheet: a typed play name links the row, Link a saved play fills it, rows add, minimize and come back, and it all survives a reload", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const plays = await page.evaluate(() => (JSON.parse(localStorage.getItem("snapline.workspace.v1")!).plays as { id: string; name: string; playType: string }[]).filter((p) => p.playType === "pass").slice(0, 2));
  const [a, b] = plays;

  await page.goto("/grid");
  await expect(page).toHaveTitle(/Call Sheet/);
  const table = page.locator("table").first();
  await expect(table.locator("tbody tr")).toHaveCount(12);

  // Typing a saved play's name in Play Name links the row and fills Pass.
  const name1 = page.getByRole("combobox", { name: "Play Name, row 1", exact: true });
  await name1.fill(a.name);
  await name1.press("Tab");
  await expect(page.locator(".toast", { hasText: `${a.name} is in your Vault, so this row is linked` })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Pass, row 1", exact: true })).toHaveValue("Yes");
  await expect(page.getByRole("button", { name: "Open linked play" })).toHaveCount(1);
  await expect.poll(async () => (await sheets(page))[0]?.rows[0]?.playId).toBe(a.id);

  // Link a saved play on row 2: search, pick, the name and the link land.
  await page.getByRole("button", { name: "Link a saved play" }).nth(0).click();
  const dialog = page.getByRole("dialog", { name: "Link a saved play" });
  await dialog.getByRole("searchbox", { name: "Search your plays" }).fill(b.name);
  await dialog.getByRole("button", { name: new RegExp(b.name) }).first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Play Name, row 2", exact: true })).toHaveValue(b.name);
  await expect(page.getByRole("button", { name: "Open linked play" })).toHaveCount(2);

  // Rows: one below row 1, then minimize row 1 to a summary line and open it again.
  await page.getByRole("button", { name: "Add a row below row 1", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(13);
  await expect(page.getByRole("combobox", { name: "Play Name, row 3", exact: true })).toHaveValue(b.name);
  await page.getByRole("button", { name: "Minimize row 1", exact: true }).click();
  const min = page.locator("tr.row-min");
  await expect(min).toHaveCount(1);
  await expect(min).toContainText(a.name);
  await page.getByRole("button", { name: /^Open row 1:/ }).click();
  await expect(min).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Play Name, row 1", exact: true })).toHaveValue(a.name);

  // Clearing the name unlinks the row (leaving the cell by a click, since Tab takes the suggestion under it).
  await page.getByRole("combobox", { name: "Play Name, row 3", exact: true }).fill("");
  await page.getByRole("combobox", { name: "Play Name, row 3", exact: true }).blur();
  await expect.poll(async () => (await sheets(page))[0]?.rows[2]?.playId).toBeNull();

  // It is all in this browser after a reload: row 1 linked, the new row 2 blank, row 3 cleared.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Play Name, row 1", exact: true })).toHaveValue(a.name);
  await expect(page.getByRole("combobox", { name: "Play Name, row 2", exact: true })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Play Name, row 3", exact: true })).toHaveValue("");
  await expect(table.locator("tbody tr")).toHaveCount(13);
  await expect(page.getByRole("button", { name: "Open linked play" })).toHaveCount(1);

  expect(errors).toEqual([]);
});
