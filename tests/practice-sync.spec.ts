import { expect, test } from "@playwright/test";
import { quiet, signIn } from "./helpers";

/**
 * Drills and the practice script on the account (PracticeSync): signing in on
 * a new device brings the account's drills, stars and script onto the Drill
 * Vault and Practice pages; a drill written here and a period renamed go up
 * to the account; signed out, nothing is sent.
 */
test.beforeEach(async ({ context }) => quiet(context));

const accountVault = {
  drills: [
    {
      id: "drl_account1",
      name: "Laptop Drill",
      category: "Defensive backs",
      side: "defense",
      minutes: 10,
      players: "",
      equipment: [],
      setup: "",
      steps: ["Written on the laptop"],
      points: [],
      custom: true,
      updatedAt: "2026-11-13T08:00:00.000Z",
    },
  ],
  deleted: [],
  favorites: ["drill-backpedal-breaks"],
  favoritesAt: "2026-11-13T08:00:00.000Z",
  script: {
    name: "Laptop script",
    start: "16:00",
    periods: [{ id: "per_laptop", title: "Laptop warm-up", minutes: 12, note: "", playIds: [], drillIds: ["drl_account1"], kind: "warmup" }],
  },
  scriptAt: "2026-11-13T08:00:00.000Z",
};

test("a new device gets the account's drills and script, and changes go up", async ({ context, page }) => {
  const sent: any[] = [];
  await signIn(context, async (route, path, method) => {
    if (path !== "practice") return false;
    if (method === "GET") {
      await route.fulfill({ json: { vault: accountVault } });
      return true;
    }
    const body = route.request().postDataJSON();
    sent.push(body.vault);
    await route.fulfill({ json: { vault: body.vault } });
    return true;
  });

  // The Drill Vault shows the account's drill and star.
  await page.goto("/drills");
  const cards = page.locator(".dr-card");
  await expect(cards.filter({ hasText: "Laptop Drill" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Star Backpedal Breaks", exact: true })).toHaveAttribute("aria-pressed", "true");

  // A drill written here goes up with the account's one still in the list.
  await page.getByRole("button", { name: "New drill" }).first().click();
  const editor = page.getByRole("dialog", { name: "New drill" });
  await editor.getByLabel("Drill name", { exact: true }).fill("Phone Drill");
  await editor.getByRole("button", { name: "Save drill" }).click();
  await expect.poll(() => sent.at(-1)?.drills.map((d: any) => d.name).sort()).toEqual(["Laptop Drill", "Phone Drill"]);
  await page.getByRole("dialog", { name: "Phone Drill" }).getByRole("button", { name: "Close Phone Drill" }).click();

  // Practice shows the account's script, with the account's drill in its period.
  await page.getByRole("navigation", { name: "Practice tabs" }).getByRole("link", { name: "Practice plan" }).click();
  await expect(page.getByLabel("Script name", { exact: true })).toHaveValue("Laptop script");
  const period = page.getByRole("region", { name: "Laptop warm-up" });
  await expect(period.getByRole("link", { name: "Laptop Drill", exact: true })).toBeVisible();

  // Renaming a period goes up as a newer script.
  await period.getByLabel("Period name").fill("Dynamic warm-up");
  await expect.poll(() => sent.at(-1)?.script?.periods?.[0]?.title).toBe("Dynamic warm-up");
  expect(sent.at(-1).scriptAt > accountVault.scriptAt).toBe(true);

  // Kept after a reload, even before the account answers again.
  await page.reload();
  await expect(page.getByRole("region", { name: "Dynamic warm-up" })).toBeVisible();
});

test("signed out, drills stay in this browser and nothing goes to the account", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/practice", (route) => {
    calls++;
    return route.fulfill({ json: { vault: null } });
  });
  await page.goto("/drills");
  await page.getByRole("button", { name: "Star Backpedal Breaks", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Star Backpedal Breaks", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(calls).toBe(0);
});
