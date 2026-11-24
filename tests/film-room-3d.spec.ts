import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { errorsOf, menuButton, quiet, seedReady } from "./helpers";

/**
 * Film Room in 3D: Flat stays the default; 3D puts the lesson on a real field
 * (the athlete model, one per player, a camera that follows the steps or holds
 * the spot the coach picks); the pick is kept with the team brand so it follows
 * the coach; Flat takes it off again; a browser without WebGL says so and stays
 * flat.
 */
test.beforeEach(async ({ context }) => quiet(context));

async function openRoom(page: Page, open = true) {
  if (open) await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await menuButton(page, "teach").click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  return page.getByRole("dialog", { name: /Film Room/ });
}

const brandCam = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1") ?? "{}").filmCam ?? null);
const brandView = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1") ?? "{}").filmView ?? null);

test("Film Room draws the lesson in 3D, follows the steps with the camera, and keeps the pick", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const room = await openRoom(page);
  const view = room.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "Flat" })).toHaveAttribute("aria-pressed", "true");
  await expect(room.locator(".fr-field svg")).toBeVisible();
  await expect(room.getByRole("combobox", { name: "Camera" })).toHaveCount(0);

  await view.getByRole("button", { name: "3D" }).click();
  await expect(view.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
  const canvas = room.locator(".fr-3d canvas");
  await expect(canvas).toHaveAttribute("role", "img");
  await expect(canvas).toHaveAttribute("aria-label", /in 3D\. Step 1 of 6: The look/);
  await expect(canvas).toHaveAttribute("data-athlete", "model", { timeout: 20000 });
  await expect(canvas).toHaveAttribute("data-players", /^\d+$/);
  expect(Number(await canvas.getAttribute("data-players"))).toBeGreaterThan(8);
  await expect.poll(async () => Number(await canvas.getAttribute("data-frames"))).toBeGreaterThan(0);
  await expect(room.locator(".fr-field svg")).toHaveCount(0);
  await expect(room.locator(".fr-hint")).toHaveText("Videos are drawn flat.");
  expect(await brandView(page)).toBe("3d");

  // The camera follows the lesson: high behind for the look, down behind the offense for the read.
  const camera = room.getByRole("combobox", { name: "Camera" });
  await expect(camera).toHaveValue("auto");
  await expect(canvas).toHaveAttribute("data-camera", "auto:look");
  await room.locator(".fr-steps button").nth(4).click();
  await expect(canvas).toHaveAttribute("data-camera", "auto:read");
  await expect(canvas).toHaveAttribute("data-shot", "qb");
  await expect(camera.locator("option")).toHaveCount(12);
  await camera.selectOption("overhead");
  await expect(canvas).toHaveAttribute("data-camera", "overhead");

  // Play the lesson: the clock runs and the field keeps drawing.
  await room.locator(".fr-steps button").nth(3).click();
  const drawn = Number(await canvas.getAttribute("data-frames"));
  await room.getByRole("button", { name: "Play the lesson" }).click();
  await expect.poll(async () => Number((await room.locator(".fr-clock").textContent())!.split(" ")[0]), { timeout: 8000 }).toBeGreaterThan(0.4);
  await room.getByRole("button", { name: "Pause" }).click();
  expect(Number(await canvas.getAttribute("data-frames"))).toBeGreaterThan(drawn);

  const axe = await new AxeBuilder({ page }).include(".fr").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  // Opened again (after a reload) it is still 3D: the pick is the coach's, kept with the team brand.
  await page.keyboard.press("Escape");
  await page.reload();
  const again = await openRoom(page, false);
  await expect(again.getByRole("group", { name: "View" }).getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
  await expect(again.locator(".fr-3d canvas")).toBeVisible();
  // So is the camera.
  await expect(again.getByRole("combobox", { name: "Camera" })).toHaveValue("overhead");

  // Flat takes it off, on this play and the account.
  await again.getByRole("group", { name: "View" }).getByRole("button", { name: "Flat" }).click();
  await expect(again.locator(".fr-field svg")).toBeVisible();
  await expect(again.locator(".fr-3d")).toHaveCount(0);
  expect(await brandView(page)).toBeNull();
  expect(errors).toEqual([]);
});

test("Every 3D camera is in the Film Room: either end, the QB cam, a helmet and free look", async ({ page }) => {
  // A software renderer (CI) draws about a frame a second, and this walks six cameras.
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await seedReady(page);
  const room = await openRoom(page);
  await room.getByRole("group", { name: "View" }).getByRole("button", { name: "3D" }).click();
  const canvas = room.locator(".fr-3d canvas");
  await expect(canvas).toHaveAttribute("data-athlete", "model", { timeout: 20000 });
  const camera = room.getByRole("combobox", { name: "Camera" });
  await room.locator(".fr-steps button").nth(4).click();

  // Every camera from the previews is back. Behind the offense stands at either end.
  await camera.selectOption("behind");
  const from = room.getByRole("combobox", { name: "From" });
  await expect(from).toHaveValue("offense");
  const behind = await canvas.getAttribute("data-goal");
  expect(Number(behind!.split(",")[2])).toBeLessThan(0);
  await from.selectOption("defense");
  await expect(canvas).toHaveAttribute("data-side", "defense");
  await expect.poll(async () => Number((await canvas.getAttribute("data-goal"))!.split(",")[2])).toBeGreaterThan(0);
  await from.selectOption("offense");
  // QB cam: hung behind the quarterback with its own snap-to-pass clock; it can stay off the ball.
  await camera.selectOption("qb");
  await expect(canvas).toHaveAttribute("data-camera", "qb");
  await expect(from).toHaveCount(0);
  await expect(room.locator(".fr-3d-snap")).toContainText("Snap to pass");
  const ball = room.getByRole("checkbox", { name: "Follow the ball" });
  await expect(ball).toBeChecked();
  await ball.uncheck();
  expect(await brandCam(page)).toEqual({ camera: "qb", side: "offense", pass: false });
  await ball.check();
  // Player's eyes rides in a helmet: the quarterback's first, then any player, turned with the buttons on the field.
  await camera.selectOption("eyes");
  await expect(canvas).toHaveAttribute("data-shot", "eyes");
  await expect(canvas).toHaveAttribute("data-drag", "1");
  const rider = room.getByRole("combobox", { name: "Player" });
  await expect(rider).toHaveValue("");
  const mine = await canvas.getAttribute("data-follow");
  await rider.selectOption("d0");
  await expect(canvas).toHaveAttribute("data-follow", "d0");
  expect(mine).not.toBe("d0");
  const turn = room.getByRole("group", { name: "Turn the camera" });
  await expect(turn.getByRole("button")).toHaveCount(4);
  await turn.getByRole("button", { name: "Turn right" }).click();
  // Free look: turned and moved in and out by hand.
  await camera.selectOption("free");
  await expect(turn.getByRole("button")).toHaveCount(6);
  const far = await canvas.getAttribute("data-goal");
  await turn.getByRole("button", { name: "Closer" }).click();
  await expect(canvas).not.toHaveAttribute("data-goal", far!);
  await expect(room.getByRole("combobox", { name: "Player" })).toHaveCount(0);
  expect(await brandCam(page)).toEqual({ camera: "free", side: "offense", pass: true });
  expect(errors).toEqual([]);
});

test("Film Room stays flat and says so where the browser can't draw 3D", async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      if (/webgl/.test(kind)) return null;
      return (get as (...a: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof get;
  });
  await seedReady(page);
  const room = await openRoom(page);
  await room.getByRole("group", { name: "View" }).getByRole("button", { name: "3D" }).click();
  await expect(room.getByRole("status")).toHaveText("This browser can't draw 3D, so the lesson is shown flat.");
  await expect(room.getByRole("group", { name: "View" }).getByRole("button", { name: "Flat" })).toHaveAttribute("aria-pressed", "true");
  await expect(room.locator(".fr-field svg")).toBeVisible();
  expect(await brandView(page)).toBeNull();
});
