import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const isPdf = async (path: string) => (await readFile(path)).subarray(0, 5).toString() === "%PDF-";

test("wristband cards preview as PDF pages, then download", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/wristbands");
  const source = page.locator('[data-tour="wb-source"] select');
  const book = source.locator('option[value^="book:"]').first();
  await expect(book).toBeAttached();
  await source.selectOption((await book.getAttribute("value"))!);
  // Print cards opens the print preview: the real PDF's pages, drawn by PDF.js.
  await page.locator(".wb-head-actions .btn-primary").click();
  await expect(page.locator(".pp-page img").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".pp-note").first()).toContainText(/\d+ pages?, exactly as/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator('.modal button:has-text("Download PDF")').click()]);
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
  await page.locator('.modal button:has-text("Preview and print")').click();
  await expect(page.locator(".pp-page img").first()).toBeVisible({ timeout: 20_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator('.modal button:has-text("Download PDF")').click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(await isPdf((await download.path())!)).toBe(true);
  expect(errors).toEqual([]);
});

test("a player dragged off the field is flagged before printing wristbands", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // Drag the first play's first player far past the sideline, the way a stray drag in the Designer would.
  await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}");
    const book = ws.playbooks[0];
    const play = ws.plays.find((p: { id: string }) => p.id === book.playIds[0]);
    const player = play.scene.nodes.find((n: { kind: string }) => n.kind === "player");
    player.x = -400;
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
  });
  await page.goto("/wristbands");
  const source = page.locator('[data-tour="wb-source"] select');
  await source.selectOption((await source.locator('option[value^="book:"]').first().getAttribute("value"))!);
  await expect(page.locator(".wb-preview .pp-warn")).toContainText("cut off");
  await page.locator(".wb-head-actions .btn-primary").click();
  await expect(page.locator(".modal .pp-warn")).toContainText("cut off");
  expect(errors).toEqual([]);
});

test("Call Sheet print opens a print preview", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/grid");
  await page.locator('[data-tour="sheet-print"]').click();
  await expect(page.locator(".pp-pagebar")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/is-print-preview/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".pp-pagebar")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/is-print-preview/);
  expect(errors).toEqual([]);
});
