import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

type Saved = {
  id: string;
  name: string;
  players: {
    id: string;
    firstName: string;
    middleName: string;
    lastName: string;
    jersey: string;
    birthDate: string;
    gradYear: string;
    photo: string;
    sizes: { jersey: string; shirt: string; pants: string };
    guardians: { name: string; relation: string; phone: string; email: string }[];
  }[];
  charts: { unit: string; slots: { playerIds: string[] }[] }[];
};
const teams = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem("grid1ronvault.myteams.v1") ?? "{}") as { teams?: Saved[] }).teams ?? []);

async function importFile(page: Page, file: string) {
  await page.getByRole("button", { name: "Import spreadsheet" }).click();
  const importer = page.getByRole("dialog", { name: "Import players from a spreadsheet" });
  await importer.getByLabel("Open a spreadsheet (Excel or CSV)").setInputFiles(`tests/fixtures/${file}`);
  await expect(importer.locator(".hub-preview")).toContainText("3 players found");
  // Every column of the league sheet is read: nothing listed as left out.
  await expect(importer.locator(".hub-preview")).not.toContainText("Not brought in");
  await expect(importer.locator(".hub-preview")).toContainText("Casen Crawford · John Crawford, Rebecca Crawford");
  await importer.getByRole("button", { name: "Add 3 players" }).click();
  await expect(importer).toBeHidden();
}

test("My team: an Excel roster comes in with parents, grad year and sizes; X and Remove selected; a second team from an .xls", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/roster");
  await expect(page.locator("h1")).toHaveText("My team");

  // The .xlsx has a title line above the headings, DAD/MOM columns, a bare EMAIL after MOM, and dates as Excel dates.
  await importFile(page, "roster.xlsx");
  const row = page.getByRole("row", { name: /Casen Crawford/ });
  await expect(row).toContainText("J YS · S YM · P YS");
  await expect(row).toContainText("Class of 2035");
  let [first] = await teams(page);
  const casen = first.players.find((p) => p.firstName === "Casen")!;
  expect(casen).toMatchObject({ middleName: "Lee", lastName: "Crawford", jersey: "1", birthDate: "2017-03-04", gradYear: "2035", sizes: { jersey: "YS", shirt: "YM", pants: "YS" } });
  expect(casen.guardians).toEqual([
    { name: "John Crawford", relation: "Father", phone: "6155550101", email: "john.crawford@example.com", text: false },
    { name: "Rebecca Crawford", relation: "Mother", phone: "615-555-0102", email: "rebecca.crawford@example.com", text: false },
  ]);
  // Mack has only a mother on the sheet.
  expect(first.players.find((p) => p.firstName === "Mack")!.guardians.map((g) => g.relation)).toEqual(["Mother"]);

  // The profile shows what came across.
  await page.getByRole("button", { name: "Open Casen Crawford" }).click();
  const profile = page.getByRole("dialog", { name: "Casen Crawford" });
  await expect(profile.getByLabel("Middle name")).toHaveValue("Lee");
  await expect(profile.getByLabel("Grad year")).toHaveValue("2035");
  await expect(profile.getByLabel("Shorts / pants")).toHaveValue("YS");
  await profile.getByLabel("Shirt").fill("YL");
  await profile.getByRole("button", { name: "Save player" }).click();
  await expect(profile).toBeHidden();
  await expect(row).toContainText("S YL");

  // The X on a row asks first, then removes just that player.
  await page.getByRole("button", { name: "Remove Mack Turner" }).click();
  const box = page.getByRole("dialog", { name: "Remove Mack Turner?" });
  await box.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Open Mack Turner" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Mack Turner" }).click();
  await box.getByRole("button", { name: "Remove player", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Mack Turner" })).toBeHidden();
  await expect.poll(async () => (await teams(page))[0].players.length).toBe(2);

  // Tick everyone shown and remove them together.
  await page.getByLabel("Select every player shown").check();
  await expect(page.locator(".hub-bulk")).toContainText("2 players selected");
  await page.getByRole("button", { name: "Remove selected" }).click();
  await page.getByRole("dialog", { name: "Remove 2 players?" }).getByRole("button", { name: "Remove 2 players", exact: true }).click();
  await expect(page.getByText("No players yet")).toBeVisible();
  await expect(page.locator(".hub-bulk")).toBeHidden();

  // Start another team and fill it from the old .xls format; the first team stays as it was.
  await importFile(page, "roster.xlsx");
  await page.getByRole("button", { name: "New team" }).click();
  const naming = page.getByRole("dialog", { name: "Start another team" });
  await naming.getByLabel("Team name").fill("Spring 7v7");
  await naming.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("button", { name: /Spring 7v7/, pressed: true })).toBeVisible();
  await expect(page.getByText("No players yet")).toBeVisible();
  await importFile(page, "roster.xls");
  [first] = await teams(page);
  const all = await teams(page);
  expect(all.map((t) => [t.name, t.players.length])).toEqual([
    ["My team", 3],
    ["Spring 7v7", 3],
  ]);
  const harvey = all[1].players.find((p) => p.firstName === "Harvey")!;
  expect(harvey).toMatchObject({ middleName: "James", birthDate: "2016-06-01", gradYear: "2034", sizes: { jersey: "YM", shirt: "YL", pants: "YM" } });

  // Switching teams, and the pick kept after a reload.
  await page.getByRole("button", { name: /^My team/ }).click();
  await expect(page.getByLabel("Team name", { exact: true })).toHaveValue("My team");
  await page.getByRole("button", { name: /Spring 7v7/ }).click();
  await page.reload();
  await expect(page.getByLabel("Team name", { exact: true })).toHaveValue("Spring 7v7");

  // Remove this team asks first; the other team is left.
  await page.getByRole("button", { name: "Remove this team" }).click();
  await page.getByRole("dialog", { name: "Remove Spring 7v7?" }).getByRole("button", { name: "Remove team", exact: true }).click();
  await expect(page.getByLabel("Team name", { exact: true })).toHaveValue("My team");
  expect((await teams(page)).map((t) => t.name)).toEqual(["My team"]);
  expect(errors).toEqual([]);
});

test("My team: a player's picture on the profile and from the depth chart card", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/roster");
  await importFile(page, "roster.xlsx");

  await page.getByRole("button", { name: "Open Casen Crawford" }).click();
  const profile = page.getByRole("dialog", { name: "Casen Crawford" });
  await profile.getByLabel("Player picture").setInputFiles("tests/fixtures/player.png");
  await expect(profile.locator("img.hub-face")).toBeVisible();
  await profile.getByRole("button", { name: "Save player" }).click();
  await expect(page.getByRole("row", { name: /Casen Crawford/ }).locator("img.hub-face")).toBeVisible();
  const photo = (await teams(page))[0].players.find((p) => p.firstName === "Casen")!.photo;
  expect(photo).toMatch(/^data:image\/jpeg;base64,/);
  expect(photo.length).toBeLessThanOrEqual(12000);

  // Depth chart: tap a player's circle on the card to add their picture.
  await page.getByRole("tab", { name: "Depth chart" }).click();
  await page.getByRole("button", { name: "Flag 5-on-5" }).click();
  await page.getByLabel("Add a player at QB").selectOption({ label: "#3 Harvey Diehl" });
  await page.getByLabel("Add a player at Center").selectOption({ label: "#1 Casen Crawford" });
  await expect(page.getByRole("button", { name: "Change Casen Crawford's picture" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add a picture of Harvey Diehl" }).click();
  await (await chooser).setFiles("tests/fixtures/player.png");
  await expect(page.getByRole("button", { name: "Change Harvey Diehl's picture" })).toBeVisible();
  await expect.poll(async () => (await teams(page))[0].players.find((p) => p.firstName === "Harvey")!.photo).toMatch(/^data:image\/jpeg/);

  // Signed out, documents wait for a sign-in instead of failing.
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.getByRole("button", { name: "Open Harvey Diehl" }).click();
  await expect(page.getByRole("dialog", { name: "Harvey Diehl" })).toContainText("Sign in to keep documents and pictures with this player.");
  expect(errors).toEqual([]);
});

test("My team signed in: documents kept with a player upload, list, download and remove", async ({ page, context }) => {
  const errors = errorsOf(page);
  type File = { id: string; name: string; type: string; size: number; uploaderName: string; createdAt: string };
  let files: File[] = [];
  const asked: string[] = [];
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("player-file")) return;
    asked.push(`${method} ${path}`);
    if (path.startsWith("player-files/") && method === "GET") return route.fulfill({ json: { files } }).then(() => true);
    if (path.startsWith("player-files/") && method === "POST") {
      const name = decodeURIComponent(route.request().headers()["x-file-name"]);
      files = [...files, { id: "0b8c3c4e-1111-4222-8333-944455556666", name, type: "application/pdf", size: 20480, uploaderName: "Coach", createdAt: "2026-11-01T00:00:00Z" }];
      return route.fulfill({ status: 201, json: { files } }).then(() => true);
    }
    if (path.startsWith("player-file/") && method === "DELETE") {
      files = [];
      return route.fulfill({ json: { files } }).then(() => true);
    }
  });
  await page.goto("/roster");
  await importFile(page, "roster.xlsx");
  const id = (await teams(page))[0].players.find((p) => p.firstName === "Casen")!.id;

  await page.getByRole("button", { name: "Open Casen Crawford" }).click();
  const profile = page.getByRole("dialog", { name: "Casen Crawford" });
  await expect(profile).toContainText("Nothing kept yet");
  await profile.getByLabel("Upload a document or picture").setInputFiles({ name: "Casen physical 2026.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  const link = profile.getByRole("link", { name: "Casen physical 2026.pdf" });
  await expect(link).toHaveAttribute("href", "/api/player-file/0b8c3c4e-1111-4222-8333-944455556666");
  await expect(profile).toContainText("20 KB");
  expect(asked).toContain(`POST player-files/my.my-team/${id}`);

  await profile.getByRole("button", { name: "Remove Casen physical 2026.pdf" }).click();
  await profile.getByRole("button", { name: "Yes, remove" }).click();
  await expect(profile).toContainText("Nothing kept yet");
  expect(asked).toContain("DELETE player-file/0b8c3c4e-1111-4222-8333-944455556666");
  expect(errors).toEqual([]);
});
