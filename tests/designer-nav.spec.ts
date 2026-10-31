import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * Getting around the Designer: Prev and Next step through the play's playbook
 * (the count between them, [ and ] and PageDown from the keyboard, the last
 * play wrapping to the first, a move saved on the way), the zoom slider and
 * Fit size the field, and the keyboard shortcuts pick tools (1, 2, X), select
 * all, duplicate and delete, and Ctrl+\ hides and shows both panels (kept
 * after a reload).
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

test("Prev and Next step through the playbook, from the bar and the keyboard, and save a move on the way", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const ws = await workspace(page);
  const book = ws.playbooks![0] as { id: string; name: string; playIds: string[] };
  const nameOf = (id: string) => ws.plays!.find((p) => p.id === id)!.name;
  const n = book.playIds.length;
  expect(n).toBe(24);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  const at = book.playIds.findIndex((id) => /Stick/.test(nameOf(id)));
  const count = page.locator(".dz-step-count");
  const prev = page.getByRole("button", { name: /^Previous play: / });
  const next = page.getByRole("button", { name: /^Next play: / });

  // The count and the neighbours' names on the buttons.
  await expect(count).toHaveText(`${at + 1} / ${n}`);
  await expect(prev).toHaveAttribute("aria-label", `Previous play: ${nameOf(book.playIds[at - 1])}`);
  await expect(next).toHaveAttribute("aria-label", `Next play: ${nameOf(book.playIds[at + 1])}`);

  // Next from the bar, Prev from the keyboard, PageDown too.
  await next.click();
  await expect(page).toHaveURL(new RegExp(`/build/${book.playIds[at + 1]}\\?book=${book.id}`));
  await expect(count).toHaveText(`${at + 2} / ${n}`);
  await page.keyboard.press("[");
  await expect(page).toHaveURL(new RegExp(`/build/${book.playIds[at]}`));
  await expect(count).toHaveText(`${at + 1} / ${n}`);
  await page.keyboard.press("PageDown");
  await expect(count).toHaveText(`${at + 2} / ${n}`);
  await page.keyboard.press("]");
  await expect(count).toHaveText(`${at + 3} / ${n}`);

  // A player moved, then Next: the move is in the saved play before the next one opens.
  const moving = book.playIds[at + 2];
  const status = page.locator(".dz-status [role=status]");
  for (let i = 0; i < 24 && !/Selected Receiver X,/.test((await status.textContent()) ?? ""); i++) await page.keyboard.press("n");
  await expect(status).toContainText("Selected Receiver X,");
  const before = (await workspace(page)).plays!.find((p) => p.id === moving)!.scene.nodes.find((nd) => nd.label === "X")!.x;
  for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowRight");
  await next.click();
  await expect(count).toHaveText(`${at + 4} / ${n}`);
  // The store writes the workspace to disk a moment after the save, so read it until it lands.
  await expect
    .poll(async () => (await workspace(page)).plays!.find((p) => p.id === moving)!.scene.nodes.find((nd) => nd.label === "X")!.x)
    .toBeGreaterThan(before + 20);

  // The last play's Next wraps to the first, and the first's Prev to the last.
  await page.goto(`/build/${book.playIds[n - 1]}?book=${book.id}`);
  await svg.waitFor();
  await expect(count).toHaveText(`${n} / ${n}`);
  await expect(next).toHaveAttribute("aria-label", `Next play: ${nameOf(book.playIds[0])}`);
  await next.click();
  await expect(count).toHaveText(`1 / ${n}`);
  await expect(prev).toHaveAttribute("aria-label", `Previous play: ${nameOf(book.playIds[n - 1])}`);
  await prev.click();
  await expect(count).toHaveText(`${n} / ${n}`);
  expect(errors).toEqual([]);
});

test("the zoom slider and Fit size the field; the keyboard picks tools, selects all, duplicates, deletes and hides the panels", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const frame = page.locator(".stage-frame");
  const slider = page.getByRole("slider", { name: "Zoom" });
  const fit = page.getByRole("button", { name: "Fit", exact: true });
  const pct = page.locator(".dz-zoom span");

  // Fit is on to start; the slider shows the fitted zoom and the frame is that size.
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  const fitted = Number(await slider.inputValue());
  expect(fitted).toBeGreaterThan(30);
  await expect(pct).toHaveText(`${fitted}%`);
  expect((await frame.boundingBox())!.width).toBeCloseTo((1040 * fitted) / 100, -1);

  // A zoom picked on the slider sizes the field and turns Fit off; Fit puts it back.
  await slider.fill("120");
  await expect(pct).toHaveText("120%");
  await expect(fit).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => Math.round((await frame.boundingBox())!.width)).toBe(1248);
  await fit.click();
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  await expect(pct).toHaveText(`${fitted}%`);

  // Ctrl + scroll zooms in over the field.
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(fitted);
  await expect(fit).toHaveAttribute("aria-pressed", "false");

  // Tool shortcuts: 2 is Dashed, 1 the route arrow, X text; Escape (via Select, key S... ) back to Select.
  await page.getByRole("tab", { name: "Draw" }).click();
  const rail = (name: string) => page.getByRole("button", { name, exact: true });
  await page.keyboard.press("2");
  await expect(rail("Dashed line with arrow")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("1");
  await expect(rail("Solid line with arrow")).toHaveAttribute("aria-pressed", "true");
  await expect(rail("Dashed line with arrow")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("x");
  await expect(rail("Text label")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(rail("Text label")).toHaveAttribute("aria-pressed", "false");

  // Ctrl+A selects everything; Ctrl+D doubles a picked player; Delete takes the copy off.
  const target = page.locator(".dz-style-target");
  await page.keyboard.press("Control+a");
  await expect(target).toHaveText("3 lines · 5 players · 3 labels");
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30);
  await expect(target).toHaveText("Next line");
  const status = page.locator(".dz-status [role=status]");
  for (let i = 0; i < 24 && !/Selected Receiver X,/.test((await status.textContent()) ?? ""); i++) await page.keyboard.press("n");
  await expect(target).toHaveText("1 player");
  const players = await svg.locator("g[data-kind=player]").count();
  await page.keyboard.press("Control+d");
  await expect(svg.locator("g[data-kind=player]")).toHaveCount(players + 1);
  await expect(target).toHaveText("1 player");
  await page.keyboard.press("Delete");
  await expect(svg.locator("g[data-kind=player]")).toHaveCount(players);
  await expect(target).toHaveText("Next line");

  // Ctrl+\ hides both panels; again shows them; the choice is kept after a reload.
  const body = page.locator(".dz-body");
  const toolsEdge = page.getByRole("button", { name: /the tools panel$/ });
  await expect(body).not.toHaveClass(/is-rail-closed/);
  await expect(toolsEdge).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Control+\\");
  await expect(body).toHaveClass(/is-rail-closed/);
  await expect(body).toHaveClass(/is-side-closed/);
  await expect(toolsEdge).toHaveAttribute("aria-expanded", "false");
  await expect(toolsEdge).toHaveText("Tools");
  await page.reload();
  await svg.waitFor();
  await expect(body).toHaveClass(/is-rail-closed/);
  await page.keyboard.press("Control+\\");
  await expect(body).not.toHaveClass(/is-rail-closed/);
  await expect(body).not.toHaveClass(/is-side-closed/);
  expect(errors).toEqual([]);
});
