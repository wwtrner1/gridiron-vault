import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, workspace } from "./helpers";

/**
 * Film Room: a play opens as a six-step lesson (the look, zones, the call,
 * snap, the read, your job) in the dark look, each step with its caption and
 * card; Play the lesson runs through the steps and moves the players; the
 * read shows the Coverage check's table; Your job spotlights one letter; the
 * look (Dark, Light, Match my device), the defense and the team switch are
 * saved in the play; Run play hands off to it; Escape closes it.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("Film Room teaches a play step by step and keeps its settings in the play", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();

  // From Extras.
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  const room = page.getByRole("dialog", { name: /Film Room/ });
  await expect(room.locator("h2")).toHaveText("Film Room 17 · Stick");
  await expect(room).toHaveAttribute("data-theme", "dark");
  const steps = room.locator(".fr-steps button");
  await expect(steps).toHaveText(["1The look", "2Zones", "3The call", "4Snap", "5The read", "6Your job"]);
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
  const caption = room.locator(".fr-cap p");
  const clock = room.locator(".fr-clock");
  await expect(caption).toContainText("17 · Stick. Line up and find the defense:");
  await expect(clock).toHaveText("0.0 S");
  await expect(room.getByRole("button", { name: "Back a step" })).toBeDisabled();

  // Hide the steps gives the field the whole width; Show the steps brings the panel back.
  const wide = (await room.locator(".fr-field").boundingBox())!.width;
  await room.getByRole("button", { name: "Hide the steps" }).click();
  await expect(room.getByLabel("Lesson steps")).toBeHidden();
  await expect(room.getByRole("button", { name: "Show the steps" })).toHaveAttribute("aria-expanded", "false");
  expect((await room.locator(".fr-field").boundingBox())!.width).toBeGreaterThan(wide);
  await room.getByRole("button", { name: "Show the steps" }).click();
  await expect(room.getByLabel("Lesson steps")).toBeVisible();

  // Zones: every defender's job, and the zone names on the field.
  await room.getByRole("button", { name: "Next step" }).click();
  await expect(caption).toContainText("Count the defense:");
  await expect(room.locator(".fr-rows li").first()).toBeVisible();
  await expect(room.locator(".fr-zone-tag").first()).toBeVisible();

  // The call: the receivers in read order.
  await steps.nth(2).click();
  await expect(caption).toContainText("The call:");
  await expect(room.locator(".fr-rows span").first()).toHaveText("Read 1");

  // The read: the Coverage check's table, and the teaching-model note.
  await steps.nth(4).click();
  await expect(room.getByRole("columnheader")).toHaveText(["Read", "Player", "Route", "Space", "Status"]);
  await expect(room.locator(".fr-pill").first()).toHaveText(/open|tight|covered/);
  await expect(room.locator(".fr-foot")).toContainText("teaching model");
  expect(Number((await clock.textContent())!.split(" ")[0])).toBeGreaterThan(1);

  // Your job: pick a letter and the caption talks to that player.
  await steps.nth(5).click();
  const letters = room.getByRole("group", { name: "Show the job for" }).getByRole("button");
  await expect(letters.first()).toHaveAttribute("aria-pressed", "true");
  await letters.nth(1).click();
  await expect(letters.nth(1)).toHaveAttribute("aria-pressed", "true");
  const letter = (await letters.nth(1).textContent())!;
  await expect(caption).toContainText(`${letter}, you`);

  // Play the lesson from the snap step: the clock runs and the players move, Pause holds it.
  await steps.nth(3).click();
  const firstPlayer = room.locator("[data-kind=player]").first();
  const start = await firstPlayer.getAttribute("transform");
  await room.getByRole("button", { name: "Play the lesson" }).click();
  await expect.poll(async () => Number((await clock.textContent())!.split(" ")[0]), { timeout: 8000 }).toBeGreaterThan(0.4);
  expect(await firstPlayer.getAttribute("transform")).not.toBe(start);
  await room.getByRole("button", { name: "Pause" }).click();
  const held = await clock.textContent();
  await page.waitForTimeout(300);
  await expect(clock).toHaveText(held!);

  // The dark look passes axe.
  const darkAxe = await new AxeBuilder({ page }).include(".fr").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(darkAxe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  // Light, and another defense: the lesson starts over against it.
  await room.getByRole("group", { name: "Look" }).getByRole("button", { name: "Light" }).click();
  await expect(room).toHaveAttribute("data-theme", "light");
  const lightAxe = await new AxeBuilder({ page }).include(".fr").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(lightAxe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  const against = room.getByRole("combobox", { name: "Against" });
  const now = await against.inputValue();
  const options = await against.locator("option").evaluateAll((os) => os.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent })));
  const next = options.find((o) => o.value !== now)!;
  const other = next.text;
  await against.selectOption(next.value);
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
  await expect(room.locator(".fr-vs")).toHaveText(`vs ${other}`);
  await expect(room.getByRole("link", { name: "Add your team colors on My team" })).toBeVisible();

  // Escape goes back to drawing; Save keeps the lesson's settings in the play.
  await page.keyboard.press("Escape");
  await expect(room).toBeHidden();
  await page.locator('[data-tour="dz-save"]').click();
  await expect
    .poll(async () => {
      const ws = await workspace(page);
      return (ws.plays!.find((p) => p.name === "17 · Stick")?.scene as { teach?: unknown } | undefined)?.teach;
    })
    .toMatchObject({ look: "light", against: expect.any(String) });
  // The look a coach picks becomes the usual one, kept with the team brand (which syncs to the account): another play opens light.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1")!).filmLook)).toBe("light");

  // Opened again it is still light; Run play hands off to it too.
  await page.locator('[data-tour="dz-run"]').first().click();
  await page.getByRole("dialog", { name: /Run play/ }).getByRole("button", { name: "Teach it in the Film Room" }).click();
  await expect(room).toHaveAttribute("data-theme", "light");
  await room.getByRole("button", { name: "Back to drawing" }).click();
  await expect(room).toBeHidden();
  await page.getByRole("button", { name: /^Next play: / }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  await expect(room).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});

test("Film Room wears the team's colors and logo, with a switch per play", async ({ page }) => {
  await seedReady(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "grid1ronvault.brand.v1",
      JSON.stringify({ name: "Hawks", logo: null, primary: "#7A1420", secondary: "#F2C14E", logoOnField: true, endZones: true, prints: true, updatedAt: new Date().toISOString() }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  const room = page.getByRole("dialog", { name: /Film Room/ });
  await expect(room.locator(".fr-team")).toHaveText("Hawks");
  await expect(room.locator(".fr-cap")).toHaveCSS("border-left-color", "rgb(122, 20, 32)");
  const team = room.getByLabel("Team colors and logo");
  await expect(team).toBeChecked();
  await team.uncheck();
  await expect(room.locator(".fr-team")).toHaveCount(0);
  await expect(room.locator(".fr-cap")).not.toHaveCSS("border-left-color", "rgb(122, 20, 32)");
});

test("Make a video saves the lesson as an MP4 in both shapes, and Sideline sees the plan instead", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = errorsOf(page);
  await seedReady(page);
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  const room = page.getByRole("dialog", { name: /Film Room/ });

  // The dialog: two shapes, wide first, and the promise that nothing is uploaded.
  await room.getByRole("button", { name: "Make a video" }).click();
  const box = page.getByRole("dialog", { name: "Make a video of this lesson" });
  await expect(box).toContainText("Nothing is uploaded.");
  await expect(box.getByRole("radio", { name: /Wide \(16:9\)/ })).toBeChecked();
  expect((await new AxeBuilder({ page }).include(".modal").analyze()).violations).toEqual([]);

  const make = async (tag: string, width: number, height: number) => {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 150_000 }), box.getByRole("button", { name: /^Make (the video|it again)$/ }).click()]);
    expect(download.suggestedFilename()).toBe(`17-stick-film-room-${tag}.mp4`);
    await expect(box.getByRole("status")).toContainText(`Saved 17-stick-film-room-${tag}.mp4`);
    const path = await download.path();
    const bytes = (await import("node:fs")).readFileSync(path);
    expect(bytes.length).toBeGreaterThan(40_000);
    // An MP4: the file type box up front, and the picture's size in its track header.
    expect(bytes.subarray(4, 8).toString("latin1")).toBe("ftyp");
    const tkhd = bytes.indexOf("tkhd", 0, "latin1");
    expect(tkhd).toBeGreaterThan(0);
    const size = bytes.indexOf(Buffer.from([width >> 8, width & 255, 0, 0, height >> 8, height & 255, 0, 0]), tkhd);
    expect(size).toBeGreaterThan(tkhd);
    expect(size - tkhd).toBeLessThan(120);
    return path;
  };
  const wide = await make("16x9", 1280, 720);
  if (process.env.FR_KEEP) (await import("node:fs")).copyFileSync(wide, `${process.env.FR_KEEP}/wide.mp4`);
  await box.getByRole("radio", { name: /Tall \(9:16\)/ }).check();
  const tall = await make("9x16", 720, 1280);
  if (process.env.FR_KEEP) (await import("node:fs")).copyFileSync(tall, `${process.env.FR_KEEP}/tall.mp4`);
  await expect(box.getByRole("link", { name: "Download it again" })).toHaveAttribute("download", "17-stick-film-room-9x16.mp4");
  await box.getByRole("button", { name: "Close Make a video of this lesson" }).click();
  await expect(box).toBeHidden();
  await expect(room).toBeVisible();

  // Sideline: the lesson still plays, the file comes with a plan.
  await page.evaluate(() => localStorage.setItem("nextplay.tier.v1", "free"));
  await page.reload();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  await room.getByRole("button", { name: "Make a video" }).click();
  await expect(box).toContainText("A video file of the lesson comes with Head Coach.");
  await expect(box.getByRole("button", { name: "Make the video" })).toHaveCount(0);
  await expect(box.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/pricing");

  expect(errors).toEqual([]);
});

test("Film Room tips show once, ring each control, and come back from the Tips button", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // A coach who has never opened the Film Room.
  await page.evaluate(() => localStorage.removeItem("grid1ronvault.filmtips.v1"));
  await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  const room = page.getByRole("dialog", { name: /Film Room/ });
  const tips = room.getByRole("group", { name: "Film Room tips" });

  // They open by themselves the first time, on the step list, with a ring on it.
  await expect(tips).toBeVisible();
  await expect(tips.locator(".fr-tip-k")).toHaveText("Tip 1 of 11");
  await expect(tips.locator("h3")).toHaveText("Six steps, one lesson");
  await expect(room.locator(".fr-tip-ring")).toBeVisible();
  await expect(tips.getByRole("button", { name: "Back" })).toBeDisabled();
  await expect(tips.getByRole("button", { name: "Next tip" })).toBeFocused();
  const ring = (await room.locator(".fr-tip-ring").boundingBox())!;
  const list = (await room.locator(".fr-steps").boundingBox())!;
  expect(Math.abs(ring.x + 5 - list.x)).toBeLessThan(3);
  expect((await new AxeBuilder({ page }).include(".fr").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);

  // The lesson still works under a tip: nothing covers it.
  await room.getByRole("button", { name: "Next step" }).click();
  await expect(room.locator(".fr-steps button").nth(1)).toHaveAttribute("aria-current", "step");

  // Next and Back walk the controls; a play with no voice skips the Voice switch's tip.
  await tips.getByRole("button", { name: "Next tip" }).click();
  await expect(tips.locator("h3")).toHaveText("The field");
  await tips.getByRole("button", { name: "Back" }).click();
  await expect(tips.locator("h3")).toHaveText("Six steps, one lesson");
  const seen: string[] = [];
  for (let k = 0; k < 10; k++) {
    await tips.getByRole("button", { name: "Next tip" }).click();
    seen.push((await tips.locator("h3").textContent())!);
  }
  expect(seen).toEqual(["The field", "One caption a step", "Run the lesson", "Pick the defense", "Add the voice", "Make a video", "More room for the field", "Flat or 3D", "Dark or light", "Tips, any time"]);
  await expect(tips.locator(".fr-tip-k")).toHaveText("Tip 11 of 11");
  await expect(tips.getByRole("button", { name: "Done" })).toBeVisible();

  // Escape puts the tips away and leaves the lesson open; they are remembered with the team brand for the account.
  await page.keyboard.press("Escape");
  await expect(tips).toHaveCount(0);
  await expect(room).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("grid1ronvault.filmtips.v1"))).toBe("seen");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1")!).filmTips)).toBe(false);

  // The Tips button brings them back, and Skip the tips puts them away.
  const button = room.getByRole("button", { name: "Tips", exact: true });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(tips.locator("h3")).toHaveText("Six steps, one lesson");
  await tips.getByRole("button", { name: "Skip the tips" }).click();
  await expect(tips).toHaveCount(0);

  // The next time the Film Room opens, they stay away.
  await page.keyboard.press("Escape");
  await expect(room).toHaveCount(0);
  await page.getByRole("button", { name: /^Extras/ }).click();
  await page.getByRole("button", { name: "Film Room: teach this play" }).click();
  await expect(room).toBeVisible();
  await expect(tips).toHaveCount(0);
  expect(errors).toEqual([]);
});
