import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("Coverage check runs a pass play against every look, shows one on the field, and the report ranks the Vault", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);

  // A pass play from the Ready-to-Go playbook.
  const name = "17 · Stick";
  await page.getByRole("button", { name: `Open ${name} in the designer` }).click();
  await page.locator(".stage-frame svg").first().waitFor();

  // Extras → Coverage check: one chip per look, a verdict, and the read table.
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.locator('[data-tour="dz-coverage"]').click();
  const dialog = page.getByRole("dialog", { name: /Coverage check/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("h2")).toContainText(name);
  const looks = dialog.locator(".cov-look");
  await expect.poll(() => looks.count()).toBeGreaterThan(2);
  await expect(dialog.locator(".cov-verdict")).toBeVisible();
  await expect(dialog.locator(".cov-table tbody tr").first()).toBeVisible();
  await expect(dialog.locator(".rp-summary, .rp-body")).toContainText(/Beats \d+ of \d+/);

  // Picking another look re-runs the table for it.
  const second = looks.nth(1);
  const lookName = (await second.textContent())!.trim();
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator(".cov-h")).toContainText(lookName.split("\n")[0].trim().slice(0, 8));

  // Show it on the field puts the defense on the Vs defense overlay and closes the check.
  const show = dialog.getByRole("button", { name: /^Show .* on the field$/ });
  if (await show.count()) {
    await show.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('button[aria-controls="dz-more-menu"]')).toHaveClass(/has-dot/);
  } else {
    await dialog.getByRole("button", { name: "Back to drawing" }).click();
    await expect(dialog).toHaveCount(0);
  }

  // The Coverage report runs every pass play and names the best calls per look.
  await page.goto("/coverage");
  await expect(page.locator("h1")).toHaveText("Coverage report");
  const group = page.locator(".cvr-group").first();
  await expect(group).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.locator(".cvr-best-card").count()).toBeGreaterThan(1);
  await expect(page.locator(".cvr-best-card ol li a").first()).toBeVisible();
  const href = await page.locator(".cvr-best-card ol li a").first().getAttribute("href");
  expect(href).toMatch(/^\/build\//);
  expect(errors).toEqual([]);
});

test("the Coverage report narrows to a playbook, files the best calls in a new playbook, and says what to do with no pass plays", async ({ page }) => {
  const errors = errorsOf(page);

  // An empty Vault: no pass plays, and a way to the starters.
  await page.goto("/coverage");
  await expect(page.locator(".empty h3")).toHaveText("No pass plays yet");
  await expect(page.locator(".empty").getByRole("link", { name: "Browse starter plays" })).toHaveAttribute("href", "/starters");
  await expect(page.locator(".cvr-group")).toHaveCount(0);

  // The Ready-to-Go playbook, plus a two-play playbook made from its first two pass plays.
  await seedReady(page);
  const pair = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const ready = ws.playbooks[0];
    const passIds = (ws.plays as { id: string; playType: string }[]).filter((p) => p.playType === "pass").map((p) => p.id);
    const ids = ready.playIds.filter((id: string) => passIds.includes(id)).slice(0, 2);
    ws.playbooks.push({ ...ready, id: "pb-red-zone-pair", name: "Red zone pair", playIds: ids });
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    return { ids, passCount: passIds.length };
  });
  await page.goto("/coverage");
  const table = page.locator(".cvr-table");
  await expect(table.locator("tbody tr")).toHaveCount(pair.passCount, { timeout: 20_000 });
  await expect(page.locator(".cvr-group h3").first()).toContainText(`${pair.passCount} plays`);

  // Plays from: a playbook narrows the report to its pass plays.
  const from = page.getByLabel("Plays from");
  await expect(from.locator("option")).toHaveText(["The whole Vault", "Ready-to-Go 5v5 Playbook", "Red zone pair"]);
  await from.selectOption({ label: "Red zone pair" });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator(".cvr-group h3").first()).toContainText("2 plays");
  await expect(table.locator("tbody tr th a").first()).toHaveAttribute("href", `/build/${pair.ids[0]}`);
  await from.selectOption("");
  await expect(table.locator("tbody tr")).toHaveCount(pair.passCount);

  // Add to a new playbook from a best-calls card: the name is suggested from the look.
  const card = page.locator(".cvr-best-card").filter({ has: page.locator(".cvr-file") }).first();
  const look = (await card.locator(".cvr-best-h").textContent())!.replace(/^Best vs /, "");
  const n = await card.locator("ol li").count();
  await card.getByRole("button", { name: "Add to a new playbook" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "New playbook" })).toHaveValue(`Beats ${look}`);
  await dialog.getByRole("button", { name: `Create and add ${n} play${n === 1 ? "" : "s"}` }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await workspace(page)).playbooks!.find((b) => b.name === `Beats ${look}`)).toBeTruthy();
  // Playbooks are listed A to Z, so the new one lands before Ready-to-Go.
  await expect(from.locator("option")).toHaveText(["The whole Vault", `Beats ${look}`, "Ready-to-Go 5v5 Playbook", "Red zone pair"]);
  await from.selectOption({ label: `Beats ${look}` });
  await expect(table.locator("tbody tr")).toHaveCount(n);
  expect(errors).toEqual([]);
});
