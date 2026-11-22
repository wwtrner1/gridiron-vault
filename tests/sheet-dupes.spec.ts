import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { errorsOf, quiet } from "./helpers";

/**
 * Tidy up on the Call Sheet: copies the old sync left behind (blank "Call Sheet"
 * sheets nobody touched, and exact repeats of a sheet with calls) are offered as
 * one button, removed together with an Undo, and a sheet with calls of its own is
 * never touched even when it shares a name with another.
 */
test.beforeEach(async ({ context }) => quiet(context));

const HEADERS = ["#", "Play Name", "Group", "Run", "Pass", "Down", "Distance", "Hash", "YL", "Route", "Position"];

/** A sheet as the store holds it (ids are per sheet, so a repeat has different column and row ids, as a real copy does). */
function sheet(id: string, name: string, calls: string[] = [], extra: Record<string, unknown> = {}) {
  const columns = HEADERS.map((label, i) => ({ id: `${id}-c${i}`, label, width: 96, type: "text" }));
  const play = columns.find((c) => c.label === "Play Name")!.id;
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `${id}-r${i}`,
    cells: Object.fromEntries(columns.map((c) => [c.id, c.label === "#" ? String(i + 1) : c.id === play ? (calls[i] ?? "") : ""])),
    colors: {},
    playId: null,
  }));
  return { id, name, columns, rows, updatedAt: "2026-11-01T12:00:00.000Z", remoteId: null, ...extra };
}

const names = (page: Page) =>
  page.evaluate(() => ((JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}").sheets ?? []) as { id: string; name: string }[]).map((s) => `${s.id}:${s.name}`));

const seed = (page: Page, sheets: object[]) =>
  page.context().addInitScript((ws) => {
    if (sessionStorage.getItem("ws-seeded")) return;
    sessionStorage.setItem("ws-seeded", "1");
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
  }, { plays: [], playbooks: [], sheets });

const ready = ["Hail Mary", "Mesh", "Stick", "Smash"];

test("Tidy up removes blank copies and exact repeats, keeps every sheet with its own calls, and Undo brings them back", async ({ page }) => {
  const errors = errorsOf(page);
  await seed(page, [
    sheet("saturday", "Saturday", ["Mesh", "Stick"]),
    sheet("blank-1", "Call Sheet"),
    sheet("blank-2", "Call Sheet"),
    sheet("blank-3", "Call Sheet 3"),
    sheet("ready-a", "Ready-to-Go 5v5 Call Sheet", ready, { remoteId: "11111111-1111-4111-8111-111111111111" }),
    sheet("ready-b", "Ready-to-Go 5v5 Call Sheet", ready),
    // Same name, different calls: a coach's own work, left alone and counted.
    sheet("ready-c", "Ready-to-Go 5v5 Call Sheet", ["Flood", "Four Verts"]),
    sheet("dolphins", "Dolphins Call Sheet", ["Smash"]),
  ]);
  await page.goto("/grid");

  const bar = page.locator(".sheet-dupes");
  // Three blanks and one exact repeat.
  await expect(bar).toContainText("4 duplicate call sheets");
  await expect(bar).toContainText("Sheets with their own calls are never removed.");
  const axe = await new AxeBuilder({ page }).include(".sheet-dupes").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await bar.getByRole("button", { name: "Tidy up" }).click();
  await expect(page.locator(".toast")).toContainText("4 duplicate call sheets removed. No plays were deleted. 1 more with the same name holds different calls, so it stays for you to check.");
  // The copy on the account stays over the browser's copy; every sheet with calls of its own is still here.
  expect(await names(page)).toEqual(["saturday:Saturday", "ready-a:Ready-to-Go 5v5 Call Sheet", "ready-c:Ready-to-Go 5v5 Call Sheet", "dolphins:Dolphins Call Sheet"]);
  await expect(bar).toHaveCount(0);

  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await names(page)).length).toBe(8);
  await expect(bar).toContainText("4 duplicate call sheets");
  expect(errors).toEqual([]);
});

test("nothing to tidy: no bar, and a lone blank sheet is never offered for removal", async ({ page }) => {
  const errors = errorsOf(page);
  await seed(page, [sheet("only", "Call Sheet")]);
  await page.goto("/grid");
  await expect(page.getByLabel("Call sheet name")).toHaveValue("Call Sheet");
  await expect(page.locator(".sheet-dupes")).toHaveCount(0);
  expect(await names(page)).toEqual(["only:Call Sheet"]);
  expect(errors).toEqual([]);
});

test("when every sheet is a blank copy, one stays", async ({ page }) => {
  const errors = errorsOf(page);
  await seed(page, [sheet("b1", "Call Sheet"), sheet("b2", "Call Sheet"), sheet("b3", "Call Sheet 2", [], { remoteId: "22222222-2222-4222-8222-222222222222" })]);
  await page.goto("/grid");
  await expect(page.locator(".sheet-dupes")).toContainText("2 duplicate call sheets");
  await page.locator(".sheet-dupes").getByRole("button", { name: "Tidy up" }).click();
  // The one already on the account is the one that stays.
  expect(await names(page)).toEqual(["b3:Call Sheet 2"]);
  await expect(page.locator(".toast")).toContainText("2 duplicate call sheets removed");
  expect(errors).toEqual([]);
});
