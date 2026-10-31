import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The Designer's Style card: with nothing picked it sets the next line (the
 * floating tools show the same weight); a picked route takes a color, weight,
 * dash and end; a picked player a fill (its letter re-inked), a letter color
 * and a size, with a link to the Routes tab; a picked label a font color, size
 * and weight; Select all + Wristband bold makes everything heavy and Undo puts
 * it back; and Save keeps every change in the play.
 */
test.beforeEach(async ({ context }) => quiet(context));

type Node = { id: string; kind: string; stroke?: string; width?: number; style?: string; endCap?: string; fill?: string; textColor?: string; size?: number; text?: string; color?: string; fontSize?: number; weight?: number };

test("the Style card restyles the next line, a route, a player and a label, Wristband bold goes heavy and Undo puts it back", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // A label on the field, since the starter has none: seeded into the play before the Designer opens it.
  const id = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const play = ws.plays.find((p: { name: string }) => /Stick/.test(p.name));
    play.scene.nodes.push({ id: "t_go", x: 900, y: 120, rotation: 0, scaleX: 1, scaleY: 1, z: 99, groupId: null, locked: false, hidden: false, name: "", kind: "text", text: "GO", fontSize: 20, color: "#0B1524", weight: 700, align: "middle", boxed: false });
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    return play.id as string;
  });
  await page.goto(`/build/${id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const card = page.locator(".dz-style");
  const target = card.locator(".dz-style-target");
  const row = (name: string) => card.getByRole("group", { name, exact: true });
  const status = page.locator(".dz-status [role=status]");
  const bar = page.getByRole("toolbar", { name: "Floating tools" });
  /** N steps through the field; this keeps pressing until the status names what we want. */
  const pick = async (what: RegExp) => {
    for (let i = 0; i < 24 && !what.test((await status.textContent()) ?? ""); i++) await page.keyboard.press("n");
    await expect(status).toContainText(what);
  };

  // Nothing picked: the card sets the next line, and the floating tools show the same weight.
  await expect(target).toHaveText("Next line");
  await row("Dash").getByRole("button", { name: "Dashed" }).click();
  await row("Curve").getByRole("button", { name: "Spline" }).click();
  await row("End").getByRole("button", { name: "Dot" }).click();
  await row("Weight").getByRole("button", { name: "Line weight 4, boldest" }).click();
  await expect(row("Dash").getByRole("button", { pressed: true })).toHaveText("Dashed");
  await expect(row("Curve").getByRole("button", { pressed: true })).toHaveText("Spline");
  await expect(row("End").getByRole("button", { pressed: true })).toHaveText("Dot");
  await expect(bar.getByRole("group", { name: "Line weight" }).locator("button[aria-pressed=true]")).toHaveAttribute("aria-label", "Line weight 4, boldest");
  await expect(card.getByRole("button", { name: "Next line Red" })).toBeVisible();

  // A player: a fill re-inks the letter, a letter color, a size, and a link to the Routes tab.
  await pick(/Selected Receiver X,/);
  await expect(target).toHaveText("1 player");
  await expect(card.getByRole("button", { name: "Give X a route →" })).toBeVisible();
  await row("Player").getByRole("button", { name: "Player fill Violet" }).click();
  const violet = svg.locator('[data-kind=player]').filter({ has: page.locator('[fill="#7A6BD2"]') });
  await expect(violet).toHaveCount(1);
  await expect(violet.locator("text")).toHaveAttribute("fill", "#FFFFFF");
  await row("Letter").getByRole("button", { name: "Letter Ink" }).click();
  await expect(violet.locator("text")).toHaveAttribute("fill", "#0B1524");
  await row("Size").getByRole("button", { name: "XL" }).click();
  await expect(violet.locator('[r="26"]').or(violet.locator('[width="52"]'))).toHaveCount(1);
  await card.getByRole("button", { name: "Give X a route →" }).click();
  await expect(page.getByRole("tab", { name: "Routes" })).toHaveAttribute("aria-selected", "true");

  // A route: color, the boldest weight, a dash and a T-block end.
  await pick(/Selected Route,/);
  await expect(target).toHaveText("1 line");
  await expect(svg.locator('[data-kind=path] path[stroke="#D24B3E"]')).toHaveCount(0);
  await row("Color").getByRole("button", { name: "Line Red" }).click();
  const red = svg.locator('[data-kind=path] path[stroke="#D24B3E"]');
  await expect(red).toHaveCount(1);
  await row("Weight").getByRole("button", { name: "Line weight 4, boldest" }).click();
  await expect(red).toHaveAttribute("stroke-width", "5.6");
  await row("Dash").getByRole("button", { name: "Dashed" }).click();
  await expect(red).toHaveAttribute("stroke-dasharray", /^16\.[78]/);
  await row("End").getByRole("button", { name: "T-block" }).click();
  await expect(red).toHaveAttribute("marker-end", "url(#tee-D24B3E)");

  // A label: font color, size and weight.
  await pick(/Selected GO,/);
  await expect(target).toHaveText("1 label");
  const go = svg.locator('[data-kind=text] text', { hasText: "GO" });
  await row("Font").getByRole("button", { name: "Font Red" }).click();
  await expect(go).toHaveAttribute("fill", "#D24B3E");
  await row("Size").getByRole("button", { name: "36", exact: true }).click();
  await expect(go).toHaveAttribute("font-size", "36");
  await row("Weight").getByRole("button", { name: "Heavy" }).click();
  await expect(go).toHaveAttribute("font-weight", "800");

  // Select all, Wristband bold: every line at the heaviest weight and the players large; Undo puts them back.
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.locator("#dz-more-menu").getByRole("button", { name: "Select all" }).click();
  await expect(target).toHaveText("3 lines · 5 players · 4 labels");
  const thin = svg.locator("[data-kind=path] path:not([stroke-width='5.6'])");
  const thinBefore = await thin.count();
  expect(thinBefore).toBeGreaterThan(0);
  await card.getByRole("button", { name: "Wristband bold" }).click();
  await expect(thin).toHaveCount(0);
  const large = svg.locator("[data-kind=player] [r='22'], [data-kind=player] [width='44']");
  await expect.poll(() => large.count()).toBeGreaterThanOrEqual(3);
  await expect(go).toHaveAttribute("font-weight", "800");
  await page.keyboard.press("Control+z");
  await expect(thin).toHaveCount(thinBefore);
  await expect(large).toHaveCount(0);

  // Save keeps the route, player and label as styled.
  await page.locator('[data-tour="dz-save"]').click();
  await expect.poll(async () => (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes.length).toBeGreaterThan(0);
  const nodes = (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes as unknown as Node[];
  expect(nodes.find((n) => n.kind === "path" && n.stroke === "#D24B3E")).toMatchObject({ width: 5.6, style: "dashed", endCap: "tee" });
  expect(nodes.find((n) => n.kind === "player" && n.fill === "#7A6BD2")).toMatchObject({ textColor: "#0B1524", size: 52 });
  expect(nodes.find((n) => n.id === "t_go")).toMatchObject({ color: "#D24B3E", fontSize: 36, weight: 800 });
  expect(errors).toEqual([]);
});
