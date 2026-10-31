import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * The tag on a line: a Coverage zone drawn on the field shows "Zone tag" in
 * the Selection panel, the text typed lands in the middle of the zone and in
 * the saved play, emptying the box takes it away; a route drawn next shows
 * "Route tag" with its own examples. The box stops at the tag limit.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true, shown: {} })));
});

type Path = { kind: string; closed?: boolean; tag?: string };

test("a Coverage zone takes a zone tag and a route takes a route tag", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const id = await page.evaluate(() => {
    const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1")!);
    return ws.plays.find((p: { name: string }) => /Stick/.test(p.name)).id as string;
  });
  await page.goto(`/build/${id}`);
  const svg = page.locator(".stage-frame svg").first();
  await svg.waitFor();
  await page.waitForTimeout(300);
  const box = (await svg.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const save = page.locator('[data-tour="dz-save"]');
  const paths = async () => (await workspace(page)).plays!.find((p) => p.id === id)!.scene.nodes.filter((n) => (n as unknown as Path).kind === "path") as unknown as Path[];
  const saved = async () => {
    await save.click();
    await expect(save).toContainText("Saved");
  };
  const first = (await paths()).length;

  // A zone: four clicks and Enter; it stays picked, so the panel offers its tag.
  await page.getByRole("tab", { name: "Draw" }).click();
  await page.getByRole("button", { name: "Coverage zone" }).first().click();
  for (const [fx, fy] of [[0.7, 0.55], [0.9, 0.55], [0.9, 0.7], [0.7, 0.7]]) await page.mouse.click(at(fx, fy).x, at(fx, fy).y);
  await page.keyboard.press("Enter");
  const tag = page.getByLabel("Zone tag");
  await expect(tag).toBeVisible();
  await expect(tag).toHaveAttribute("placeholder", "Hook, Deep 1/3, Flat");
  await tag.fill("Hook zone");
  await expect(svg.locator("text", { hasText: "Hook zone" })).toHaveCount(1);
  await saved();
  expect((await paths()).slice(first)[0]).toMatchObject({ closed: true, tag: "Hook zone" });

  // The box stops at the limit, and emptying it takes the tag off the field and the saved play.
  const limit = Number(await tag.getAttribute("maxlength"));
  expect(limit).toBeGreaterThan(3);
  await tag.fill("x".repeat(limit + 10));
  await expect(tag).toHaveValue("x".repeat(limit));
  await tag.fill("");
  await expect(svg.locator("text", { hasText: "Hook zone" })).toHaveCount(0);
  await saved();
  expect((await paths()).slice(first)[0].tag).toBeUndefined();

  // A route drawn next is a Route tag, with its own example words.
  await page.getByRole("tab", { name: "Draw" }).click();
  await page.getByRole("button", { name: "Solid line with arrow" }).first().click();
  for (const [fx, fy] of [[0.3, 0.8], [0.4, 0.7]]) await page.mouse.click(at(fx, fy).x, at(fx, fy).y);
  await page.keyboard.press("Enter");
  const route = page.getByLabel("Route tag");
  await expect(route).toHaveAttribute("placeholder", /Post, 12 yds/);
  await route.fill("Option");
  await saved();
  expect((await paths()).slice(first).map((p) => [!!p.closed, p.tag])).toEqual([[true, undefined], [false, "Option"]]);
  expect(errors).toEqual([]);
});
