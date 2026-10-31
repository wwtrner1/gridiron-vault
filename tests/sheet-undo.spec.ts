import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const sheets = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}") as { sheets?: { id: string; name: string; rows: { playId: string | null }[] }[] }).sheets ?? []);

test("Undo on the delete message brings a Call Sheet back, and the blank one laid out meanwhile goes", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const play = page.locator(".play-card h3, .play-card .play-name").first();
  const name = (await play.textContent())!.trim();
  await page.goto("/grid");
  const cell = page.getByRole("combobox", { name: "Play Name, row 1", exact: true });
  await cell.fill(name);
  await cell.press("Tab");
  await expect.poll(async () => (await sheets(page))[0]?.rows[0]?.playId).toBeTruthy();
  const [original] = await sheets(page);

  await page.getByRole("button", { name: `Delete ${original.name}`, exact: true }).click();
  // The only sheet is gone, so the page lays out a blank one.
  await expect.poll(async () => (await sheets(page)).map((s) => s.id)).not.toContain(original.id);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await sheets(page)).map((s) => s.id)).toEqual([original.id]);
  expect((await sheets(page))[0].rows[0].playId).toBe(original.rows[0].playId);
  await expect(page.getByRole("combobox", { name: "Play Name, row 1", exact: true })).toHaveValue(name);
  expect(errors).toEqual([]);
});
