import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

type Node = { id: string; kind: string; label?: string };

/** The select under one of the setup's labels. */
const field = (setup: import("@playwright/test").Locator, name: string) => setup.locator(`label.field:has(span:text-is("${name}")) select`);

test("New play setup lines the personnel up, files the play in a new playbook on its first save, and stays off when the coach says so", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);

  // A fresh /build asks: name, personnel, formation, field, playbook.
  await page.goto("/build");
  const setup = page.getByRole("dialog", { name: "New play" });
  await expect(setup).toBeVisible();
  await setup.getByPlaceholder("Trips Right Smash").fill("Bunch Right Flood");
  await field(setup, "Personnel").selectOption("5-on-5 offense");
  await field(setup, "Playbook").selectOption("__new__");
  await setup.getByPlaceholder("Varsity Offense 2026").fill("Varsity Offense 2026");
  await setup.getByRole("button", { name: "Open the field" }).click();
  await expect(setup).toBeHidden();

  // The five players are on the field, named from the personnel, before anything is drawn.
  await page.locator(".stage-frame svg").first().waitFor();
  await expect(page.locator(".stage-frame svg g[data-kind=player]")).toHaveCount(5);

  // The first save files the play in the new playbook.
  await page.locator('[data-tour="dz-save"]').click();
  await expect.poll(async () => (await workspace(page)).plays!.find((p) => p.name === "Bunch Right Flood")?.id).toBeTruthy();
  const ws = await workspace(page);
  const play = ws.plays!.find((p) => p.name === "Bunch Right Flood")!;
  const players = (play.scene.nodes as unknown as Node[]).filter((n) => n.kind === "player");
  expect(players).toHaveLength(5);
  const letters = players.map((n) => n.label?.trim().toUpperCase());
  expect(new Set(letters).size).toBe(5);
  expect(letters).toEqual(expect.arrayContaining(["Q", "C"]));
  const book = (ws.playbooks as unknown as { id: string; name: string; playIds: string[] }[]).find((b) => b.name === "Varsity Offense 2026");
  expect(book?.playIds).toEqual([play.id]);

  // The next new play remembers the personnel and the playbook.
  await page.goto("/build");
  await expect(setup).toBeVisible();
  await expect(field(setup, "Personnel")).toHaveValue("5-on-5 offense");
  await expect(field(setup, "Playbook")).toHaveValue(book!.id);

  // "Skip this next time" opens a blank field from then on, and Extras turns it back on.
  await setup.getByLabel(/Skip this next time/).check();
  await setup.getByRole("button", { name: "Blank field" }).click();
  await expect(setup).toBeHidden();
  await page.goto("/build");
  await page.locator(".stage-frame svg").first().waitFor();
  await expect(setup).toBeHidden();
  await expect(page.locator(".stage-frame svg g[data-kind=player]")).toHaveCount(0);
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.getByRole("button", { name: /New play setup: off/ }).click();
  await page.goto("/build");
  await expect(setup).toBeVisible();

  expect(errors).toEqual([]);
});
