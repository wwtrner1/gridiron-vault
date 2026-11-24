import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { designerMenu, errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

/**
 * Griddy's coaching skills past drawing one play: a bulk edit narrowed to one
 * category, a defense laid out against the play on the field with every job
 * tagged, the gap tags on the open play (and Undo), a defense saved from the
 * Vault, "these plays" (the plays picked in the Vault) reaching him, and
 * Wes's block schemes and pressures on the open play (and Undo).
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.newplay.v1", JSON.stringify({ ask: false })));
});

type Reply = { text: string; actions: unknown[] };

/** Answers each Griddy message with the next reply, and keeps what the browser sent. */
async function griddyReplies(context: import("@playwright/test").BrowserContext, replies: Reply[]) {
  const sent: { context: { focus?: { ids: string[] } | null; play?: { name: string; defenders?: number } | null } }[] = [];
  await signIn(context, async (route, path) => {
    if (path !== "ai/griddy") return;
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ json: { reply: replies[Math.min(sent.length, replies.length) - 1] } });
    return true;
  });
  return sent;
}

async function askPanel(page: Page, text: string) {
  await page.locator(".gd-launch").click();
  const box = page.locator(".gd-panel textarea").first();
  await box.fill(text);
  await box.press("Enter");
}

async function askBar(page: Page, text: string) {
  const box = page.locator(".pa-bar").getByLabel("Message Griddy");
  await box.fill(text);
  await box.press("Enter");
}

test("A bulk edit for one category of play changes only those plays", async ({ page, context }) => {
  const errors = errorsOf(page);
  await griddyReplies(context, [
    { text: "Here you go.", actions: [{ id: "b1", tool: "bulk_edit", scope: { kind: "vault" }, filter: { playType: "run" }, changes: [{ op: "wristband", format: "bold" }] }] },
  ]);
  await seedReady(page);
  const before = (await workspace(page)).plays! as unknown as { id: string; playType: string; scene: { nodes: { kind: string; width?: number }[] } }[];
  const runs = before.filter((p) => p.playType === "run");
  expect(runs.length).toBeGreaterThan(0);
  expect(runs.length).toBeLessThan(before.length);
  await askPanel(page, "make all my run plays wristband bold");
  const card = page.locator(".gd-bulk");
  // Only the run plays are counted, not the whole Vault.
  await expect(card.getByRole("button", { name: new RegExp(`Apply to ${runs.length} play`) })).toBeVisible();
  await card.getByRole("button", { name: /Apply to/ }).click();
  await expect(page.locator(".toast", { hasText: `${runs.length} plays updated` })).toBeVisible();
  const after = (await workspace(page)).plays! as unknown as typeof before;
  const widest = (p: (typeof before)[number]) => Math.max(0, ...p.scene.nodes.filter((n) => n.kind === "path").map((n) => n.width ?? 0));
  for (const p of after) {
    const was = before.find((b) => b.id === p.id)!;
    if (p.playType === "run") expect(widest(p)).toBe(5.6);
    else expect(JSON.stringify(p.scene)).toBe(JSON.stringify(was.scene));
  }
  expect(errors).toEqual([]);
});

test("Griddy lines a defense up against the play on the field, tags the jobs, and tags the gaps on the open play", async ({ page, context }) => {
  const errors = errorsOf(page);
  const sent = await griddyReplies(context, [
    { text: "Cover 3 rotates to the trips side.", actions: [{ id: "d1", tool: "draw_defense", call: { name: "Cover 3 vs Trips", game: "5v5", coverage: "Cover 3", against: "Trips Right", jobs: true } }] },
    { text: "Here's a man look.", actions: [{ id: "d2", tool: "draw_defense", call: { name: "Man vs Trips", game: "5v5", coverage: "Man" } }] },
    { text: "Tagged.", actions: [{ id: "g1", tool: "bulk_edit", scope: { kind: "open" }, changes: [{ op: "gaps", replace: true }] }] },
  ]);
  await page.goto("/build");
  await page.locator(".pa-bar").getByLabel("Message Griddy").waitFor();

  // Against a named formation: the scout offense and the defense, every defender with a job.
  await askBar(page, "make me a Cover 3 defense for Trips Right with jobs");
  const first = page.locator(".gd-defense").first();
  await expect(first).toContainText("Cover 3 vs Trips vs Trips Right");
  await expect(first.getByLabel("Coverage")).toHaveValue("Cover 3");
  // 5-on-5 has no Cover 1 or Cover 4 to offer.
  await expect(first.getByLabel("Coverage").locator("option")).toHaveText(["Cover 2", "Cover 3", "Man (Cover 0)"]);
  await first.getByRole("button", { name: "Put it on the field" }).click();
  await expect(first).toContainText("You put Cover 3 vs Trips");
  const jobs = page.locator(".builder-stage text[data-job]");
  await expect(jobs).toHaveCount(5);
  await expect(page.locator(".builder-stage text[data-job='Deep 1/3']")).toHaveCount(3);

  // Against the play on the field: man lines to its receivers, and the bar told Griddy what's there.
  await askBar(page, "now a man look against this");
  const second = page.locator(".gd-defense").nth(1);
  await expect(second).toContainText("Man vs Trips vs");
  expect(sent[1].context.play?.defenders).toBe(5);
  await second.getByRole("button", { name: "Put it on the field" }).click();
  await expect(page.locator(".builder-stage text[data-job]")).toHaveCount(5);

  // The gaps on this play: the field changes, not the Vault, and Undo puts the tags back.
  await askBar(page, "tag the gaps on this play");
  const bulk = page.locator(".gd-bulk");
  await expect(bulk).toContainText("the play on the field");
  await bulk.getByRole("button", { name: "Apply to 1 play" }).click();
  await expect(page.locator(".toast", { hasText: "Save the play to keep it" })).toBeVisible();
  await expect(page.locator(".builder-stage text[data-job$=' gap']").first()).toBeVisible();
  const tagged = await page.locator(".builder-stage text[data-job$=' gap']").count();
  expect(tagged).toBeGreaterThan(0);
  await bulk.getByRole("button", { name: "Undo this change" }).click();
  await expect(page.locator(".builder-stage text[data-job$=' gap']")).toHaveCount(0);
  await expect(page.locator(".builder-stage text[data-job='Deep 1/3']")).toHaveCount(3);
  expect((await workspace(page)).plays ?? []).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("A defense saved from the Vault opens in the Designer, and the picked plays reach Griddy as these plays", async ({ page, context }) => {
  const errors = errorsOf(page);
  const sent = await griddyReplies(context, [
    { text: "", actions: [{ id: "d1", tool: "draw_defense", call: { name: "Cover 2 vs Trips Left", game: "5v5", coverage: "Cover 2", against: "Trips Right", mirrored: true } }] },
  ]);
  await seedReady(page);
  const picks = page.locator(".play-pick");
  const names = [(await picks.nth(0).getAttribute("aria-label"))!.replace(/^Select /, ""), (await picks.nth(1).getAttribute("aria-label"))!.replace(/^Select /, "")];
  await picks.nth(0).click();
  await picks.nth(1).click();
  await askPanel(page, "make a Cover 2 for Trips Left");
  await expect(page.locator(".gd-defense")).toBeVisible();
  // The two picked plays went along as "these plays", by their Vault ids.
  const ws = await workspace(page);
  const picked = ws.plays!.filter((p) => names.includes(p.name)).map((p) => p.id);
  expect(picked).toHaveLength(2);
  expect([...(sent[0].context.focus?.ids ?? [])].sort()).toEqual(picked.sort());

  const card = page.locator(".gd-defense");
  await expect(card).toContainText("vs Trips Left");
  await card.getByRole("button", { name: "Save and open it" }).click();
  await expect(page).toHaveURL(/\/build\/.+/);
  const saved = (await workspace(page)).plays!.find((p) => p.name === "Cover 2 vs Trips Left") as unknown as { playType: string; tags: string[]; scene: { nodes: { kind: string; side?: string }[] } };
  expect(saved.playType).toBe("defense");
  expect(saved.tags).toContain("scout");
  expect(saved.scene.nodes.filter((n) => n.kind === "player" && n.side === "defense")).toHaveLength(5);
  expect(saved.scene.nodes.filter((n) => n.kind === "player" && n.side === "offense").length).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

/** The lines on the field (a picked player's highlight is drawn a second time with no pointer events), as their path data. */
const fieldLines = (page: Page) =>
  page
    .locator(".stage-frame svg")
    .first()
    .locator("g[data-kind=path]:not([pointer-events=none])")
    .evaluateAll((els) => els.map((e) => e.querySelector("path")?.getAttribute("d") ?? "").sort());

/** The blank 11-man field, opened from New play setup (the file's default skips the setup, so this puts it back). */
async function openField(page: Page) {
  await page.context().addInitScript(() => {
    localStorage.removeItem("grid1ronvault.newplay.v1");
    localStorage.setItem("grid1ronvault.tips.v1", JSON.stringify({ off: true }));
  });
  await page.goto("/build");
  await page.getByRole("button", { name: "Open the field" }).click();
  await page.locator(".stage-frame svg").first().waitFor();
  await page.locator(".pa-bar").getByLabel("Message Griddy").waitFor();
}

const setEdit = (id: string, change: Record<string, unknown>) => ({ id, tool: "bulk_edit", scope: { kind: "open" }, changes: [{ op: "apply_set", ...change }] });

test("Griddy puts a block scheme and a pressure on the play on the field, each one Undo from gone, and says why when it can't", async ({ page, context }) => {
  const errors = errorsOf(page);
  await griddyReplies(context, [
    { text: "Boom it is.", actions: [setEdit("s1", { kind: "pressure", id: "boom" })] },
    { text: "Inside zone, to the right.", actions: [setEdit("s2", { kind: "scheme", id: "inside-zone", dir: "right" })] },
    { text: "Power, the other way.", actions: [setEdit("s3", { kind: "scheme", id: "power", dir: "left" })] },
    { text: "Boom on the 4-3.", actions: [setEdit("s4", { kind: "pressure", id: "boom", gold: "free" })] },
  ]);
  await openField(page);
  const bare = await fieldLines(page);
  expect(bare).toHaveLength(0);

  // No defense on the field: the card says so in the coach's words and offers nothing to apply.
  await askBar(page, "run Boom on this");
  const refused = page.locator(".gd-bulk").first();
  await expect(refused).toContainText("Boom pressure");
  await expect(refused).toContainText("There's no defense on the field");
  await expect(refused).toContainText("Ask me to draw a defense first");
  await expect(refused.getByRole("button", { name: /Apply/ })).toHaveCount(0);
  expect(await fieldLines(page)).toEqual(bare);

  // A block scheme on the offense: every blocker's block, its own lines, said in the coach's words.
  await askBar(page, "block this inside zone to the right");
  const zone = page.locator(".gd-bulk").nth(1);
  await expect(zone).toContainText("Inside zone to the right");
  await expect(zone).toContainText("T ");
  await zone.getByRole("button", { name: "Apply to 1 play" }).click();
  await expect(page.locator(".toast", { hasText: "Save the play to keep it" })).toBeVisible();
  const inside = await fieldLines(page);
  expect(inside.length).toBeGreaterThanOrEqual(5);
  await expect(zone).toContainText("Applied to 1 play");

  // A second scheme replaces the first one's lines; Undo brings the first one's back, exactly.
  await askBar(page, "now power to the left");
  const power = page.locator(".gd-bulk").nth(2);
  await expect(power).toContainText("Power to the left");
  await power.getByRole("button", { name: "Apply to 1 play" }).click();
  await expect(power).toContainText("Applied to 1 play");
  const powered = await fieldLines(page);
  expect(powered).not.toEqual(inside);
  await power.getByRole("button", { name: "Undo this change" }).click();
  await expect(power).toContainText("Undone");
  expect(await fieldLines(page)).toEqual(inside);
  await zone.getByRole("button", { name: "Undo this change" }).click();
  expect(await fieldLines(page)).toEqual(bare);

  // With a defense on the field the pressure draws; Undo leaves the defense as it was.
  await (await designerMenu(page, "edit")).getByRole("button", { name: "Turn this offense into a defense" }).click();
  await page.waitForTimeout(200);
  const lined = await fieldLines(page);
  await askBar(page, "run Boom, gold free");
  const boom = page.locator(".gd-bulk").nth(3);
  await expect(boom).toContainText("Boom pressure, rover is free");
  await expect(boom).toContainText("rush");
  await boom.getByRole("button", { name: "Apply to 1 play" }).click();
  await expect(boom).toContainText("Applied to 1 play");
  expect(await fieldLines(page)).not.toEqual(lined);
  await expect(page.locator(".builder-stage text[data-job]").first()).toBeVisible();
  await boom.getByRole("button", { name: "Undo this change" }).click();
  await expect(boom).toContainText("Undone");
  expect(await fieldLines(page)).toEqual(lined);
  expect(errors).toEqual([]);
});

test("A defense Griddy calls with a pressure draws the rushers, and the card lets the coach change or drop the pressure", async ({ page, context }) => {
  const errors = errorsOf(page);
  await griddyReplies(context, [
    { text: "Here's Boom out of a 4-2-5.", actions: [{ id: "d1", tool: "draw_defense", call: { name: "4-2-5 Cover 1 Boom", game: "11", front: "4-2-5", coverage: "Cover 1", pressure: "boom" } }] },
  ]);
  await openField(page);
  await askBar(page, "draw a 4-2-5 with Boom against this play");
  const card = page.locator(".gd-defense");
  await expect(card.getByLabel("Pressure")).toHaveValue("boom");
  await expect(card.getByLabel("Front")).toHaveValue("4-2-5");
  await expect(card).toContainText("Boom:");
  await expect(card).toContainText("rush");
  await expect(card.getByLabel("Rover's Gold job")).toBeVisible();

  // The same call with the pressure taken off has no rushers to name.
  await card.getByLabel("Pressure").selectOption("");
  await expect(card).not.toContainText("Boom:");
  await expect(card.getByLabel("Rover's Gold job")).toHaveCount(0);
  await card.getByLabel("Pressure").selectOption("sob");
  await expect(card).toContainText("SOB:");

  await card.getByRole("button", { name: "Put it on the field" }).click();
  await expect(card).toContainText("You put 4-2-5 Cover 1 Boom");
  await expect(card).toContainText("SOB:");
  await expect(page.locator(".builder-stage text[data-job]").first()).toBeVisible();
  expect(errors).toEqual([]);
});
