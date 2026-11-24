// 11-call-sheet: "The Call Sheet" (take 18.7 s). Six lines (../source/timings.json):
//   1 "Game day runs on your call sheet. Build it right here."              a half-built Call Sheet (8 calls linked, the rest to come); the pointer walks the calls and clicks the next empty Play Name cell
//   2 "Type a play name, and it links to the play in your Vault."           "smash" offers 07 · Smash from the Vault, Tab takes it: the row links (Group fills in, the diagram button appears), Situation typed
//   3 "Paint your calls by situation, and add any column you need."        Paint cells: green for the openers, red for the red zone; Add column, named Notes
//   4 "Find a call in a second, or fold away what you don't need."         Find "red" narrows to the red-zone calls; Minimize Group folds the column; Hide empty drops the blank rows
//   5 "Then print the sheet, and send the same calls to your wristbands."  Print: the page preview with the paint kept; Wristbands: the cards built from the same calls, same numbers
//   6 "One sheet. Every call."                                              Call Sheet button back to the sheet; the camera pulls out to the finished sheet
// Everything is the real app over sample data: the Ready-to-Go 5v5 playbook the recorder adds, and one Call Sheet written into the browser's saved
// workspace the way a coach's own would be (the sheet is data: its columns, its eight starting calls linked to Vault plays, amber and violet paint
// on three of them, a compact view). Nothing needs an account, so there are no mocks. The Ask Griddy launcher is kept out of the picture.
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/11-call-sheet.mjs   (DRY=1 for timing only, SNAPS=1 for stills in /tmp/home-clips/11)
import { mkdirSync } from "node:fs";
import { record } from "./lib.mjs";

const SNAPS = !!process.env.SNAPS;
if (SNAPS) mkdirSync("/tmp/home-clips/11", { recursive: true });
const snap = async (h, name) => { if (SNAPS) await h.page.screenshot({ path: `/tmp/home-clips/11/${name}.png`, scale: "css" }); };

const SHEET_ID = "sheet-gameday";
const PAINT = { amber: "#FADFA3", violet: "#D3CFF4" };
// The calls already on the sheet: [Vault play, situation, paint]. Row 9 is typed on camera.
const ROWS = [
  ["02 · Quick Slants", "Opener"],
  ["04 · Curl-Flat", "Opener"],
  ["01 · All Curls", "Opener"],
  ["06 · Four Verticals", "3rd & long", "amber"],
  ["05 · Slant-Flat", "3rd & long", "amber"],
  ["21 · QB Bootleg", "Goal line", "violet"],
  ["10 · Scissors", "Red zone"],
  ["09 · Spot", "Red zone"],
];

const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f));
const center = async (locator) => {
  const b = await locator.first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** A quick click: glide there, press and let go, a beat to see it land. */
async function tap(h, target, sec = 0.25) {
  await h.glide(target, sec);
  await h.page.mouse.down();
  await h.tick(40);
  await h.page.mouse.up();
  await h.roll(0.07);
}
/** Types one character every `each` seconds. */
async function typeSlow(h, text, each = 1 / 15) {
  for (const ch of text) { await h.page.keyboard.type(ch); await h.roll(each); }
}
/** Glides the pointer from `from` to a box on the sheet while the sheet scrolls sideways to its end, in the same frames. */
async function glideAndScroll(h, from, locator, sec) {
  const b = await locator.first().boundingBox();
  const { max, at } = await h.page.evaluate(() => { const w = document.querySelector(".grid-wrap"); return { max: w.scrollWidth - w.clientWidth, at: w.scrollLeft }; });
  const to = { x: b.x + b.width / 2 - (max - at), y: b.y + b.height / 2 };
  await h.roll(sec, async (f) => {
    const e = ease(f);
    await h.page.evaluate((x) => { document.querySelector(".grid-wrap").scrollLeft = x; }, at + (max - at) * e);
    await h.page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
  });
  await h.page.evaluate((x) => { document.querySelector(".grid-wrap").scrollLeft = x; }, max);
  await h.page.mouse.move(to.x, to.y);
  h.setMouse(to);
  return to;
}

// Camera boxes (CSS px of the 1440x810 screen). The caption bar covers the bottom fifth of whatever the camera shows, so the action stays above it.
const TABLE = { x: 254, y: 130, width: 1164, height: 655 };
const ROW_TIGHT = { x: 510, y: 245, width: 880, height: 495 };
const TOP = { x: 254, y: 0, width: 1164, height: 655 };
const PAPER = { x: 192, y: 62, width: 1056, height: 594 };
const CARDS = { x: 560, y: 150, width: 860, height: 484 };
const CARDS_LOW = { x: 560, y: 235, width: 860, height: 484 };

const TARGETS = [108, 196, 302, 407, 504, 577];
const timed = (scenes) => scenes.map((fn, i) => async (h) => {
  await fn(h);
  if (process.env.DRY) console.log(`scene ${i + 1} ends at frame ${h.frame} of ${TARGETS[i]} (${((TARGETS[i] - h.frame) / 30).toFixed(2)} s spare)`);
});

await record(
  "11-call-sheet",
  async (h) => {
    const p = h.page;
    await p.context().addInitScript(() => {
      const css = ".gd-launch{display:none !important}";
      const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); };
      if (document.head) add(); else addEventListener("DOMContentLoaded", add);
    });
    await p.evaluate(([rows, paint, sheetId]) => {
      const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1"));
      const columns = ["#", "Play Name", "Situation", "Group"].map((label, i) => ({ id: `c${i}`, label, width: label === "Play Name" ? 220 : 96, type: "text" }));
      const made = Array.from({ length: 12 }, (_, i) => {
        const r = rows[i];
        const play = r && ws.plays.find((x) => x.name === r[0]);
        const hex = r && r[2] ? paint[r[2]] : "";
        return {
          id: `r${i}`,
          cells: { c0: String(i + 1), c1: r ? r[0] : "", c2: r ? r[1] : "", c3: play ? play.formation : "" },
          colors: hex ? { c0: hex, c1: hex, c2: hex, c3: hex } : {},
          playId: play ? play.id : null,
        };
      });
      ws.sheets = [{ id: sheetId, name: "Game Day Call Sheet", columns, rows: made, updatedAt: new Date().toISOString(), remoteId: null }];
      localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
      localStorage.setItem("grid1ronvault.sheetview.v1", JSON.stringify({ [sheetId]: { cols: [], rows: [], compact: true, hideEmpty: false } }));
    }, [ROWS, PAINT, SHEET_ID]);
    await h.goto("/grid", p.locator("table.sheet tbody tr").first());
    await h.quiet(500);
    h.setMouse({ x: 1150, y: 330 });
    await p.mouse.move(1150, 330);
  },
  timed([
    // 1: Game day runs on your call sheet. Build it right here.
    async (h) => {
      const p = h.page;
      const name = (r) => p.getByLabel(`Play Name, row ${r}`, { exact: true });
      h.zoom(null, 0);
      await h.roll(0.5);
      h.zoom(TABLE, 1.0);
      await h.glide(await center(name(1)), 0.9);
      await snap(h, "s1a");
      for (let r = 2; r <= 8; r++) await h.glide(await center(name(r)), 0.2);
      await h.glide(await center(name(9)), 0.4);
      await snap(h, "s1b");
    },
    // 2: Type a play name, and it links to the play in your Vault.
    async (h) => {
      const p = h.page;
      h.zoom(ROW_TIGHT, 0.5);
      await h.page.mouse.down();
      await h.tick(40);
      await h.page.mouse.up();
      await h.roll(0.1);
      await typeSlow(h, "smash", 3 / 30);
      await h.roll(0.5);
      await snap(h, "s2a");
      await p.keyboard.press("Tab");
      await h.roll(0.45);
      await snap(h, "s2b");
      await p.keyboard.press("Tab");
      await typeSlow(h, "Red zone", 1 / 30);
      await h.roll(0.05);
      await h.glide(p.getByRole("button", { name: "Open linked play" }).nth(8), 0.4);
      await h.roll(0.45);
      await snap(h, "s2c");
    },
    // 3: Paint your calls by situation, and add any column you need.
    async (h) => {
      const p = h.page;
      const dot = (n) => p.getByRole("button", { name: n, exact: true });
      const grip = (r) => p.getByRole("button", { name: `Paint row ${r}`, exact: true });
      const addColumn = p.getByRole("button", { name: "Add column" });
      h.zoom(TABLE, 0.5);
      await tap(h, dot("Green"), 0.3);
      await tap(h, grip(1), 0.28);
      await tap(h, grip(2), 0.08);
      await tap(h, grip(3), 0.08);
      await snap(h, "s3a");
      await tap(h, dot("Red"), 0.3);
      await tap(h, grip(7), 0.3);
      await tap(h, grip(8), 0.08);
      await tap(h, grip(9), 0.08);
      await snap(h, "s3b");
      await h.roll(0.25);
      const from = await center(addColumn);
      await tap(h, addColumn, 0.3);
      const header = p.getByLabel("Rename New column");
      const to = await glideAndScroll(h, from, header, 0.3);
      await h.page.mouse.down();
      await h.tick(40);
      await h.page.mouse.up();
      await h.roll(0.04);
      await p.keyboard.press("Control+a");
      await typeSlow(h, "Notes", 1 / 30);
      void to;
      await h.roll(0.3);
      await snap(h, "s3c");
    },
    // 4: Find a call in a second, or fold away what you don't need.
    async (h) => {
      const p = h.page;
      const find = p.getByLabel("Find in this call sheet");
      await tap(h, find, 0.35);
      await typeSlow(h, "red", 3 / 30);
      await h.roll(0.55);
      await snap(h, "s4a");
      await p.keyboard.press("Control+a");
      await p.keyboard.press("Backspace");
      await h.roll(0.15);
      await tap(h, p.getByRole("button", { name: "Minimize Group" }), 0.4);
      await h.roll(0.35);
      await snap(h, "s4b");
      await tap(h, p.getByRole("button", { name: "Hide empty" }), 0.4);
      await h.roll(0.45);
      await snap(h, "s4c");
    },
    // 5: Then print the sheet, and send the same calls to your wristbands.
    async (h) => {
      const p = h.page;
      h.zoom(TOP, 0.4);
      await tap(h, p.getByRole("button", { name: "Print", exact: true }), 0.35);
      const preview = p.getByRole("dialog", { name: /^Print preview/ });
      await h.cut(async () => { await h.settle(preview); });
      h.zoom(PAPER, 0.4);
      await h.glide({ x: 1150, y: 296 }, 0.6);
      await h.roll(0.8);
      await snap(h, "s5a");
      await p.keyboard.press("Escape");
      h.zoom(TOP, 0.4);
      await h.roll(0.1);
      await tap(h, p.getByRole("link", { name: "Wristbands" }).first(), 0.35);
      await h.cut(async () => { await h.settle(p.locator(".wb-preview")); });
      h.zoom(CARDS_LOW, 0.1);
      await h.glide({ x: 1100, y: 330 }, 0.3);
      await h.roll(0.5);
      await snap(h, "s5b");
    },
    // 6: One sheet. Every call.
    async (h) => {
      const p = h.page;
      h.zoom(CARDS, 0.3);
      await tap(h, p.getByRole("link", { name: "Call Sheet" }).last(), 0.4);
      await h.cut(async () => { await h.settle(p.locator("table.sheet")); });
      h.zoom(null, 0.9);
      const name = (r) => p.getByLabel(`Play Name, row ${r}`, { exact: true });
      await h.glide(await center(name(1)), 0.8);
      await snap(h, "s6a");
      await h.glide(await center(name(9)), 0.9);
      await h.roll(0.2);
      await snap(h, "s6");
    },
  ]),
);
