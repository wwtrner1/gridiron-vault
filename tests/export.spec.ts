import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const isPdf = async (path: string) => (await readFile(path)).subarray(0, 5).toString() === "%PDF-";

test("wristband cards download as a PDF", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/wristbands");
  const source = page.locator('[data-tour="wb-source"] select');
  const book = source.locator('option[value^="book:"]').first();
  await expect(book).toBeAttached();
  await source.selectOption((await book.getAttribute("value"))!);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".wb-head-actions .btn-primary").click()]);
  expect(download.suggestedFilename()).toMatch(/^wristbands-.*\.pdf$/);
  expect(await isPdf((await download.path())!)).toBe(true);
  expect(errors).toEqual([]);
});

test("a play exports as a PDF from the Designer", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.locator('.play-card button[aria-label^="Open"]').first().click();
  await page.locator('[data-tour="dz-export"]').click();
  const pdf = page.locator('.modal button:has-text("PDF")').first();
  if (await pdf.count()) await pdf.click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator('.modal button:has-text("Build the PDF")').click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(await isPdf((await download.path())!)).toBe(true);
  expect(errors).toEqual([]);
});
