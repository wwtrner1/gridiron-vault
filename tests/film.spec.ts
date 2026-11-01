import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * Film next to the play, in Run play: a clip from the coach's own computer
 * plays beside the drawing, Mark the snap here sets where the snap is and
 * Sync to video drives the clip from the play's clock; a Hudl or YouTube
 * link is checked, kept in the saved play with the snap time, and opens at
 * the snap.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

async function openRun(page: import("@playwright/test").Page) {
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.locator('[data-tour="dz-run"]').first().click();
  return page.getByRole("dialog", { name: /Run play/ });
}

test("a clip from this computer plays beside the drawing, with the snap marked and the clock in step", async ({ page }) => {
  const errors = errorsOf(page);
  const dialog = await openRun(page);
  await expect(dialog.getByRole("button", { name: "Attach a practice or game clip from this computer" })).toBeVisible();
  await expect(dialog.getByLabel("Sync to video")).toBeDisabled();

  await dialog.locator('input[type=file]').setInputFiles("tests/fixtures/practice-clip.webm");
  const clip = dialog.locator("video");
  await expect(clip).toHaveAttribute("aria-label", "Clip: practice-clip.webm");
  await expect(dialog.getByRole("button", { name: "Attach a different video" })).toBeVisible();
  await expect(dialog.locator(".rp-note")).toContainText("Play the clip to the snap, pause, and press Mark the snap here.");
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1);

  // The clip is at 1.0 s when the coach marks the snap.
  await clip.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 1;
  });
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(1, 0);
  await dialog.getByRole("button", { name: "Mark the snap here" }).click();
  await expect(dialog.locator(".rp-note")).toContainText("Snap marked at 1.0 s");

  // With Sync to video on, moving the play's clock moves the clip to the snap plus that time.
  await expect(dialog.getByLabel("Sync to video")).toBeEnabled();
  await dialog.getByLabel("Time after the snap").fill("1.5");
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => Number(v.currentTime.toFixed(1)))).toBeCloseTo(2.5, 0);
  await dialog.getByLabel("Time after the snap").fill("0");
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => Number(v.currentTime.toFixed(1)))).toBeCloseTo(1, 0);
  expect(errors).toEqual([]);
});

test("a YouTube link is checked, kept with the snap time, and opens at the snap", async ({ page }) => {
  const errors = errorsOf(page);
  const dialog = await openRun(page);
  const link = dialog.getByLabel("Hudl or YouTube link");

  // Anything else is refused in words.
  await link.fill("https://example.com/film");
  await link.blur();
  await expect(dialog.getByRole("alert")).toHaveText("Paste a Hudl or YouTube link that starts with https://.");
  await expect(dialog.getByLabel("The snap happens at (m:ss)")).toHaveCount(0);

  // A YouTube link is kept; the snap time opens the link at that second.
  await link.fill("https://www.youtube.com/watch?v=abc123");
  await link.blur();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const snap = dialog.getByLabel("The snap happens at (m:ss)");
  await snap.fill("1:07");
  await snap.blur();
  const open = dialog.getByRole("link", { name: /Open the film at the snap \(1:07\)/ });
  await expect(open).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123&t=67s");
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", /noopener/);

  // A Hudl link is accepted too and the saved play keeps the link and the snap.
  await link.fill("https://www.hudl.com/video/3/99/abc");
  await link.blur();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Back to drawing" }).click();
  const save = page.locator('[data-tour="dz-save"]');
  await save.click();
  await expect(save).toHaveText(/Saved/);
  await expect
    .poll(async () => ((await workspace(page)).plays!.find((p) => /Stick/.test(p.name))!.scene as unknown as { film?: { link?: string; snapAt?: number } }).film)
    .toEqual({ link: "https://www.hudl.com/video/3/99/abc", snapAt: 67 });
  expect(errors).toEqual([]);
});
