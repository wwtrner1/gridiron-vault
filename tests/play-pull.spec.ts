import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const CLOUD_PLAY = "77777777-7777-4777-8777-777777777777";
const CLOUD_BOOK = "88888888-8888-4888-8888-888888888888";

test("signing in on a new device brings the account's plays down before the Vault is opened", async ({ page, context }) => {
  const errors = errorsOf(page);
  let scene: unknown = null;
  let serve = false;
  const pulls: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (method !== "GET") return;
    if (path.startsWith("plays")) {
      pulls.push(path);
      if (!serve) return;
      await route.fulfill({
        json: { plays: [{ id: CLOUD_PLAY, ownerId: "u1", ownerName: "Coach", name: "Cloud Mesh", formation: "Trips Right", playType: "pass", personnel: "", description: "", tags: [], fieldView: "half", scene, preview: "", isPublic: false, saveCount: 2, updatedAt: "2026-10-20T00:00:00.000Z" }] },
      });
      return true;
    }
    if (path === "playbooks" && serve) {
      await route.fulfill({ json: { playbooks: [{ id: CLOUD_BOOK, name: "Red Zone", description: "", color: "#1f8fff", isPublic: false, updatedAt: "2026-10-20T00:00:00.000Z" }], members: [{ playbookId: CLOUD_BOOK, playId: CLOUD_PLAY, sortOrder: 0 }] } });
      return true;
    }
  });

  // Borrow a starter's drawing for the account copy, then empty this browser.
  await seedReady(page);
  scene = (await workspace(page)).plays![0].scene;
  await page.evaluate(() => localStorage.removeItem("snapline.workspace.v1"));
  serve = true;
  pulls.length = 0;

  // Straight to Playbooks, never the Vault: the play is there, filed in the account's playbook.
  await page.goto("/playbooks");
  await expect(page.getByText("Red Zone").first()).toBeVisible();
  await expect.poll(async () => (await workspace(page)).plays?.find((p) => p.id === CLOUD_PLAY)?.name).toBe("Cloud Mesh");
  expect(pulls).toContain("plays");
  await expect(page.locator(".book-chip").first()).toBeVisible();
  await expect(page.locator(".book-chip").first().getByRole("img", { name: "Cloud Mesh diagram" })).toBeVisible();
  expect(errors).toEqual([]);
});
