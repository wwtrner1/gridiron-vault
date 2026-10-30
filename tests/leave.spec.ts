import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

async function openPlay(page: Page) {
  await seedReady(page);
  await page.locator('.play-card button[aria-label^="Open"]').nth(2).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.waitForTimeout(300);
  return page.url().split("/build/")[1].split(/[?#]/)[0];
}

async function clearName(page: Page) {
  const tab = page.getByRole("tab", { name: "Play", exact: true });
  if (await tab.isVisible()) await tab.click();
  await page.locator("#insp-pane").getByLabel("Play name").fill("");
  await expect(page.locator('[data-tour="dz-save"]')).toHaveText("Save play");
}

const playbookTab = (page: Page) => page.getByRole("navigation", { name: "Work tabs" }).getByRole("link", { name: "Playbook" });
const prompt = (page: Page) => page.getByRole("dialog", { name: "Save this play before you go?" });

test("a play with no name never traps the coach: stay, leave without saving, or name it and save", async ({ page }) => {
  const errors = errorsOf(page);
  const id = await openPlay(page);
  const before = (await workspace(page)).plays!.find((p) => p.id === id)!.name;

  // Nothing changed: the tab just goes.
  await playbookTab(page).click();
  await expect(page).toHaveURL(/\/playbooks/);
  await page.goBack();
  await page.locator(".stage-frame svg").first().waitFor();

  // Unsaved and unnamed: the tab asks. Stay keeps the coach here.
  await clearName(page);
  await playbookTab(page).click();
  await expect(prompt(page)).toBeVisible();
  await prompt(page).getByRole("button", { name: "Stay" }).click();
  await expect(prompt(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/build\//);

  // The browser's Back asks too; Leave without saving goes and keeps the saved play as it was.
  await page.goBack();
  await expect(prompt(page)).toBeVisible();
  await prompt(page).getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).not.toHaveURL(/\/build\//);
  expect((await workspace(page)).plays!.find((p) => p.id === id)!.name).toBe(before);

  // Name it in the box and save on the way out.
  await page.goto(`/build/${id}`);
  await page.locator(".stage-frame svg").first().waitFor();
  await clearName(page);
  await playbookTab(page).click();
  await expect(prompt(page)).toBeVisible();
  await prompt(page).getByLabel("Play name").fill("Trips Right Y Corner");
  await prompt(page).getByRole("button", { name: "Save and leave" }).click();
  await expect(page).toHaveURL(/\/playbooks/);
  expect((await workspace(page)).plays!.find((p) => p.id === id)!.name).toBe("Trips Right Y Corner");
  expect(errors).toEqual([]);
});

test("Save on a play with no name asks for the name instead of a dead end", async ({ page }) => {
  const id = await openPlay(page);
  await clearName(page);
  await page.locator('[data-tour="dz-save"]').click();
  const box = page.getByRole("dialog", { name: "Name this play" });
  await expect(box).toBeVisible();
  await box.getByLabel("Play name").fill("Bunch Left Snag");
  await box.getByRole("button", { name: "Save play" }).click();
  await expect(box).toHaveCount(0);
  await expect(page.locator('[data-tour="dz-save"]')).toContainText("Saved");
  await expect(page.locator("#insp-pane").getByLabel("Play name")).toHaveValue("Bunch Left Snag");
  expect((await workspace(page)).plays!.find((p) => p.id === id)!.name).toBe("Bunch Left Snag");
});
