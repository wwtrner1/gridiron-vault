import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * Turn this offense into a defense (Extras, and the Sets tab's Defense list):
 * the offense on the field picks the front and coverage, the front lines up
 * on its strength by technique, every defender carries a responsibility tag,
 * a second run replaces the first (Undo brings it back), and the tags save
 * with the play. The Defense library's own drop is tagged too, with a switch
 * to leave the tags off.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false })));
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

async function reach(page: Page, button: Locator) {
  await page.locator("#dz-tools").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  // A selection grows the pinned Style card over the foot of the rail, so press the button from the keyboard.
  await button.focus();
  await page.keyboard.press("Enter");
}

/** Every tagged defender: its tag and where it stands across the field. */
async function tagged(svg: Locator) {
  return svg.locator("g[data-kind=player] text[data-job]").evaluateAll((els) =>
    els.map((t) => {
      const g = t.closest("g[data-kind=player]")!;
      const x = Number(/translate\(([\d.-]+)/.exec(g.getAttribute("transform") ?? "")?.[1]);
      return { job: t.getAttribute("data-job") ?? "", x };
    }),
  );
}

/** Clears the field (Ctrl+A, Delete), then drops a formation from Sets → Formations. */
async function dropFormation(page: Page, game: string, personnel: string, formation: string) {
  const svg = page.locator(".stage-frame svg").first();
  if (await svg.locator("g[data-kind]").count()) {
    await page.getByRole("button", { name: "Extras" }).click();
    await page.locator("#dz-more-menu").getByRole("button", { name: "Select all" }).click();
    await page.keyboard.press("Delete");
    await expect(svg.locator("g[data-kind]")).toHaveCount(0);
  }
  await page.getByRole("tab", { name: "Sets" }).click();
  const formations = page.locator("#dz-tabpanel").getByRole("button", { name: "Formations" });
  if ((await formations.getAttribute("aria-expanded")) !== "true") await formations.click();
  const tray = page.locator("#dz-list-tray");
  await tray.getByRole("button", { name: game, exact: true }).click();
  if (game === "11-man") await tray.locator("select").first().selectOption(personnel);
  await tray.locator("select").nth(1).selectOption(formation);
  await reach(page, page.getByRole("button", { name: `Drop ${formation}` }));
}

async function turnIntoDefense(page: Page) {
  await page.getByRole("button", { name: "Extras" }).click();
  await page.locator("#dz-more-menu").getByRole("button", { name: "Turn this offense into a defense" }).click();
}

test("Turn this offense into a defense reads the set, lines up on its strength and tags every defender", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const status = page.locator(".dz-status [role=status]");
  const players = svg.locator("g[data-kind=player]");

  // Nothing on the field: it says what to do first.
  await turnIntoDefense(page);
  await expect(status).toContainText("Put an offense on the field first");

  // 11-man Trips Right (11 personnel): nickel 3-3 Cover 3, strength right.
  await dropFormation(page, "11-man", "11", "Trips Right");
  await expect(players).toHaveCount(11);
  await turnIntoDefense(page);
  await expect(status).toContainText("3-3 Cover 3. Trips: nickel with three deep");
  await expect(status).toContainText("Strength right: 3 receivers to the right");
  await expect(players).toHaveCount(22);
  let jobs = await tagged(svg);
  expect(jobs).toHaveLength(11);
  expect(jobs.map((j) => j.job)).toEqual(expect.arrayContaining(["0 technique", "5 technique", "A gap", "B gap", "Deep 1/3"]));
  // The strong safety rolls down to the trips side: the flat defender toward the three receivers stands right of the ball.
  const flats = jobs.filter((j) => j.job === "Flat");
  expect(flats.length).toBeGreaterThan(0);
  expect(Math.max(...flats.map((f) => f.x))).toBeGreaterThan(520);

  // A second run replaces the first rather than stacking a second defense; Undo brings the first back.
  await turnIntoDefense(page);
  await expect(status).toContainText("The defense that was on the field is replaced");
  await expect(players).toHaveCount(22);
  await page.keyboard.press("Control+z");
  await expect(players).toHaveCount(22);

  // 21 personnel I formation: two backs, so eight in the box. The 3 technique goes to the strength (the tight end's side, right).
  await dropFormation(page, "11-man", "21", "I Formation");
  await turnIntoDefense(page);
  await expect(status).toContainText("4-4 Cover 3. Two backs");
  jobs = await tagged(svg);
  expect(jobs).toHaveLength(11);
  const three = jobs.find((j) => j.job === "3 technique")!;
  const one = jobs.find((j) => j.job === "1 technique")!;
  expect(three.x).toBeGreaterThan(520);
  expect(one.x).toBeLessThan(520);

  // Trips Left: the same call, mirrored, so the trips-side flat is left of the ball.
  await dropFormation(page, "11-man", "11", "Trips Left");
  await turnIntoDefense(page);
  await expect(status).toContainText("Strength left: 3 receivers to the left");
  jobs = await tagged(svg);
  expect(Math.min(...jobs.filter((j) => j.job === "Flat").map((f) => f.x))).toBeLessThan(520);

  // 5v5 flag Trips: one rusher and three deep, from the Defense list on the Sets tab.
  await dropFormation(page, "5v5 flag", "11", "Trips Right");
  await reach(page, page.locator("#dz-tabpanel").getByRole("button", { name: "Defense", exact: true }));
  await reach(page, page.locator("#dz-list-tray").getByRole("button", { name: "Turn this offense into a defense" }));
  await expect(status).toContainText("1 rush · Cover 3");
  jobs = await tagged(svg);
  expect(jobs.map((j) => j.job).sort()).toEqual(["Deep 1/3", "Deep 1/3", "Deep 1/3", "Middle hook", "Rush"]);

  // The tags save with the play.
  await page.locator("#insp-tab-play").click();
  await page.locator("#insp-pane").getByLabel("Play name").fill("Trips vs Cover 3");
  await page.locator('[data-tour="dz-save"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}") as { plays?: { scene: { nodes: { job?: string }[] } }[] };
        return (ws.plays ?? []).flatMap((p) => p.scene.nodes.map((n) => n.job).filter(Boolean)).length;
      }),
    )
    .toBe(5);
  expect(errors).toEqual([]);
});

test("The Defense library drops a front tagged by technique and gap, with a switch to leave the tags off", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/build");
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const panel = page.locator("#dz-tabpanel");
  await page.getByRole("tab", { name: "Sets" }).click();
  await panel.getByRole("button", { name: "Defense", exact: true }).click();
  await expect(page.locator("#dz-list-tray")).toContainText("Responsibility tags put each defender's technique, gap or coverage job under him (5 technique, 1 technique, 3 technique, B gap)");
  await reach(page, page.getByRole("button", { name: "Drop 4-3 Cover 3" }));
  const jobs = await tagged(svg);
  expect(jobs.map((j) => j.job)).toEqual(
    expect.arrayContaining(["5 technique", "1 technique", "3 technique", "B gap", "A gap", "Contain", "Deep 1/3", "Flat"]),
  );
  expect(jobs).toHaveLength(11);

  // Off: the same front with no tags.
  await reach(page, page.getByRole("group", { name: "Responsibility tags" }).getByRole("button", { name: "Off" }));
  await reach(page, page.getByRole("button", { name: "Drop 4-3 Cover 3" }));
  await expect(svg.locator("g[data-kind=player]")).toHaveCount(22);
  expect(await tagged(svg)).toHaveLength(11);
  expect(errors).toEqual([]);
});
