import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("a Call Sheet saved with no signal goes to the account once, when the signal is back", async ({ page, context }) => {
  const errors = errorsOf(page);
  let online = false;
  const creates: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("call-sheets") || method === "GET") return;
    if (!online) {
      await route.abort("internetdisconnected");
      return true;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    if (method === "POST") creates.push(body.name);
    await route.fulfill({ json: { sheet: { id: "44444444-4444-4444-8444-444444444444", name: body.name, columns: body.columns, rows: body.rows, updatedAt: new Date().toISOString() } } });
    return true;
  });
  await page.goto("/grid");
  const save = page.getByRole("button", { name: /Save sheet/ });
  await save.click();
  await expect(page.locator(".toast", { hasText: "No signal, so the call sheet is in this browser for now." })).toBeVisible();

  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => creates.length).toBe(1);
  await save.click();
  await expect(page.locator(".toast", { hasText: "Call sheet saved to your account." })).toBeVisible();
  expect(creates.length).toBe(1);
  const sheets = await page.evaluate(() => JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}").sheets as { remoteId?: string }[]);
  expect(sheets.some((s) => s.remoteId === "44444444-4444-4444-8444-444444444444")).toBe(true);
  expect(errors).toEqual([]);
});
