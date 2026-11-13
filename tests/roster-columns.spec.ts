import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * My team's roster columns (hide one from its heading, turn an extra one on,
 * add a field of your own, type into the table, download what's shown) and
 * the depth chart's On the field view (spots placed by name, a sideline spot,
 * an arrow-key move saved, Line them up by position).
 */

test.beforeEach(async ({ context }) => quiet(context));

const TEAM = "grid1ronvault.myteams.v1";

async function seed(page: Page) {
  const players = [
    ["Marcus", "Hill", "12", "QB"],
    ["Dana", "Reed", "7", "C"],
    ["Luis", "Ortega", "21", "X"],
  ].map(([firstName, lastName, jersey, positions], i) => ({
    id: `p${i}`,
    firstName,
    lastName,
    jersey,
    positions,
    phone: i === 0 ? "615-555-0100" : "",
    guardians: i === 1 ? [{ name: "Chris Reed", relation: "Father", phone: "615-555-0142", email: "chris@example.com", text: true }] : [],
    updatedAt: "2026-11-01",
  }));
  const slots = [
    { key: "o1", label: "QB", letter: "Q", playerIds: ["p0"] },
    { key: "o2", label: "Center", letter: "C", playerIds: ["p1"] },
    { key: "o3", label: "X", letter: "X", playerIds: ["p2", "p1"] },
    { key: "o4", label: "Wingback", letter: "", playerIds: [] },
  ];
  await page.goto("/roster");
  await page.evaluate(
    ([key, doc]) => localStorage.setItem(key as string, JSON.stringify(doc)),
    [TEAM, { teams: [{ id: "my", name: "Hawks", level: "", season: "", players, charts: [{ unit: "offense", slots, updatedAt: "" }], updatedAt: "2026-11-01" }], updatedAt: "2026-11-01" }],
  );
  await page.reload();
}

const stored = (page: Page) =>
  page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? "{}") as { teams: { players: Record<string, unknown>[]; charts: { unit: string; slots: { key: string; at?: { x: number; y: number } }[] }[] }[] }).teams[0], TEAM);

test("roster: hide and add columns, add a field, type into the table and download what shows", async ({ page }) => {
  const errors = errorsOf(page);
  await seed(page);
  const table = page.locator(".hub-table");
  await expect(table.getByRole("columnheader", { name: "Grade / age" })).toBeVisible();
  // A player has their own phone, so that column starts on.
  await expect(table.getByRole("columnheader", { name: "Player phone" })).toBeVisible();

  // Hide a column from its heading; it comes back from the Columns panel.
  await page.getByRole("button", { name: "Hide the Grade / age column" }).click();
  await expect(table.getByRole("columnheader", { name: "Grade / age" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Columns \(\d+ hidden\)/ }).click();
  const panel = page.getByRole("group", { name: "Roster columns" });
  await panel.getByLabel("Status", { exact: true }).check();
  await expect(table.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await expect(panel.getByLabel("Player", { exact: true })).toBeDisabled();

  // A field of the coach's own; a name the roster already uses is refused.
  await panel.getByLabel("New field name").fill("Pos");
  await panel.getByRole("button", { name: "Add field" }).click();
  await expect(panel.getByRole("alert")).toContainText("already has a Pos column");
  await panel.getByLabel("New field name").fill("Waiver signed");
  await panel.getByRole("button", { name: "Add field" }).click();
  await expect(table.getByRole("columnheader", { name: "Waiver signed" })).toBeVisible();
  await panel.getByRole("button", { name: "Done" }).click();

  // Type into the table: Enter saves, Escape puts the box back.
  await page.getByRole("button", { name: "Edit in the table" }).click();
  await page.getByLabel("Waiver signed for Dana Reed").fill("Yes");
  await page.getByLabel("Waiver signed for Dana Reed").press("Enter");
  await page.getByLabel("Jersey # for Marcus Hill").fill("4");
  await page.getByLabel("Jersey # for Marcus Hill").press("Tab");
  await page.getByLabel("Guardian 1 phone for Dana Reed").fill("999");
  await page.getByLabel("Guardian 1 phone for Dana Reed").press("Escape");
  await expect(page.getByLabel("Guardian 1 phone for Dana Reed")).toHaveValue("615-555-0142");
  await page.getByLabel("Status for Luis Ortega").selectOption("injured");
  const axe = await new AxeBuilder({ page }).include(".hub-panel").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  await expect.poll(async () => (await stored(page)).players.find((p) => p.id === "p1")?.custom).toEqual({ "Waiver signed": "Yes" });
  await expect.poll(async () => (await stored(page)).players.find((p) => p.id === "p0")?.jersey).toBe("4");
  expect((await stored(page)).players.find((p) => p.id === "p2")?.status).toBe("injured");
  expect(((await stored(page)).players.find((p) => p.id === "p1")?.guardians as { phone: string }[])[0].phone).toBe("615-555-0142");
  // Emptying both names is refused.
  await page.getByLabel("First name for Dana Reed").fill("");
  await page.getByLabel("First name for Dana Reed").press("Enter");
  await page.getByLabel("Last name for Reed").fill("");
  await page.getByLabel("Last name for Reed").press("Enter");
  await expect(page.locator(".toast").last()).toContainText("needs a first or last name");
  await page.getByRole("button", { name: "Done editing" }).click();

  // Download CSV carries the columns on screen, the added field included, and not the hidden one.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  const csv = await (await download.createReadStream()).toArray().then((b) => Buffer.concat(b).toString());
  const [head, ...rows] = csv.split("\n");
  expect(head).toContain("First name,Last name");
  expect(head).toContain("Waiver signed");
  expect(head).toContain("Status");
  expect(head).not.toContain("Grade");
  expect(rows[0]).toContain("Marcus");
  expect(rows.find((r) => r.includes("Reed"))).toContain("Yes");

  // The view stays after a reload; removing a field with values asks first and clears it.
  await page.reload();
  await expect(table.getByRole("columnheader", { name: "Grade / age" })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Waiver signed" })).toBeVisible();
  await page.getByRole("button", { name: /^Columns/ }).click();
  await page.getByRole("button", { name: "Remove the Waiver signed field" }).click();
  await page.getByRole("dialog", { name: "Take Waiver signed off the roster?" }).getByRole("button", { name: "Remove field" }).click();
  await expect(table.getByRole("columnheader", { name: "Waiver signed" })).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).players.find((p) => p.id === "p1")?.custom).toEqual({});
  await page.getByRole("button", { name: "Show the usual columns" }).click();
  await expect(table.getByRole("columnheader", { name: "Grade / age" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("depth chart: On the field places spots by name, moves one by keys and lines them up again", async ({ page }) => {
  const errors = errorsOf(page);
  await seed(page);
  await page.getByRole("tab", { name: "Depth chart" }).click();
  await page.getByRole("button", { name: "On the field" }).click();
  const field = page.getByRole("group", { name: "Offense on the field" });
  await expect(field).toBeVisible();
  const qb = field.locator('[data-spot="QB"]');
  const center = field.locator('[data-spot="Center"]');
  await expect(qb).toContainText("#12 Marcus Hill");
  await expect(field.locator('[data-spot="X"]')).toContainText("2nd Reed");
  // The QB lines up behind the center; X is out wide left.
  const [q, c, x] = await Promise.all([qb.boundingBox(), center.boundingBox(), field.locator('[data-spot="X"]').boundingBox()]);
  expect(q!.y).toBeGreaterThan(c!.y);
  expect(Math.abs(q!.x - c!.x)).toBeLessThan(4);
  expect(x!.x).toBeLessThan(c!.x);
  // A name it doesn't know waits on the sideline.
  await expect(field.locator('[data-spot="Wingback"]')).toHaveClass(/is-parked/);
  await expect(page.getByText("1 spot waits on the sideline")).toBeVisible();
  const axe = await new AxeBuilder({ page }).include(".hub-panel").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);

  // Arrow keys move a spot, and it's saved with the chart.
  await field.getByRole("button", { name: /^QB: Marcus Hill/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => (await stored(page)).charts[0].slots.find((s) => s.key === "o1")?.at).toEqual({ x: 52, y: 57 });

  // The view is remembered; Line them up by position puts it back.
  await page.reload();
  await expect(page.getByRole("group", { name: "Offense on the field" })).toBeVisible();
  await page.getByRole("button", { name: "Line them up by position" }).click();
  await expect.poll(async () => (await stored(page)).charts[0].slots.find((s) => s.key === "o1")?.at).toBeUndefined();
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.locator(".hub-slot:not(.hub-slot-add)")).toHaveCount(4);
  expect(errors).toEqual([]);
});
