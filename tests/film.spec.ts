import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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

test("film notes: a note and a drawing pinned to a moment, kept in the saved play, copied for players", async ({ page, context }) => {
  const errors = errorsOf(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // A stand-in for YouTube's player that speaks its message format: it answers "listening" with
  // the time and follows seekTo, so the test sees the page read the film's time and seek to a note.
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body style="background:#000"><script>
        let t = 12.5;
        const tell = () => parent.postMessage(JSON.stringify({ event: "infoDelivery", info: { currentTime: t, playerState: 2 } }), "*");
        addEventListener("message", (e) => {
          const m = JSON.parse(e.data);
          if (m.event === "listening") tell();
          if (m.event === "command" && m.func === "seekTo") { t = m.args[0]; tell(); }
        });
      </script></body>`,
    }),
  );
  const dialog = await openRun(page);
  await expect(dialog.getByRole("button", { name: "Add film notes" })).toHaveCount(0);
  const link = dialog.getByLabel("Hudl or YouTube link");
  await link.fill("https://youtu.be/abcdefghijk");
  await link.blur();

  // The YouTube player swaps in with its message API on; nothing from YouTube is scripted into the page.
  await dialog.getByRole("button", { name: "Add film notes" }).click();
  await expect(dialog.locator(".fn-stage iframe")).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk\?.*enablejsapi=1/);
  await expect(dialog.getByText("No notes yet.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "+ Add a note at 0:12" })).toBeVisible();

  // A note at 0:42 with words and an arrow drawn on the paused frame.
  await dialog.getByRole("button", { name: /\+ Add a note/ }).click();
  await dialog.getByLabel("Note time").fill("0:42");
  await dialog.getByLabel("What to watch").fill("Watch the 2 cut off the screen");
  await dialog.getByRole("button", { name: "Save note" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "Write a note" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Edit the note at 0:42" }).click();
  const area = await dialog.locator("svg.fn-draw").boundingBox();
  await page.mouse.move(area!.x + 60, area!.y + 60);
  await page.mouse.down();
  await page.mouse.move(area!.x + 220, area!.y + 140, { steps: 6 });
  await page.mouse.up();
  await dialog.getByRole("button", { name: "Save note" }).click();
  await expect(dialog.locator(".fn-note")).toHaveCount(1);
  await expect(dialog.locator(".fn-note")).toContainText("Watch the 2 cut off the screen");
  await expect(dialog.locator(".fn-note")).toContainText("1 drawing");

  // Its time button seeks the film there and shows the drawing over the paused frame.
  await dialog.getByRole("button", { name: "Go to 0:42" }).click();
  await expect(dialog.getByRole("button", { name: "+ Add a note at 0:42" })).toBeVisible();
  await expect(dialog.locator("svg.fn-draw path.fn-mark")).toHaveCount(1);

  // An empty note is refused in words; Delete has an Undo.
  await dialog.getByRole("button", { name: /\+ Add a note/ }).click();
  await dialog.getByRole("button", { name: "Save note" }).click();
  await expect(dialog.locator(".fn-status")).toHaveText("Write a note or draw on the frame first.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.getByRole("button", { name: "Delete the note at 0:42" }).click();
  await expect(dialog.locator(".fn-note")).toHaveCount(0);
  await dialog.locator(".fn-status").getByRole("button", { name: "Undo" }).click();
  await expect(dialog.locator(".fn-note")).toHaveCount(1);

  // Copy notes for players links the moment on YouTube.
  await dialog.getByRole("button", { name: "Copy notes for players" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("0:42  Watch the 2 cut off the screen\nhttps://youtu.be/abcdefghijk?t=42s");

  // The notes panel, with a note open, passes axe's WCAG A and AA rules (the player frame is YouTube's own).
  const axe = await new AxeBuilder({ page }).include(".rp-notes").exclude(".fn-stage iframe").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  await dialog.getByRole("button", { name: "Close film notes" }).click();
  await expect(dialog.getByRole("button", { name: "Film notes (1)" })).toBeVisible();
  await dialog.getByRole("button", { name: "Back to drawing" }).click();
  const save = page.locator('[data-tour="dz-save"]');
  await save.click();
  await expect(save).toHaveText(/Saved/);
  await expect
    .poll(async () => {
      const film = ((await workspace(page)).plays!.find((p) => /Stick/.test(p.name))!.scene as unknown as { film?: { notes?: { at: number; text: string; marks: { kind: string }[] }[] } }).film;
      return film?.notes?.map((n) => ({ at: n.at, text: n.text, marks: n.marks.map((m) => m.kind) }));
    })
    .toEqual([{ at: 42, text: "Watch the 2 cut off the screen", marks: ["arrow"] }]);
  expect(errors).toEqual([]);
});
