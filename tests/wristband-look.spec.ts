import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Wristbands page's look settings: card color sets and a custom color
 * (preview and the saved settings use the same colors), Same size in every
 * box, the header band and bottom border text, the league rule lines and
 * route depths on the cards, the paper choice, and all of it kept after a
 * reload. The card layout, numbering and PDF are in wristbands.spec.ts and
 * export.spec.ts.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("card colors, same size, header and border text, rule lines, depths and paper are kept", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/wristbands");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const card = page.locator('.wb-preview [aria-label^="Card "]').first();
  await expect(card).toBeVisible();
  const head = card.locator(".wb-card-head");
  const prefs = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("grid1ronvault.wristbands.v1") ?? "{}") as {
          sameSize: boolean;
          paper: string;
          footer: string;
          header: { show: boolean; left: string; right: string };
          colors: { head: string } | null;
          look: { rules?: boolean; depths?: boolean };
        },
    );

  // Card colors: the GridIronVault set, then Navy and gold on the preview, then one color changed by hand.
  const colors = page.getByRole("group", { name: "Card colors" });
  const swatches = colors.locator("input[type=color]");
  await expect(colors.locator(".chip[aria-pressed=true]")).toHaveText("GridIronVault");
  await expect(swatches).toHaveCount(5);
  expect(await swatches.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(["#0b1524", "#16c8e8", "#0b1524", "#ffffff", "#0b1524"]);
  await expect(head).toHaveCSS("background-color", "rgb(11, 21, 36)");
  await colors.getByRole("button", { name: "Navy and gold" }).click();
  expect(await swatches.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(["#14213d", "#fca311", "#14213d", "#fca311", "#14213d"]);
  await expect(head).toHaveCSS("background-color", "rgb(20, 33, 61)");
  await expect(head).toHaveCSS("color", "rgb(252, 163, 17)");
  await expect(card.locator(".wb-cell-top b").first()).toHaveCSS("background-color", "rgb(20, 33, 61)");
  await swatches.first().fill("#112233");
  await expect(colors.locator(".chip[aria-pressed=true]")).toHaveCount(0);
  await expect(head).toHaveCSS("background-color", "rgb(17, 34, 51)");
  expect((await prefs()).colors).toEqual({ head: "#112233", headText: "#FCA311", tab: "#14213D", tabText: "#FCA311", line: "#14213D" });

  // Same size in every box changes its note.
  const same = page.getByLabel("Same size in every box");
  await expect(same).not.toBeChecked();
  await expect(page.getByText("Each play fills its own box, so players and routes can differ a little from box to box. Turn this on to match them.")).toBeVisible();
  await same.check();
  await expect(page.getByText("Players, routes and yard lines print the same size on every play. The widest play sets how much field each box shows.")).toBeVisible();

  // Header band and bottom border text show on the card; Reset header puts the default back; off hides the band.
  const headerOn = page.getByLabel("Print a header band");
  const left = page.getByLabel("Header, left");
  await expect(headerOn).toBeChecked();
  await expect(left).toHaveValue("{role} · Card {card} · {source}");
  await expect(page.getByLabel("Header, right")).toHaveValue("{count} plays");
  await expect(head).toContainText("QB wristband · Card A · Ready-to-Go 5v5 Playbook");
  await left.fill("Go Blue");
  await expect(head).toContainText("Go Blue");
  await page.getByRole("button", { name: "Reset header" }).click();
  await expect(left).toHaveValue("{role} · Card {card} · {source}");
  await page.getByLabel("Bottom border").fill("Mid TN Blue");
  await expect(card.locator(".wb-card-foot")).toContainText("Mid TN Blue");
  await headerOn.uncheck();
  await expect(left).toHaveCount(0);
  await expect(head).toHaveCount(0);

  // The league rule lines and route depths draw on the cards.
  const svg = card.locator("svg").first();
  await expect(svg.locator("text", { hasText: "RUSH LINE" })).toHaveCount(0);
  await page.getByLabel("League rush line and no-run zone").check();
  await expect(svg.locator("text", { hasText: "RUSH LINE · 7 YDS" })).toHaveCount(1);
  await page.getByLabel("Yards at each route break").check();
  expect(await svg.locator("g[pointer-events=none] text").count()).toBeGreaterThan(0);

  // Paper.
  const paper = page.getByRole("combobox", { name: "Paper" });
  await expect(paper.locator("option")).toHaveText([
    "Letter sheet, 8.5 × 11 in",
    "Legal sheet, 8.5 × 14 in",
    "A4 sheet, 8.27 × 11.69 in",
    "One card per page (print shop, card stock)",
  ]);
  await expect(paper).toHaveValue("letter");
  await paper.selectOption("card");

  // Everything is kept.
  expect(await prefs()).toMatchObject({
    sameSize: true,
    paper: "card",
    footer: "Mid TN Blue",
    header: { show: false, left: "{role} · Card {card} · {source}", right: "{count} plays" },
    look: { rules: true, depths: true },
  });
  await page.reload();
  await expect(card).toBeVisible();
  await expect(head).toHaveCount(0);
  await expect(card.locator(".wb-card-foot")).toContainText("Mid TN Blue");
  await expect(same).toBeChecked();
  await expect(paper).toHaveValue("card");
  await expect(page.getByLabel("League rush line and no-run zone")).toBeChecked();
  await expect(colors.locator(".chip[aria-pressed=true]")).toHaveCount(0);
  expect(await swatches.first().inputValue()).toBe("#112233");
  expect(errors).toEqual([]);
});
