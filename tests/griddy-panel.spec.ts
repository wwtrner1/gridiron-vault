import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn } from "./helpers";

/**
 * Griddy's panel itself: the launcher opens it with the hello and starters, a
 * quick pick types into the box and never sends, Clear empties it, a text file
 * of calls lands in the box (an empty one says so), Enter sends and Shift+Enter
 * makes a new line, the quick picks row and New conversation appear once there
 * is a conversation, Escape closes it with focus back on the launcher, the
 * conversation follows the coach to the next screen, and the launcher stays
 * off the sign-in page and the Designer (which has the bar instead).
 */
test.beforeEach(async ({ context }) => quiet(context));

test("Griddy's panel: starters, quick picks, a file of calls, Enter and Shift+Enter, Escape, the conversation kept across screens", async ({ page, context }) => {
  const errors = errorsOf(page);
  let calls = 0;
  await signIn(context, async (route, path) => {
    if (path !== "ai/griddy") return;
    calls++;
    await route.fulfill({ json: { reply: { text: "Got it, Coach.", actions: [] } } });
    return true;
  });
  await seedReady(page);
  const launcher = page.locator("button.gd-launch");
  const panel = page.locator("#griddy-panel");
  const box = panel.getByLabel("Message Griddy");
  const log = panel.getByRole("log", { name: "Conversation with Griddy" });

  // The launcher opens the panel on the hello and ten starters; nothing to reset yet.
  await expect(panel).toHaveCount(0);
  await launcher.click();
  await expect(panel.getByRole("heading", { name: "Griddy" })).toBeVisible();
  await expect(log).toContainText("Hey Coach. Tell me a play and I'll draw it");
  await expect(log.locator(".gd-starter")).toHaveCount(10);
  await expect(panel.getByRole("button", { name: "Start a new conversation" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Send" })).toBeDisabled();

  // A starter types into the box, cursor at the end, and never sends; Clear empties it.
  await log.locator(".gd-starter", { hasText: "Draw a play" }).click();
  await expect(box).toHaveValue("Draw: Trips Right, X bubble, Z go, Y corner");
  await expect(box).toBeFocused();
  await expect(panel.getByRole("button", { name: "Send" })).toBeEnabled();
  expect(calls).toBe(0);
  await panel.getByRole("button", { name: "Clear the message" }).click();
  await expect(box).toHaveValue("");

  // A text file of calls lands in the box under "Add these plays to my Vault"; an empty file says so.
  const file = panel.locator("input[type=file]");
  await file.setInputFiles({ name: "calls.txt", mimeType: "text/plain", buffer: Buffer.from("Trips Right X Bubble\nBunch Y Corner\n") });
  await expect(box).toHaveValue("Add these plays to my Vault.\n\nFrom calls.txt:\nTrips Right X Bubble\nBunch Y Corner");
  await panel.getByRole("button", { name: "Clear the message" }).click();
  await file.setInputFiles({ name: "empty.txt", mimeType: "text/plain", buffer: Buffer.from("   ") });
  await expect(panel.locator(".pa-error")).toHaveText("empty.txt is empty.");
  await expect(box).toHaveValue("");

  // Enter sends; the reply lands, and the quick picks row and New conversation appear.
  await box.fill("hello");
  await box.press("Enter");
  await expect(log.locator(".gd-msg.is-coach")).toContainText("hello");
  await expect(log.locator(".gd-msg.is-griddy").last()).toContainText("Got it, Coach.");
  expect(calls).toBe(1);
  await expect(box).toHaveValue("");
  await expect(panel.getByRole("group", { name: "Quick picks" }).getByRole("button")).toHaveCount(10);
  await expect(panel.getByRole("button", { name: "Start a new conversation" })).toBeVisible();

  // Shift+Enter makes a new line without sending; a quick pick replaces the draft.
  await box.fill("line one");
  await box.press("Shift+Enter");
  await box.pressSequentially("line two");
  await expect(box).toHaveValue("line one\nline two");
  expect(calls).toBe(1);
  await panel.getByRole("group", { name: "Quick picks" }).getByRole("button", { name: "What beats it" }).click();
  await expect(box).toHaveValue("What in my Vault beats Cover 2?");
  expect(calls).toBe(1);

  // Escape closes the panel and hands focus back to the launcher.
  await box.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(launcher).toBeFocused();

  // The conversation follows the coach to the next screen; New conversation clears it.
  await page.locator("aside#rail-nav").getByRole("link", { name: "Playbooks" }).click();
  await expect(page.locator("h1")).toHaveText("Playbooks");
  await launcher.click();
  await expect(log.locator(".gd-msg.is-griddy").last()).toContainText("Got it, Coach.");
  await panel.getByRole("button", { name: "Start a new conversation" }).click();
  await expect(log.locator(".gd-starter")).toHaveCount(10);
  await expect(log.locator(".gd-msg")).toHaveCount(0);
  await panel.getByRole("button", { name: "Close Griddy" }).click();
  await expect(panel).toHaveCount(0);

  // No launcher on the sign-in page; the Designer has Griddy's bar instead.
  await page.goto("/signin");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(launcher).toHaveCount(0);
  await page.goto("/vault");
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await expect(launcher).toHaveCount(0);
  await expect(page.locator(".pa-bar").getByLabel("Message Griddy")).toBeVisible();
  expect(errors).toEqual([]);
});
