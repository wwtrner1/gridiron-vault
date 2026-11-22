// 14-playbooks-players: "Playbooks & Player Links" (take 20 s). Six lines (../source/timings.json):
//   1 "A playbook only works if your players know it."          the Playbooks screen, a playbook
//   2 "Group your plays into a playbook, in the order you install them."   Add plays, then the book's order (up and down arrows)
//   3 "Share it with one link. No account, and no app to download."        Players: Create the player link, the link and QR code, Copy link
//   4 "Each player picks a letter, and sees their own job on every play."  the player's page (/team/<token>): a letter, his plays, one running
//   5 "Then the Griddy Quiz shows you who really knows it."                the quiz: a question, an answer
//   6 "Teach it once. Let them study all week."                            the score, then the coach's Players dialog with the scores
// The coach's account and the player links are the small in-memory account of 14-players-mocks.mjs (the same answers the server gives);
// the Playbooks screen, the Players dialog, the player's page, the quiz and the scores list are the real app.
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/14-playbooks-players.mjs   (DRY=1 for timing only, SNAPS=1 for stills in /tmp/home-clips/14)
import { mkdirSync } from "node:fs";
import { record, BASE } from "./lib.mjs";
import { seedAccount, install, TOKEN } from "./14-players-mocks.mjs";

const FPS = 30;
const frames = (sec) => Math.round(sec * FPS);
const BOOK = "Week 1 Install";
const FIRST_SIX = ["01 · All Curls", "02 · Quick Slants", "03 · Mesh", "04 · Curl-Flat", "05 · Slant-Flat", "06 · Four Verticals"];
const ADDED = ["22 · Criss-Cross", "21 · QB Bootleg"]; // the top row of the Add plays grid (the Vault lists newest first)
const FINAL_ORDER = [...FIRST_SIX, "21 · QB Bootleg", "22 · Criss-Cross"];
const PLAYER = "Sample Player 4";
const LETTER = "X";
const SEED = Number(process.env.SEED ?? 23); // question 1 is "03 · Mesh: which route does the X run?", its right answer in the top row
const PRE = "preflightTokenAAAAAAAA";
const SNAPS = !!process.env.SNAPS;
if (SNAPS) mkdirSync("/tmp/home-clips/14", { recursive: true });
const snap = async (h, name) => { if (SNAPS) await h.page.screenshot({ path: `/tmp/home-clips/14/${name}.png`, scale: "css" }); };

// The quiz builds its questions with Math.random. Both the real take and the rehearsal reseed it the moment the coach or player presses
// Start the quiz, so the same questions come up in the same order, and the take can press the right answer on cue.
const SEEDABLE = (seed) => {
  const real = Math.random.bind(Math);
  let gen = null;
  Math.random = () => (gen ? gen() : real());
  const mk = () => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  addEventListener("click", (e) => { if (/Start the quiz|Take it again/.test(e.target?.closest?.("button")?.textContent ?? "")) gen = mk(); }, true);
  addEventListener("click", () => { gen = null; });
};

let account;
let rightAnswers = [];
const letterBtn = (page, l) => page.getByRole("group", { name: "Your letter" }).getByRole("button", { name: l, exact: true });

/** Plays the quiz once on a throwaway browser (nothing is saved anywhere) to learn which answer is right for each question. */
async function rehearse(h, snapshot, seed = SEED) {
  const browser = h.page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } });
  await ctx.addInitScript(SEEDABLE, seed);
  await ctx.route("**/api/shares/**", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { share: { name: snapshot.name, plays: snapshot.plays, updatedAt: new Date().toISOString() } } });
    return route.fulfill({ status: 201, json: { ok: true } });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/team/${PRE}`);
  await letterBtn(p, LETTER).click();
  await p.getByRole("tab", { name: "Griddy Quiz" }).click();
  await p.getByLabel("Your name").fill(PLAYER);
  await p.getByRole("button", { name: "Start the quiz" }).click();
  const total = Number((await p.locator(".tm-count").textContent()).match(/of (\d+)/)[1]);
  const right = [];
  const kinds = [];
  const prompts = [];
  for (let i = 0; i < total; i++) {
    kinds.push((await p.locator(".tm-opts-routes").count()) ? "route" : "name");
    if (process.env.SEEDSEARCH) prompts.push((await p.locator(".tm-quiz h2").textContent()).slice(0, 34));
    await p.locator(".tm-opt").first().click();
    right.push(await p.locator(".tm-opt").evaluateAll((els) => els.findIndex((e) => e.classList.contains("is-right"))));
    await p.getByRole("button", { name: i === total - 1 ? "See my score" : "Next" }).click();
  }
  await ctx.close();
  console.log("quiz", total, "questions; right answers", right.join(","), kinds.join(","), prompts.slice(0, 3).join(" | "));
  return right;
}

async function setup(h) {
  const { page } = h;
  await page.context().addInitScript(SEEDABLE, SEED);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  account = await seedAccount(page);
  await install(page, account, {});
  await h.goto("/playbooks", page.locator('[data-tour="new-playbook"]'));

  // The playbook the coach made: six plays in install order (the take adds two more).
  await page.locator('[data-tour="new-playbook"]').click();
  const form = page.getByRole("dialog", { name: "New playbook" });
  await form.getByLabel("Playbook name").fill(BOOK);
  await form.getByLabel("Description").fill("Base pass game plus two run answers. Install Tuesday.");
  await form.getByRole("button", { name: "Create playbook" }).click();
  await h.quiet(600);
  const card = () => page.locator(".book", { hasText: BOOK });
  await card().getByRole("button", { name: `Add plays to ${BOOK}` }).click();
  const adder = page.getByRole("dialog", { name: "Add plays to this book" });
  await h.settle(adder);
  for (const n of FIRST_SIX) {
    // (a click through the DOM: the toasts of the earlier adds sit over the lower cards)
    await adder.getByRole("button", { name: `Add ${n} to ${BOOK}` }).evaluate((el) => el.click());
    await h.quiet(150);
  }
  await adder.getByRole("button", { name: "Done" }).click();
  await h.quiet(900);
  await snap(h, "s0-playbooks");

  // The quiz rehearsal, on the playbook as the take will share it.
  const byName = new Map([...account.plays.values()].map((p) => [p.name, p]));
  const snapshot = {
    name: BOOK,
    plays: FINAL_ORDER.map((n) => {
      const p = byName.get(n);
      return JSON.parse(JSON.stringify({ id: p.id, name: p.name, formation: p.formation, playType: p.playType, personnel: p.personnel, description: p.description, tags: p.tags, scene: { ...p.scene, film: undefined } }));
    }),
  };
  if (process.env.SEEDSEARCH) {
    for (let sd = 1; sd <= Number(process.env.SEEDSEARCH); sd++) console.log("seed", sd, (await rehearse(h, snapshot, sd)).join(","));
    process.exit(0);
  }
  rightAnswers = await rehearse(h, snapshot);

  // Scores from teammates who took the quiz while the link was out (the server keeps them as sent: name, letter, score, total).
  const N = rightAnswers.length;
  account.pending = [
    { playerName: "Sample Player 1", letter: "Z", score: N, total: N, minutesAgo: 22 },
    { playerName: "Sample Player 2", letter: "Y", score: Math.round(N * 0.6), total: N, minutesAgo: 71 },
    { playerName: "Sample Player 3", letter: "C", score: Math.round(N * 0.4), total: N, minutesAgo: 143 },
  ];
  // The player's name is remembered in his browser from the last visit.
  await page.evaluate((n) => localStorage.setItem("grid1ronvault.team.v1", JSON.stringify({ name: n })), PLAYER);
  await h.goto("/playbooks", page.locator(".book").first());
  await snap(h, "s1-ready");
  h.setMouse({ x: 720, y: 405 });
}

// ---------------------------------------------------------------------------------------------------------------------------------
const card = (h) => h.page.locator(".book", { hasText: BOOK });
const dlg = (h, name) => h.page.getByRole("dialog", { name });

// Rolls frames until the locator shows, so a wait is footage and not a freeze.
const until = async (h, locator, maxSec = 3) => {
  for (let i = 0; i < frames(maxSec); i++) {
    if (await locator.first().isVisible().catch(() => false)) return;
    await h.roll(1 / FPS);
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Never showed: ${locator}`);
};
/** Scrolls an element to `to` (or its end) over `sec`, one step per frame. */
const scrollTo = async (h, locator, to, sec) => {
  const from = await locator.evaluate((el) => { el.style.scrollBehavior = "auto"; return el.scrollTop; });
  const end = to === "end" ? await locator.evaluate((el) => el.scrollHeight - el.clientHeight) : to;
  await h.roll(sec, (f) => locator.evaluate((el, v) => (el.scrollTop = v), from + (end - from) * (f * f * (3 - 2 * f))));
};

/** Scrolls the page to `to` over `sec`, one step per frame (the browser's own smooth scroll needs real frames). */
const scrollWin = async (h, to, sec) => {
  const from = await h.page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; return window.scrollY; });
  await h.roll(sec, (f) => h.page.evaluate((v) => window.scrollTo(0, v), from + (to - from) * (f * f * (3 - 2 * f))));
};

// Crops (CSS px of the 1440x810 screen). The caption bar covers the bottom 18% of the picture (one line) or 24% (two lines), so what
// matters in each crop sits in its upper three quarters.
const BOOK_TOP = { x: 290, y: 30, width: 860, height: 484 };
const ADD_GRID = { x: 290, y: 60, width: 860, height: 484 };
const BOOK_END = { x: 290, y: 240, width: 860, height: 484 };
const PAGE_TOP = { x: 400, y: 0, width: 640, height: 360 };
const PAGE_GRID = { x: 300, y: 150, width: 840, height: 473 };
const RUN_CARD = { x: 290, y: 80, width: 860, height: 484 };
const QUIZ_TAB = { x: 270, y: 130, width: 900, height: 506 };
const QUIZ_Q = { x: 300, y: 200, width: 840, height: 473 };
const DLG_ASK = { x: 340, y: 200, width: 760, height: 428 };
const DLG_LINK = { x: 300, y: 60, width: 840, height: 473 };
const DLG_FINAL = { x: 322, y: 122, width: 796, height: 448 };
const SCORE_TOP = { x: 380, y: 128, width: 680, height: 383 };
const SCORES_TABLE = { x: 374, y: 420, width: 693, height: 390 };

// Line 1: "A playbook only works if your players know it." The Playbooks screen, the book, opened: its plays in install order.
async function scene1(h) {
  await h.roll(0.15);
  await h.zoomOn(card(h), 36, 0.7);
  await h.press(card(h).getByRole("button", { name: `Open ${BOOK}` }), 0.5);
  const book = dlg(h, BOOK);
  await until(h, book);
  await snap(h, "a1-open");
  h.zoom(BOOK_TOP, 0.5);
  await h.roll(0.25);
  await scrollTo(h, book, 520, 1.4);
  await snap(h, "a1-scrolled");
  // The book stays open to the end of the line (it is the picture the step still shows); scene 2 puts it away.
}

// Line 2: "Group your plays into a playbook, in the order you install them." Add plays (two clicks), then the book: the new plays
// land last, and the down arrow on the first puts them in the order the coach installs them.
async function scene2(h) {
  const { page } = h;
  await page.keyboard.press("Escape");
  await h.roll(0.05);
  await h.zoomOn(card(h), 36, 0.5);
  await h.press(card(h).getByRole("button", { name: `Add plays to ${BOOK}` }), 0.4);
  const adder = dlg(h, "Add plays to this book");
  await until(h, adder);
  h.zoom(ADD_GRID, 0.4);
  await snap(h, "b-add");
  await h.press(adder.getByRole("button", { name: `Add ${ADDED[0]} to ${BOOK}` }), 0.4);
  await h.press(adder.getByRole("button", { name: `Add ${ADDED[1]} to ${BOOK}` }), 0.35);
  await snap(h, "b-added");
  await page.keyboard.press("Escape");
  await h.roll(0.05);
  await h.zoomOn(card(h), 36, 0.4);
  await h.press(card(h).getByRole("button", { name: `Open ${BOOK}` }), 0.4);
  const book = dlg(h, BOOK);
  await until(h, book);
  h.zoom(BOOK_END, 0.4);
  await scrollTo(h, book, "end", 0.4);
  await snap(h, "b-order1");
  await h.press(book.getByRole("button", { name: `Move ${ADDED[0]} down` }), 0.35);
  await snap(h, "b-order2");
}

// Line 3: "Share it with one link. No account, and no app to download." Players on the book, Create the player link, the link with its QR
// code, Copy link.
async function scene3(h) {
  const { page } = h;
  await page.keyboard.press("Escape");
  await h.roll(0.05);
  await h.zoomOn(card(h), 36, 0.5);
  await h.press(card(h).getByRole("button", { name: `Players: link for ${BOOK}` }), 0.45);
  const pl = dlg(h, `Player link: ${BOOK}`);
  await until(h, pl.getByRole("button", { name: "Create the player link" }));
  h.zoom(DLG_ASK, 0.4);
  await snap(h, "c-dialog");
  await h.press(pl.getByRole("button", { name: "Create the player link" }), 0.45);
  await until(h, pl.getByRole("textbox", { name: "Link to send" }));
  h.zoom(DLG_LINK, 0.5);
  await snap(h, "c-link");
  await h.press(pl.getByRole("button", { name: "Copy link" }), 0.4);
  await snap(h, "c-copied");
  h.zoom(DLG_FINAL, 0.8);
  await h.glide(pl.getByRole("img", { name: "QR code for the player link" }), 0.55);
  await h.glide({ x: 930, y: 370 }, 0.7);
  await snap(h, "c-end");
}

const letters = (page) => page.getByRole("group", { name: "Your letter" });

// Line 4: "Each player picks a letter, and sees their own job on every play." The player's page: the letter, his plays, one running.
async function scene4(h) {
  const { page } = h;
  await h.goto(`/team/${TOKEN}`, page.getByRole("heading", { level: 1, name: BOOK }));
  h.zoom(PAGE_TOP, 0.04);
  await snap(h, "d-open");
  await h.roll(0.3);
  await h.press(letterBtn(page, LETTER), 0.55);
  await until(h, page.locator(".tm-card"));
  await snap(h, "d-letter");
  await h.roll(0.25);
  h.zoom(PAGE_GRID, 0.45);
  await scrollWin(h, 260, 0.7);
  await snap(h, "d-scrolled");
  await h.press(page.getByRole("button", { name: "Run 03 · Mesh" }), 0.4);
  await until(h, page.getByRole("dialog"));
  h.zoom(RUN_CARD, 0.4);
  await snap(h, "d-run");
  await h.roll(0.9);
  await snap(h, "d-run2");
}

// Line 5: "Then the Griddy Quiz shows you who really knows it." Close the play, the quiz tab, Start, a question, the right answer.
async function scene5(h) {
  const { page } = h;
  await page.keyboard.press("Escape");
  h.zoom(QUIZ_TAB, 0.3);
  await scrollWin(h, 0, 0.25);
  await h.press(page.getByRole("tab", { name: "Griddy Quiz" }), 0.35);
  await snap(h, "e-intro");
  await h.press(page.getByRole("button", { name: "Start the quiz" }), 0.35);
  await until(h, page.locator(".tm-count"));
  h.zoom(QUIZ_Q, 0.3);
  await snap(h, "e-q1");
  await h.press(page.locator(".tm-opt").nth(rightAnswers[0]), 0.35);
  await snap(h, "e-q1-answered");
}

// Line 6: "Teach it once. Let them study all week." The rest of the quiz (not recorded), the score, then the coach's Players dialog.
async function scene6(h) {
  const { page } = h;
  await h.cut(async () => {
    const total = rightAnswers.length;
    for (let i = 0; i < total; i++) {
      if (i > 0) {
        const wrong = i === 4; // one miss: 7 of 8
        const pick = wrong ? (rightAnswers[i] + 1) % 4 : rightAnswers[i];
        await page.locator(".tm-opt").nth(pick).click();
        await h.quiet(120);
      }
      await page.getByRole("button", { name: i === total - 1 ? "See my score" : "Next", exact: true }).click();
      await h.quiet(120);
    }
    await h.settle(page.getByText("Your score went to your coach."));
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  h.zoom(SCORE_TOP, 0.04);
  await snap(h, "f-score");
  await h.roll(0.15);
  await h.glide({ x: 640, y: 352 }, 0.6);
  await h.roll(0.05);
  await h.goto("/playbooks", card(h));
  await h.zoomOn(card(h), 36, 0.04);
  await h.press(card(h).getByRole("button", { name: `Players: link for ${BOOK}` }), 0.4);
  const pl = dlg(h, `Player link: ${BOOK}`);
  await until(h, pl.locator(".pl-table"));
  h.zoom(SCORES_TABLE, 0.5);
  await snap(h, "f-scores");
  await h.glide({ x: 790, y: 601 }, 0.4);
  await h.glide({ x: 790, y: 703 }, 0.6);
}

const END = [2.96, 6.56, 10.64, 14.4, 17.04, 20.26];
const lap = (i, fn) => async (h) => {
  const a = h.frame;
  await fn(h);
  console.log(`scene ${i + 1}: ${(a / FPS).toFixed(2)}s -> ${(h.frame / FPS).toFixed(2)}s (line ends ${END[i]}s, slack ${(END[i] - h.frame / FPS).toFixed(2)}s)`);
};
await record("14-playbooks-players", setup, [scene1, scene2, scene3, scene4, scene5, scene6].map((f, i) => lap(i, f)));
