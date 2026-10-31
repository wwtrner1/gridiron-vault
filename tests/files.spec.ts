import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Front Office → Files, with the hub API mocked: starter folders, a new
 * folder for the whole Front Office, uploads (one kept, one refused for its
 * type), the download link, delete with its in-place confirm, rename.
 */
test.beforeEach(async ({ context }) => quiet(context));

const org = { id: "org1", name: "Vaultline Youth", seats: 3, members: [], shares: [] };
const team = { id: "t1", name: "U10 Mustangs", level: "U10", season: "Fall 2026", color: "#1d4ed8", coachIds: [], allCoaches: true, players: 0 };
type F = { id: string; name: string; type: string; size: number; uploaderName: string; mine: boolean; createdAt: string };
type Folder = { id: string; teamId: string | null; name: string; files: F[] };

test("folders are made, files uploaded, refused, downloaded and deleted, folders renamed", async ({ page, context }) => {
  const errors = errorsOf(page);
  let folders: Folder[] = [];
  let used = 0;
  let n = 1;
  const uploads: { folder: string; name: string; type: string; bytes: number }[] = [];
  const state = () => ({ folders, used });
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: org, joined: [], invites: [] } }), true);
    if (path === "hub/org1" && method === "GET") return (await route.fulfill({ json: { org: { id: "org1", name: "Vaultline Youth" }, role: "director", teams: [team], coaches: [] } }), true);
    if (path === "hub/org1/folders" && method === "GET") return (await route.fulfill({ json: state() }), true);
    if (path === "hub/org1/folders" && method === "POST") {
      const { teamId, names } = JSON.parse(route.request().postData() ?? "{}") as { teamId: string | null; names: string[] };
      folders = [...folders, ...names.map((name) => ({ id: `f${n++}`, teamId, name, files: [] }))];
      return (await route.fulfill({ json: state() }), true);
    }
    const files = /^hub-folders\/(\w+)\/files$/.exec(path);
    if (files && method === "POST") {
      const headers = route.request().headers();
      const name = decodeURIComponent(headers["x-file-name"] ?? "");
      const bytes = route.request().postDataBuffer()?.length ?? 0;
      uploads.push({ folder: files[1], name, type: headers["content-type"] ?? "", bytes });
      const file: F = { id: `x${n++}`, name, type: headers["content-type"] ?? "", size: bytes, uploaderName: "Coach", mine: true, createdAt: new Date().toISOString() };
      folders = folders.map((f) => (f.id === files[1] ? { ...f, files: [...f.files, file] } : f));
      used += bytes;
      return (await route.fulfill({ json: state() }), true);
    }
    if (path.startsWith("hub-folders/") && method === "PUT") {
      const id = path.slice("hub-folders/".length);
      const { name } = JSON.parse(route.request().postData() ?? "{}") as { name: string };
      folders = folders.map((f) => (f.id === id ? { ...f, name } : f));
      return (await route.fulfill({ json: state() }), true);
    }
    if (path.startsWith("hub-folders/") && method === "DELETE") {
      folders = folders.filter((f) => f.id !== path.slice("hub-folders/".length));
      return (await route.fulfill({ json: state() }), true);
    }
    if (path.startsWith("hub-files/") && method === "DELETE") {
      const id = path.slice("hub-files/".length);
      folders = folders.map((f) => ({ ...f, files: f.files.filter((x) => x.id !== id) }));
      return (await route.fulfill({ json: state() }), true);
    }
  });

  await page.goto("/front-office?tab=files");
  const panel = page.getByRole("region", { name: "U10 Mustangs files" });
  await expect(panel).toBeVisible();

  // A team with no folders is offered the starter set.
  await panel.getByRole("button", { name: /^Add Forms and waivers, Medical/ }).click();
  const folderNames = panel.locator(".hub-folder-name b");
  await expect(folderNames).toHaveText(["Forms and waivers", "Medical", "Practice plans", "Scouting reports", "Film notes"]);

  // A folder for the whole Front Office lands under its own heading.
  await panel.getByLabel("New folder name").fill("League rules");
  await panel.getByLabel("For the whole Front Office").check();
  await panel.getByRole("button", { name: "Add folder" }).click();
  await expect(panel.getByRole("heading", { name: "Shared with all of Vaultline Youth" })).toBeVisible();
  await expect(folderNames).toHaveCount(6);
  await expect(panel.getByLabel("New folder name")).toHaveValue("");

  // Upload: a PDF is kept with its name and size; a .exe is refused before it is sent.
  const medical = panel.locator(".hub-folder").filter({ hasText: "Medical" });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), medical.getByRole("button", { name: "Upload to Medical" }).click()]);
  await chooser.setFiles([
    { name: "physical-marcus.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(2048, 1) },
    { name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.alloc(10, 2) },
  ]);
  await expect(page.getByText("setup.exe isn't a document or picture we keep. Save it as a PDF and try again.")).toBeVisible();
  await expect(page.getByText("1 file added to Medical.")).toBeVisible();
  expect(uploads).toEqual([{ folder: "f2", name: "physical-marcus.pdf", type: "application/pdf", bytes: 2048 }]);
  await expect(medical.getByRole("button", { name: "Medical 1 file" })).toHaveAttribute("aria-expanded", "true");
  const row = medical.locator(".hub-files li");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("2 KB · Coach");
  await expect(row.getByRole("link", { name: "physical-marcus.pdf" })).toHaveAttribute("href", "/api/hub-files/x7");
  await expect(panel.locator(".hub-usage")).toContainText("2 KB of 500.0 MB");

  // Delete the file, then the folder: the folder asks in place first.
  await row.getByRole("button", { name: "Delete physical-marcus.pdf" }).click();
  await expect(row).toHaveCount(0);
  await expect(medical).toContainText("Empty. Drop files here or press Upload.");
  await medical.getByRole("button", { name: "Delete Medical" }).click();
  await medical.getByRole("button", { name: "Delete folder and 0 files" }).click();
  await expect(folderNames).toHaveCount(5);
  await expect(folderNames.filter({ hasText: "Medical" })).toHaveCount(0);

  // Rename a folder in place.
  const film = panel.locator(".hub-folder").filter({ hasText: "Film notes" });
  await film.getByRole("button", { name: "Rename Film notes" }).click();
  await film.getByLabel("Folder name").fill("Game film");
  await film.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(folderNames.filter({ hasText: "Game film" })).toHaveCount(1);
  await expect(folderNames.filter({ hasText: "Film notes" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
