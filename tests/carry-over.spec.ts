import { expect, test, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * Plays carried over from the old address: the forwarding script packs this
 * browser's plays, playbooks and settings into `#carry=…`, and CarryOver
 * unpacks them here. A newer carried copy replaces a play, an older one loses,
 * a play and playbook only on the old address are added, settings come over
 * only where this browser has nothing yet (then the page starts again and says
 * so), sign-in is never carried, the hash leaves the address bar, a packed
 * (gzip) link reads the same, and a link that can't be read says so in coach
 * words.
 */
test.beforeEach(async ({ context }) => quiet(context));

const raw = (o: unknown) => "raw." + Buffer.from(JSON.stringify(o)).toString("base64url");
const gz = (o: unknown) => "gz." + gzipSync(Buffer.from(JSON.stringify(o))).toString("base64url");

/** Arrives the way the old address forwards: a fresh load of the page (by way of a plain file, so no app is open), not a hash change on one already open. */
async function arrive(page: Page, hash: string) {
  await page.goto("/robots.txt");
  await page.goto(`/vault#carry=${hash}`);
}

test("plays, a playbook and settings come over from the old address, newer wins, and sign-in never does", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("snapline.workspace.v1")!) as { plays: Record<string, unknown>[]; playbooks: Record<string, unknown>[] });
  const [a, b, c] = before.plays;
  const book = before.playbooks[0];
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const carried = {
    v: 2,
    ws: {
      plays: [
        { ...a, name: "Carried newer", updatedAt: soon },
        { ...b, name: "Carried older", updatedAt: "2020-01-01T00:00:00.000Z" },
        { ...c, id: "carry-c", name: "Only on the old address", updatedAt: soon },
      ],
      playbooks: [
        { ...book, name: "Renamed on the old address" },
        { ...book, id: "carry-book", name: "Old address plays", playIds: ["carry-c"] },
      ],
    },
    presets: null,
    keys: {
      "grid1ronvault.railTab.v1": "routes",
      "grid1ronvault.tour.v1": "from-old",
      "gotrue.user": JSON.stringify({ id: "stolen" }),
      "other.thing": "no",
    },
  };

  await arrive(page, raw(carried));
  // Settings came over, so the app started again with them and then said what arrived (the count is what was packed; the older copy and the renamed playbook lose below).
  await expect(page.locator(".toast")).toHaveText("Welcome to gridiron-vault.com. 3 plays and 2 playbooks came over from the old address.");
  await expect(page).toHaveURL(/\/vault$/);
  expect(page.url()).not.toContain("carry");

  const after = await workspace(page);
  const byId = new Map(after.plays!.map((p) => [p.id, p.name]));
  expect(byId.get(a.id as string)).toBe("Carried newer");
  expect(byId.get(b.id as string)).toBe(b.name);
  expect(byId.get("carry-c")).toBe("Only on the old address");
  expect(after.plays).toHaveLength(before.plays.length + 1);
  expect(after.playbooks!.map((p) => p.name)).toEqual(expect.arrayContaining([book.name, "Old address plays"]));
  expect(after.playbooks!.map((p) => p.name)).not.toContain("Renamed on the old address");
  expect(
    await page.evaluate(() => ({
      rail: localStorage.getItem("grid1ronvault.railTab.v1"),
      tour: localStorage.getItem("grid1ronvault.tour.v1"),
      user: localStorage.getItem("gotrue.user"),
      other: localStorage.getItem("other.thing"),
    })),
  ).toEqual({ rail: "routes", tour: "1", user: null, other: null });

  // The carried play is in the Vault, and a reload doesn't repeat any of it.
  await page.getByLabel("Search the Vault").fill("old address");
  await expect(page.locator(".play-card")).toHaveCount(1);
  await expect(page.locator(".play-card")).toContainText("Only on the old address");
  await page.reload();
  await expect(page.locator(".play-card").first()).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(0);
  expect((await workspace(page)).plays).toHaveLength(before.plays.length + 1);
  expect(errors).toEqual([]);
});

test("a packed link with only settings says so, one with nothing new is quiet, and one that can't be read says so", async ({ page }) => {
  const errors = errorsOf(page);
  await arrive(page, gz({ v: 2, ws: null, presets: null, keys: { "grid1ronvault.railTab.v1": "sets" } }));
  await expect(page.locator(".toast")).toHaveText("Welcome to gridiron-vault.com. Your saved settings came over from the old address.");
  await expect(page).toHaveURL(/\/vault$/);
  expect(await page.evaluate(() => localStorage.getItem("grid1ronvault.railTab.v1"))).toBe("sets");

  // The same settings again: this browser has them, so nothing is written and nothing is said.
  await arrive(page, gz({ v: 2, ws: null, presets: null, keys: { "grid1ronvault.railTab.v1": "plays" } }));
  await expect(page).toHaveURL(/\/vault$/);
  await expect(page.locator(".vault-ready")).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("grid1ronvault.railTab.v1"))).toBe("sets");

  // A link that doesn't unpack.
  await arrive(page, `raw.${Buffer.from("not plays").toString("base64url")}`);
  await expect(page.locator(".toast.is-bad")).toHaveText("Some plays saved under the old address couldn't be brought over.");
  await expect(page).toHaveURL(/\/vault$/);
  expect(errors).toEqual([]);
});
