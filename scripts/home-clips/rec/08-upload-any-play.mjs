// 08-upload-any-play: "Upload Any Play" (take 20 s). Six lines: plays on a whiteboard (the sample photo itself, full screen), the
// Upload page and a file dropped on it, the review (the page cut into plays, each read and redrawn), Check and fix (a question
// answered with a click, the green Checked), Save and open the play in the Designer, the Vault with the new playbook.
// The Play reader needs the AI Gateway, so its answers are scripted by 08-upload-mocks.mjs; everything else is the real app
// over a small in-memory account. The photo is made by 08-whiteboard.py (python3 scripts/home-clips/rec/08-whiteboard.py).
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/08-upload-any-play.mjs        (DRY=1 for timing only)
import { record } from "./lib.mjs";
import { seedAccount, install } from "./09-griddy-mocks.mjs";
import { installReader, BOARD, FILE_NAME } from "./08-upload-mocks.mjs";
import { readFileSync } from "node:fs";

const FPS = 30;
const frames = (sec) => Math.round(sec * FPS);
// Where each voiceover line starts (timings.json), for holding a beat until Glenn says it.
const START = [0.08, 3.76, 7.6, 11.28, 13.96, 17.68];
const holdTo = async (h, sec) => { while (h.frame < frames(sec)) await h.roll(1 / FPS); };
const until = async (h, locator, maxSec = 4) => {
  for (let i = 0; i < frames(maxSec); i++) {
    if (await locator.first().isVisible().catch(() => false)) return;
    await h.roll(1 / FPS);
    await new Promise((r) => setTimeout(r, 25));
  }
  await h.page.screenshot({ path: "/tmp/home-clips/08/fail.png" }).catch(() => undefined);
  throw new Error(`Never showed: ${locator}`);
};

// ---- the pointer (the recorder's own glide is used for simple moves; these also scroll and drag along the way)
let pos = { x: 720, y: 405 };
const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f));
const smooth = (k) => k * k * (3 - 2 * k);
/** Glides the pointer to `to` over `sec`, optionally scrolling the page and running `each(f)` every frame. */
async function move(h, to, sec, { scroll, each } = {}) {
  const from = { ...pos };
  const y0 = scroll === undefined ? 0 : await h.page.evaluate(() => window.scrollY);
  await h.roll(sec, async (f) => {
    const e = ease(f);
    pos = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
    await h.page.mouse.move(pos.x, pos.y);
    if (scroll !== undefined) await h.page.evaluate((y) => window.scrollTo(0, y), y0 + (scroll - y0) * smooth(f));
    if (each) await each(f);
  });
  pos = to;
  await h.page.mouse.move(to.x, to.y);
  if (scroll !== undefined) await h.page.evaluate((y) => window.scrollTo(0, y), scroll);
  h.setMouse(to);
}
const tap = async (h) => {
  await h.roll(0.06);
  await h.page.mouse.down();
  await h.tick(60);
  await h.page.mouse.up();
  await h.roll(0.1);
};
/** The centre of an element on screen. */
const at = async (locator) => {
  const b = await locator.first().boundingBox();
  if (!b) throw new Error(`No box for ${locator}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** A scroll position, over `sec`, by hand (a frame at a time). */
const scrollTo = async (h, to, sec) => {
  const from = await h.page.evaluate(() => window.scrollY);
  await h.roll(sec, (f) => h.page.evaluate((y) => window.scrollTo(0, y), from + (to - from) * smooth(f)));
  await h.page.evaluate((y) => window.scrollTo(0, y), to);
};

// The caption bar covers the bottom quarter of every frame (the bottom fifth of a one-line caption), so every box below keeps
// what it shows in the top three quarters of the box. The Ask Griddy launcher is put away, the toast is lifted above the caption,
// and the review pages get extra room under them so a button at the bottom of the page can be scrolled up into the picture.
const STYLE = `.gd-launch{display:none !important} .toast-wrap{bottom:236px !important} html.no-toast .toast-wrap{display:none !important}
  .up{padding-bottom:380px} html{scroll-behavior:auto !important} *{-webkit-user-select:none !important;user-select:none !important}`;
const R_PAGE = { x: 232, y: 60, w: 900, h: 506 };
const R_DROP = { x: 232, y: 60, w: 1208, h: 680 };
const R_CARDS = { x: 232, y: 120, w: 1208, h: 680 };
const R_CHECK = { x: 232, y: 62, w: 1208, h: 680 };
const R_VAULT = { x: 232, y: 100, w: 1208, h: 680 };

let gates;
const board = readFileSync(BOARD);

async function setup(h) {
  const { page } = h;
  const zoom0 = h.zoom;
  h.zoom = (r, sec) => zoom0(r && r.w !== undefined ? { x: r.x, y: r.y, width: r.w, height: r.h } : r, sec);
  const ctx = page.context();
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  }, STYLE);
  await ctx.route("**/__clip/board.jpg", (route) => route.fulfill({ body: board, contentType: "image/jpeg" }));
  const account = await seedAccount(page);
  await install(page, account);
  gates = await installReader(page, { log: (m) => console.log("mock", m) });
  // The Vault with the Getting started card put away, then the Upload page.
  await h.goto("/vault", page.locator(".play-card"));
  const hide = page.locator("section:has(#start-h)").getByRole("button", { name: "Hide", exact: true });
  if (await hide.count()) await hide.first().click();
  await h.goto("/upload", page.locator(".up-drop"));
  // The photo (full screen, for line 1), the file the coach drags in, and the picture that rides along with the pointer.
  await page.evaluate(async (name) => {
    const blob = await (await fetch("/__clip/board.jpg")).blob();
    window.__clipFile = new File([blob], name, { type: "image/jpeg" });
    const photo = document.createElement("div");
    photo.id = "clip-photo";
    photo.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:#2a2a28;";
    const img = document.createElement("img");
    img.src = "/__clip/board.jpg";
    img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
    photo.append(img);
    document.body.append(photo);
    await img.decode();
    const g = document.createElement("div");
    g.id = "clip-ghost";
    g.style.cssText = "position:fixed;left:0;top:0;z-index:2147483640;pointer-events:none;width:176px;transform:translate(-9999px,-9999px) rotate(-3deg)";
    g.innerHTML = `<img src="/__clip/board.jpg" style="display:block;width:176px;height:99px;object-fit:cover;border:2px solid #fff;border-radius:8px;box-shadow:0 12px 30px rgba(1,22,40,.45)"><span style="display:block;margin-top:6px;padding:3px 8px;border-radius:6px;background:#0B1524;color:#fff;font:600 12px Barlow,sans-serif;width:max-content">${name}</span>`;
    document.body.append(g);
    addEventListener("mousemove", (e) => { if (g.dataset.on) g.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 10}px) rotate(-3deg)`; }, true);
  }, FILE_NAME);
  await page.evaluate(() => window.scrollTo(0, 0));
}

// Line 1: "Got plays on a whiteboard, or in a binder? Bring them with you." The photo, full screen, drifting a little; then the Upload page.
async function bring(h) {
  const { page } = h;
  await page.evaluate(() => { const p = document.getElementById("reel-ptr"); if (p) p.style.display = "none"; });
  h.zoom({ x: 0, y: 40, w: 1244, h: 700 }, 1.6);
  await h.roll(1.7);
  h.zoom({ x: 196, y: 40, w: 1244, h: 700 }, 1.5);
  await holdTo(h, 3.55);
  // cut to the Upload page
  await page.evaluate(() => { document.getElementById("clip-photo")?.remove(); const p = document.getElementById("reel-ptr"); if (p) p.style.display = ""; });
  h.zoom(null, 0.03);
  await h.roll(0.1);
  h.zoom(R_DROP, 0.5);
}

// Line 2: "Open Upload, and drop in a photo, a scan, or a PDF." The page, the file carried in and dropped on the box.
async function drop(h) {
  const { page } = h;
  const zone = page.locator(".up-drop");
  const rect = await zone.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
  const drag = (type) => page.evaluate(([type, sel]) => {
    const dt = new DataTransfer();
    dt.items.add(window.__clipFile);
    document.querySelector(sel).dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [type, ".up-drop"]);
  await holdTo(h, START[1] + 0.2);
  // a look at the page (the pointer drifts to Choose files), then out to the edge of the window, where the file is picked up
  await move(h, { x: 742, y: 452 }, 0.5);
  await holdTo(h, 4.72);
  await move(h, { x: 1434, y: 330 }, 0.6);
  await page.evaluate(() => { const g = document.getElementById("clip-ghost"); g.dataset.on = "1"; });
  await page.mouse.move(1434, 330);
  await page.mouse.down();
  await h.roll(0.1);
  let inside = false;
  await move(h, { x: 836, y: 392 }, 1.4, {
    each: async () => {
      const now = pos.x > rect.l && pos.x < rect.r && pos.y > rect.t && pos.y < rect.b;
      if (now && !inside) { await drag("dragenter"); await drag("dragover"); }
      else if (now) await drag("dragover");
      else if (inside) await drag("dragleave");
      inside = now;
    },
  });
  await drag("dragover");
  await holdTo(h, 7.4);
  // let go
  await page.mouse.up();
  await page.evaluate(() => { const g = document.getElementById("clip-ghost"); delete g.dataset.on; g.style.transform = "translate(-9999px,-9999px)"; });
  await drag("drop");
  await h.roll(0.1);
}

// Line 3: "GridIronVault reads the players, the routes, and the blocks." Finding the plays on the page, then each one read and redrawn.
async function read(h) {
  const { page } = h;
  h.zoom(R_PAGE, 0.6);
  await until(h, page.locator(".sc-scan"), 3);
  await holdTo(h, START[2] + 0.5);
  gates.openFind();
  await until(h, page.locator(".sc-item").nth(2), 3);
  await h.roll(0.3);
  // scroll the page up to the cards and the Read button, the pointer going there as it goes
  const btn = page.getByRole("button", { name: /^Read 3 plays$/ });
  const S = 380;
  const target = await btn.evaluate((el, s) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + window.scrollY + r.height / 2 - s }; }, S);
  h.zoom(R_CARDS, 0.55);
  await move(h, target, 0.55, { scroll: S });
  await tap(h);
  await until(h, page.locator(".sc-item .pill", { hasText: "Reading" }).first(), 2);
  h.zoom({ x: 240, y: 120, w: 850, h: 478 }, 0.6);
  await holdTo(h, START[2] + 2.0);
  gates.openRead(0);
  await until(h, page.locator(".sc-item .pill-green").first(), 3);
  gates.openRead(1);
  await h.roll(0.12);
  h.zoom({ x: 590, y: 120, w: 850, h: 478 }, 0.6);
  await until(h, page.locator(".sc-item .pill-green").nth(1), 3);
  gates.openRead(2);
  await until(h, page.locator(".sc-item .pill-green").nth(2), 3);
  await h.roll(0.2);
  h.zoom(R_CARDS, 0.5);
  // the pointer goes to Check and fix on the first play as the line ends
  await holdTo(h, 10.72);
  await move(h, await at(page.locator(".sc-item").first().getByRole("button", { name: "Check and fix" })), 0.5);
}

// Line 4: "Check the read, and fix anything with a click." Check and fix on the first play, a question answered, Use this version.
// The page is held at a scroll where the board's photo, the rebuilt field (its route about to flip) and the Corner button all sit
// clear of the sticky header and the caption bar.
async function fix(h) {
  const { page } = h;
  await tap(h);
  await until(h, page.locator(".pr-check"), 3);
  await page.evaluate(() => window.scrollTo(0, 245));
  h.zoom(R_CHECK, 0.35);
  await holdTo(h, 12.2);
  const corner = page.locator(".pr-opts button", { hasText: "Corner" });
  await move(h, await at(corner), 0.55);
  await tap(h);
  await until(h, page.locator(".pr-chips .chip", { hasText: "Y · corner" }), 2);
  // the corrected route and the new chip stay on screen (the line's still is taken at 13.6 s), then on to Use this version
  await holdTo(h, 13.68);
  const use = page.getByRole("button", { name: "Use this version" });
  const abs = await use.evaluate((el) => el.getBoundingClientRect().top + window.scrollY + el.offsetHeight / 2);
  const x = await use.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
  await move(h, { x, y: 470 }, 0.38, { scroll: abs - 470 });
}

// Line 5: "Save it, and it's a real play you can edit, teach, and print." Green Checked, Save, the Vault, the play open in the Designer.
async function save(h) {
  const { page } = h;
  await tap(h);
  await until(h, page.locator(".sc-item.is-checked"), 2);
  const saveBtn = page.getByRole("button", { name: /^Save 3 plays to Vault/ });
  const abs = await saveBtn.evaluate((el) => el.getBoundingClientRect().top + window.scrollY + el.offsetHeight / 2);
  const S = 380;
  await page.evaluate((y) => window.scrollTo(0, y), S);
  h.zoom(R_CARDS, 0.5);
  await holdTo(h, START[4] + 0.7);
  const sx = await saveBtn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
  await move(h, { x: sx, y: abs - 420 }, 0.5, { scroll: 420 });
  await tap(h);
  await until(h, page.locator(".play-card").first(), 4);
  await page.evaluate(() => window.scrollTo(0, 0));
  h.zoom(R_VAULT, 0.4);
  await h.roll(0.05);
  const open = page.getByRole("button", { name: "Open Smash in the designer" }).first();
  await move(h, await at(open), 0.4);
  await tap(h);
  await h.cut(async () => {
    await page.evaluate(() => document.documentElement.classList.add("no-toast"));
    await page.locator(".stage-frame svg").first().waitFor({ timeout: 20000 });
    await h.settle(page.locator(".stage-frame svg g[data-kind=player]"));
  });
  h.zoom(null, 0.03);
  // edit, teach, print: along the top bar's menus
  await move(h, await at(page.locator('button[aria-controls="dz-menu-edit"]')), 0.3);
  await tap(h);
  await until(h, page.locator("#dz-menu-edit"), 2);
  await h.roll(0.2);
  // (a press outside only closes an open menu, so Escape puts Edit away and the next press opens Teach)
  await page.keyboard.press("Escape");
  await move(h, await at(page.locator('button[aria-controls="dz-menu-teach"]')), 0.22);
  await tap(h);
  await until(h, page.locator("#dz-menu-teach"), 2);
  await move(h, await at(page.locator("#dz-menu-teach").getByText("Print assignment sheets")), 0.3);
}

// Line 6: "Your old playbook, in your new Vault." Back to the Vault: the new playbook in the tree, its plays among the others.
async function vault(h) {
  const { page } = h;
  await h.cut(async () => {
    await page.keyboard.press("Escape");
    await page.goBack();
    await h.settle(page.locator(".play-card"));
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await h.roll(0.35);
  const row = page.getByRole("treeitem", { name: /Whiteboard plays/ }).first();
  await move(h, await at(row), 0.55);
  const open = await row.getAttribute("aria-expanded");
  if (open !== "true") {
    await tap(h);
    await until(h, page.getByRole("treeitem").filter({ hasText: "Smash" }), 2);
  }
  await h.roll(0.3);
  await move(h, await at(page.locator(".play-card").first().getByText("Stick", { exact: true })), 0.6);
}

await record("08-upload-any-play", setup, [bring, drop, read, fix, save, vault], {
  storage: [{ name: "grid1ronvault.guides.v1", value: JSON.stringify({ seen: ["designer", "vault", "wristbands", "grid", "coverage", "practice", "drills", "roster", "playbooks", "upload", "tutorials", "coverage-report", "language", "starters"] }) }],
});
