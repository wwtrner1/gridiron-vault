import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const localTeam = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("grid1ronvault.myteams.v1") ?? "{}") as { teams?: { players: { firstName: string; jersey: string }[] }[] }).teams?.[0] ?? {},
  ) as Promise<{ players?: { firstName: string; jersey: string; sizes?: Record<string, string>; middleName?: string; gradYear?: string; birthDate?: string; photo?: string; guardians?: { name: string; relation: string; phone: string; email: string }[] }[] }>;

test("My team: add a player, paste a spreadsheet, download the CSV, build a depth chart and send the starters to Assignments", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/roster");
  await expect(page.locator("h1")).toHaveText("My team");

  // Add one player by hand.
  await page.getByRole("button", { name: "Add player" }).click();
  const form = page.getByRole("dialog", { name: "Add a player" });
  await form.getByLabel("First name").fill("Marcus");
  await form.getByLabel("Last name").fill("Hill");
  await form.getByLabel("Jersey #").fill("12");
  await form.getByLabel("Positions").fill("QB");
  await form.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("button", { name: "Open Marcus Hill" })).toBeVisible();

  // Paste a spreadsheet: the headings are matched loosely and the rows previewed before anything is added.
  await page.getByRole("button", { name: "Import spreadsheet" }).click();
  const importer = page.getByRole("dialog", { name: "Import players from a spreadsheet" });
  await importer.locator("textarea").fill("First name\tLast name\tJersey\tParent name\tParent phone\nDana\tReed\t7\tChris Reed\t615-555-0142\nLuis\tOrtega\t21\tAna Ortega\t615-555-0199\n");
  await expect(importer.locator(".hub-preview")).toContainText("2 players found");
  await importer.getByRole("button", { name: "Add 2 players" }).click();
  await expect(importer).toBeHidden();
  await expect(page.getByRole("button", { name: "Open Dana Reed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Luis Ortega" })).toBeVisible();
  await expect.poll(async () => (await localTeam(page)).players?.length).toBe(3);

  // The CSV carries every player, sorted by jersey.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  const csv = await (await download.createReadStream()).toArray().then((b) => Buffer.concat(b).toString());
  expect(csv).toContain("Marcus");
  expect(csv.indexOf("Reed")).toBeLessThan(csv.indexOf("Hill"));
  expect(csv.indexOf("Hill")).toBeLessThan(csv.indexOf("Ortega"));

  // Depth chart: start from the flag preset, put Marcus at QB, and send the starters to the Assignments roster.
  await page.getByRole("tab", { name: "Depth chart" }).click();
  await page.getByRole("button", { name: "Flag 5-on-5" }).click();
  await expect(page.locator(".hub-slot:not(.hub-slot-add)")).toHaveCount(5);
  await page.getByLabel("Add a player at QB").selectOption({ label: "#12 Marcus Hill (QB)" });
  await expect(page.locator(".hub-slot").first()).toContainText("Marcus Hill");
  await page.getByRole("button", { name: "Starters to Assignments" }).click();
  await expect(page.locator(".toast").last()).toContainText("1 starters are on the Assignments roster");
  const roster = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.roster.v1") ?? "{}") as Record<string, { name: string; number: string }>);
  expect(roster.Q).toEqual({ name: "Marcus Hill", number: "12" });

  // Both survive a reload (this browser's team).
  await page.reload();
  await expect(page.locator(".hub-slot").first()).toContainText("Marcus Hill");
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.getByRole("button", { name: "Open Marcus Hill" })).toBeVisible();
  expect(errors).toEqual([]);
});
