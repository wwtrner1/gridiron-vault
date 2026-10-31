import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const REMOTE = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

test("a /build link to a play only on the account fetches it; a missing one says so", async ({ page, context }) => {
  const errors = errorsOf(page);
  let scene: unknown = null;
  let name = "";
  const fetched: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (method !== "GET" || !path.startsWith("plays/")) return;
    fetched.push(path);
    if (path === `plays/${REMOTE}`) {
      await route.fulfill({
        json: { play: { id: REMOTE, ownerId: "u1", ownerName: "Coach", name, formation: "Trips Right", playType: "pass", personnel: "", description: "", tags: [], fieldView: "half", scene, preview: "", isPublic: false, saveCount: 3, updatedAt: new Date().toISOString() } },
      });
      return true;
    }
    await route.fulfill({ status: 404, json: { error: "That play no longer exists." } });
    return true;
  });

  // Borrow a starter's drawing for the "account" copy, then empty this browser's Vault.
  await seedReady(page);
  const starter = (await workspace(page)).plays![0];
  scene = starter.scene;
  name = `${starter.name} (cloud)`;
  const players = starter.scene.nodes.filter((n) => "label" in n).length;
  await page.evaluate(() => localStorage.removeItem("snapline.workspace.v1"));

  await page.goto(`/build/${REMOTE}`);
  await expect(page.locator(".stage-frame svg g[data-kind=player]")).toHaveCount(players);
  await expect(page.locator(".dz-draftbar")).toHaveCount(0);
  expect(fetched).toContain(`plays/${REMOTE}`);
  const kept = (await workspace(page)).plays!.find((p) => p.id === REMOTE);
  expect(kept?.remote).toBe(true);
  expect(kept?.name).toBe(name);

  // Opening it again comes from the browser, no second fetch.
  fetched.length = 0;
  await page.goto(`/build/${REMOTE}`);
  await expect(page.locator(".stage-frame svg g[data-kind=player]")).toHaveCount(players);
  await page.waitForTimeout(400);
  expect(fetched).toEqual([]);

  // A play the account doesn't have: the bar says so and offers the Vault.
  await page.goto(`/build/${GONE}`);
  const bar = page.locator(".dz-draftbar.is-missing");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("This play isn't in your Vault.");
  await bar.getByRole("button", { name: "Open the Vault" }).click();
  await expect(page).toHaveURL(/\/vault$/);
  expect(errors).toEqual([]);
});

test("signed out, a /build link to an unknown play offers sign-in or the Vault", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto(`/build/${GONE}`);
  const bar = page.locator(".dz-draftbar.is-missing");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("This play isn't in this browser's Vault.");
  await expect(bar.getByRole("button", { name: "Sign in" })).toBeVisible();
  await bar.getByRole("button", { name: "Draw here" }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator(".stage-frame svg")).toBeVisible();
  expect(errors).toEqual([]);
});
