import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { errorsOf, quiet } from "./helpers";

/**
 * The home page below the hero (2026-11-22 refresh): Featured tools (a tool list, its poster, blurb and the steps of its
 * clip as slides), the Film Room's twelve cameras, the every-tool grid with a picture of each screen, and the video
 * pop-out all of them open (Escape, focus back on the button that opened it, Back a step / Next step, Open the tool).
 *
 * The test browser can't decode H.264, so none of this plays a clip: it checks the pages, the files they name (the
 * clips, posters, step stills and screen pictures all have to exist) and what the pop-out's controls do to the list.
 */
test.beforeEach(async ({ context }) => quiet(context));

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test("featured tools: the list works by keyboard, a slide opens the video pop-out on its step, and every file it names exists", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  const featured = page.locator("#featured");
  await featured.scrollIntoViewIfNeeded();
  await expect(featured.getByRole("heading", { level: 2, name: "See every tool at work" })).toBeVisible();

  // One tab per tool with a clip, grouped Draw, Teach, Plan and print, Team and AI; the Designer first.
  const tabs = featured.getByRole("tablist", { name: "Featured tools" }).getByRole("tab");
  const count = await tabs.count();
  expect(count).toBeGreaterThanOrEqual(10);
  await expect(tabs.first()).toContainText("The Play Designer");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(tabs.first()).toHaveAttribute("tabindex", "0");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");

  // Arrow keys, Home and End move the pick and the focus (the list is one tab stop).
  await tabs.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  const panel = featured.getByRole("tabpanel");
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText((await tabs.nth(1).locator(".ft-tab-name").textContent())!);
  await page.keyboard.press("End");
  await expect(tabs.last()).toBeFocused();
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");

  // The Designer's stage: the blurb, the two buttons, and its steps as slides.
  await expect(panel.getByRole("heading", { level: 3, name: "The Play Designer" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Open the Designer" })).toHaveAttribute("href", "/build");
  const watch = panel.getByRole("button", { name: /^Watch the video · \d:\d\d$/ });
  await expect(watch).toBeVisible();
  const slides = panel.getByRole("list", { name: "The steps in The Play Designer" }).getByRole("button");
  const steps = await slides.count();
  expect(steps).toBeGreaterThanOrEqual(5);

  // Every file the stage names is a real file: the clip's poster and mp4, and the still under each step.
  const files = await panel.evaluate((el) => [...el.querySelectorAll("img")].map((i) => i.getAttribute("src")!));
  expect(files.length).toBe(steps + 1);
  for (const f of files) expect((await page.request.get(f)).status(), f).toBe(200);
  const clipSrc = await panel.locator(".ft-poster img").getAttribute("src");
  expect((await page.request.get(clipSrc!.replace(/\.jpg$/, ".mp4"), { headers: { Range: "bytes=0-1" } })).status()).toBeLessThan(300);

  // A slide opens the pop-out on that step; the step list marks it, and Back a step / Next step move it.
  await slides.nth(2).click();
  const pop = page.getByRole("dialog");
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("heading", { level: 2 })).toHaveText("The Play Designer");
  const list = pop.getByRole("list", { name: "Steps. Press one to jump to it." }).getByRole("button");
  await expect(list).toHaveCount(steps);
  await expect(list.nth(2)).toHaveAttribute("aria-current", "step");
  await pop.getByRole("button", { name: "Next step" }).click();
  await expect(list.nth(3)).toHaveAttribute("aria-current", "step");
  await pop.getByRole("button", { name: "Back a step" }).click();
  await pop.getByRole("button", { name: "Back a step" }).click();
  await expect(list.nth(1)).toHaveAttribute("aria-current", "step");
  await list.nth(0).click();
  await expect(pop.getByRole("button", { name: "Back a step" })).toBeDisabled();
  await list.last().click();
  await expect(pop.getByRole("button", { name: "Next step" })).toBeDisabled();
  await expect(pop.getByRole("link", { name: "Open the Designer" })).toHaveAttribute("href", "/build");
  // The page behind holds still, and Escape puts the pop-out away with focus back on the slide.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  await expect(slides.nth(2)).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

  // The Watch button opens it on the first step; its close button works too.
  await watch.click();
  await expect(pop.getByRole("list", { name: "Steps. Press one to jump to it." }).getByRole("button").first()).toHaveAttribute("aria-current", "step");
  await pop.getByRole("button", { name: /^Close / }).click();
  await expect(pop).toHaveCount(0);
  await expect(watch).toBeFocused();

  // Open the tool goes to the tool and puts the pop-out away.
  await watch.click();
  await pop.getByRole("link", { name: "Open the Designer" }).click();
  await expect(page).toHaveURL(/\/build/);
  expect(errors).toEqual([]);
});

test("the Film Room's twelve cameras: a picture and a line for each, by click or arrow key, and Watch opens the camera clip", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  const cameras = page.locator("#cameras");
  await cameras.scrollIntoViewIfNeeded();
  await expect(cameras.getByRole("heading", { level: 2, name: "Twelve cameras for every play" })).toBeVisible();
  const chips = cameras.getByRole("tablist", { name: "Film Room cameras" }).getByRole("tab");
  await expect(chips).toHaveCount(12);
  await expect(chips).toHaveText(["Follow the lesson", "Behind the offense", "Wide", "All 22", "QB cam", "Follow a player", "Player's eyes", "Sideline", "Coach cam", "Overhead", "A camera for each moment", "Free look"]);

  // It opens on the QB cam, the one coaches ask about first.
  await expect(chips.nth(4)).toHaveAttribute("aria-selected", "true");
  const stage = cameras.getByRole("tabpanel");
  await expect(stage.getByRole("heading", { level: 3 })).toHaveText("QB cam");
  await expect(stage.getByRole("img", { name: "The Film Room in 3D, seen through the QB cam camera" })).toBeVisible();

  // Every camera has its own picture file.
  for (const id of ["auto", "behind", "wide", "all22", "qb", "zoom", "eyes", "sideline", "coach", "overhead", "modular", "free"]) {
    const res = await page.request.get(`/shots/cameras/${id}.webp`);
    expect(res.status(), id).toBe(200);
    expect(res.headers()["content-type"], id).toContain("image/webp");
  }

  await chips.nth(7).click();
  await expect(stage.getByRole("heading", { level: 3 })).toHaveText("Sideline");
  await expect(stage.getByRole("img")).toHaveAttribute("src", "/shots/cameras/sideline.webp");
  await chips.nth(7).focus();
  await page.keyboard.press("ArrowRight");
  await expect(chips.nth(8)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(stage.getByRole("heading", { level: 3 })).toHaveText("Follow the lesson");

  // Watch the cameras opens the clip's pop-out, and Escape returns to the button.
  const watch = stage.getByRole("button", { name: /^Watch the cameras · / });
  await watch.click();
  const pop = page.getByRole("dialog");
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("link", { name: "Watch a concept" })).toHaveAttribute("href", "/concepts");
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  await expect(watch).toBeFocused();
  expect(errors).toEqual([]);
});

test("every tool, one click away: the side menu's groups with a picture of each screen and a Watch button where there is a clip", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  const grid = page.locator("#everything");
  await grid.scrollIntoViewIfNeeded();
  await expect(grid.getByRole("heading", { level: 2, name: "Every tool, one click away" })).toBeVisible();
  await expect(grid.getByRole("heading", { level: 3 })).toHaveText([/^Plays/, /^Game plan/, /^Practice/, /^Team/, /^Tools/]);

  // Each card links to its screen; every picture it shows is a real file.
  const cards = grid.locator(".ta-card");
  expect(await cards.count()).toBeGreaterThanOrEqual(15);
  const pictures = await grid.locator("img.ta-shot").evaluateAll((els) => els.map((e) => e.getAttribute("src")!));
  expect(pictures.length).toBeGreaterThanOrEqual(15);
  for (const src of pictures) {
    const res = await page.request.get(src);
    expect(res.status(), src).toBe(200);
    expect(res.headers()["content-type"], src).toContain("image/webp");
  }
  // A tool with no picture (the Front Office, which needs a sign-in to show anything) gets an icon tile, not a broken box.
  await expect(grid.locator('a.ta-card[href="/front-office"]').locator(".ta-shot-icon")).toHaveCount(1);
  await expect(grid.locator('a.ta-card[href="/wristbands"]')).toHaveAttribute("href", "/wristbands");

  // The Watch chips sit beside their cards (not inside the link) and open the pop-out; Escape puts focus back.
  const chips = grid.getByRole("button", { name: /^Watch the .* video$/ });
  expect(await chips.count()).toBeGreaterThanOrEqual(8);
  const designer = grid.getByRole("button", { name: "Watch the Designer video" });
  await designer.click();
  const pop = page.getByRole("dialog");
  await expect(pop.getByRole("heading", { level: 2 })).toHaveText("The Play Designer");
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  await expect(designer).toBeFocused();
  expect(errors).toEqual([]);
});

test("the new sections and the open video pop-out pass axe's WCAG A and AA rules", async ({ page }) => {
  await page.goto("/");
  const sweep = async (label: string) => {
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(res.violations.map((v) => `${label} [${v.impact}] ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), label).toEqual([]);
  };
  // Every tool in the list takes its turn at being the picked one (the picked tab sits on a tinted background).
  const tabs = page.locator("#featured").getByRole("tablist", { name: "Featured tools" }).getByRole("tab");
  await tabs.first().scrollIntoViewIfNeeded();
  await sweep("featured tools, first tool picked");
  await tabs.nth(5).click();
  await sweep("featured tools, a later tool picked");
  const chips = page.locator("#cameras").getByRole("tablist", { name: "Film Room cameras" }).getByRole("tab");
  await chips.nth(7).click();
  await sweep("cameras, the sideline picked");
  await page.locator("#everything").scrollIntoViewIfNeeded();
  await sweep("every-tool grid");
  // The pop-out, open on a step.
  await page.locator("#featured .ft-steps button").nth(1).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await sweep("the video pop-out");
});

test("the hero's tour link and the reel's list take the visitor to the reel and seek its video", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Watch the 20-second tour" }).click();
  await expect(page).toHaveURL(/\/#reel$/);
  const reel = page.locator("#reel");
  await expect(reel).toBeInViewport();
  const parts = reel.locator(".home-reel-list li button");
  await expect(parts).toHaveCount(7);
  await expect(parts.nth(1)).toContainText("Teach it in the Film Room, even in 3D");
  // A part of the list seeks the reel there (the seconds are in the page's list); the player's own clock follows.
  await parts.nth(3).click();
  await expect.poll(() => reel.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 8000 }).toBeGreaterThan(8);
});

test("the new home page sections fit a phone: no sideways scroll, the pop-out inside the screen @phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "needs the phone project");
  const errors = errorsOf(page);
  await page.goto("/");
  for (const id of ["featured", "cameras", "everything"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id}`)).toBeVisible();
    expect(await sideways(page), `${id} pushes the page sideways`).toBeLessThanOrEqual(0);
  }
  const width = page.viewportSize()!.width;
  // The slides are a column of steps; one opens the pop-out, which stays inside the screen and keeps its close button in reach.
  await page.locator("#featured .ft-steps button").first().scrollIntoViewIfNeeded();
  await page.locator("#featured .ft-steps button").first().click();
  const pop = page.getByRole("dialog");
  await expect(pop).toBeVisible();
  const box = (await pop.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  const close = (await pop.getByRole("button", { name: /^Close / }).boundingBox())!;
  expect(close.y).toBeGreaterThanOrEqual(0);
  expect(close.x + close.width).toBeLessThanOrEqual(width);
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  expect(errors).toEqual([]);
});
