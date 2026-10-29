import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

async function ask(page: import("@playwright/test").Page, text: string) {
  await page.locator(".gd-launch").click();
  const box = page.locator(".gd-panel textarea").first();
  await box.fill(text);
  await box.press("Enter");
}

test("signed out, Griddy asks the coach to sign in", async ({ page }) => {
  await page.goto("/vault");
  await ask(page, "draw me a slant");
  await expect(page.locator(".gd-panel")).toContainText("Sign in to talk to Griddy");
});

test("Griddy's answer shows its card, loaded on demand", async ({ page, context }) => {
  const errors = errorsOf(page);
  let names: string[] = [];
  await signIn(context, async (route, path) => {
    if (path !== "ai/griddy") return;
    const body = JSON.parse(route.request().postData() ?? "{}");
    const shown = body.context.vault.slice(0, 2) as { id: string; name: string }[];
    names = shown.map((v) => v.name);
    const ids = shown.map((v) => v.id);
    await route.fulfill({ json: { reply: { text: "Here are two.", actions: [{ id: "a1", tool: "show_plays", ids }] } } });
    return true;
  });
  await seedReady(page);
  await ask(page, "show me two plays");
  await expect(page.locator(".gd-msg.is-griddy").last()).toContainText("Here are two.");
  for (const name of names) await expect(page.locator(".gd-turn").last()).toContainText(name);
  expect(errors).toEqual([]);
});

test("a server error reads as coach-facing words, and the coach can try again", async ({ page, context }) => {
  let calls = 0;
  await signIn(context, async (route, path) => {
    if (path !== "ai/griddy") return;
    calls++;
    if (calls === 1) await route.fulfill({ status: 503, json: { error: "Griddy is offline while we fix a problem on our side." } });
    else await route.fulfill({ json: { reply: { text: "Back now.", actions: [] } } });
    return true;
  });
  await page.goto("/vault");
  await ask(page, "hello");
  await expect(page.locator(".gd-panel")).toContainText("Griddy is offline while we fix a problem on our side.");
  const box = page.locator(".gd-panel textarea").first();
  await box.fill("hello again");
  await box.press("Enter");
  await expect(page.locator(".gd-msg.is-griddy").last()).toContainText("Back now.");
});

test("no signal, a timeout or an odd reply never shows a script error, and the message stays in the box", async ({ page, context }) => {
  const errors = errorsOf(page);
  let calls = 0;
  await signIn(context, async (route, path) => {
    if (path !== "ai/griddy") return;
    calls++;
    if (calls === 1) await route.abort("internetdisconnected");
    else if (calls === 2) await route.fulfill({ status: 504, contentType: "text/html", body: "<html>Gateway Timeout</html>" });
    else await route.fulfill({ json: { reply: { text: "half" } } });
    return true;
  });
  await page.goto("/vault");
  await ask(page, "draw me a slant");
  const box = page.locator(".gd-panel textarea").first();
  const err = page.locator(".gd-panel .gd-error");
  await expect(err).toContainText("No signal, so Griddy can't answer right now.");
  await expect(box).toHaveValue("draw me a slant");
  await box.press("Enter");
  await expect(err).toContainText("didn't get an answer in time");
  await expect(box).toHaveValue("draw me a slant");
  await box.press("Enter");
  await expect(err).toContainText("Griddy couldn't answer just now.");
  await expect(box).toHaveValue("draw me a slant");
  await expect(page.locator(".gd-msg.is-coach")).toHaveCount(0);
  expect(errors).toEqual([]);
});
