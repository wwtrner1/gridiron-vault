import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn, workspace } from "./helpers";

/**
 * Getting started on the Vault: five first moves that tick themselves off as
 * the coach draws a play, makes a playbook, prints wristband cards, asks
 * Griddy and runs a Coverage check (a copied starter and the Ready-to-Go
 * playbook don't count), say so once all five are done, Hide takes the card
 * off the Vault and Tutorials brings it back.
 */
test.beforeEach(async ({ context }) => quiet(context));

const field = (setup: import("@playwright/test").Locator, name: string) => setup.locator(`label.field:has(span:text-is("${name}")) select`);

test("the five first moves tick off as the coach makes them, then the card can be hidden and brought back", async ({ page, context }) => {
  const errors = errorsOf(page);
  let n = 0;
  await signIn(context, async (route, path, method) => {
    if (path.startsWith("plays") && (method === "POST" || method === "PUT")) {
      const body = JSON.parse(route.request().postData() ?? "{}");
      const id = method === "POST" ? `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` : path.split("/")[1];
      await route.fulfill({ json: { play: { id, ownerId: "u1", ownerName: "Coach", name: body.name ?? "Play", formation: body.formation ?? "", playType: body.playType ?? "pass", personnel: body.personnel ?? "", description: body.description ?? "", tags: body.tags ?? [], fieldView: body.fieldView ?? "half", scene: body.scene, preview: "", isPublic: false, saveCount: 1, updatedAt: new Date().toISOString() } } });
      return true;
    }
    if (path === "ai/griddy") {
      await route.fulfill({ json: { reply: { text: "Cover 2 leaves the deep middle: run Four Verts.", actions: [] } } });
      return true;
    }
  });

  await page.goto("/vault");
  const card = page.locator("section.start");
  await expect(card.locator(".eyebrow")).toHaveText("Getting started · 0 of 5");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("Five moves to game-ready");
  const meter = card.getByRole("progressbar", { name: "Getting started" });
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
  const steps = card.locator(".start-steps li");
  await expect(steps).toHaveText([/Draw your first play \(to do\)/, /Make a playbook \(to do\)/, /Print a wristband \(to do\)/, /Ask Griddy \(to do\)/, /Run a Coverage check \(to do\)/]);
  await expect(steps.nth(0).getByRole("link", { name: "Show me" })).toHaveAttribute("href", "/build?tour=designer");
  await expect(steps.nth(4).getByRole("link", { name: "Show me" })).toHaveAttribute("href", /\?tour=coverage-check$/);

  // The Ready-to-Go playbook and its plays don't count as the coach's own.
  await page.locator(".vault-ready button").click();
  await page.locator(".play-card").first().waitFor();
  await expect(card.locator(".eyebrow")).toHaveText("Getting started · 0 of 5");

  // Draft a play opens New play setup; the first save, filed in a new playbook, ticks the first two.
  await steps.nth(0).getByRole("link", { name: "Draft a play" }).click();
  const setup = page.getByRole("dialog", { name: "New play" });
  await setup.getByPlaceholder("Trips Right Smash").fill("Mesh Right");
  await field(setup, "Personnel").selectOption("5-on-5 offense");
  await field(setup, "Playbook").selectOption("__new__");
  await setup.getByPlaceholder("Varsity Offense 2026").fill("Week 1 install");
  await setup.getByRole("button", { name: "Open the field" }).click();
  await page.locator(".stage-frame svg g[data-kind=player]").first().waitFor();
  await page.locator('[data-tour="dz-save"]').click();
  await expect.poll(async () => (await workspace(page)).plays!.find((p) => p.name === "Mesh Right")?.remote).toBe(true);
  await page.goto("/vault");
  await expect(card.locator(".eyebrow")).toHaveText("Getting started · 2 of 5");
  await expect(steps.nth(0)).toContainText("(done)");
  await expect(steps.nth(1)).toContainText("(done)");
  await expect(meter).toHaveAttribute("aria-valuenow", "2");

  // Wristbands: the Download from the print preview counts as the printed wristband.
  await steps.nth(2).getByRole("link", { name: "Wristbands" }).click();
  await expect(page).toHaveURL("/wristbands");
  const source = page.locator('[data-tour="wb-source"] select');
  await source.selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  await page.locator(".wb-head-actions .btn-primary").click();
  await expect(page.locator(".pp-page img").first()).toBeVisible({ timeout: 20_000 });
  await Promise.all([page.waitForEvent("download"), page.locator('.modal button:has-text("Download PDF")').click()]);
  await page.goto("/vault");
  await expect(card.locator(".eyebrow")).toHaveText("Getting started · 3 of 5");

  // Ask Griddy opens the panel; a message sent counts.
  await steps.nth(3).getByRole("button", { name: "Ask Griddy" }).click();
  const box = page.locator(".gd-panel textarea").first();
  await box.fill("what beats Cover 2?");
  await box.press("Enter");
  await expect(page.locator(".gd-msg.is-griddy").last()).toContainText("run Four Verts");
  await expect(card.locator(".eyebrow")).toHaveText("Getting started · 4 of 5");
  await page.keyboard.press("Escape");

  // The Coverage check in the Designer is the last one: all five, and the card says so.
  await page.locator('.play-card button[aria-label^="Open"]').first().click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.locator('[data-tour="dz-coverage"]').click();
  await expect(page.getByRole("dialog", { name: /Coverage check/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/vault");
  await expect(card.locator(".eyebrow")).toHaveText("Getting started · 5 of 5");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("You're set up, coach.");
  await expect(meter).toHaveAttribute("aria-valuenow", "5");

  // Done hides it from the Vault; Tutorials still shows it and brings it back.
  await card.getByRole("button", { name: "Done" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(card).toHaveCount(0);
  await page.goto("/tutorials");
  await expect(card.locator(".eyebrow")).toHaveText("Getting started · 5 of 5");
  await card.getByRole("button", { name: "Show on the Vault" }).click();
  await expect(card.getByRole("button", { name: "Done" })).toBeVisible();
  await page.goto("/vault");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("You're set up, coach.");
  expect(errors).toEqual([]);
});
