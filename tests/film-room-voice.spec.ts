import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

/**
 * A coach's own voice on a Film Room lesson. Signed out, the lesson asks for a
 * sign-in instead of the microphone. Signed in: Record this step, Stop and
 * keep (the clip goes to the account and the play names it), Hear it, the
 * voice starting with the step when the lesson plays, Record again replacing
 * the old clip on the account, the voice inside the MP4, Remove, and the
 * clip's id kept in the saved play. The browser's stand-in microphone makes a
 * real recording; `/api/voice` is answered here.
 */
test.use({
  permissions: ["microphone"],
  launchOptions: {
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});
test.beforeEach(async ({ context }) => quiet(context));

const IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

async function openRoom(page: import("@playwright/test").Page) {
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  return page.getByRole("dialog", { name: /Film Room/ });
}

test("signed out, the Film Room asks for a sign-in before any recording", async ({ page }) => {
  const errors = errorsOf(page);
  const room = await openRoom(page);
  const voice = room.getByRole("group", { name: "Your voice on The look" });
  await expect(voice.getByRole("link", { name: "Sign in to record your voice on this lesson" })).toHaveAttribute("href", "/signin");
  await expect(voice.getByRole("button")).toHaveCount(0);
  await expect(room.getByRole("button", { name: /^Voice o/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a coach records a step, hears it in the lesson and in the video, replaces it and removes it", async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors = errorsOf(page);
  const clips = new Map<string, Buffer>();
  const posts: { type: string; ms: number; size: number }[] = [];
  const heard: string[] = [];
  const removed: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "voice" && method === "POST") {
      const body = route.request().postDataBuffer() ?? Buffer.alloc(0);
      const id = IDS[posts.length];
      posts.push({ type: route.request().headers()["content-type"], ms: Number(route.request().headers()["x-voice-ms"]), size: body.length });
      clips.set(id, body);
      await route.fulfill({ status: 201, json: { id, ms: posts[posts.length - 1].ms } });
      return true;
    }
    if (path.startsWith("voice/")) {
      const id = path.slice(6);
      if (method === "DELETE") {
        removed.push(id);
        clips.delete(id);
        await route.fulfill({ json: { ok: true } });
      } else {
        heard.push(id);
        const clip = clips.get(id);
        if (clip) await route.fulfill({ contentType: "audio/webm", body: clip });
        else await route.fulfill({ status: 404, json: { error: "That recording isn't here any more." } });
      }
      return true;
    }
  });

  const room = await openRoom(page);
  const voice = room.getByRole("group", { name: "Your voice on The look" });
  const note = voice.getByRole("status");
  await expect(voice.getByRole("button", { name: "Record this step" })).toBeVisible();
  await expect(room.getByRole("button", { name: /^Voice o/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include(".fr-voice").analyze()).violations).toEqual([]);

  // Record, then keep it: the clip goes to the account, and the step says how long it runs.
  await voice.getByRole("button", { name: "Record this step" }).click();
  await expect(voice.locator(".fr-voice-live")).toContainText(/Recording \d/);
  await page.waitForTimeout(1500);
  await voice.getByRole("button", { name: "Stop and keep" }).click();
  await expect(note).toContainText("Kept. Your voice plays on The look");
  await expect(voice.getByText(/^Recorded · \d\.\d s$/)).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].type).toBe("audio/webm");
  expect(posts[0].ms).toBeGreaterThan(1200);
  expect(posts[0].size).toBeGreaterThan(1000);

  // Hear it back, and hear it start with the step when the lesson plays.
  await voice.getByRole("button", { name: "Hear it" }).click();
  await expect.poll(() => heard.filter((h) => h === IDS[0]).length).toBeGreaterThan(0);
  const before = heard.length;
  await expect(room.getByRole("button", { name: "Voice on" })).toHaveAttribute("aria-pressed", "true");
  await room.getByRole("button", { name: "Play the lesson" }).click();
  await expect.poll(() => heard.length).toBeGreaterThan(before);
  await room.getByRole("button", { name: "Pause" }).click();
  await room.locator(".fr-steps button").first().click();

  // A recording thrown away keeps the one already there.
  await voice.getByRole("button", { name: "Record again" }).click();
  await expect(voice.locator(".fr-voice-live")).toContainText(/Recording \d/);
  await voice.getByRole("button", { name: "Throw it away" }).click();
  await expect(voice.getByRole("button", { name: "Record again" })).toBeVisible();
  expect(posts).toHaveLength(1);

  // Record again: the new clip takes the step, the old one leaves the account.
  await voice.getByRole("button", { name: "Record again" }).click();
  await page.waitForTimeout(1200);
  await voice.getByRole("button", { name: "Stop and keep" }).click();
  await expect.poll(() => posts.length).toBe(2);
  await expect.poll(() => removed).toEqual([IDS[0]]);

  // Another step has its own, still empty.
  await room.getByRole("button", { name: "Next step" }).click();
  await expect(room.getByRole("group", { name: "Your voice on Zones" }).getByRole("button", { name: "Record this step" })).toBeVisible();
  await room.getByRole("button", { name: "Back a step" }).click();

  // The video carries the voice: a sound track in the MP4.
  await room.getByRole("button", { name: "Make a video" }).click();
  const box = page.getByRole("dialog", { name: "Make a video of this lesson" });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 150_000 }), box.getByRole("button", { name: "Make the video" }).click()]);
  await expect(box.getByRole("status")).toContainText("Saved 17-stick-film-room-16x9.mp4 to your downloads, with your voice.");
  const bytes = readFileSync(await download.path());
  expect(bytes.indexOf("soun", 0, "latin1")).toBeGreaterThan(0);
  expect(bytes.indexOf("mp4a", 0, "latin1") > 0 || bytes.indexOf("Opus", 0, "latin1") > 0).toBe(true);
  if (process.env.FR_KEEP) (await import("node:fs")).copyFileSync(await download.path(), `${process.env.FR_KEEP}/voice.mp4`);
  await box.getByRole("button", { name: "Close Make a video of this lesson" }).click();

  // Save keeps the clip's id and length in the play, so it follows the play to every device.
  await page.keyboard.press("Escape");
  await expect(room).toBeHidden();
  await page.locator('[data-tour="dz-save"]').click();
  await expect
    .poll(async () => {
      const ws = await workspace(page);
      return (ws.plays!.find((p) => p.name === "17 · Stick")?.scene as { teach?: { voice?: unknown } } | undefined)?.teach?.voice;
    })
    .toMatchObject({ look: { id: IDS[1], ms: expect.any(Number) } });

  // Remove: the step goes quiet and the clip leaves the account.
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  await expect(voice.getByText(/^Recorded · /)).toBeVisible();
  await voice.getByRole("button", { name: "Remove" }).click();
  await expect(note).toHaveText("Removed your voice from The look.");
  await expect(voice.getByRole("button", { name: "Record this step" })).toBeVisible();
  await expect(room.getByRole("button", { name: /^Voice o/ })).toHaveCount(0);
  await expect.poll(() => removed).toEqual(IDS);
  expect(errors).toEqual([]);
});
