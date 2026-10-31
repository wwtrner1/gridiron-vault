import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const org = { id: "org1", name: "Vaultline Youth", seats: 3, members: [], shares: [] };
const live = (n: number) => ({ id: `live${n}`, orgId: "org1", name: `Staff play ${n}`, rev: 1, updatedAt: "2026-10-31T10:00:00Z", updatedBy: "Coach" });

test("Draw together: delete asks in the app, Cancel keeps the play, Delete for everyone removes it", async ({ page, context }) => {
  const errors = errorsOf(page);
  let plays = [live(1), live(2)];
  const deleted: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") {
      await route.fulfill({ json: { mine: org, joined: [], invites: [] } });
      return true;
    }
    if (path === "live" && method === "GET") {
      await route.fulfill({ json: { plays, live: true } });
      return true;
    }
    if (path.startsWith("live/") && method === "DELETE") {
      const id = path.slice("live/".length);
      deleted.push(id);
      plays = plays.filter((p) => p.id !== id);
      await route.fulfill({ json: { ok: true } });
      return true;
    }
  });

  await page.goto("/front-office?tab=live");
  const list = page.locator(".fo-list");
  await expect(list.locator("li")).toHaveCount(2);

  // No browser confirm: an in-app box, and focus never starts on the confirming button.
  await page.getByRole("button", { name: "Delete Staff play 1" }).click();
  const box = page.getByRole("dialog", { name: "Delete Staff play 1 for everyone?" });
  await expect(box).toBeVisible();
  await expect(box).toContainText("no Undo");
  await expect(box.getByRole("button", { name: "Delete for everyone" })).not.toBeFocused();
  await box.getByRole("button", { name: "Cancel" }).click();
  await expect(box).toHaveCount(0);
  await expect(list.locator("li")).toHaveCount(2);
  expect(deleted).toEqual([]);

  // Delete for everyone goes to the account and the list refreshes without it.
  await page.getByRole("button", { name: "Delete Staff play 1" }).click();
  await box.getByRole("button", { name: "Delete for everyone" }).click();
  await expect(box).toHaveCount(0);
  await expect(list.locator("li")).toHaveCount(1);
  await expect(list).toContainText("Staff play 2");
  expect(deleted).toEqual(["live1"]);
  await expect(page.locator(".toast").last()).toContainText("Staff play 1 deleted for everyone");
  expect(errors).toEqual([]);
});
