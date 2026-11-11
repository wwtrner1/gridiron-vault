import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Export dialog's settings, opened from the Vault's bulk bar with two
 * plays: file kinds, the one-click styles, size, diagram look, plays per
 * sheet, the print order, resolution for images, a custom size, and the
 * button each kind ends in. The PDF itself is covered in export.spec.ts.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the Export dialog's one-click styles, sizes, looks, plays per sheet, order and resolution", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Select 17 · Stick" }).click();
  await page.getByRole("button", { name: "Select 03 · Mesh" }).click();
  await page.getByRole("button", { name: "Export or print" }).click();
  const modal = page.locator(".modal");
  await expect(modal.getByRole("heading", { name: "Export 2 plays" })).toBeVisible();
  const pressed = (group: string) => modal.locator(`[aria-labelledby=${group}] button[aria-pressed=true]`);
  const size = modal.locator("[role=radio][aria-checked=true] strong");
  const preview = modal.locator(".ex-preview");
  const field = modal.locator("label:has-text('Field') select");
  const notes = modal.getByLabel("Print the coaching notes underneath");
  const order = modal.locator(".ex-order-name");

  // A print-ready PDF on letter portrait, the whole field, one play per page, in the Vault's order.
  await expect(pressed("ex-file")).toHaveText("Print-ready PDF");
  await expect(modal.locator("[role=radio]")).toHaveCount(9);
  await expect(size).toHaveText("Letter portrait");
  await expect(pressed("ex-look")).toHaveText("Whole field");
  await expect(pressed("ex-per")).toHaveAttribute("aria-label", "One play per page");
  await expect(preview).toHaveAttribute("aria-label", "Print preview, 8.5 by 11 inches");
  await expect(modal.locator(".hint").first()).toHaveText("8.5 × 11 in · vector lines, sharp at any print size");
  await expect(order).toHaveText(["17 · Stick", "03 · Mesh"]);
  await expect(modal.getByRole("button", { name: "Preview and print" })).toBeVisible();

  // One-click styles set size, look, field and notes together.
  await modal.getByRole("button", { name: "Wristband bold" }).click();
  await expect(size).toHaveText("Large wristband card");
  await expect(pressed("ex-look")).toHaveText("Zoom to the play");
  await expect(pressed("ex-per")).toHaveAttribute("aria-label", "One play per page");
  await expect(preview).toHaveAttribute("aria-label", "Print preview, 4.75 by 2.5 inches");
  await expect(field).toHaveValue("yards");
  await expect(notes).not.toBeChecked();
  await modal.getByRole("button", { name: "Install binder" }).click();
  await expect(size).toHaveText("Letter portrait");
  await expect(pressed("ex-look")).toHaveText("Whole field");
  await expect(field).toHaveValue("full");
  await expect(notes).toBeChecked();

  // Plays per sheet and the print order.
  await modal.getByRole("button", { name: "4 plays per sheet" }).click();
  await expect(pressed("ex-per")).toHaveAttribute("aria-label", "4 plays per sheet");
  await expect(modal.getByRole("button", { name: "Move 17 · Stick up" })).toBeDisabled();
  await modal.getByRole("button", { name: "Move 17 · Stick down" }).click();
  await expect(order).toHaveText(["03 · Mesh", "17 · Stick"]);
  await expect(modal.getByRole("button", { name: "Move 17 · Stick down" })).toBeDisabled();

  // Images: resolution instead of plays per sheet, with the plan's cap shown; the button names the file.
  await modal.getByRole("button", { name: "PNG image" }).click();
  await expect(modal.locator("[aria-labelledby=ex-per]")).toHaveCount(0);
  const dpi = modal.locator("[aria-labelledby=ex-dpi] button");
  await expect(dpi).toHaveText(["86 DPI", "150 DPI", "300 DPI", /600 DPI/]);
  await expect(pressed("ex-dpi")).toHaveAttribute("aria-label", "300 DPI");
  await expect(dpi.last()).toBeDisabled();
  await expect(dpi.last()).toHaveAttribute("aria-label", "600 DPI — locked on Head Coach");
  await expect(modal.getByRole("button", { name: "Download PNG" })).toBeVisible();
  await modal.getByRole("button", { name: "PowerPoint" }).click();
  await expect(modal.getByText("Slides use up to 300 DPI, sharp on any projector.")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Download the deck" })).toBeVisible();

  // A custom size takes any width and height.
  await modal.getByRole("radio", { name: /^Custom size/ }).click();
  await expect(modal.getByLabel("Width (in)")).toHaveValue("4.75");
  await modal.getByLabel("Width (in)").fill("3");
  await modal.getByLabel("Height (in)").fill("2");
  await expect(preview).toHaveAttribute("aria-label", "Print preview, 3 by 2 inches");

  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toHaveCount(0);
  expect(errors).toEqual([]);
});
