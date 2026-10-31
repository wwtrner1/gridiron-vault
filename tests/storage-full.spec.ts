import { expect, test, type BrowserContext } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * A browser that refuses to keep the workspace (storage full, or a private
 * window that blocks it): the session keeps working in memory, and one toast
 * says so, in the signed-out words or, signed in, that new changes live on
 * the account only. A second refused write adds no second toast.
 */
test.beforeEach(async ({ context }) => quiet(context));

/** The workspace key refuses every write, the way a full disk does; everything else is kept as usual. */
async function fullStorage(context: BrowserContext) {
  await context.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "snapline.workspace.v1") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
}

test("signed out, a full browser says new work is gone with the tab, once, and the plays still show", async ({ page, context }) => {
  const errors = errorsOf(page);
  await fullStorage(context);
  await page.goto("/vault");
  await page.locator(".vault-ready button").click();
  const toast = page.locator(".toast.is-bad");
  await expect(toast).toHaveText("This browser's storage is full, so new work is gone when you close the tab. Sign in to keep plays on your account, or delete plays you don't need.");
  // The work is still here in memory, and nothing reached the disk.
  await expect(page.locator(".play-card")).toHaveCount(24);
  expect(await page.evaluate(() => localStorage.getItem("snapline.workspace.v1"))).toBeNull();

  // A second refused write (a playbook from the tree) brings no second toast.
  await page.getByRole("button", { name: "New playbook", exact: true }).click();
  await page.getByLabel("New playbook name").fill("Red zone");
  await page.getByLabel("New playbook name").press("Enter");
  await expect(page.getByRole("treeitem", { name: /^Red zone/ })).toBeVisible();
  await expect(toast).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("signed in, a full browser says new changes live on the account only", async ({ page, context }) => {
  const errors = errorsOf(page);
  await fullStorage(context);
  await signIn(context, () => false);
  await page.goto("/vault");
  await page.locator(".vault-ready button").click();
  const toast = page.locator(".toast.is-bad");
  await expect(toast).toHaveText("This browser can't keep more work, so new changes live on your account only until you free up space here.");
  await expect(page.locator(".play-card")).toHaveCount(24);
  expect(errors).toEqual([]);
});
