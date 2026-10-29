import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const ID = "33333333-3333-4333-8333-333333333333";
const play = {
  id: ID, ownerId: "u1", ownerName: "Coach", name: "Spot Right", formation: "Trips", playType: "pass", personnel: "", description: "", tags: [],
  fieldView: "half", scene: { version: 2, view: "half", losY: 400, nodes: [] }, preview: "", isPublic: false, saveCount: 0, updatedAt: "2026-10-01T00:00:00.000Z",
};

test("a play deleted with no signal stays deleted and leaves the account when the signal is back", async ({ page, context }) => {
  const errors = errorsOf(page);
  let online = false;
  const deletes: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (path.startsWith("plays") && method === "GET") {
      await route.fulfill({ json: { plays: deletes.length ? [] : [play] } });
      return true;
    }
    if (path === `plays/${ID}` && method === "DELETE") {
      if (!online) await route.abort("internetdisconnected");
      else {
        deletes.push(ID);
        await route.fulfill({ json: { ok: true } });
      }
      return true;
    }
  });
  await page.goto("/vault");
  await page.locator(".play-card", { hasText: "Spot Right" }).waitFor();
  await page.getByRole("button", { name: "Delete Spot Right" }).click();
  await expect(page.locator(".play-card", { hasText: "Spot Right" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("grid1ronvault.deletes.v1"))).toContain(ID);

  // The account still has it, but the next pull doesn't bring it back.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".play-card", { hasText: "Spot Right" })).toHaveCount(0);
  expect((await workspace(page)).plays!.some((p) => p.id === ID)).toBe(false);

  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => deletes).toEqual([ID]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("grid1ronvault.deletes.v1"))).toBeNull();
  expect(errors).toEqual([]);
});
