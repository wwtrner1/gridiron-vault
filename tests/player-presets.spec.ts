import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * Player presets (the Designer's right panel with a player picked): the
 * starter chips, a new preset built in the editor (letter, shape, outline,
 * lines, Blocking switching the line end to a T-bar), saved and listed,
 * applied to the picked player and dropped on the field as a new one, the
 * Delete link, the starter put back from "Add the starter presets", all
 * kept in grid1ronvault.playerPresets.v1 after a reload.
 */
test.beforeEach(async ({ context }) => quiet(context));

type Node = { id: string; kind: string; x: number; y: number; label?: string; shape?: string; hidden?: boolean; locked?: boolean; assignOf?: string; endCap?: string; style?: string };

/** The chips' names (the glyph's letter is hidden from assistive tech, so the name is the chip's own text). */
const chipNames = (chips: import("@playwright/test").Locator) =>
  chips.getByRole("button").evaluateAll((els) => els.map((el) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("")));

const presets = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("grid1ronvault.playerPresets.v1") ?? "null") as { id: string; name: string; label: string }[] | null)?.map((p) => [p.id, p.name, p.label]));

/** The field as the Designer's safety copy has it (written a moment after every change). */
const draft = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("grid1ronvault.draft.v1") ?? "null") as { scene: { nodes: Node[] } } | null)?.scene.nodes ?? []);

test("Player presets: the starters, a new preset saved, applied and dropped, deleted, and the starter put back", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");

  // Pick one player on the field, by his spot.
  const id = page.url().split("/build/")[1].split(/[?#]/)[0];
  const player = await page.evaluate((pid) => {
    const plays = JSON.parse(localStorage.getItem("snapline.workspace.v1")!).plays as { id: string; scene: { nodes: Node[] } }[];
    return plays.find((p) => p.id === pid)!.scene.nodes.find((n) => n.kind === "player" && !n.locked && !n.hidden)!;
  }, id);
  const at = await page.evaluate(({ x, y }) => {
    const el = document.querySelector(".stage-frame svg") as SVGSVGElement;
    const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, player);
  await page.mouse.click(at.x, at.y);
  const panel = page.locator(".panel").filter({ has: page.locator(".panel-head", { hasText: "Player presets" }) });
  await expect(panel.locator(".panel-head")).toHaveAttribute("aria-expanded", "true");
  const chips = panel.getByRole("list", { name: "Your player presets" });
  await expect(chips.getByRole("button")).toHaveCount(10);
  expect(await chipNames(chips)).toEqual(["QB Q · drop", "X · go", "Z · post", "Slot S · out", "Back H · flat", "Center · block", "TE Y · seam", "Tackle T · base", "Guard G · pull", "Nose N · rush"]);
  expect(await presets(page)).toBeUndefined();

  // A starter opens in the editor; its preview is named.
  await chips.getByRole("button", { name: "Z · post" }).click();
  await expect(panel.locator(".pp-editor-head")).toContainText("Edit preset · Z · post");
  await expect(panel.getByRole("img", { name: "Preview of Z · post" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Saved" })).toBeDisabled();
  // A press on a player picks his group when he is in one, so Apply names however many that is.
  const apply = panel.getByRole("button", { name: /^Apply to selected \(\d+\)$/ });
  await expect(apply).toBeEnabled();
  const picked = Number((await apply.textContent())!.match(/\((\d+)\)/)![1]);

  // A new preset: name, letter, shape, outline, lines; Blocking switches the line end to a T-bar and the route select off.
  await panel.getByRole("button", { name: "+ New preset" }).click();
  await expect(panel.locator(".pp-editor-head")).toContainText("Edit preset · New preset");
  await expect(panel.getByLabel("Position letter")).toHaveValue("X");
  await panel.getByLabel("Preset name").fill("Slot Z");
  await panel.getByLabel("Position letter").fill("z");
  await expect(panel.getByLabel("Position letter")).toHaveValue("Z");
  await panel.getByRole("group", { name: "Shape" }).getByRole("button", { name: "Square" }).click();
  await panel.getByRole("button", { name: "Preset outline #d4a017" }).click();
  await panel.getByRole("group", { name: "Outline style" }).getByRole("button", { name: "Dash" }).click();
  await panel.getByRole("group", { name: "Line weight" }).getByRole("button", { name: "3" }).click();
  await panel.getByRole("group", { name: "Line style" }).getByRole("button", { name: "Dashed" }).click();
  await expect(panel.getByRole("group", { name: "Line end" }).getByRole("button", { pressed: true })).toHaveText("Arrow");
  await panel.getByRole("group", { name: "Assignment" }).getByRole("button", { name: "Blocking" }).click();
  await expect(panel.getByRole("group", { name: "Line end" }).getByRole("button", { pressed: true })).toHaveText("T-bar");
  await expect(panel.getByRole("combobox", { name: "Route" })).toBeDisabled();
  await expect(panel.getByRole("combobox", { name: "Block" })).toBeEnabled();
  await expect(panel.getByLabel("Mark as first read")).toBeDisabled();
  await expect(panel.locator(".pp-editor-head")).toContainText("Edit preset · Slot Z");
  await expect(panel.getByRole("button", { name: "Delete this preset" })).toHaveCount(0);

  // Save: a chip, the button reads Saved, the delete link appears, and the browser keeps it with the starters.
  await panel.getByRole("button", { name: "Save preset" }).click();
  await expect(chips.getByRole("button", { name: "Slot Z" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("button", { name: "Saved" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Delete this preset" })).toBeVisible();
  expect((await presets(page))?.at(-1)).toEqual([expect.stringMatching(/^pre/), "Slot Z", "Z"]);

  // Apply to the picked player: his letter and shape change and a block line hangs off him.
  await apply.click();
  await expect(status).toHaveText("Slot Z applied");
  await expect.poll(async () => (await draft(page)).find((n) => n.id === player.id)?.label).toBe("Z");
  const applied = (await draft(page)).find((n) => n.id === player.id)!;
  expect(applied.shape).toBe("square");
  const block = (await draft(page)).find((n) => n.kind === "path" && n.assignOf === player.id)!;
  expect(block.endCap).toBe("tee");
  expect(block.style).toBe("dashed");
  expect((await draft(page)).filter((n) => n.kind === "player" && n.label === "Z" && n.shape === "square").length).toBe(picked);

  // Drop on field: a new Z with his own block line, picked.
  const before = (await draft(page)).filter((n) => n.kind === "player").length;
  await panel.getByRole("button", { name: "Drop on field" }).click();
  await expect(status).toHaveText("Slot Z dropped");
  await expect.poll(async () => (await draft(page)).filter((n) => n.kind === "player").length).toBe(before + 1);
  const dropped = (await draft(page)).filter((n) => n.kind === "player").at(-1)!;
  expect(dropped.label).toBe("Z");
  expect((await draft(page)).some((n) => n.kind === "path" && n.assignOf === dropped.id)).toBe(true);
  await expect(page.locator("#insp-pane .panel-head").first()).toContainText("Z");

  // Delete the new preset: the chip goes and the first starter opens.
  await panel.getByRole("button", { name: "Delete this preset" }).click();
  await expect(chips.getByRole("button", { name: "Slot Z" })).toHaveCount(0);
  await expect(panel.locator(".pp-editor-head")).toContainText("Edit preset · QB Q · drop");
  expect(await presets(page)).toHaveLength(10);

  // A starter deleted can be put back from the link; the rest is kept after a reload.
  await panel.getByRole("button", { name: "Delete this preset" }).click();
  await expect(chips.getByRole("button", { name: "QB Q · drop" })).toHaveCount(0);
  const seeds = panel.getByRole("button", { name: "+ Add the starter presets (Q)" });
  await expect(seeds).toBeVisible();
  await seeds.click();
  await expect(seeds).toHaveCount(0);
  await expect(chips.getByRole("button").last()).toHaveAccessibleName("QB Q · drop");
  await panel.getByRole("button", { name: "+ New preset" }).click();
  await panel.getByLabel("Preset name").fill("Nickel N");
  await panel.getByLabel("Position letter").fill("N");
  await panel.getByRole("button", { name: "Save preset" }).click();
  await expect(chips.getByRole("button", { name: "Nickel N" })).toBeVisible();
  await page.reload();
  await svg.waitFor();
  await page.mouse.click(at.x, at.y);
  await expect(chips.getByRole("button")).toHaveCount(11);
  expect(await chipNames(chips)).toEqual(["X · go", "Z · post", "Slot S · out", "Back H · flat", "Center · block", "TE Y · seam", "Tackle T · base", "Guard G · pull", "Nose N · rush", "QB Q · drop", "Nickel N"]);
  expect(errors).toEqual([]);
});
