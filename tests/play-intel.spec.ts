import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The Designer's Play intel drawer: name, formation, type, personnel, field,
 * coaching notes with "Write the talking points for me", labels (typed,
 * suggested, removed) and the public switch, all saved with the play and
 * shown on its Vault card.
 */
test.beforeEach(async ({ context }) => quiet(context));

type Saved = { name: string; formation: string; playType: string; personnel: string; tags: string[]; isPublic: boolean; description: string; scene: { view: string } };

test("Play intel edits the play's name, formation, type, field, notes and labels, and the save keeps them", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  const panel = page.locator(".panel").filter({ has: page.locator(".panel-head", { hasText: "Play intel" }) });
  const field = (name: string) => panel.locator(`label.field:has(> span:text-is("${name}"))`);
  const chips = (name: string) => panel.locator(`.field:has(> span:text-is("${name}")) .chip`);
  const type = panel.getByRole("group", { name: "Type" });
  const personnel = panel.locator('select[aria-labelledby="play-personnel-label"]');
  const notes = field("Coaching notes").locator("textarea");

  // What the starter carries.
  await expect(field("Play name").locator("input")).toHaveValue("17 · Stick");
  await expect(field("Formation").locator("select")).toHaveValue("");
  await expect(type.getByRole("button", { name: "pass" })).toHaveAttribute("aria-pressed", "true");
  await expect(personnel).toHaveValue("5-on-5 offense");
  await expect(chips("Field").filter({ hasText: "Half field" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator('button[aria-label^="Remove the"]')).toHaveText(["ready-to-go", "twins"]);
  const before = await notes.inputValue();
  expect(before).toMatch(/^Y sticks at 5/);

  // The talking points are written from the drawing, after the coach's own notes.
  await panel.getByRole("button", { name: "Write the talking points for me" }).click();
  const after = await notes.inputValue();
  expect(after.startsWith(before.trim())).toBe(true);
  expect(after).toMatch(/\n\nQ takes the snap/);
  expect(after.split("\n").length).toBeGreaterThan(before.split("\n").length + 2);

  // Name (the top bar follows it), formation, type, field, labels, public.
  await field("Play name").locator("input").fill("Stick Right");
  await expect(page.locator(".dz-name")).toContainText("Stick Right");
  await field("Formation").locator("select").selectOption("Trips Right");
  await type.getByRole("button", { name: "defense" }).click();
  await expect(type.getByRole("button", { name: "defense" })).toHaveAttribute("aria-pressed", "true");
  await type.getByRole("button", { name: "pass" }).click();
  await chips("Field").filter({ hasText: "Red zone" }).click();
  await expect(chips("Field").filter({ hasText: "Red zone" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByLabel("Add a label").fill("goal line");
  await page.keyboard.press("Enter");
  await expect(panel.getByLabel("Add a label")).toHaveValue("");
  await panel.locator(".field:has(> span:text-is('Labels')) .chip-row").last().getByRole("button", { name: "Corner" }).click();
  await panel.getByRole("button", { name: "Remove the twins label" }).click();
  await expect(panel.locator('button[aria-label^="Remove the"]')).toHaveText(["ready-to-go", "goal line", "corner"]);
  await panel.getByLabel("Share this play in the public Vault").check();

  // Saved with the play, and on its Vault card.
  await page.locator('button[data-tour="dz-save"]').click();
  await expect(page.locator(".dz-saved")).toContainText("Saved");
  const play = ((await workspace(page)).plays as unknown as Saved[]).find((p) => p.name === "Stick Right")!;
  expect(play).toMatchObject({ formation: "Trips Right", playType: "pass", personnel: "5-on-5 offense", tags: ["ready-to-go", "goal line", "corner"], isPublic: true });
  expect(play.scene.view).toBe("redzone");
  expect(play.description).toMatch(/\n\nQ takes the snap/);
  await page.goto("/vault");
  const card = page.locator(".play-card", { hasText: "Stick Right" }).first();
  await expect(card).toContainText("Trips Right · pass");
  await expect(card).toContainText("goal line");
  expect(errors).toEqual([]);
});
