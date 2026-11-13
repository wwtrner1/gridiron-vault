import { expect, test } from "@playwright/test";
import { quiet, seedReady, signIn } from "./helpers";

/**
 * Wristbands page settings: the source, plays per card, numbering, a one-click
 * style, the bottom border text, moving a call, and every setting kept after
 * a reload. The PDF itself is covered in export.spec.ts.
 */
test.beforeEach(async ({ context }) => quiet(context));

const chip = (page: import("@playwright/test").Page, group: string, name: string | RegExp) =>
  page.getByRole("group", { name: group }).getByRole("button", { name });

test("wristband settings lay out the cards, number the calls and are kept after a reload", async ({ page }) => {
  await seedReady(page);
  await page.goto("/wristbands");
  await expect(page.locator("h1")).toHaveText("Wristbands");

  // Pull the Ready-to-Go playbook: 24 calls.
  const source = page.locator('[data-tour="wb-source"] select');
  await source.selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const cards = page.locator('.wb-preview [aria-label^="Card "]');
  await expect(cards.first()).toBeVisible();

  // Plays per card: 8 a card makes three cards, 4 a card makes six.
  await chip(page, "Plays per card (columns × rows)", "8 plays, 4 across and 2 down").click();
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute("aria-label", /^Card A, 8 plays/);
  await expect(cards.last()).toHaveAttribute("aria-label", /^Card C, 8 plays/);
  await chip(page, "Plays per card (columns × rows)", "4 plays, 2 across and 2 down").click();
  await expect(cards).toHaveCount(6);
  await chip(page, "Plays per card (columns × rows)", "8 plays, 4 across and 2 down").click();

  // Numbering: in print order from 10, then by card (11… on A, 21… on B, 31… on C).
  const numbering = page.getByRole("group", { name: "Numbering" });
  await numbering.getByRole("button", { name: "1, 2, 3 in print order" }).click();
  await numbering.getByLabel("Start at").fill("10");
  await expect(numbering).toContainText("Your calls run 10 to 33.");
  await numbering.getByRole("button", { name: "By card" }).click();
  await numbering.getByLabel("First card starts at").fill("1");
  await expect(numbering).toContainText("Your calls run 11 to 38.");
  await expect(page.locator('.wb-preview button[aria-label^="Move 11 "]').first()).toBeVisible();

  // A one-click style: Sideline 2×4 is pressed and keeps the grid at eight.
  await chip(page, "One-click styles", "Sideline 2×4").click();
  await expect(chip(page, "One-click styles", "Sideline 2×4")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Plays per card (columns × rows)", "8 plays, 4 across and 2 down")).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(3);

  // The bottom border text shows on every card, with {card} filled in.
  await page.getByLabel("Bottom border").fill("Mustangs · card {card}");
  await expect(cards.first()).toContainText("Mustangs · card A");
  await expect(cards.last()).toContainText("Mustangs · card C");

  // Moving a call later changes the order and Original order puts it back.
  const first = cards.first().locator('button[aria-label^="Move "][aria-label$=" later"]').first();
  const label = (await first.getAttribute("aria-label"))!;
  const name = label.replace(/^Move \d+ /, "").replace(/ later$/, "");
  await first.click();
  await expect(page.getByRole("button", { name: "Original order" })).toBeVisible();
  await expect(cards.first().locator('button[aria-label$=" later"]').nth(1)).toHaveAttribute("aria-label", new RegExp(`Move \\d+ ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} later`));
  await page.getByRole("button", { name: "Original order" }).click();
  await expect(page.getByRole("button", { name: "Original order" })).toHaveCount(0);
  await expect(cards.first().locator('button[aria-label$=" later"]').first()).toHaveAttribute("aria-label", label);

  // Card size: a youth window says what it fits.
  await page.getByRole("combobox", { name: "Card size" }).selectOption("fpc-youth");
  await expect(page.getByRole("group", { name: "Card size" })).toContainText("Fits a 3.75 × 2.25 in youth window");

  // Everything is kept after a reload.
  await page.reload();
  await expect(cards.first()).toBeVisible();
  await expect(cards).toHaveCount(3);
  await expect(chip(page, "Plays per card (columns × rows)", "8 plays, 4 across and 2 down")).toHaveAttribute("aria-pressed", "true");
  await expect(numbering.getByRole("button", { name: "By card" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Bottom border")).toHaveValue("Mustangs · card {card}");
  await expect(page.getByRole("combobox", { name: "Card size" })).toHaveValue("fpc-youth");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.wristbands.v1") ?? "{}"));
  expect(saved).toMatchObject({ grid: "4x2", sizeId: "fpc-youth", footer: "Mustangs · card {card}", numbering: { mode: "card" } });
});

test("plays picked by hand make the cards, and nothing picked says so", async ({ page }) => {
  await seedReady(page);
  await page.goto("/wristbands");
  const source = page.locator('[data-tour="wb-source"] select');
  await source.selectOption("hand");
  await expect(page.getByText("No plays to print yet")).toBeVisible();
  const picks = page.getByRole("group", { name: "Plays to print" }).getByRole("checkbox");
  await picks.nth(0).check();
  await picks.nth(1).check();
  await picks.nth(2).check();
  const cards = page.locator('.wb-preview [aria-label^="Card "]');
  await expect(cards.first()).toHaveAttribute("aria-label", /^Card A, 3 plays/);
  await picks.nth(1).uncheck();
  await expect(cards.first()).toHaveAttribute("aria-label", /^Card A, 2 plays/);
});

test("Play card style prints 3 to 10 plays a card, with 5 and 7 on a centred short row", async ({ page }) => {
  await seedReady(page);
  await page.goto("/wristbands");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const cards = page.locator('.wb-preview [aria-label^="Card "]');
  await expect(cards.first()).toBeVisible();
  const per = "Plays per card (columns × rows)";

  // Every count from 3 to 10 has a chip; 24 calls make that many cards.
  for (const [count, name, made] of [
    [3, "3 plays, 3 across and 1 down", 8],
    [4, "4 plays, 2 across and 2 down", 6],
    [5, "5 plays, 3 over 2, the short row centred", 5],
    [6, "6 plays, 3 across and 2 down", 4],
    [7, "7 plays, 4 over 3, the short row centred", 4],
    [8, "8 plays, 4 across and 2 down", 3],
    [9, "9 plays, 3 across and 3 down", 3],
    [10, "10 plays, 5 across and 2 down", 3],
  ] as const) {
    await chip(page, per, name).click();
    await expect(cards, `${count} a card`).toHaveCount(made);
  }

  // 5 a card: the second row's two boxes keep the top row's width and sit in the middle.
  await chip(page, per, "5 plays, 3 over 2, the short row centred").click();
  const boxes = cards.first().locator(".wb-cell");
  await expect(boxes).toHaveCount(5);
  const [top, low] = [(await boxes.nth(0).boundingBox())!, (await boxes.nth(3).boundingBox())!];
  expect(Math.abs(low.width - top.width)).toBeLessThan(1);
  expect(low.x - top.x).toBeCloseTo(top.width / 2, 0);

  // The Play card style: gray strip, each card's numbers in its own color, a bold edge, the line of scrimmage lined up.
  await chip(page, "One-click styles", "Play card").click();
  await expect(chip(page, "One-click styles", "Play card")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, per, "5 plays, 3 over 2, the short row centred")).toHaveAttribute("aria-pressed", "true");
  await expect(cards.first()).toHaveAttribute("data-border", "bold");
  await expect(cards.nth(0).locator(".wb-cell-band").first()).toHaveCSS("color", "rgb(224, 32, 27)");
  await expect(cards.nth(1).locator(".wb-cell-band").first()).toHaveCSS("color", "rgb(31, 71, 224)");
  await expect(page.getByLabel("Same size in every box")).toBeChecked();
  await expect(page.getByLabel("Line up the line of scrimmage in every box")).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Number color" })).toHaveValue("card");

  // Kept after a reload.
  await page.reload();
  await expect(cards).toHaveCount(5);
  await expect(chip(page, "One-click styles", "Play card")).toHaveAttribute("aria-pressed", "true");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.wristbands.v1") ?? "{}"));
  expect(saved).toMatchObject({ grid: "3x2-5", numberInk: "card", border: "bold", sameSize: true, look: { lineUp: true } });
});

test("Undo and Redo, saved setups, the call sheet's columns and the one-page sheet with diagrams", async ({ page }) => {
  await seedReady(page);
  await page.goto("/wristbands");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const cards = page.locator('.wb-preview [aria-label^="Card "]');
  const grid = "Plays per card (columns × rows)";
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });

  // Undo and Redo step through the changes, from the buttons and from the keyboard.
  await chip(page, grid, "8 plays, 4 across and 2 down").click();
  await expect(cards).toHaveCount(3);
  await chip(page, grid, "4 plays, 2 across and 2 down").click();
  await expect(cards).toHaveCount(6);
  await undo.click();
  await expect(cards).toHaveCount(3);
  await redo.click();
  await expect(cards).toHaveCount(6);
  await expect(redo).toBeDisabled();
  await page.locator(".wb-lede").click();
  await page.keyboard.press("Control+z");
  await expect(cards).toHaveCount(3);
  await page.keyboard.press("Control+Shift+z");
  await expect(cards).toHaveCount(6);

  // Save these settings under a name, change them, then load the setup back.
  await chip(page, "One-click styles", "Play card").click();
  await page.getByLabel("Name for these settings").fill("Varsity Friday");
  await page.getByRole("button", { name: "Save setup" }).click();
  await expect(page.locator(".toast", { hasText: 'Saved "Varsity Friday"' })).toBeVisible();
  await chip(page, "One-click styles", "Sideline 2×4").click();
  await expect(cards).toHaveCount(3);
  await page.getByLabel("Setup to load").selectOption({ label: "Varsity Friday" });
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(chip(page, "One-click styles", "Play card")).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(6);
  // Loading is one step: Undo puts the Sideline settings back.
  await undo.click();
  await expect(chip(page, "One-click styles", "Sideline 2×4")).toHaveAttribute("aria-pressed", "true");
  // Delete, then the toast's Undo brings the setup back.
  await page.getByRole("button", { name: "Delete the picked setup" }).click();
  await expect(page.getByLabel("Setup to load").locator("option", { hasText: "Varsity Friday" })).toHaveCount(0);
  await page.locator(".toast button", { hasText: "Undo" }).click();
  await expect(page.getByLabel("Setup to load").locator("option", { hasText: "Varsity Friday" })).toHaveCount(1);

  // The call sheet prints the columns the coach picks; the number always stays.
  const sheet = page.getByRole("group", { name: "Coach's call sheet" });
  const cols = sheet.getByRole("group", { name: "Columns on the call sheet" });
  const heads = page.locator(".wb-sheet-table thead th");
  await expect(heads).toHaveText(["#", "Play", "Formation", "Type", "Card"]);
  await expect(cols.getByRole("button", { name: "#" })).toBeDisabled();
  await cols.getByRole("button", { name: "Formation" }).click();
  await cols.getByRole("button", { name: "Personnel" }).click();
  await cols.getByRole("button", { name: "Notes" }).click();
  await expect(heads).toHaveText(["#", "Play", "Personnel", "Type", "Card", "Notes"]);
  await sheet.getByLabel("Title", { exact: true }).fill("{team} · Friday plan");
  await sheet.getByRole("checkbox", { name: "Today's date by the title" }).check();
  await sheet.getByLabel("Blank lines for game-day notes").fill("6");

  // One page with diagrams: all 24 calls on a single letter page.
  await sheet.getByLabel("Call sheet prints").selectOption({ label: "One page with diagrams: every call on one sheet" });
  await page.locator(".wb-head-actions").getByRole("button", { name: "Call sheet" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator('.modal button:has-text("Download PDF")').click()]);
  const bytes = await (await download.createReadStream()).toArray();
  const pdf = Buffer.concat(bytes).toString("latin1");
  expect(pdf.match(/\/Type \/Page\b(?!s)/g)?.length).toBe(1);

  // Every call sheet choice and the saved setup are kept after a reload.
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.wristbands.v1") ?? "{}"));
  expect(saved.coachSheet).toBe("onepage");
  expect(saved.sheet).toMatchObject({
    title: "{team} · Friday plan",
    columns: ["number", "name", "personnel", "type", "spot", "notes"],
    date: true,
    blankRows: 6,
  });
  const setups = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.wristbandSetups.v1") ?? "{}"));
  expect(setups.setups.map((s: { name: string }) => s.name)).toEqual(["Varsity Friday"]);
  await expect(page.getByLabel("Setup to load").locator("option", { hasText: "Varsity Friday" })).toHaveCount(1);
});

test("saved setups live on the account: another device's setup loads here, and a new one or a delete goes up", async ({ page, context }) => {
  // The account already holds a setup saved on the coach's phone.
  let held = {
    setups: [{ id: "setup-phone", name: "Phone setup", prefs: { grid: "3x2-5", numberInk: "card" }, savedAt: "2026-11-13T08:00:00.000Z" }],
    deleted: [] as { id: string; at: string }[],
  };
  const puts: (typeof held)[] = [];
  await signIn(context, async (route, path, method) => {
    if (path !== "wristband-setups") return false;
    if (method === "PUT") {
      const sent = route.request().postDataJSON().setups as typeof held;
      puts.push(sent);
      const gone = new Set(sent.deleted.map((d) => d.id));
      held = { setups: [...sent.setups, ...held.setups.filter((s) => !sent.setups.some((x) => x.id === s.id) && !gone.has(s.id))], deleted: sent.deleted };
    }
    await route.fulfill({ json: { setups: held } });
    return true;
  });
  await seedReady(page);
  await page.goto("/wristbands");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const pick = page.getByLabel("Setup to load");
  await expect(pick.locator("option", { hasText: "Phone setup" })).toHaveCount(1);
  await expect(page.locator(".wb-setups")).toContainText("Saved to your account");

  // Loading the phone's setup sets this page: 5 a card, a color per card.
  await pick.selectOption({ label: "Phone setup" });
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(chip(page, "Plays per card (columns × rows)", /5 plays, 3 over 2/)).toHaveAttribute("aria-pressed", "true");

  // A setup saved here goes to the account beside the phone's.
  await page.getByLabel("Name for these settings").fill("Laptop setup");
  await page.getByRole("button", { name: "Save setup" }).click();
  await expect(page.locator(".toast", { hasText: 'Saved "Laptop setup" on your account' })).toBeVisible();
  await expect.poll(() => held.setups.map((s) => s.name).sort()).toEqual(["Laptop setup", "Phone setup"]);

  // A delete goes up as well, so the phone drops it too.
  await pick.selectOption({ label: "Phone setup" });
  await page.getByRole("button", { name: "Delete the picked setup" }).click();
  await expect.poll(() => held.setups.map((s) => s.name)).toEqual(["Laptop setup"]);
  expect(puts[puts.length - 1].deleted.map((d) => d.id)).toEqual(["setup-phone"]);
});
