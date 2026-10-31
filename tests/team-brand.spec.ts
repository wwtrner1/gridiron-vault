import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Team branding on My team: the name on the field, a color preset, a logo
 * (its colors pulled out, a file that isn't an image refused in coach words),
 * the field and print switches, the wristband header in team colors with the
 * logo and {team}, Back to GridIronVault colors, and all of it kept in this
 * browser after a reload.
 */
test.beforeEach(async ({ context }) => quiet(context));

type Brand = { name: string; logo: string | null; primary: string; secondary: string; logoOnField: boolean; endZones: boolean; prints: boolean };
const stored = (page: import("@playwright/test").Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1") ?? "{}") as Brand);

/** A 64×64 PNG: green with a gold corner, so the colors pulled from it are known. */
async function logoPng(page: import("@playwright/test").Page) {
  const url = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#1F5B3A";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#E8B820";
    ctx.fillRect(0, 0, 32, 32);
    return c.toDataURL("image/png");
  });
  return { name: "wildcats.png", mimeType: "image/png", buffer: Buffer.from(url.split(",")[1], "base64") };
}

test("Team branding: name, preset, logo and its colors, the switches, the wristband header, reset and kept after a reload", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/roster");
  const panel = page.getByRole("region", { name: "Team branding" });
  await expect(panel).toBeVisible();
  const preview = panel.getByRole("img", { name: "Preview of the red zone field with your branding" });
  const endZone = preview.locator("text", { hasText: /END ZONE|WILDCATS/ });
  const band = panel.locator(".brand-band");
  const name = panel.getByLabel("Name on the field and prints");
  const primary = panel.getByLabel("Primary color");
  const secondary = panel.getByLabel("Second color");
  const presets = panel.getByRole("group", { name: "Team color presets" });

  // Nothing branded yet: the GridIronVault colors and a plain end zone.
  await expect(endZone).toHaveText("END ZONE");
  await expect(primary).toHaveValue("#0b1524");
  await expect(presets.getByRole("button", { pressed: true })).toHaveCount(0);

  // The name goes on the end zone and the card band; a preset sets both colors.
  await name.fill("Wildcats");
  await expect(endZone).toHaveText("WILDCATS");
  await expect(band).toHaveText("WILDCATS · CARD A");
  await presets.getByRole("button", { name: "Navy and gold" }).click();
  await expect(presets.getByRole("button", { name: "Navy and gold" })).toHaveAttribute("aria-pressed", "true");
  await expect(primary).toHaveValue("#1b2a4a");
  await expect(secondary).toHaveValue("#f2b705");
  await expect(band).toHaveCSS("background-color", "rgb(27, 42, 74)");

  // A file that isn't an image is refused in coach words; a PNG logo lands with its colors.
  const file = panel.locator("input[type=file]");
  await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a logo") });
  await expect(page.locator(".toast", { hasText: "Choose a PNG, JPG, WebP, GIF or SVG image of your logo." })).toBeVisible();
  await expect(panel.locator(".brand-logo.is-empty")).toHaveText("No logo");
  await file.setInputFiles(await logoPng(page));
  await expect(page.locator(".toast", { hasText: "Logo added. Its colors are now your team colors" })).toBeVisible();
  await expect(panel.getByRole("img", { name: "Team logo" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Change logo" })).toBeVisible();
  await expect(primary).toHaveValue("#1f5b3a");
  await expect(secondary).toHaveValue("#e8b820");
  await expect(preview.locator("image")).toHaveCount(1);
  expect((await stored(page)).logo).toMatch(/^data:image\/png;base64,/);

  // The switches: the logo off the field, the end zones back to plain.
  await panel.getByLabel("Logo at midfield").uncheck();
  await expect(preview.locator("image")).toHaveCount(0);
  await panel.getByLabel(/End zones in team colors/).uncheck();
  await expect(endZone).toHaveText("END ZONE");
  await panel.getByLabel(/End zones in team colors/).check();
  await expect(endZone).toHaveText("WILDCATS");

  // Wristbands: the header band takes the team colors and logo, and {team} fills in the name.
  await page.goto("/wristbands");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
  const card = page.locator('.wb-preview [aria-label^="Card "]').first();
  const head = card.locator(".wb-card-head");
  await expect(head).toHaveCSS("background-color", "rgb(31, 91, 58)");
  await expect(head.locator(".wb-card-logo")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Card colors" }).locator(".chip[aria-pressed=true]")).toHaveText("Team colors");
  await page.getByLabel("Header, left").fill("{team} · Card {card}");
  await expect(head).toContainText("Wildcats · Card A");

  // Prints off: the header goes back to the GridIronVault look.
  await page.goto("/roster");
  await panel.getByLabel(/On wristbands and PDFs/).uncheck();
  await page.goto("/wristbands");
  await expect(head).toHaveCSS("background-color", "rgb(11, 21, 36)");
  await expect(head.locator(".wb-card-logo")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Card colors" }).locator(".chip[aria-pressed=true]")).toHaveText("GridIronVault");

  // Kept in this browser after a reload.
  await page.goto("/roster");
  await page.reload();
  await expect(name).toHaveValue("Wildcats");
  await expect(primary).toHaveValue("#1f5b3a");
  await expect(panel.getByRole("img", { name: "Team logo" })).toBeVisible();
  await expect(panel.getByLabel("Logo at midfield")).not.toBeChecked();
  await expect(panel.getByLabel(/On wristbands and PDFs/)).not.toBeChecked();
  expect(await stored(page)).toMatchObject({ name: "Wildcats", primary: "#1F5B3A", secondary: "#E8B820", logoOnField: false, endZones: true, prints: false });

  // Remove takes the logo off; Back to GridIronVault colors clears the rest.
  await panel.getByRole("button", { name: "Remove" }).click();
  await expect(panel.locator(".brand-logo.is-empty")).toHaveText("No logo");
  await panel.getByRole("button", { name: "Back to GridIronVault colors" }).click();
  await expect(name).toHaveValue("");
  await expect(primary).toHaveValue("#0b1524");
  await expect(endZone).toHaveText("END ZONE");
  await expect(panel.getByLabel("Logo at midfield")).toBeChecked();
  expect(await stored(page)).toMatchObject({ name: "", logo: null, primary: "#0B1524", secondary: "#16C8E8", prints: true });

  expect(errors).toEqual([]);
});
