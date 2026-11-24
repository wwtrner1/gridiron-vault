// 09-griddy: "Ask Griddy" (take 19 s). Six lines: he's on every page, ask for a play and he draws it, save it to the Vault,
// recolor a whole playbook (and Undo), build a call sheet from the Vault, ask a question.
// Griddy's answers are scripted by 09-griddy-mocks.mjs (the real model needs the AI Gateway); the cards, the Vault, the
// bulk edit and its Undo, the Call Sheet and the panel are the real app over a small in-memory account.
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/09-griddy.mjs        (DRY=1 for timing only)
import { record } from "./lib.mjs";
import { seedAccount, install } from "./09-griddy-mocks.mjs";

const FPS = 30;
const frames = (sec) => Math.round(sec * FPS);

/** Rolls frames until the clip has reached `sec`, so a beat lands when Glenn says it. */
const holdTo = async (h, sec) => {
  while (h.frame < frames(sec)) await h.roll(1 / FPS);
};
/** Rolls frames (one per tick) until the locator shows, so the wait is footage and not a freeze. */
const until = async (h, locator, maxSec = 3) => {
  for (let i = 0; i < frames(maxSec); i++) {
    if (await locator.first().isVisible().catch(() => false)) return;
    await h.roll(1 / FPS);
    await new Promise((r) => setTimeout(r, 25));
  }
  await h.page.screenshot({ path: "/tmp/home-clips/09/fail.png" }).catch(() => undefined);
  throw new Error(`Never showed: ${locator}`);
};
/** One key per frame. */
const typeText = async (h, text) => {
  for (const ch of text) {
    await h.page.keyboard.type(ch);
    await h.roll(1 / FPS);
  }
};
const logTo = (h, y) => h.page.evaluate((top) => { const el = document.querySelector(".gd-log"); if (el) el.scrollTop = top === "end" ? el.scrollHeight : top; }, y);

/** Scrolls the log to its end over `sec` (by hand, a frame at a time: the browser's own smooth scroll needs real frames). */
const scrollEnd = async (h, sec = 0.25) => {
  const [from, to] = await h.page.evaluate(() => {
    const el = document.querySelector(".gd-log");
    el.style.scrollBehavior = "auto";
    return [el.scrollTop, el.scrollHeight - el.clientHeight];
  });
  if (to > from + 2) {
    await h.roll(sec, (f) => h.page.evaluate(([a, b, k]) => { document.querySelector(".gd-log").scrollTop = a + (b - a) * (k * k * (3 - 2 * k)); }, [from, to, f]));
  }
  await logTo(h, "end");
};

// The caption bar covers the bottom quarter of every frame, and Griddy's composer sits on the bottom edge of the screen, so
// setup() gives the composer extra room under it (COMPOSE_LIFT): the typed words, the card buttons and Undo all stay above
// the caption. Every box below keeps what it shows in the top 3/4 of the box.
const COMPOSE_LIFT = 128;
const PANEL_HELLO = { x: 720, y: 0, width: 720, height: 405 };
const PANEL_INPUT = { x: 800, y: 440, width: 640, height: 360 };
const DRAW_CARD = { x: 516, y: 165, width: 924, height: 520 };
const VAULT_TOP = { x: 196, y: 90, width: 800, height: 450 };
const BULK_CARD = { x: 440, y: 140, width: 1000, height: 562 };
const VAULT_Z = { x: 240, y: 230, width: 780, height: 439 };
const ANSWER = { x: 373, y: 92, width: 1067, height: 600 };
const SHEET_CARD = { x: 471, y: 137, width: 969, height: 545 };

let account;
const asked = [];

async function setup(h) {
  const { page } = h;
  // The panel's own smooth scroll needs real frames and fights a recording that steps the clock by hand, so the log is
  // scrolled by this script instead (scrollEnd): the same end positions the panel reaches by itself.
  await page.context().addInitScript(() => {
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      if (this.classList?.contains("gd-log")) return;
      return scrollTo.apply(this, args);
    };
  });
  await page.context().addInitScript((lift) => {
    const add = () => {
      const style = document.createElement("style");
      style.textContent = `.gd-compose{padding-bottom:${12 + lift}px !important}`;
      document.head.append(style);
    };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  }, COMPOSE_LIFT);
  account = await seedAccount(page);
  await install(page, account, { onGriddy: (q, r, ctx) => asked.push({ q, tools: r.actions.map((a) => a.tool), picks: r.actions.flatMap((a) => a.ids ?? []).map((id) => { const v = (ctx?.vault ?? []).find((x) => x.id === id); return `${v?.name} [${v?.beats}]`; }) }) });
  // The Vault with the Getting started card put away, then one dry conversation so every card's code is already loaded
  // (nothing is clicked, so nothing is saved), then back to the first screen.
  await h.goto("/vault", page.locator(".play-card"));
  const hide = page.locator("section:has(#start-h)").getByRole("button", { name: "Hide", exact: true });
  if (await hide.count()) await hide.first().click();
  await page.locator(".gd-launch").click();
  const box = page.locator(".gd-panel textarea").first();
  await h.settle(box);
  for (const [msg, card] of [
    ["Draw a Smash to beat Cover 2", ".gd-panel .pa-preview"],
    ["Make every Z in Ready-to-Go yellow", ".gd-bulk"],
    ["Build me a call sheet", ".gd-sheet"],
    ["What beats Cover 2?", ".gd-plays"],
  ]) {
    await box.fill(msg);
    await box.press("Enter");
    await h.settle(page.locator(card), 20000);
  }
  await h.goto("/playbooks", page.locator(".gd-launch"));
  await page.mouse.move(720, 405);
  h.setMouse({ x: 720, y: 405 });
}

// Line 1: "Meet Griddy, your coaching assistant. He's on every page." Playbooks, the launcher, his panel with the hello and
// the starters, then the same panel on the Vault.
async function meet(h) {
  const { page } = h;
  await h.roll(0.25);
  h.zoom({ x: 960, y: 520, width: 480, height: 270 }, 0.6);
  await h.press(page.locator(".gd-launch"), 0.5);
  await until(h, page.locator(".gd-hello"));
  h.zoom(PANEL_HELLO, 0.5);
  await h.roll(1.0);
  await h.roll(0.45, async (f) => logTo(h, Math.round(150 * f)));
  h.zoom(null, 0.5);
  await h.press(page.getByRole("link", { name: /The Vault/ }).first(), 0.5);
  await h.settle(page.locator(".play-card"));
  await h.roll(0.2);
}

// Line 2: "Ask for a play in plain words, and he draws it."
async function ask(h) {
  const { page } = h;
  h.zoom(PANEL_INPUT, 0.5);
  await page.locator(".gd-panel textarea").first().focus();
  await typeText(h, "Draw a Smash to beat Cover 2");
  await h.roll(0.1);
  await page.keyboard.press("Enter");
  await scrollEnd(h, 0.15);
  await until(h, page.locator(".gd-panel .pa-preview"));
  h.zoom(DRAW_CARD, 0.6);
  await scrollEnd(h, 0.3);
  await h.glide({ x: 1180, y: 540 }, 0.5);
}

// Line 3: "Like it? Save it straight to your Vault."
async function save(h) {
  const { page } = h;
  await logTo(h, "end");
  await h.press(page.getByRole("button", { name: "Save to Vault" }), 0.45);
  await until(h, page.locator(".gd-panel .gd-done").first());
  await h.roll(0.3);
  h.zoom(VAULT_TOP, 0.6);
  await h.roll(0.7);
}

// Line 4: "Tell him to recolor a whole playbook, and it's done. Undo is one click."
async function recolor(h) {
  const { page } = h;
  h.zoom(PANEL_INPUT, 0.5);
  await h.click(page.locator(".gd-panel textarea").first(), 0.35);
  await typeText(h, "Make every Z in Ready-to-Go yellow");
  await h.roll(0.1);
  await page.keyboard.press("Enter");
  await scrollEnd(h, 0.12);
  await until(h, page.locator(".gd-bulk"));
  h.zoom(BULK_CARD, 0.6);
  await scrollEnd(h, 0.25);
  await h.press(page.getByRole("button", { name: /^Apply to \d+ plays/ }), 0.45);
  await until(h, page.getByRole("button", { name: "Undo this change" }));
  await scrollEnd(h, 0.15);
  h.zoom(VAULT_Z, 0.5);
  await h.roll(0.8);
  h.zoom(BULK_CARD, 0.4);
  await h.press(page.getByRole("button", { name: "Undo this change" }), 0.4);
  await until(h, page.locator(".gd-bulk .gd-done", { hasText: "Undone" }));
  await scrollEnd(h, 0.15);
}

// Line 5: "He'll even build a call sheet from the plays you already have."
async function sheet(h) {
  const { page } = h;
  h.zoom(PANEL_INPUT, 0.4);
  await page.locator(".gd-panel textarea").first().focus();
  await typeText(h, "Build me a call sheet");
  await h.roll(0.1);
  await page.keyboard.press("Enter");
  await scrollEnd(h, 0.12);
  await until(h, page.locator(".gd-sheet"));
  h.zoom(SHEET_CARD, 0.5);
  await scrollEnd(h, 0.25);
  await h.press(page.getByRole("button", { name: "Create the call sheet" }), 0.4);
  await until(h, page.getByRole("button", { name: "Open Call Sheet" }));
  await scrollEnd(h, 0.12);
  h.zoom(null, 0.4);
  await h.press(page.getByRole("button", { name: "Open Call Sheet" }), 0.35);
  await h.settle(page.locator("table, .grid-wrap, [role=grid]").first());
  await h.roll(0.1);
}

// Line 6: "Got a question? Just ask Griddy."
async function question(h) {
  const { page } = h;
  await h.press(page.locator(".gd-launch"), 0.35);
  await until(h, page.locator(".gd-panel textarea"));
  await logTo(h, "end");
  h.zoom(PANEL_INPUT, 0.3);
  await page.locator(".gd-panel textarea").first().focus();
  await typeText(h, "What beats Cover 2?");
  await h.roll(0.05);
  await page.keyboard.press("Enter");
  await scrollEnd(h, 0.1);
  await until(h, page.locator(".gd-plays"));
  h.zoom(ANSWER, 0.45);
  await scrollEnd(h, 0.2);
  // The answer stays up to the end of the line (the recorder pads the rest), so the three plays are on screen for the last second.
}

const meta = await record("09-griddy", setup, [meet, ask, save, recolor, sheet, question]);
console.log(JSON.stringify(asked));
if (process.env.DRY) console.log("overruns", JSON.stringify(meta.overruns), "errors", JSON.stringify(meta.errors));
