import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { errorsOf, quiet, seedReady, signIn, wbSection, type WristbandSection } from "./helpers";

/**
 * The Wristbands page after Wes's notes (2026-11-22): a dropdown for every
 * group of settings (all closed, one open at a time), the Gridiron-Vault setup
 * as the default for coaches and in the Saved setups list, adding, removing and
 * editing plays from the page, the cut-off warning with Fix it, and the page's
 * settings following the account. The older settings tests are in
 * wristbands.spec.ts and wristband-look.spec.ts.
 */
test.beforeEach(async ({ context }) => quiet(context));

const KEY = "grid1ronvault.wristbands.v1";
const READY = "Playbook · Ready-to-Go 5v5 Playbook";
const CARDS = '.wb-preview [aria-label^="Card "]';
const LIST = '.wb-controls [data-panel="plays"] .wb-plays li';

type Ws = { plays: { id: string; name: string; remote?: boolean; scene: { nodes: { id: string; kind: string; x: number; y: number }[] } }[]; playbooks: { id: string; name: string; playIds: string[] }[]; sheets: { id: string; rows: { id: string; playId: string | null }[] }[] };
const ws = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}") as Ws);

async function openReady(page: Page) {
  await page.goto("/wristbands");
  await wbSection(page, "start");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: READY });
  await expect(page.locator(CARDS).first()).toBeVisible();
}

test("a coach on a fresh browser opens on the Gridiron-Vault card, and nothing is written until they change something", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await openReady(page);

  // 3 across and 2 down, the G and GRIDDY in the header, GRIDIRON-VAULT.COM underneath, a bold edge, numbers in a color per card.
  const cards = page.locator(CARDS);
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toHaveAttribute("aria-label", /^Card A, 6 plays/);
  await expect(cards.first()).toHaveAttribute("data-border", "bold");
  await expect(cards.first().locator(".wb-card-head")).toContainText("GRIDDY");
  await expect(cards.first().locator(".wb-card-head")).toContainText("WIN THE GAME");
  await expect(cards.first().locator(".wb-card-head .wb-card-logo")).toHaveCount(1);
  await expect(cards.first().locator(".wb-card-foot")).toContainText("GRIDIRON-VAULT.COM");
  await expect(cards.first().locator(".wb-cell-band").first()).toBeVisible();
  await expect(cards.nth(0).locator(".wb-cell-band").first()).toHaveCSS("color", "rgb(224, 32, 27)");
  await expect(cards.nth(1).locator(".wb-cell-band").first()).toHaveCSS("color", "rgb(31, 71, 224)");

  // The closed Playbook & saved setups section says which setup is on, and the browser holds no copy yet.
  await wbSection(page, "grid");
  await expect(page.locator('.wb-controls [data-panel="start"] .panel-hint')).toContainText("Gridiron-Vault");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();

  // The first change is written, and the section's hint stops naming the built-in setup.
  await page.getByRole("group", { name: "Plays per card (columns × rows)" }).getByRole("button", { name: "8 plays, 4 across and 2 down" }).click();
  await expect(cards).toHaveCount(3);
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), KEY)).toMatchObject({ grid: "4x2", footer: "GRIDIRON-VAULT.COM" });
  await expect(page.locator('.wb-controls [data-panel="start"] .panel-hint')).toContainText("your own settings");
  expect(errors).toEqual([]);
});

test("a browser still on the old defaults moves to the Gridiron-Vault card, and one the coach changed is left alone", async ({ page }) => {
  await seedReady(page);

  // Exactly what the page used to open on: a coach who never changed it switches over.
  await page.evaluate(
    (k) =>
      localStorage.setItem(
        k,
        JSON.stringify({ grid: "4x2", sizeId: "flag", numberStyle: "tab", footer: "", header: { show: true, left: "{role} · Card {card} · {source}", right: "{count} plays" }, sameSize: false, colors: null }),
      ),
    KEY,
  );
  await openReady(page);
  await expect(page.locator(CARDS).first()).toHaveAttribute("aria-label", /^Card A, 6 plays/);
  await expect(page.locator(CARDS).first().locator(".wb-card-head")).toContainText("GRIDDY");

  // One setting different, and the whole saved set is theirs: nothing moves.
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ grid: "3x2-5" })), KEY);
  await page.reload();
  await wbSection(page, "start");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: READY });
  await expect(page.locator(CARDS).first()).toHaveAttribute("aria-label", /^Card A, 5 plays/);
  await expect(page.locator(CARDS).first().locator(".wb-card-head")).toContainText("QB wristband · Card A");
  await expect(page.locator(CARDS).first().locator(".wb-card-foot")).toHaveCount(0);
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), KEY)).toEqual({ grid: "3x2-5" });
});

test("Gridiron-Vault is built into Saved setups: load it over your own settings, Undo puts them back, and it can't be deleted", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await openReady(page);
  const cards = page.locator(CARDS);
  await wbSection(page, "styles");
  await page.getByRole("group", { name: "One-click styles" }).getByRole("button", { name: "Sideline 2×4" }).click();
  await expect(cards).toHaveCount(3);

  await wbSection(page, "start");
  const pick = page.getByLabel("Setup to load");
  await expect(pick.locator("optgroup[label='Built in'] option")).toHaveText(["Gridiron-Vault (built in)"]);
  await pick.selectOption({ label: "Gridiron-Vault (built in)" });
  await expect(page.getByRole("button", { name: "Delete the picked setup" })).toBeDisabled();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.locator(".toast", { hasText: "Loaded Gridiron-Vault" })).toBeVisible();
  await expect(cards).toHaveCount(4);
  await expect(cards.first().locator(".wb-card-head")).toContainText("GRIDDY");

  // One step: Undo brings the Sideline settings back.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cards).toHaveCount(3);

  // The built-in setup is never stored as the coach's own.
  const setups = await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.wristbandSetups.v1") ?? "{}"));
  expect((setups.setups ?? []).map((s: { name: string }) => s.name)).toEqual([]);
  expect(errors).toEqual([]);
});

test("every section of the left panel starts closed, opens on a tap, and opening one closes the others", async ({ page }) => {
  await seedReady(page);
  await openReady(page);
  const heads = page.locator(".wb-controls .panel-head");
  const open = page.locator('.wb-controls .panel-head[aria-expanded="true"]');
  await page.reload();
  await expect(page.locator(CARDS).first()).toBeVisible();
  await expect(heads).toHaveCount(14);
  await expect(open).toHaveCount(0);
  await expect(page.locator(".wb-controls .panel-body:visible")).toHaveCount(0);

  // A closed section says what it is set to, so nothing has to be opened to find out.
  await expect(page.locator('.wb-controls [data-panel="size"] .panel-hint')).toContainText("in");
  await expect(page.locator('.wb-controls [data-panel="numbering"] .panel-hint')).not.toBeEmpty();

  await heads.filter({ hasText: "Card size" }).click();
  await expect(page.getByRole("combobox", { name: "Card size" })).toBeVisible();
  await heads.filter({ hasText: "Numbering" }).click();
  await expect(page.getByRole("group", { name: "Numbering" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Card size" })).toBeHidden();
  await expect(open).toHaveCount(1);

  // The same head closes its section again.
  await heads.filter({ hasText: "Numbering" }).click();
  await expect(open).toHaveCount(0);

  // Tapping the header on a card opens Header and border text and puts the cursor in the box.
  await cardsHeaderClick(page);
  await expect(page.locator('.wb-controls [data-panel="text"] .panel-head')).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Header, left")).toBeFocused();
});

async function cardsHeaderClick(page: Page) {
  await page.locator(`${CARDS} .wb-card-head`).first().click();
}

test("plays can be taken off, added and opened from the page: a playbook's list, with Undo, and the Vault keeps every play", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const before = await ws(page);
  const book = before.playbooks[0];
  const nameOf = (id: string) => before.plays.find((p) => p.id === id)!.name;
  await openReady(page);
  await wbSection(page, "plays");
  const list = page.locator(LIST);
  await expect(page.locator('.wb-controls [data-panel="plays"] .panel-count')).toHaveText("24");
  await expect(list).toHaveCount(24);

  // Take the first call off: the card list, the playbook and the cards follow; the play stays in the Vault.
  const first = nameOf(book.playIds[0]);
  await page.getByRole("button", { name: `Take ${first} off the cards`, exact: true }).click();
  await expect(list).toHaveCount(23);
  await expect(page.locator(".toast", { hasText: `Took "${first}" off the playbook` })).toBeVisible();
  let now = await ws(page);
  expect(now.playbooks[0].playIds).toEqual(book.playIds.slice(1));
  expect(now.plays).toHaveLength(before.plays.length);
  await expect(page.locator(CARDS).first()).toHaveAttribute("aria-label", /^Card A, 6 plays/);

  // Undo puts it back where it was.
  await page.locator(".toast button", { hasText: "Undo" }).click();
  await expect(list).toHaveCount(24);
  now = await ws(page);
  expect(now.playbooks[0].playIds).toEqual(book.playIds);

  // Take the third off, then add it again from the Vault: it goes on the end.
  const third = nameOf(book.playIds[2]);
  await page.getByRole("button", { name: `Take ${third} off the cards`, exact: true }).click();
  await expect(list).toHaveCount(23);
  await page.getByRole("button", { name: "Add plays" }).click();
  const dialog = page.getByRole("dialog", { name: "Add plays to the cards" });
  await expect(dialog.locator(".add-card")).toHaveCount(1);
  await dialog.getByRole("button", { name: `Add ${third} to the cards`, exact: true }).click();
  await expect(dialog.getByText("Nothing left to add")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(list).toHaveCount(24);
  await expect(list.last().locator(".wb-plays-name")).toContainText(third);
  now = await ws(page);
  expect(now.playbooks[0].playIds).toEqual([...book.playIds.filter((id) => id !== book.playIds[2]), book.playIds[2]]);

  // Open a play in the Designer: the link keeps the playbook, so Prev and Next stay in it.
  const edit = page.getByRole("link", { name: `Open ${nameOf(book.playIds[1])} in the Designer`, exact: true });
  await expect(edit).toHaveAttribute("href", `/build/${book.playIds[1]}?book=${book.id}`);
  await page.getByRole("link", { name: "Draw a new play" }).click();
  await expect(page).toHaveURL(new RegExp(`/build\\?book=${book.id}$`));
  expect(errors).toEqual([]);
});

test("plays picked by hand, and a Call Sheet's calls, can be taken off and added too", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  const plays = (await ws(page)).plays.slice(0, 3);

  // By hand: the list and the checkboxes agree, and Undo puts the play back.
  await page.goto("/wristbands");
  await wbSection(page, "start");
  await page.locator('[data-tour="wb-source"] select').selectOption("hand");
  const picks = page.getByRole("group", { name: "Plays to print" }).getByRole("checkbox");
  await picks.nth(0).check();
  await picks.nth(1).check();
  await wbSection(page, "plays");
  const list = page.locator(LIST);
  await expect(list).toHaveCount(2);
  const gone = (await list.first().locator(".wb-plays-name").innerText()).trim();
  await page.getByRole("button", { name: `Take ${gone} off the cards`, exact: true }).click();
  await expect(list).toHaveCount(1);
  await page.locator(".toast button", { hasText: "Undo" }).click();
  await expect(list).toHaveCount(2);
  await expect(list.first().locator(".wb-plays-name")).toContainText(gone);
  await page.getByRole("button", { name: "Add plays" }).click();
  const dialog = page.getByRole("dialog", { name: "Add plays to the cards" });
  await dialog.getByRole("searchbox", { name: "Search your plays" }).fill(plays[2].name);
  await dialog.getByRole("button", { name: `Add ${plays[2].name} to the cards`, exact: true }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(list).toHaveCount(3);

  // A Call Sheet: link two plays on /grid, then print them from the wristbands page.
  await page.goto("/grid");
  for (const [i, p] of plays.slice(0, 2).entries()) {
    const cell = page.getByRole("combobox", { name: `Play Name, row ${i + 1}`, exact: true });
    await cell.fill(p.name);
    await cell.press("Tab");
    await expect(page.getByRole("button", { name: "Open linked play" })).toHaveCount(i + 1);
  }
  const sheet = (await ws(page)).sheets[0];
  await expect.poll(async () => (await ws(page)).sheets[0].rows.filter((r) => r.playId).length).toBe(2);
  await page.goto(`/wristbands?source=${encodeURIComponent(`grid:${sheet.id}`)}`);
  await wbSection(page, "plays");
  await expect(list).toHaveCount(2);
  const rows = (await ws(page)).sheets[0].rows.length;

  // Taking a call off removes its row from the Call Sheet; Undo puts the row back in the same place.
  await page.getByRole("button", { name: `Take ${plays[0].name} off the cards`, exact: true }).click();
  await expect(list).toHaveCount(1);
  await expect(page.locator(".toast", { hasText: "off the Call Sheet" })).toBeVisible();
  expect((await ws(page)).sheets[0].rows).toHaveLength(rows - 1);
  await page.locator(".toast button", { hasText: "Undo" }).click();
  await expect(list).toHaveCount(2);
  expect((await ws(page)).sheets[0].rows.map((r) => r.playId).filter(Boolean)).toEqual([plays[0].id, plays[1].id]);

  // Adding a play fills the next blank row.
  await page.getByRole("button", { name: "Add plays" }).click();
  await dialog.getByRole("searchbox", { name: "Search your plays" }).fill(plays[2].name);
  await dialog.getByRole("button", { name: `Add ${plays[2].name} to the cards`, exact: true }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(list).toHaveCount(3);
  expect((await ws(page)).sheets[0].rows.map((r) => r.playId).filter(Boolean)).toEqual([plays[0].id, plays[1].id, plays[2].id]);
  expect((await ws(page)).sheets[0].rows).toHaveLength(rows);
  expect(errors).toEqual([]);
});

/** Drags the first play's first player past the sideline, the way a stray drag in the Designer would. */
async function dragOff(page: Page, remote = false) {
  await page.evaluate((remote) => {
    const w = JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}");
    const play = w.plays.find((p: { id: string }) => p.id === w.playbooks[0].playIds[0]);
    play.scene.nodes.find((n: { kind: string }) => n.kind === "player").x = -400;
    if (remote) for (const p of w.plays) p.remote = true;
    localStorage.setItem("snapline.workspace.v1", JSON.stringify(w));
  }, remote);
}
const firstPlay = async (page: Page) => {
  const w = await ws(page);
  return w.plays.find((p) => p.id === w.playbooks[0].playIds[0])!;
};

test("a box that prints cut off is named, fixed in one press, and Undo puts the drawing back", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await dragOff(page);
  const was = await firstPlay(page);
  const players = (p: typeof was) => p.scene.nodes.filter((n) => n.kind === "player");
  await openReady(page);

  // The warning sits over the cards, the Plays section is marked, and the play's row says what is cut.
  const warn = page.locator(".wb-preview .pp-warn");
  await expect(warn).toContainText("1 box will print with something cut off");
  await expect(page.locator('.wb-controls [data-panel="plays"] .panel-alert')).toHaveAttribute("aria-label", "1 box will print cut off");
  await wbSection(page, "plays");
  const cutRow = page.locator(`${LIST}.is-cut`);
  await expect(cutRow).toHaveCount(1);
  await expect(cutRow).toContainText("Cut off:");
  await expect(cutRow.getByRole("button", { name: `Fix the cut-off in ${was.name}`, exact: true })).toBeVisible();

  // Fix it: only that play's edge moves, the toast says how much, and the warning goes.
  await cutRow.getByRole("button", { name: `Fix the cut-off in ${was.name}`, exact: true }).click();
  await expect(page.locator(".toast", { hasText: /Pulled \d+ pieces? back onto the field in 1 play/ })).toBeVisible();
  await expect(warn).toHaveCount(0);
  await expect(page.locator(`${LIST}.is-cut`)).toHaveCount(0);
  const fixed = await firstPlay(page);
  expect(fixed.scene.nodes).toHaveLength(was.scene.nodes.length);
  expect(players(fixed)[0].x).toBeGreaterThan(0);
  expect(players(fixed).slice(1).map((n) => [n.x, n.y])).toEqual(players(was).slice(1).map((n) => [n.x, n.y]));

  // Undo, then the warning's own Fix all does the same.
  await page.locator(".toast button", { hasText: "Undo" }).click();
  await expect(warn).toContainText("1 box will print with something cut off");
  expect(players(await firstPlay(page))[0].x).toBe(-400);
  await warn.getByRole("button", { name: "Fix all" }).click();
  await expect(warn).toHaveCount(0);
  expect(players(await firstPlay(page))[0].x).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("the print preview names the cut-off box and points back to Fix all, and a signed-in fix goes to the account", async ({ page, context }) => {
  const puts: { id: string; scene: { nodes: { kind: string; x: number }[] } }[] = [];
  await signIn(context, async (route, path, method) => {
    if (method === "PUT" && path.startsWith("plays/")) {
      puts.push({ id: path.slice("plays/".length), ...route.request().postDataJSON() });
      await route.fulfill({ json: {} });
      return true;
    }
  });
  await seedReady(page);
  await dragOff(page, true);
  const was = await firstPlay(page);
  await openReady(page);
  await page.locator(".wb-head-actions .btn-primary").click();
  const note = page.locator(".modal .pp-warn");
  await expect(note).toContainText("cut off");
  await expect(note).toContainText("press Fix all on the Wristbands page");
  await expect(note.getByRole("button")).toHaveCount(0);
  await page.locator(".modal").getByRole("button", { name: "Close" }).first().click();

  await page.locator(".wb-preview .pp-warn").getByRole("button", { name: "Fix all" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0].id).toBe(was.id);
  expect(puts[0].scene.nodes.find((n) => n.kind === "player")!.x).toBeGreaterThan(0);
});

test("the G beside the header words can be switched off and on, and the header rewrites on every card", async ({ page }) => {
  await seedReady(page);
  await openReady(page);
  const logo = page.locator(`${CARDS} .wb-card-head .wb-card-logo`);
  const count = await page.locator(CARDS).count();
  await expect(logo).toHaveCount(count);
  await wbSection(page, "text");
  const g = page.getByLabel("GridIronVault G beside the header words");
  await expect(g).toBeChecked();
  await g.uncheck();
  await expect(logo).toHaveCount(0);
  await page.getByLabel("Header, right").fill("GO {count}");
  await expect(page.locator(`${CARDS} .wb-card-head`).first()).toContainText("GO 6");
  await g.check();
  await expect(logo).toHaveCount(count);
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}").header, KEY)).toEqual({ show: true, left: "GRIDDY", right: "GO {count}", mark: true });
  await page.getByRole("button", { name: "Reset header" }).click();
  await expect(page.getByLabel("Header, right")).toHaveValue("WIN THE GAME");
});

test("the page's settings follow the account: another device's settings open here, a change goes up, and another coach's stay out", async ({ page, context }) => {
  const mine = { prefs: { grid: "3x2-5", footer: "FROM THE PHONE" }, at: "2026-11-22T09:00:00.000Z" };
  const puts: { setups: unknown[]; current?: { prefs: Record<string, unknown>; at: string } }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path !== "wristband-setups") return false;
    if (method === "PUT") puts.push(route.request().postDataJSON().setups);
    await route.fulfill({ json: { setups: { setups: [], deleted: [], current: mine } } });
    return true;
  });
  await seedReady(page);
  await page.goto("/wristbands");
  await wbSection(page, "start");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: READY });

  // The phone's settings: 5 a card and its bottom text.
  await expect(page.locator(CARDS).first()).toHaveAttribute("aria-label", /^Card A, 5 plays/);
  await expect(page.locator(CARDS).first().locator(".wb-card-foot")).toContainText("FROM THE PHONE");
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), KEY)).toMatchObject({ grid: "3x2-5" });

  // A change made here goes up stamped later than the phone's, with the whole settings.
  await wbSection(page, "text");
  await page.getByLabel("Bottom border").fill("FROM THE LAPTOP");
  await expect.poll(() => puts.at(-1)?.current?.prefs.footer).toBe("FROM THE LAPTOP");
  expect(puts.at(-1)!.current!.prefs.grid).toBe("3x2-5");
  expect(puts.at(-1)!.current!.at > mine.at).toBe(true);
});

test("settings made by another account in this browser are never shown to, or sent for, the next coach", async ({ page, context }) => {
  const puts: unknown[] = [];
  await signIn(context, async (route, path, method) => {
    if (path !== "wristband-setups") return false;
    if (method === "PUT") puts.push(route.request().postDataJSON().setups);
    await route.fulfill({ json: { setups: null } });
    return true;
  });
  // The browser holds the last coach's settings and setup list.
  await context.addInitScript(() => {
    localStorage.setItem("grid1ronvault.wristbandSetups.owner.v1", "someone-else");
    localStorage.setItem("grid1ronvault.wristbands.v1", JSON.stringify({ grid: "2x2", footer: "THEIR TEAM" }));
    localStorage.setItem(
      "grid1ronvault.wristbandSetups.v1",
      JSON.stringify({ setups: [{ id: "theirs", name: "Their setup", prefs: { grid: "2x2" }, savedAt: "2026-11-20T08:00:00.000Z" }], deleted: [] }),
    );
  });
  await seedReady(page);
  await page.goto("/wristbands");
  await wbSection(page, "start");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: READY });

  // This coach starts on the Gridiron-Vault card with no saved setups.
  await expect(page.locator(CARDS).first()).toHaveAttribute("aria-label", /^Card A, 6 plays/);
  await expect(page.locator(CARDS).first().locator(".wb-card-foot")).toContainText("GRIDIRON-VAULT.COM");
  await expect(page.getByLabel("Setup to load").locator("option", { hasText: "Their setup" })).toHaveCount(0);
  expect(JSON.stringify(puts)).not.toContain("THEIR TEAM");
  expect(JSON.stringify(puts)).not.toContain("Their setup");
  expect(await page.evaluate(() => localStorage.getItem("grid1ronvault.wristbandSetups.owner.v1"))).toBe("u1");
});

test("settings the account brings in are the new starting point: Undo never puts the older ones back or sends them up", async ({ page, context }) => {
  const phone = { prefs: { grid: "3x2-5", footer: "FROM THE PHONE" }, at: "2026-11-22T09:00:00.000Z" };
  const puts: { current?: { prefs: Record<string, unknown> } }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path !== "wristband-setups") return false;
    if (method === "PUT") puts.push(route.request().postDataJSON().setups);
    // The account answers a moment after the page has opened on this browser's own card.
    if (method === "GET") await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ json: { setups: { setups: [], deleted: [], current: phone } } });
    return true;
  });
  await seedReady(page);
  await page.goto("/wristbands");
  await wbSection(page, "start");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: READY });
  const foot = page.locator(CARDS).first().locator(".wb-card-foot");
  await expect(foot).toContainText("GRIDIRON-VAULT.COM");
  await expect(foot).toContainText("FROM THE PHONE");

  // Coming from the account is not a step the coach took: nothing to undo, and Ctrl+Z changes nothing.
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();
  await page.locator("body").press("Control+z");
  await expect(foot).toContainText("FROM THE PHONE");

  // A real change is a step, and Undo goes back to the account's settings, never to the card the page opened on.
  await wbSection(page, "text");
  await page.getByLabel("Bottom border").fill("MY CHANGE");
  await expect(foot).toContainText("MY CHANGE");
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(foot).toContainText("FROM THE PHONE");
  await expect(undo).toBeDisabled();
  await expect.poll(() => puts.at(-1)?.current?.prefs.footer).toBe("FROM THE PHONE");
  expect(JSON.stringify(puts)).not.toContain("GRIDIRON-VAULT.COM");
});

test("settings this browser already held reach the account, or are kept as a saved setup when the account has newer ones", async ({ page, context }) => {
  const OLD = { grid: "2x2", footer: "MY OLD CARD" };
  const puts: { setups: { name: string }[]; current?: { prefs: Record<string, unknown> } }[] = [];
  let account: unknown = { setups: [], deleted: [] };
  await signIn(context, async (route, path, method) => {
    if (path !== "wristband-setups") return false;
    if (method === "PUT") puts.push(route.request().postDataJSON().setups);
    await route.fulfill({ json: { setups: account } });
    return true;
  });
  // Changed on this browser before settings followed the account: nothing has a time on it.
  await context.addInitScript((o) => {
    if (!localStorage.getItem("grid1ronvault.wristbands.v1")) localStorage.setItem("grid1ronvault.wristbands.v1", JSON.stringify(o));
  }, OLD);

  // The account has no settings yet: they go up from any screen, so the next device opens on them.
  await page.goto("/vault");
  await expect.poll(() => puts.at(-1)?.current?.prefs.footer).toBe("MY OLD CARD");
  expect(puts.at(-1)!.setups).toEqual([]);

  // Another browser: the account already holds newer settings from the phone. They open here, and this browser's
  // own card is not lost: it waits in Saved setups.
  const other = await context.browser()!.newContext();
  await quiet(other);
  await signIn(other, async (route, path, method) => {
    if (path !== "wristband-setups") return false;
    if (method === "PUT") puts.push(route.request().postDataJSON().setups);
    await route.fulfill({
      json: { setups: { setups: [], deleted: [], current: { prefs: { grid: "3x2-5", footer: "FROM THE PHONE" }, at: "2026-11-22T09:00:00.000Z" } } },
    });
    return true;
  });
  await other.addInitScript((o) => {
    if (!localStorage.getItem("grid1ronvault.wristbands.v1")) localStorage.setItem("grid1ronvault.wristbands.v1", JSON.stringify(o));
  }, OLD);
  const second = await other.newPage();
  await seedReady(second);
  await second.goto("/wristbands");
  await wbSection(second, "start");
  await second.locator('[data-tour="wb-source"] select').selectOption({ label: READY });
  await expect(second.locator(CARDS).first().locator(".wb-card-foot")).toContainText("FROM THE PHONE");
  const pick = second.getByLabel("Setup to load");
  await expect(pick.locator("optgroup[label='Yours'] option")).toHaveText(["Saved from this browser"]);
  await pick.selectOption({ label: "Saved from this browser" });
  await second.getByRole("button", { name: "Load", exact: true }).click();
  await expect(second.locator(CARDS).first().locator(".wb-card-foot")).toContainText("MY OLD CARD");
  await other.close();
});

test("a sign-in that merely ran out keeps the card for the field, and a sign-out the coach chose puts it away", async ({ page, context }) => {
  // No sign-in at all (the session ran out with no signal), but this browser remembers whose card it is.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("wb-seeded")) return;
    sessionStorage.setItem("wb-seeded", "1");
    localStorage.setItem("grid1ronvault.wristbandSetups.owner.v1", "u1");
    localStorage.setItem("grid1ronvault.wristbands.v1", JSON.stringify({ grid: "2x2", footer: "MY TEAM" }));
    localStorage.setItem(
      "grid1ronvault.wristbandSetups.v1",
      JSON.stringify({ setups: [{ id: "mine", name: "Game day", prefs: { grid: "2x2" }, savedAt: "2026-11-20T08:00:00.000Z" }], deleted: [] }),
    );
  });
  await seedReady(page);
  await page.goto("/wristbands");
  await wbSection(page, "start");
  await page.locator('[data-tour="wb-source"] select').selectOption({ label: READY });
  await expect(page.locator(CARDS).first().locator(".wb-card-foot")).toContainText("MY TEAM");
  await expect(page.getByLabel("Setup to load").locator("option", { hasText: "Game day" })).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("grid1ronvault.wristbands.v1"))).toContain("MY TEAM");

  // Signed in, then Sign out on purpose: the card and the list go, so the next person starts clean.
  const signed = await context.browser()!.newContext();
  await quiet(signed);
  await signIn(signed, async (route, path, method) => {
    if (path === "wristband-setups" && method === "GET") {
      await route.fulfill({ json: { setups: { setups: [], deleted: [], current: { prefs: { grid: "3x2-5", footer: "MY TEAM" }, at: "2026-11-22T09:00:00.000Z" } } } });
      return true;
    }
    return false;
  });
  const p2 = await signed.newPage();
  await p2.goto("/vault");
  await expect.poll(() => p2.evaluate(() => localStorage.getItem("grid1ronvault.wristbands.v1") ?? "")).toContain("MY TEAM");
  await p2.getByRole("button", { name: /^Sign out of/ }).click();
  await expect.poll(() => p2.evaluate(() => localStorage.getItem("grid1ronvault.wristbands.v1"))).toBeNull();
  expect(await p2.evaluate(() => localStorage.getItem("grid1ronvault.wristbandSetups.owner.v1"))).toBeNull();
  await signed.close();
});

test("when the account cuts back a time that was ahead of its clock, this browser takes the account's time and keeps its undo steps", async ({ page, context }) => {
  const earlier = "2026-11-22T10:00:00.000Z";
  await signIn(context, async (route, path, method) => {
    if (path !== "wristband-setups") return false;
    if (method === "PUT") {
      const sent = route.request().postDataJSON().setups;
      await route.fulfill({ json: { setups: { ...sent, current: { ...sent.current, at: earlier } } } });
    } else await route.fulfill({ json: { setups: { setups: [], deleted: [] } } });
    return true;
  });
  await seedReady(page);
  await page.goto("/wristbands");
  await wbSection(page, "text");
  await page.getByLabel("Bottom border").fill("AHEAD OF THE CLOCK");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.wristbandSetups.v1") ?? "{}").current?.at))
    .toBe(earlier);
  // The coach's own step is still there to undo: taking the account's time is not a settings change.
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Bottom border")).toHaveValue("AHEAD OF THE CLOCK");
});

test("the Wristbands tour opens each section it explains, so every step finds its spot", async ({ page }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  await page.goto("/wristbands?tour=wristbands");
  const card = page.locator(".tour-layer [role=dialog]");
  await expect(card).toBeVisible({ timeout: 10_000 });
  const total = Number((await card.locator(".tour-card-kicker span").textContent())!.split(" of ")[1]);
  expect(total).toBeGreaterThan(12);
  const seen: string[] = [];
  for (let i = 0; i < total; i++) {
    await expect(card.locator(".tour-card-kicker span")).toHaveText(`${i + 1} of ${total}`);
    await expect(page.locator(".tour-spot")).toBeVisible();
    await expect(page.locator(".tour-card-note")).toHaveCount(0);
    seen.push(await card.locator("h2").innerText());
    await card.getByRole("button", { name: i === total - 1 ? "Done" : "Next" }).click();
  }
  await expect(card).toHaveCount(0);
  expect(seen).toEqual(expect.arrayContaining(["Left panel", "Saved setups", "Plays on the cards", "Plays per card", "Card colors", "Coach's call sheet", "Card layout"]));
  expect(errors).toEqual([]);
});

test("every section of the left panel, the plays list with a cut-off box and the Add plays box pass axe's WCAG A and AA rules @phone", async ({ page }) => {
  test.setTimeout(150_000);
  await seedReady(page);
  await dragOff(page);
  await openReady(page);
  const sweep = async (label: string) => {
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    // The one allowed reading (docs/accessibility.md): a card's number strip shows the printed ink, a color per card on gray.
    const found = res.violations
      .map((v) => (v.id === "color-contrast" ? { ...v, nodes: v.nodes.filter((n) => !n.target.join(" ").includes(".wb-cell-band")) } : v))
      .filter((v) => v.nodes.length);
    expect(
      found.map((v) => `${label} [${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`),
      label,
    ).toEqual([]);
  };
  await sweep("every section closed");
  const sections: WristbandSection[] = ["start", "plays", "styles", "numbering", "size", "grid", "look", "shows", "colors", "text", "paper", "copies", "callsheet", "format"];
  for (const id of sections) {
    await wbSection(page, id);
    await sweep(`section ${id}`);
  }
  await wbSection(page, "plays");
  await page.getByRole("button", { name: "Add plays" }).click();
  await expect(page.getByRole("dialog", { name: "Add plays to the cards" })).toBeVisible();
  await sweep("Add plays box");
});
