import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * Starters: the play type chips and the formation select narrow the grid,
 * a preview carries the starter intel (Why it works, Best against from the
 * Coverage check or the hand-written line, Who does what), and a card's
 * Copy to a playbook files one play in an existing playbook.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("Starters filter by type and formation, preview the intel, and copy one play into a playbook", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/starters");
  const cards = page.locator(".play-card");
  const names = cards.locator("h3");
  await cards.first().waitFor();
  await expect(cards).toHaveCount(56);

  // Play type chips.
  const types = page.getByRole("group", { name: "Filter by play type" });
  await expect(types.locator("button[aria-pressed=true]")).toHaveText("Everything");
  await types.getByRole("button", { name: "Run" }).click();
  await expect(cards).toHaveCount(14);
  await expect(names.first()).toHaveText("I Formation — Base");
  await types.getByRole("button", { name: "Defense" }).click();
  await expect(cards).toHaveCount(5);
  await expect(names.first()).toHaveText("Man Free");
  await types.getByRole("button", { name: "Teaching" }).click();
  await expect(names).toHaveText(["Route Tree 0–5", "Route Tree 6–9"]);
  await types.getByRole("button", { name: "Everything" }).click();
  await expect(cards).toHaveCount(56);

  // The formation select, on its own and with a type.
  const formation = page.getByRole("combobox", { name: "Formation" });
  await expect(formation.locator("option")).toHaveCount(14);
  await formation.selectOption("Bunch");
  await expect(names).toHaveText(["Bunch — Base", "Bunch — Triangle", "Bunch — Rub", "Bunch — Return"]);
  await types.getByRole("button", { name: "Run" }).click();
  await expect(cards).toHaveCount(0);
  await types.getByRole("button", { name: "Everything" }).click();
  await formation.selectOption("All formations");
  await expect(cards).toHaveCount(56);

  // A pass play's preview: why it works, what it beats from the Coverage check, and every player's job.
  const mesh = cards.filter({ hasText: "Spread — Mesh" }).first();
  await mesh.getByRole("button", { name: "Preview Spread — Mesh" }).click();
  const preview = page.getByRole("dialog", { name: "Spread — Mesh" });
  const intel = preview.locator(".starter-intel");
  await expect(intel.locator("h4")).toHaveText(["Why it works", "Best against", "Who does what"]);
  await expect(intel).toContainText("Crossing receivers run defenders into each other. Man coverage gets picked off, and zone has to pass two men at once.");
  const beats = intel.locator(".pill");
  expect(await beats.count()).toBeGreaterThan(0);
  for (const look of await beats.allTextContents()) expect(look).toMatch(/Cover \d|Man|rush/i);
  await expect(intel.locator(".hint")).toHaveText("From the Coverage check: the play run against every 7v7 look. A teaching model, not a promise.");
  const jobs = intel.locator("li");
  await expect(jobs).toHaveCount(5);
  await expect(jobs.first()).toHaveText("Q takes the snap.");
  await expect(jobs.nth(1)).toHaveText("X runs straight upfield, about 17 yards.");
  await expect(preview.getByRole("button", { name: "Copy to Vault" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Copy to a playbook" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Open in designer" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();

  // A run play's preview reads its hand-written line instead of the Coverage check.
  const toss = cards.filter({ hasText: "Double Back — Toss Sweep" }).first();
  await toss.getByRole("button", { name: "Preview Double Back — Toss Sweep" }).click();
  const tossIntel = page.getByRole("dialog", { name: "Double Back — Toss Sweep" }).locator(".starter-intel");
  await expect(tossIntel).toContainText("The ball gets outside immediately, with a lead blocker in front before the defense can pursue.");
  await expect(tossIntel).toContainText("Defenses crowding the middle.");
  await expect(tossIntel.locator(".pill")).toHaveCount(0);
  await expect(tossIntel.locator("li")).toContainText(["Q takes the snap.", "Z blocks.", "H blocks."]);
  await page.keyboard.press("Escape");

  // Copy to a playbook from the card: one play into the seeded playbook.
  await mesh.getByRole("button", { name: "Copy Spread — Mesh to a playbook" }).click();
  const adder = page.getByRole("dialog", { name: "Add to a playbook" });
  await expect(adder.getByRole("button", { name: "Create and add 1 play" })).toBeVisible();
  const book = adder.getByRole("button", { name: /Ready-to-Go 5v5 Playbook/ });
  await expect(book).toContainText("24 plays");
  await book.click();
  await expect(page.locator(".toast").last()).toContainText("1 play added to Ready-to-Go 5v5 Playbook.");
  const ws = await workspace(page);
  const copy = ws.plays!.find((p) => p.name === "Spread — Mesh")!;
  expect(copy).toBeTruthy();
  const filed = (ws.playbooks as unknown as { name: string; playIds: string[] }[]).find((b) => b.name === "Ready-to-Go 5v5 Playbook")!;
  expect(filed.playIds).toHaveLength(25);
  expect(filed.playIds).toContain(copy.id);
  expect(errors).toEqual([]);
});
