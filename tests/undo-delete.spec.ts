import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("Undo on the delete message brings a play back into its playbook, and a playbook back with its plays", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.locator(".play-card .play-pick").nth(0).click();
  await page.locator(".play-card .play-pick").nth(1).click();
  await page.getByRole("button", { name: "Add to new playbook" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "New playbook" }).fill("Varsity");
  await dialog.getByRole("button", { name: "Create and add 2 plays" }).click();
  await expect(dialog).toBeHidden();
  const book = async () => (await workspace(page)).playbooks!.find((b) => b.name === "Varsity") as { name: string; playIds: string[] } | undefined;
  const ids = (await book())!.playIds;
  expect(ids).toHaveLength(2);

  // Delete the first of them from its card, then Undo.
  const name = (await workspace(page)).plays!.find((p) => p.id === ids[0])!.name;
  await page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
  await expect(page.locator(".play-card", { hasText: name })).toHaveCount(0);
  expect((await book())!.playIds).toEqual([ids[1]]);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".play-card", { hasText: name }).first()).toBeVisible();
  expect((await book())!.playIds).toEqual(ids);
  await expect(page.locator(".toast")).toHaveCount(0);

  // The playbook itself: Delete, then Undo brings it back with both plays.
  await page.goto("/playbooks");
  await page.getByRole("button", { name: "Delete Varsity", exact: true }).click();
  await expect.poll(async () => await book()).toBeUndefined();
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await book())?.playIds).toEqual(ids);
  await expect(page.getByText("Varsity").first()).toBeVisible();
  expect(errors).toEqual([]);
});

const ID = "44444444-4444-4444-8444-444444444444";
const NEW_ID = "55555555-5555-4555-8555-555555555555";
const play = {
  id: ID, ownerId: "u1", ownerName: "Coach", name: "Spot Left", formation: "Trips", playType: "pass", personnel: "", description: "", tags: [],
  fieldView: "half", scene: { version: 2, view: "half", losY: 400, nodes: [] }, preview: "", isPublic: false, saveCount: 0, updatedAt: "2026-10-01T00:00:00.000Z",
};

test("Undo after deleting an account play sends it back up as a new play", async ({ page, context }) => {
  const errors = errorsOf(page);
  const calls: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (path.startsWith("plays") && method === "GET") {
      await route.fulfill({ json: { plays: calls.length ? [] : [play] } });
      return true;
    }
    if (path === `plays/${ID}` && method === "DELETE") {
      calls.push("DELETE");
      await route.fulfill({ json: { ok: true } });
      return true;
    }
    if (path === "plays" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { name: string };
      calls.push(`POST ${body.name}`);
      await route.fulfill({ json: { play: { ...play, id: NEW_ID, updatedAt: new Date().toISOString() } } });
      return true;
    }
  });
  await page.goto("/vault");
  await page.locator(".play-card", { hasText: "Spot Left" }).waitFor();
  await page.getByRole("button", { name: "Delete Spot Left", exact: true }).click();
  await expect.poll(() => calls).toEqual(["DELETE"]);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".play-card", { hasText: "Spot Left" }).first()).toBeVisible();
  await expect.poll(() => calls).toEqual(["DELETE", "POST Spot Left"]);
  await expect.poll(async () => (await workspace(page)).plays!.find((p) => p.name === "Spot Left")).toMatchObject({ id: NEW_ID, remote: true });
  expect((await workspace(page)).plays!.some((p) => p.id === ID)).toBe(false);
  expect(errors).toEqual([]);
});
