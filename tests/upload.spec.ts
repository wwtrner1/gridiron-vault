import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Route } from "@playwright/test";
import { errorsOf, quiet, signIn, workspace } from "./helpers";

/**
 * Upload plays: the page's own refusals, a whiteboard photo read through the
 * mocked Play reader (`/api/ai/scan` finds the plays, `/api/ai/photo` reads
 * each one), a scanned page with several plays (keep, read, check and fix,
 * rename, file in a new playbook), a read refused by the account, and the
 * signed-out wording. Nothing real is read: the image is the app's own icon.
 */
test.beforeEach(async ({ context }) => quiet(context));

const png = readFileSync("public/icon-512.png");
const image = (name: string) => ({ name, mimeType: "image/png", buffer: png });

const signedIn = (page: import("@playwright/test").Page) => page.locator("strong", { hasText: /^Coach$/ }).first().waitFor();

type Box = { x: number; y: number; w: number; h: number; title: string; notes?: string };
const read = (name: string, question = true) => ({
  isPlay: true,
  name,
  formation: "Trips Right",
  game: "5v5",
  losY: 0.55,
  offenseAt: "bottom",
  players: [
    { board: "Q", vault: "Q", side: "offense", x: 0.5, y: 0.72 },
    { board: "C", vault: "C", side: "offense", x: 0.5, y: 0.58 },
    { board: "X", vault: "X", side: "offense", x: 0.15, y: 0.6 },
    { board: "Y", vault: "Y", side: "offense", x: 0.7, y: 0.6 },
    { board: "R", vault: "H", side: "offense", x: 0.82, y: 0.6 },
    { board: "X", vault: "X", side: "defense", x: 0.5, y: 0.4 },
  ],
  assignments: [
    { player: "X", kind: "route", action: "go", heard: "", path: [{ x: 0.15, y: 0.6 }, { x: 0.15, y: 0.2 }] },
    { player: "Y", kind: "route", action: "corner", breaks: "right", heard: "", path: [{ x: 0.7, y: 0.6 }, { x: 0.7, y: 0.4 }, { x: 0.9, y: 0.25 }] },
    { player: "H", kind: "route", action: "flat", breaks: "right", heard: "", path: [{ x: 0.82, y: 0.6 }, { x: 0.95, y: 0.52 }] },
  ],
  questions: question ? [{ player: "Y", question: "Y route: corner or post? The line bends at about 8 yards.", options: ["corner", "post"] }] : [],
});

const json = (route: Route) => JSON.parse(route.request().postData() ?? "{}") as { image?: string; game?: string; terms?: unknown[] };

test("the page refuses files it can't read, in coach words", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Bring plays in from anywhere" })).toBeVisible();
  const input = page.locator("input[type=file]");
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert")).toHaveText("notes.txt isn’t a file GridIronVault can read. Use JPG, PNG, HEIC, PDF or PPTX.");
  await input.setInputFiles({ name: "old-deck.ppt", mimeType: "application/vnd.ms-powerpoint", buffer: Buffer.from("x") });
  await expect(page.getByRole("alert")).toContainText("older .ppt file");
  await input.setInputFiles([
    { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("a") },
    { name: "b.txt", mimeType: "text/plain", buffer: Buffer.from("b") },
  ]);
  await expect(page.getByRole("alert")).toContainText("Those files can't be read here.");
  expect(errors).toEqual([]);
});

test("signed out, a photo opens for review but the reader asks for a sign-in", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/upload");
  await page.locator("input[type=file]").setInputFiles(image("board.png"));
  await expect(page.getByRole("heading", { name: "Your photo" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Sign in to have GridIronVault read your photo. It is included with every plan.");
  await expect(page.getByRole("img", { name: "Photo: board.png" })).toBeVisible();
  await page.getByRole("button", { name: "Upload more" }).click();
  await expect(page.getByRole("heading", { name: "Bring plays in from anywhere" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a whiteboard photo is read, checked, and saved to the Vault", async ({ page, context }) => {
  const errors = errorsOf(page);
  const scans: { image: string }[] = [];
  const photos: { game?: string; terms?: unknown[] }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "ai/scan" && method === "POST") {
      scans.push({ image: json(route).image ?? "" });
      return (await route.fulfill({ json: { plays: [{ x: 0.05, y: 0.05, w: 0.9, h: 0.9, title: "" }] } }), true);
    }
    if (path === "ai/photo" && method === "POST") {
      const body = json(route);
      photos.push({ game: body.game, terms: body.terms });
      return (await route.fulfill({ json: { read: read("Trips Right Flood") } }), true);
    }
  });
  await page.goto("/upload");
  await signedIn(page);
  await page.locator("input[type=file]").setInputFiles(image("board.png"));

  await expect(page.getByRole("heading", { name: "Is this the play on your board?" })).toBeVisible();
  expect(scans).toHaveLength(1);
  expect(scans[0].image.length).toBeGreaterThan(1000);
  expect(photos).toEqual([{ game: "5v5", terms: expect.any(Array) }]);
  await expect(page.getByText("Draft · not saved ·")).toContainText("board.png");

  // What was found: every offensive player with his route, the board's R drawn as H.
  const chips = page.locator(".pr-chips .chip");
  await expect(chips).toHaveText(["Q · quarterback", "C · center", "X · go", "Y · corner", "H · flat"]);
  await expect(page.locator(".pr-note").first()).toHaveText("Your board used R for the player your Vault calls H. They're drawn with your Vault letters.");

  // The one question, answered.
  const check = page.getByRole("group", { name: "Y route: corner or post? The line bends at about 8 yards." });
  await expect(check).toBeVisible();
  await check.getByRole("button", { name: "Post" }).click();
  await expect(check).toBeHidden();
  await expect(chips.nth(3)).toHaveText("Y · post");

  // The formation is in the library, so the Vault format is on; the photo's layout is one click away.
  const vault = page.getByRole("radio", { name: /Use my Vault format/ });
  const photo = page.getByRole("radio", { name: /Keep the photo's layout/ });
  await expect(vault).toBeChecked();
  await expect(page.getByText("The Formation library's Trips Right spacing")).toBeVisible();
  await photo.check();
  await expect(photo).toBeChecked();
  await vault.check();

  await page.getByRole("button", { name: "Save to Vault" }).click();
  await expect(page.getByText("Trips Right Flood saved to your Vault.")).toBeVisible();
  await expect(page).toHaveURL(/\/vault/);
  const ws = await workspace(page);
  const play = (ws.plays ?? []).find((p) => p.name === "Trips Right Flood") as unknown as { tags: string[]; formation: string; description: string; scene: { nodes: { label?: string }[] } };
  expect(play).toBeTruthy();
  // Every question answered on the review, so it saves already checked.
  expect(play.tags).toEqual(["imported", "whiteboard", "checked"]);
  expect(play.formation).toBe("Trips Right");
  expect(play.description).toBe("Read from board.png.");
  expect(play.scene.nodes.filter((n) => n.label === "Q" || n.label === "H").length).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("a scanned page: plays found, kept, read, checked, renamed and filed in a new playbook", async ({ page, context }) => {
  const errors = errorsOf(page);
  let reads = 0;
  const boxes: Box[] = [
    { x: 0.05, y: 0.05, w: 0.4, h: 0.4, title: "Wheel Right", notes: "Hit the wheel vs man." },
    { x: 0.55, y: 0.05, w: 0.4, h: 0.4, title: "" },
    { x: 0.05, y: 0.55, w: 0.4, h: 0.4, title: "" },
  ];
  await signIn(context, async (route, path, method) => {
    if (path === "ai/scan" && method === "POST") return (await route.fulfill({ json: { plays: boxes } }), true);
    if (path === "ai/photo" && method === "POST") {
      reads += 1;
      return (await route.fulfill({ json: { read: read(`Read ${reads}`, reads === 1) } }), true);
    }
  });
  await page.goto("/upload");
  await signedIn(page);
  await page.locator("input[type=file]").setInputFiles(image("binder-page.png"));

  await expect(page.getByRole("heading", { name: "3 plays found on 1 page" })).toBeVisible();
  await expect(page.locator(".sc-page figcaption")).toContainText("Page 1 3 plays");
  await expect(page.locator(".sc-box")).toHaveCount(3);
  const items = page.locator(".sc-item");
  await expect(items).toHaveCount(3);
  await expect(items.locator(".pill")).toHaveText(["Not read yet", "Not read yet", "Not read yet"]);
  await expect(page.getByRole("textbox", { name: "Name for play 1" })).toHaveValue("Wheel Right");
  await expect(page.getByRole("button", { name: "Save 0 plays to Vault" })).toBeDisabled();

  // Keep two of the three.
  await page.getByRole("checkbox", { name: "Keep play 2" }).uncheck();
  await expect(items.nth(1)).toHaveClass(/is-off/);
  await page.getByRole("button", { name: "Read 2 plays" }).click();
  await expect(items.nth(0).locator(".pill").first()).toHaveText("Read");
  await expect(items.nth(2).locator(".pill").first()).toHaveText("Read");
  await expect(items.nth(1).locator(".pill")).toHaveText("Not read yet");
  expect(reads).toBe(2);
  await expect(page.getByRole("textbox", { name: "Name for play 1" })).toHaveValue("Wheel Right");
  await expect(page.getByRole("textbox", { name: "Name for play 3" })).toHaveValue(/^Read \d$/);
  await expect(page.getByRole("button", { name: /^Read \d/ })).toBeHidden();

  // Check and fix opens the one-play review and hands the answers back.
  const first = items.nth(0);
  await expect(first.getByText("1 thing to check")).toBeVisible();
  await first.getByRole("button", { name: "Check and fix" }).click();
  await expect(page.getByRole("heading", { name: "Is this the play on your board?" })).toBeVisible();
  await expect(page.getByText("Draft · not saved ·")).toContainText("binder-page.png · page 1");
  await page.getByRole("group").getByRole("button", { name: "Post" }).click();
  await page.getByRole("radio", { name: /Keep the photo's layout/ }).check();

  // Fix the read: the board's R is the slot, not the back, and X runs a slant, not a go.
  const fix = page.getByRole("region", { name: "Fix the read" });
  await fix.getByLabel("Who the board's R is").selectOption("S");
  await fix.getByLabel("X's job").selectOption("route:slant");
  await expect(page.locator(".pr-chips .chip")).toHaveText(["Q · quarterback", "C · center", "X · slant", "Y · post", "S · flat"]);
  // A defender's job, and a player the read missed.
  await fix.getByLabel(/'s responsibility$/).first().fill("Deep 1/2");
  await fix.getByLabel("Add a player the read missed").selectOption("o:Z");
  await fix.getByRole("button", { name: "Add" }).click();
  await expect(fix.getByLabel("Who the board's Z is")).toHaveValue("Z");
  await fix.getByRole("button", { name: "Remove Z (board Z)" }).click();
  await expect(fix.getByLabel("Who the board's Z is")).toHaveCount(0);

  const taught = page.waitForRequest((r) => r.url().endsWith("/api/read-lessons") && r.method() === "POST");
  await page.getByRole("button", { name: "Use this version" }).click();
  const lessons = JSON.parse((await taught).postData() ?? "{}");
  expect(lessons.corrections).toEqual([
    { kind: "route", from: "go", to: "slant" },
    { kind: "route", from: "corner", to: "post" },
    { kind: "letter", from: "R", to: "S" },
  ]);
  await expect(page.getByRole("heading", { name: "3 plays found on 1 page" })).toBeVisible();
  expect(reads).toBe(2);

  // The play just checked wears the green check; the other read play still says it hasn't been.
  await expect(first.getByLabel("Checked and fixed")).toBeVisible();
  await expect(first).toHaveClass(/is-checked/);
  await expect(first.getByRole("button", { name: "Fix again" })).toBeVisible();
  await expect(items.nth(2).getByText("Not checked yet")).toBeVisible();
  await expect(page.getByText("1 of 2 plays checked")).toBeVisible();

  // Rename, file in a new playbook named after the page, save.
  await page.getByRole("textbox", { name: "Name for play 3" }).fill("Stick Concept");
  const bookName = page.getByLabel("New playbook name");
  await expect(bookName).toHaveValue("binder-page");
  await bookName.fill("Binder scans");
  await page.getByRole("button", { name: "Save 2 plays to Vault" }).click();
  await expect(page.getByText("2 plays saved to your Vault in Binder scans. Open any one to fine-tune it.")).toBeVisible();
  await expect(page).toHaveURL(/\/vault/);
  const ws = await workspace(page);
  const names = (ws.plays ?? []).map((p) => p.name).sort();
  expect(names).toEqual(["Stick Concept", "Wheel Right"]);
  const wheel = (ws.plays ?? []).find((p) => p.name === "Wheel Right") as { tags: string[]; description: string } | undefined;
  expect(wheel?.tags).toEqual(["imported", "scan", "checked"]);
  const stick = (ws.plays ?? []).find((p) => p.name === "Stick Concept") as { tags: string[] } | undefined;
  expect(stick?.tags).toEqual(["imported", "scan", "to-check"]);
  // The Vault says which still need a look.
  await expect(page.locator(".play-meta .pill", { hasText: "Needs a check" })).toHaveCount(1);
  await expect(page.locator(".play-meta .pill", { hasText: "Checked" })).toHaveCount(1);
  expect(wheel?.description).toBe("Hit the wheel vs man.\n\nRead from binder-page.png.");
  const book = (ws.playbooks ?? []).find((b) => b.name === "Binder scans") as { playIds: string[] } | undefined;
  expect(book?.playIds).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("a read the account refuses keeps what was read and says so", async ({ page, context }) => {
  const errors = errorsOf(page);
  let reads = 0;
  await signIn(context, async (route, path, method) => {
    if (path === "ai/scan" && method === "POST")
      return (await route.fulfill({ json: { plays: [{ x: 0.05, y: 0.05, w: 0.4, h: 0.4, title: "Flood" }, { x: 0.55, y: 0.05, w: 0.4, h: 0.4, title: "Mesh" }] } }), true);
    if (path === "ai/photo" && method === "POST") {
      reads += 1;
      if (reads === 1) return (await route.fulfill({ json: { read: read("Flood", false) } }), true);
      return (await route.fulfill({ status: 429, json: { error: "You've used this month's whiteboard photo reviews. More come with the next plan up." } }), true);
    }
  });
  await page.goto("/upload");
  await signedIn(page);
  await page.locator("input[type=file]").setInputFiles(image("sheet.png"));
  await expect(page.getByRole("heading", { name: "2 plays found on 1 page" })).toBeVisible();
  await page.getByRole("button", { name: "Read 2 plays" }).click();
  await expect(page.locator(".up-wait[role=status]")).toHaveText(
    "You've used this month's whiteboard photo reviews. More come with the next plan up. Plays already read are kept; press Read again to try the rest.",
  );
  const pills = page.locator(".sc-item .pill").filter({ hasText: /^(Read|Try again)$/ });
  await expect(pills).toHaveText(["Read", "Try again"]);
  await expect(page.getByRole("button", { name: "Read 1 play" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save 1 play to Vault" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a scan keeps reading after the coach leaves, and Send to my Vault files the plays to check later", async ({ page, context }) => {
  const errors = errorsOf(page);
  let reads = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await signIn(context, async (route, path, method) => {
    if (path === "ai/scan" && method === "POST")
      return (await route.fulfill({ json: { plays: [{ x: 0.05, y: 0.05, w: 0.4, h: 0.4, title: "Flood" }, { x: 0.55, y: 0.05, w: 0.4, h: 0.4, title: "Mesh" }] } }), true);
    if (path === "ai/photo" && method === "POST") {
      reads += 1;
      await gate;
      return (await route.fulfill({ json: { read: read(`Read ${reads}`, false) } }), true);
    }
  });
  await page.goto("/upload");
  await signedIn(page);
  await page.locator("input[type=file]").setInputFiles(image("binder.png"));
  await expect(page.getByRole("heading", { name: "2 plays found on 1 page" })).toBeVisible();
  await page.getByRole("button", { name: "Read 2 plays" }).click();
  await expect.poll(() => reads).toBe(2);

  // Leave mid-read: the bar follows the coach, and the plays are waiting on the way back.
  await page.getByRole("link", { name: /^The Vault/ }).first().click();
  await expect(page).toHaveURL(/\/vault/);
  const bar = page.locator(".scan-bar");
  await expect(bar).toContainText("Reading plays from binder.png: 0 of 2 read");
  release();
  await expect(bar).toContainText("2 plays from binder.png are read and waiting for you.");
  await bar.getByRole("link", { name: "Back to the review" }).click();
  await expect(page.getByRole("heading", { name: "2 plays found on 1 page" })).toBeVisible();
  await expect(page.locator(".sc-item .pill-green")).toHaveCount(2);
  await expect(bar).toBeHidden();

  // Send to my Vault to check later: both go in, marked Needs a check.
  await page.getByRole("button", { name: "Save 2 plays to Vault" }).waitFor();
  await page.getByRole("button", { name: "Upload more" }).click();
  await page.locator("input[type=file]").setInputFiles(image("binder.png"));
  await expect(page.getByRole("heading", { name: "2 plays found on 1 page" })).toBeVisible();
  await page.getByRole("button", { name: "Send to my Vault to check later" }).click();
  await expect(page.getByText("2 plays saved to your Vault in binder. Open any one to fine-tune it.")).toBeVisible();
  await expect(page).toHaveURL(/\/vault/);
  const ws = await workspace(page);
  const scanned = (ws.plays ?? []) as unknown as { id: string; name: string; tags: string[] }[];
  expect(scanned.map((p) => p.tags)).toEqual([
    ["imported", "scan", "to-check"],
    ["imported", "scan", "to-check"],
  ]);
  await expect(page.locator(".play-meta .pill", { hasText: "Needs a check" })).toHaveCount(2);

  // Saving one in the Designer gives it the green check.
  await page.goto(`/build/${scanned[0].id}`);
  await page.getByRole("region", { name: "Needs a check" }).getByRole("button", { name: "Looks right: mark as checked" }).click();
  await expect(page.getByText("Marked as checked.")).toBeVisible();
  const after = await workspace(page);
  const tags = ((after.plays ?? []) as unknown as { name: string; tags: string[] }[]).map((p) => p.tags.includes("checked")).sort();
  expect(tags).toEqual([false, true]);
  await expect(page.getByRole("region", { name: "Needs a check" })).toBeHidden();
  expect(errors).toEqual([]);
});
