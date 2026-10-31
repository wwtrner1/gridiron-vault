import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Saved play format: the Designer's Sets tab saves one play's look (colors,
 * player fills, letters, line style, field) and gives it to the open play;
 * the Vault's "Format plays" paints it onto a play per click with Undo; the
 * parts chips narrow what carries over and are kept in this browser; the
 * Wristbands page prints every card in that look with "Apply game-day format".
 */
test.beforeEach(async ({ context }) => quiet(context));

const PURPLE = "#7B2CBF";
const ORANGE = "#FF6600";
type Node = { id: string; kind: string; fill?: string; stroke?: string; closed?: boolean; firstRead?: boolean };
type Play = { id: string; name: string; playType: string; scene: { nodes: Node[] } };
const plays = (page: import("@playwright/test").Page) => page.evaluate(() => JSON.parse(localStorage.getItem("snapline.workspace.v1")!).plays as Play[]);
const fills = (p: Play) => p.scene.nodes.filter((n) => n.kind === "player").map((n) => n.fill);
const strokes = (p: Play) => p.scene.nodes.filter((n) => n.kind === "path" && !n.closed && !n.firstRead).map((n) => n.stroke);

test("a play's format is saved in the Designer, painted onto Vault plays with Undo and narrowed by its parts, and printed on every wristband card", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // The source play gets a look of its own: purple players and orange routes.
  const [a, b, c] = (await plays(page)).filter((p) => p.playType === "pass").slice(0, 3);
  await page.evaluate(
    ({ id, PURPLE, ORANGE }) => {
      const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
      const play = ws.plays.find((p: Play) => p.id === id)!;
      for (const n of play.scene.nodes) {
        if (n.kind === "player") n.fill = PURPLE;
        if (n.kind === "path" && !n.closed) n.stroke = ORANGE;
      }
      localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    },
    { id: a.id, PURPLE, ORANGE },
  );
  expect(fills(b)).not.toContain(PURPLE);
  expect(strokes(b)).not.toContain(ORANGE);

  // Designer → Sets → Saved play format: nothing saved yet, then this play's format.
  await page.goto(`/build/${a.id}`);
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("tab", { name: "Sets" }).click();
  const group = page.locator('section[aria-labelledby="dz-format-title"]');
  await expect(group.locator(".pf-from")).toHaveText("No format saved yet. Open the play that looks right and save its format.");
  await expect(group.getByRole("button", { name: "Apply to this play" })).toBeDisabled();
  await group.getByRole("button", { name: "Save this play's format" }).click();
  await expect(page.locator(".dz-status [role=status]")).toContainText(`Saved the format of ${a.name}. Use it from the Vault or Wristbands too.`);
  await expect(group.locator(".pf-from")).toHaveText(`From ${a.name}`);
  await expect(group.getByRole("button", { name: "Apply to this play" })).toBeEnabled();
  const parts = group.getByRole("group", { name: "Parts of the format to copy" });
  await expect(parts.getByRole("button")).toHaveText(["Colors", "Player fills", "Letters", "Line style", "Field"]);
  await expect(parts.getByRole("button", { pressed: true })).toHaveCount(5);

  // Vault → Format plays: a click paints the play; Undo puts it back.
  await page.goto("/vault");
  const box = page.locator(".vault-format");
  await expect(box).toContainText("Saved play format");
  await box.getByRole("button", { name: "Format plays" }).click();
  await expect(box.getByRole("button", { name: "Format on · click a play" })).toHaveAttribute("aria-pressed", "true");
  await expect(box.locator(".pf-from")).toHaveText(`From ${a.name}`);
  await page.getByRole("button", { name: `Give ${b.name} the saved format` }).click();
  await expect(page.locator(".toast", { hasText: `${b.name} now uses the ${a.name} format.` })).toBeVisible();
  await expect.poll(async () => fills((await plays(page)).find((p) => p.id === b.id)!)).toEqual(fills(b).map(() => PURPLE));
  expect(strokes((await plays(page)).find((p) => p.id === b.id)!)).toEqual(strokes(b).map(() => ORANGE));
  await box.getByRole("button", { name: `Undo ${b.name}` }).click();
  await expect(page.locator(".toast", { hasText: `${b.name} is back the way it was.` })).toBeVisible();
  await expect.poll(async () => fills((await plays(page)).find((p) => p.id === b.id)!)).toEqual(fills(b));
  expect(strokes((await plays(page)).find((p) => p.id === b.id)!)).toEqual(strokes(b));

  // Player fills off: the next play gets the route colors but keeps its own tokens.
  await box.getByRole("button", { name: "Player fills" }).click();
  await expect(box.getByRole("button", { name: "Player fills" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: `Give ${c.name} the saved format` }).click();
  await expect(page.locator(".toast", { hasText: `${c.name} now uses the ${a.name} format.` })).toBeVisible();
  await expect.poll(async () => strokes((await plays(page)).find((p) => p.id === c.id)!)).toEqual(strokes(c).map(() => ORANGE));
  expect(fills((await plays(page)).find((p) => p.id === c.id)!)).toEqual(fills(c));

  // Wristbands: Apply game-day format prints every card in that look, with the parts as left (fills back on here).
  await page.goto("/wristbands");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const card = page.locator('.wb-preview [aria-label^="Card "]').first();
  const svg = card.locator("svg").first();
  await expect(svg.locator(`path[stroke="${ORANGE}"]`)).toHaveCount(0);
  const gameDay = page.getByLabel("Apply game-day format");
  await expect(gameDay).toBeEnabled();
  await gameDay.check();
  await expect(page.locator(".pf-from")).toHaveText(`From ${a.name}`);
  await expect(page.getByRole("button", { name: "Player fills" })).toHaveAttribute("aria-pressed", "false");
  expect(await svg.locator(`path[stroke="${ORANGE}"]`).count()).toBeGreaterThan(0);
  await expect(svg.locator(`circle[fill="${PURPLE}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Player fills" }).click();
  expect(await svg.locator(`circle[fill="${PURPLE}"]`).count()).toBeGreaterThan(0);
  await gameDay.uncheck();
  await expect(svg.locator(`path[stroke="${ORANGE}"]`)).toHaveCount(0);

  // Designer → Apply to this play gives the open play the look, as one undoable step; the parts are kept after a reload.
  await page.goto(`/build/${c.id}`);
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("tab", { name: "Sets" }).click();
  await expect(parts.getByRole("button", { pressed: true })).toHaveCount(5);
  await expect(page.locator(`.stage-frame svg circle[fill="${PURPLE}"]`)).toHaveCount(0);
  await group.getByRole("button", { name: "Apply to this play" }).click();
  await expect(page.locator(".dz-status [role=status]")).toContainText(`Gave this play the ${a.name} format. Undo puts it back.`);
  expect(await page.locator(`.stage-frame svg circle[fill="${PURPLE}"]`).count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
