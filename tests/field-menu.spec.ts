import { expect, test, type Page } from "@playwright/test";
import { errorsOf, quiet, seedReady } from "./helpers";

/**
 * The Designer's right-click menus. On empty field the Tools menu offers the
 * line tools as radios (the current one checked) and the field actions; a tool
 * picked there is the rail's, Select all picks everything, the scrim and
 * Escape close it without doing anything. On a route the Selected element
 * menu restyles it in place (dash, weight, color, the arrow and the first
 * read, each shown ticked on the next open), Copy and Paste here put a copy
 * where the field was clicked, and Delete takes it off. On a player it offers
 * his own moves (a pre-snap spot, Lock in place), and a locked player gets the field's menu.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  // Coach tips off, so a tool intro never sits over the field.
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

/** Screen spot of the middle of the longest open route, and its index among the drawn paths. */
const longestRoute = (page: Page) =>
  page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=path]"));
    let best: { i: number; el: SVGPathElement; len: number } | null = null;
    groups.forEach((g, i) => {
      const el = g.querySelector('path[fill="none"]') as SVGPathElement | null;
      if (!el || el.getAttribute("marker-end") === null) return;
      const len = el.getTotalLength();
      if (!best || len > best.len) best = { i, el, len };
    });
    if (!best) throw new Error("no route on the field");
    const { i, el, len } = best as { i: number; el: SVGPathElement; len: number };
    const p = el.getPointAtLength(len / 2).matrixTransform(el.getScreenCTM()!);
    return { i, x: p.x, y: p.y };
  });

/** Screen spot of a player who isn't locked, and his letter. */
const aPlayer = (page: Page, letter: string) =>
  page.evaluate((letter) => {
    const groups = Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=player]"));
    const g = groups.find((el) => el.querySelector("text")?.textContent === letter)!;
    const box = (g as SVGGElement).getBBox();
    const p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform((g as SVGGElement).getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, letter);

test("the field's right-click menu picks a tool, selects all and closes on the scrim or Escape", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/vault");
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");
  const menu = page.getByRole("menu", { name: "Tools" });
  // The floating tools sit over the field's top-left corner, so empty field is the bottom-right.
  const box = (await svg.boundingBox())!;
  const empty = { x: box.x + box.width - 30, y: box.y + box.height - 30 };

  // The tools as radios with Select checked, then the field actions for a saved play with lines.
  await page.mouse.click(empty.x, empty.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio")).toHaveText(["Select", "Route arrow", "3-point arc", "Dashed", "Block", "Motion", "Freehand", "Text"]);
  await expect(menu.getByRole("menuitemradio", { name: "Select" })).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitemradio", { name: "Select" })).toBeFocused();
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Select all",
    "Select with a box",
    "Clean up all lines",
    "Smooth all lines",
    "Straighten all lines",
    "Flip and save as a new play",
    "Fit the field to the screen",
    "Hide the side panels",
  ]);

  // A tool picked here is the rail's tool; the next open shows it checked.
  await menu.getByRole("menuitemradio", { name: "Dashed" }).click();
  await expect(menu).toBeHidden();
  await page.getByRole("tab", { name: "Draw" }).click();
  await expect(page.getByRole("button", { name: "Dashed line with arrow" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(empty.x, empty.y, { button: "right" });
  await expect(menu.getByRole("menuitemradio", { name: "Dashed" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: "Select" }).click();
  await expect(page.getByRole("button", { name: "Dashed line with arrow" })).toHaveAttribute("aria-pressed", "false");

  // Select all picks every element on the field.
  const total = await svg.locator("g[data-kind]").count();
  expect(total).toBeGreaterThan(5);
  await page.mouse.click(empty.x, empty.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "Select all" }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator(".dz-style-target")).toHaveText("3 lines · 5 players · 3 labels");
  await page.mouse.click(empty.x, empty.y);
  await expect(page.locator(".dz-style-target")).toHaveText("Next line");

  // A click away closes it and nothing changes; so does Escape.
  await page.mouse.click(empty.x, empty.y, { button: "right" });
  await expect(menu).toBeVisible();
  await page.mouse.click(box.x + 40, box.y + box.height - 40);
  await expect(menu).toBeHidden();
  await expect(page.locator(".dz-style-target")).toHaveText("Next line");
  await page.mouse.click(empty.x, empty.y, { button: "right" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(status).not.toContainText("Selected");
  expect(errors).toEqual([]);
});

test("a route's right-click menu restyles it in place, copies it to where the field was clicked and deletes it; a player gets his own moves", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // The starter's players are one group; X on his own, so his menu is a player's and not the group's.
  const id = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    const play = ws.plays.find((p: { name: string }) => /Stick/.test(p.name));
    const x = play.scene.nodes.find((n: { kind: string; label?: string }) => n.kind === "player" && n.label === "X");
    x.groupId = null;
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    return play.id as string;
  });
  await page.goto(`/build/${id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const status = page.locator(".dz-status [role=status]");
  const menu = page.getByRole("menu", { name: "Selected element" });
  const tools = page.getByRole("menu", { name: "Tools" });
  const route = await longestRoute(page);
  const line = svg.locator("g[data-kind=path]").nth(route.i).locator('path[fill="none"]');
  const open = async () => {
    await page.mouse.click(route.x, route.y, { button: "right" });
    await expect(menu).toBeVisible();
  };

  // The sections, the current look ticked, and the first item focused.
  await open();
  await expect(menu.locator(".stage-menu-head")).toHaveText(["Line style", "Weight", "Color", "Ends", "Clean up", "Snap", "Edit"]);
  await expect(menu.getByRole("menuitemcheckbox", { name: "Solid" })).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitemcheckbox", { name: "Solid" })).toBeFocused();
  await expect(menu.getByRole("menuitemcheckbox", { name: "Arrow at the end" })).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toHaveClass(/is-danger/);
  await expect(page.locator(".dz-style-target")).toHaveText("1 line");

  // Dashed, Thick and Red land on the drawing, and each shows ticked on the next open.
  await menu.getByRole("menuitemcheckbox", { name: "Dashed" }).click();
  await expect(menu).toBeHidden();
  await expect(line).toHaveAttribute("stroke-dasharray", /\d/);
  await open();
  await expect(menu.getByRole("menuitemcheckbox", { name: "Dashed" })).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitemcheckbox", { name: "Solid" })).toHaveAttribute("aria-checked", "false");
  await menu.getByRole("menuitemcheckbox", { name: "Thick" }).click();
  await expect(line).toHaveAttribute("stroke-width", "4.4");
  await open();
  await expect(menu.getByRole("menuitemcheckbox", { name: "Thick" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemcheckbox", { name: "Red" }).click();
  await expect(line).toHaveAttribute("stroke", "#D24B3E");

  // The arrow comes off and goes back on; First read paints the route in the first-read color.
  await open();
  await menu.getByRole("menuitemcheckbox", { name: "Arrow at the end" }).click();
  await expect(line).not.toHaveAttribute("marker-end", /.+/);
  await open();
  await expect(menu.getByRole("menuitemcheckbox", { name: "Arrow at the end" })).toHaveAttribute("aria-checked", "false");
  await menu.getByRole("menuitemcheckbox", { name: "Arrow at the end" }).click();
  await expect(line).toHaveAttribute("marker-end", /url\(/);
  await open();
  await menu.getByRole("menuitemcheckbox", { name: "First read" }).click();
  await expect(line).toHaveAttribute("stroke", "#0FA8C4");
  await open();
  await expect(menu.getByRole("menuitemcheckbox", { name: "First read" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // Copy, then Paste here from the field menu: one more route, picked and placed where the field was clicked.
  const paths = await svg.locator("g[data-kind=path]").count();
  await open();
  await menu.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await expect(status).toContainText("Copied");
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30, { button: "right" });
  await expect(tools.getByRole("menuitem").first()).toHaveText("Paste here");
  await tools.getByRole("menuitem", { name: "Paste here" }).click();
  await expect(status).toContainText("Pasted 1 element. Drag to place it.");
  await expect(svg.locator("g[data-kind=path]")).toHaveCount(paths + 1);

  // Delete from the menu takes the pasted copy off again.
  const copy = await longestRoute(page);
  const pasted = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=path]"));
    const g = groups[groups.length - 1] as SVGGElement;
    const el = g.querySelector('path[fill="none"]') as SVGPathElement;
    const p = el.getPointAtLength(el.getTotalLength() / 2).matrixTransform(el.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  expect(copy).toBeTruthy();
  await page.mouse.click(pasted.x, pasted.y, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  await expect(svg.locator("g[data-kind=path]")).toHaveCount(paths);

  // A player: his own moves. The pre-snap spot adds a faded copy of him; Lock in place ends his menu.
  const x = await aPlayer(page, "X");
  const players = await svg.locator("g[data-kind=player]").count();
  await page.mouse.click(x.x, x.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.locator(".stage-menu-head")).toHaveText(["Player", "Edit"]);
  await expect(menu.getByRole("menuitem")).toContainText(["Draw a route from here", "Pick from the route library", "Add a note", "Show where he lines up pre-snap", "X on every play"]);
  await menu.getByRole("menuitem", { name: "Show where he lines up pre-snap" }).click();
  await expect(status).toContainText("Drag the faded X to where he lines up before the snap.");
  await expect(svg.locator("g[data-kind=player]")).toHaveCount(players + 1);
  await page.mouse.click(x.x, x.y, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Remove the pre-snap spot" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Lock in place" }).click();
  await expect(status).toContainText("Locked in place.");
  // Locked, a right-click on him is a right-click on the field: the Tools menu, not his.
  await page.mouse.click(x.x, x.y, { button: "right" });
  await expect(tools).toBeVisible();
  await expect(menu).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(tools).toBeHidden();
  expect(errors).toEqual([]);
});
