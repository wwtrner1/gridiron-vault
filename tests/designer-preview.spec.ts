import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Designer's ways to see a play besides drawing it: Preview (the play run
 * once, flat or in 3D with a camera, then Export, Make a video or the Film
 * Room), the Flat · 3D chips on the field itself, and Make a video in the Play
 * panel. None of them changes the play.
 */
test.beforeEach(async ({ context }) => quiet(context));

async function openStick(page: Page) {
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
}

const brandView = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1") ?? "{}").filmView ?? null);
const nodeCount = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}").plays as { name: string; scene: { nodes: unknown[] } }[]).find((p) => p.name === "17 · Stick")!.scene.nodes.length);

test("Preview runs the play flat or in 3D with a camera, then hands on to Export, a video or the Film Room", async ({ page }) => {
  const errors = errorsOf(page);
  await openStick(page);
  const before = await nodeCount(page);

  await page.locator('[data-tour="dz-preview"]').click();
  const pv = page.getByRole("dialog", { name: /Preview/ });
  await expect(pv.locator("h2")).toContainText("17 · Stick");
  const view = pv.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "Flat" })).toHaveAttribute("aria-pressed", "true");
  await expect(pv.locator(".fr-field svg")).toBeVisible();
  await expect(pv.getByRole("combobox", { name: "Camera" })).toHaveCount(0);

  // Run it: the clock moves, Pause holds it, and the slider goes anywhere in the play.
  const clock = () => pv.locator(".fr-clock").textContent().then((s) => Number(s!.split(" ")[0]));
  await pv.getByRole("button", { name: "Run the play" }).click();
  await expect.poll(clock, { timeout: 8000 }).toBeGreaterThan(0.3);
  await pv.getByRole("button", { name: "Pause" }).click();
  const held = await clock();
  await page.waitForTimeout(300);
  expect(await clock()).toBe(held);
  await pv.getByRole("slider", { name: "Time" }).fill("0");
  expect(await clock()).toBe(0);

  // 3D: the same run on a real field, with the camera pick; the pick is the coach's, kept with the team brand.
  await view.getByRole("button", { name: "3D" }).click();
  const canvas = pv.locator(".fr-3d canvas");
  await expect(canvas).toHaveAttribute("aria-label", /17 · Stick against .+, in 3D\./);
  await expect(canvas).toHaveAttribute("data-athlete", "model", { timeout: 20000 });
  expect(await brandView(page)).toBe("3d");
  const camera = pv.getByRole("combobox", { name: "Camera" });
  await expect(camera).toHaveValue("behind");
  await expect(canvas).toHaveAttribute("data-camera", "behind");
  await camera.selectOption("sideline");
  await expect(canvas).toHaveAttribute("data-camera", "sideline");
  await expect(pv.locator(".pv-next .fr-hint")).toContainText("An export is your flat drawing");

  const axe = await new AxeBuilder({ page }).include(".pv").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  // Next: Export opens the export box in the preview's place.
  await pv.getByRole("button", { name: "Export", exact: true }).click();
  await expect(pv).toBeHidden();
  const exportBox = page.getByRole("dialog", { name: /Export/ });
  await expect(exportBox).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(exportBox).toBeHidden();

  // Make a video goes straight to the video box, and the Film Room opens from here too.
  await page.locator('[data-tour="dz-preview"]').click();
  await pv.getByRole("button", { name: "Make a video" }).click();
  await expect(pv).toBeHidden();
  const video = page.getByRole("dialog", { name: /video/i });
  await expect(video).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(video).toBeHidden();
  await page.locator('[data-tour="dz-preview"]').click();
  await pv.getByRole("button", { name: "Teach it in the Film Room" }).click();
  const room = page.getByRole("dialog", { name: /Film Room/ });
  await expect(room.locator("h2")).toContainText("Film Room");
  await page.keyboard.press("Escape");
  await expect(room).toBeHidden();

  // Escape closes the preview and focus goes back to its button; nothing in the play changed.
  await page.locator('[data-tour="dz-preview"]').click();
  await expect(pv).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pv).toBeHidden();
  await expect(page.locator('[data-tour="dz-preview"]')).toBeFocused();
  expect(await nodeCount(page)).toBe(before);
  await expect(page.locator(".dz-saved")).toContainText("Saved");
  expect(errors).toEqual([]);
});

test("The field's Flat · 3D chips show the play in 3D with a camera and give the drawing back", async ({ page }) => {
  const errors = errorsOf(page);
  await openStick(page);
  const view = page.getByRole("group", { name: "Field view" });
  await expect(view.getByRole("button", { name: "Flat" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".dz-view-cam")).toHaveCount(0);

  await view.getByRole("button", { name: "3D" }).click();
  const look = page.getByRole("group", { name: "The play in 3D" });
  const canvas = look.locator("canvas");
  await expect(canvas).toHaveAttribute("aria-label", /17 · Stick in 3D against /);
  await expect(canvas).toHaveAttribute("data-athlete", "model", { timeout: 20000 });
  await expect(canvas).toHaveAttribute("data-camera", "behind");
  await expect(look).toContainText("Switch to Flat to draw.");
  // The drawing under it is out of reach, and so are the floating tools.
  await expect(page.locator(".builder-stage")).toHaveAttribute("inert", "");
  await expect(page.locator(".dz-float")).toHaveCount(0);
  const camera = page.locator(".dz-view-cam select");
  await expect(camera.locator("option")).toHaveText(["Behind the offense", "Sideline", "Overhead"]);
  await camera.selectOption("overhead");
  await expect(canvas).toHaveAttribute("data-camera", "overhead");
  // The field's 3D look is a view for this visit: it never becomes the Film Room's saved pick.
  expect(await brandView(page)).toBeNull();

  const axe = await new AxeBuilder({ page }).include(".dz-stage-wrap").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  await view.getByRole("button", { name: "Flat" }).click();
  await expect(look).toHaveCount(0);
  await expect(page.locator(".builder-stage")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".dz-float")).toBeVisible();
  await expect(page.locator(".dz-status [role=status]")).toHaveText("Back on the drawing.");

  // The Play panel's Teach and share: Make a video without opening the Film Room first.
  await page.getByRole("button", { name: "Teach and share" }).scrollIntoViewIfNeeded();
  const share = page.locator(".insp-share");
  await share.getByRole("button", { name: "Make a video" }).click();
  const video = page.getByRole("dialog", { name: /video/i });
  await expect(video).toBeVisible();
  await page.keyboard.press("Escape");
  await share.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("dialog", { name: /Preview/ })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("A blank field has nothing to preview in 3D and says so", async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false })));
  await page.goto("/build");
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("group", { name: "Field view" }).getByRole("button", { name: "3D" }).click();
  await expect(page.locator(".dz-status [role=status]")).toHaveText("3D needs an offense on the field. Add your players, then switch to 3D.");
  await expect(page.getByRole("group", { name: "The play in 3D" })).toHaveCount(0);
  await page.locator('[data-tour="dz-preview"]').click();
  const pv = page.getByRole("dialog", { name: /Preview/ });
  await expect(pv).toContainText("The moving preview needs an offense on the field.");
  await expect(pv.getByRole("group", { name: "View" })).toHaveCount(0);
  await pv.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /Export/ })).toBeVisible();
});

test("On a phone the field carries Preview and Flat · 3D, and the preview fits the screen @phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone layout");
  await openStick(page);
  const wide = page.viewportSize()!.width;
  const chips = page.locator(".dz-view");
  for (const b of await chips.locator("button").all()) {
    const box = (await b.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(wide);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await chips.getByRole("button", { name: "Preview" }).tap();
  const pv = page.getByRole("dialog", { name: /Preview/ });
  await expect(pv.locator(".fr-field svg")).toBeVisible();
  await pv.getByRole("group", { name: "View" }).getByRole("button", { name: "3D" }).tap();
  await expect(pv.locator(".fr-3d canvas")).toHaveAttribute("data-athlete", "model", { timeout: 20000 });
  await expect(pv.getByRole("combobox", { name: "Camera" })).toBeVisible();
  for (const name of ["Export", "Make a video", "Teach it in the Film Room"]) {
    const b = pv.getByRole("button", { name, exact: true });
    await b.scrollIntoViewIfNeeded();
    const box = (await b.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(wide);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(wide);
  await pv.getByRole("button", { name: "Back to drawing" }).tap();
  await expect(pv).toBeHidden();
});
