import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * Film breakdown on Upload: a play-by-play CSV is read in the browser, each
 * offensive rep is matched to the Vault play with the same name (defense and
 * kicking reps left out), the coach picks a play for a name that didn't match,
 * names the film and keeps the reps in the plays. Run play then says what the
 * film shows about the play, the same film brought in again replaces its reps,
 * and Clear these reps takes them off. A file that isn't a CSV, or has no play
 * column, is refused in coach words.
 */
test.beforeEach(async ({ context }) => quiet(context));

const CSV = `PLAY #,ODK,DN,DIST,HASH,OFF FORM,OFF PLAY,PLAY TYPE,RESULT,GN/LS
1,O,1,10,M,Trips Right,Stick,Pass,Complete,6
2,O,2,4,L,Trips Right,Stick,Pass,Incomplete,0
3,D,1,10,,,Cover 3,,,
4,O,3,4,R,Spread,Mystery Play,Pass,Complete,12
5,K,,,,,Punt,,,
6,O,1,10,M,,stick,Pass,TD,18
`;
const file = (name: string, text: string, mimeType = "text/csv") => ({ name, mimeType, buffer: Buffer.from(text) });

test("a breakdown CSV is matched to Vault plays, kept in them and shown in Run play", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/upload");
  const card = page.getByRole("region", { name: "Film breakdown" });
  const pick = card.locator("input[type=file]");

  // Refusals, in coach words.
  await pick.setInputFiles(file("breakdown.pdf", "%PDF", "application/pdf"));
  await expect(card.getByRole("alert")).toContainText("breakdown.pdf isn't a CSV.");
  await pick.setInputFiles(file("roster.csv", "First,Last\nSam,Lee\n"));
  await expect(card.getByRole("alert")).toContainText("That file has no play column.");

  // The real thing: offense only, Stick found under its Vault number, the stranger left for the coach.
  await pick.setInputFiles(file("week-3_vs_central.csv", CSV));
  const box = page.getByRole("dialog", { name: "Match your film to your plays" });
  await expect(box.getByLabel("Name this film")).toHaveValue("week 3 vs central");
  await expect(box.getByRole("status")).toContainText("3 of 4 reps matched to a Vault play.");
  await expect(box.locator("tbody tr")).toHaveCount(2);
  const stick = box.getByLabel("Vault play for Stick");
  await expect(stick.locator("option:checked")).toHaveText("17 · Stick");
  await expect(box.getByLabel("Vault play for Mystery Play")).toHaveValue("");
  await expect(box.getByRole("button", { name: "Add 3 reps to 1 play" })).toBeEnabled();
  expect((await new AxeBuilder({ page }).include(".modal").analyze()).violations).toEqual([]);

  // The coach ties the stranger to a play, names the film and keeps the reps.
  await box.getByLabel("Vault play for Mystery Play").selectOption({ index: 1 });
  await expect(box.getByRole("status")).toContainText("4 of 4 reps matched");
  await box.getByLabel("Vault play for Mystery Play").selectOption("");
  await box.getByLabel("Name this film").fill("");
  await expect(box.getByRole("button", { name: "Add 3 reps to 1 play" })).toBeDisabled();
  await box.getByLabel("Name this film").fill("Week 3 vs Central");
  await box.getByRole("button", { name: "Add 3 reps to 1 play" }).click();
  await expect(box).toBeHidden();
  await expect(page.getByText("3 reps from Week 3 vs Central added to 1 play.")).toBeVisible();
  const reps = async () => ((await workspace(page)).plays!.find((p) => p.name === "17 · Stick")!.scene as unknown as { film?: { reps?: unknown[] } }).film?.reps;
  expect(await reps()).toEqual([
    { game: "Week 3 vs Central", n: 1, down: 1, dist: 10, gain: 6, result: "Complete" },
    { game: "Week 3 vs Central", n: 2, down: 2, dist: 4, gain: 0, result: "Incomplete" },
    { game: "Week 3 vs Central", n: 6, down: 1, dist: 10, gain: 18, result: "TD" },
  ]);

  // The same film again replaces its reps instead of doubling them.
  await pick.setInputFiles(file("again.csv", CSV));
  await box.getByLabel("Name this film").fill("Week 3 vs Central");
  await box.getByRole("button", { name: "Add 3 reps to 1 play" }).click();
  await expect(box).toBeHidden();
  expect(await reps()).toHaveLength(3);

  // Run play says what the film shows, newest rep first, and can clear it.
  await page.goto("/vault");
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.locator('[data-tour="dz-run"]').first().click();
  const run = page.getByRole("dialog", { name: /Run play/ });
  const film = run.getByRole("group", { name: "From your film" });
  await expect(film).toContainText("Called 3 times on film · 8 yards a call · best 18");
  await expect(film.locator("li").first()).toHaveText("Week 3 vs Central · rep 6 · 1st & 10 · TD · +18 yd");
  await film.getByRole("button", { name: "Clear these reps" }).click();
  await expect(film).toHaveCount(0);
  expect(errors).toEqual([]);
});
