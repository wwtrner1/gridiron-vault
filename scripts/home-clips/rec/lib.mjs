// Shared recorder for the home page tool clips (2026-11-22; the recorder is the Designer v2 social set's from 2026-11-21).
// The app is driven by Playwright with its clock paused and stepped one frame at a time, so the footage is smooth however
// slow the machine is. Each clip is a list of scenes, one per voiceover line: a scene's frames are padded to the next
// line's start (../source/timings.json), so the footage lines up with Glenn's read. Frames are clean (no captions):
// compose.py adds the caption bar and the sound.
//
//   (gridiron-vault) npm run build && npx vite preview --port 4173 &     BASE=http://localhost:4173 node scripts/home-clips/rec/<clip>.mjs
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const p of [undefined, "/opt/node-tools/node_modules", "/opt/node22/lib/node_modules", join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "node_modules")]) {
    try { return p ? require(require.resolve("playwright", { paths: [p] })) : require("playwright"); } catch {}
  }
  throw new Error("playwright not found");
})();

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASE = process.env.BASE ?? "http://localhost:4173";
export const FPS = 30;
export const W = 1440;
export const H = 810;
export const SCALE = 2; // frames are 2880x1620; compose.py crops (focus) and scales to 1080p, then the pack step to 1280x720
const TIMINGS = JSON.parse(readFileSync(join(HERE, "..", "source", "timings.json"), "utf8"));
const DRY = !!process.env.DRY; // DRY=1 steps the clock and runs every scene but writes no frames (a quick check that the scenes fit their lines)
const FRAMES = process.env.FRAMES ?? "/tmp/home-clips/frames";

/**
 * Records one video. `setup(h)` runs untimed (no frames) to get the first screen ready; `scenes[i](h)` is the footage
 * under voiceover line i. A scene may call h.cut(async () => …) to change screens without recording the load.
 */
export async function record(name, setup, scenes, opts = {}) {
  const lines = TIMINGS[name];
  if (!lines) throw new Error(`No timings for ${name}`);
  if (lines.length !== scenes.length) throw new Error(`${name}: ${lines.length} lines but ${scenes.length} scenes`);
  const raw = join(FRAMES, name);
  rmSync(raw, { recursive: true, force: true });
  mkdirSync(raw, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    storageState: {
      cookies: [],
      origins: [{
        origin: BASE,
        localStorage: [
          { name: "nextplay.tier.v1", value: "solo" },
          { name: "grid1ronvault.tour.v1", value: "1" },
          { name: "grid1ronvault.filmtips.v1", value: "seen" },
          { name: "grid1ronvault.tips.v1", value: JSON.stringify({ off: true }) },
          { name: "grid1ronvault.guides.v1", value: JSON.stringify({ seen: ["designer", "vault", "wristbands", "grid", "coverage", "practice", "drills", "roster", "playbooks"] }) },
          ...(opts.storage ?? []),
        ],
      }],
    },
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept().catch(() => undefined));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // The Vault first, in real time, so the Ready-to-Go playbook is there for every scene.
  await page.goto(`${BASE}/vault`);
  const ready = page.getByRole("button", { name: /^Add all \d+/ });
  await ready.first().waitFor({ timeout: 15000 });
  await ready.first().click();
  await page.locator(".play-card").first().waitFor({ timeout: 20000 });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 2000));

  let n = 0;
  let mouse = { x: W / 2, y: H / 2 };
  const shot = async () => DRY ? void n++ : page.screenshot({ path: join(raw, `f${String(n++).padStart(5, "0")}.jpg`), type: "jpeg", quality: 90 });
  const tick = async (ms = 1000 / FPS) => page.clock.runFor(ms);
  const roll = async (sec, each) => {
    const count = Math.round(sec * FPS);
    for (let i = 0; i < count; i++) {
      if (each) await each(i / count);
      await tick();
      await shot();
    }
  };
  const quiet = async (ms = 500) => {
    for (let i = 0; i < ms / 50; i++) { await tick(50); await new Promise((r) => setTimeout(r, 15)); }
  };
  const settle = async (locator, ms = 20000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      await tick(60);
      if (!locator || (await locator.first().isVisible().catch(() => false))) return;
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`Never showed: ${locator}`);
  };
  const dress = async () =>
    page.evaluate(() => {
      if (document.getElementById("reel-ptr")) return;
      const style = document.createElement("style");
      style.textContent = `
        #reel-ptr{position:fixed;z-index:2147483647;width:30px;height:30px;margin:-3px 0 0 -3px;pointer-events:none;transition:transform .12s}
        #reel-ptr.down{transform:scale(.8)}
        #reel-ring{position:fixed;z-index:2147483646;width:44px;height:44px;margin:-22px 0 0 -22px;border:3px solid #16C8E8;border-radius:50%;pointer-events:none;opacity:0}
        #reel-ring.go{animation:reelring .45s ease-out}
        @keyframes reelring{from{opacity:.9;transform:scale(.4)}to{opacity:0;transform:scale(1.5)}}`;
      document.head.append(style);
      const ptr = document.createElement("div");
      ptr.id = "reel-ptr";
      ptr.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l15 9-7 1.6L8.6 20z" fill="#fff" stroke="#011628" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
      const ring = document.createElement("div");
      ring.id = "reel-ring";
      document.body.append(ptr, ring);
      addEventListener("mousemove", (e) => ((ptr.style.left = e.clientX + "px"), (ptr.style.top = e.clientY + "px")), true);
      addEventListener("mousedown", (e) => {
        ptr.classList.add("down");
        ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px";
        ring.classList.remove("go"); void ring.offsetWidth; ring.classList.add("go");
      }, true);
      addEventListener("mouseup", () => ptr.classList.remove("down"), true);
    });
  const centre = async (target) => {
    if (typeof target.boundingBox !== "function") return target;
    const b = await target.first().boundingBox();
    if (!b) throw new Error(`No box for ${target}`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const glide = async (target, sec = 0.5) => {
    await dress();
    const to = await centre(target);
    const from = { ...mouse };
    await roll(sec, async (f) => {
      const e = f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);
      mouse = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      await page.mouse.move(mouse.x, mouse.y);
    });
    mouse = to;
    await page.mouse.move(to.x, to.y);
  };
  /** Glides to an element (or a point) and clicks it with the real mouse, so canvas taps work too. */
  const press = async (target, sec = 0.5) => {
    await glide(target, sec);
    await roll(0.07);
    await page.mouse.down();
    await tick(60);
    await page.mouse.up();
    await roll(0.1);
  };
  /** Clicks through Playwright (for elements a mouse click can't reach reliably), with the pointer gliding there first. */
  const click = async (locator, sec = 0.5) => {
    await glide(locator, sec);
    await roll(0.07);
    await locator.first().click();
    await roll(0.1);
  };
  const type = async (text, perChar = 1 / 15) => {
    for (const ch of text) { await page.keyboard.type(ch); await roll(perChar); }
  };
  /** Changes screens untimed: the load isn't recorded, so the footage cuts. */
  const cut = async (fn) => { await fn(); await quiet(600); await dress(); await page.mouse.move(mouse.x, mouse.y); };
  const goto = async (path, ready) => cut(async () => { await page.goto(`${BASE}${path}`); await settle(ready ?? page.locator("main, .stage-frame").first()); });
  /** Every player on the field with his letter and where he is on screen. */
  const spots = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=player]"))
        .filter((g) => !g.closest('g[opacity="0.36"]'))
        .map((g) => { const r = g.getBoundingClientRect(); return { label: g.querySelector("text")?.textContent ?? "", x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  const player = async (label, nth = 0) => {
    const s = (await spots()).filter((p) => p.label === label)[nth];
    if (!s) throw new Error(`No player ${label}`);
    return { x: s.x, y: s.y };
  };
  const openDesigner = async (playName) => {
    await page.goto(`${BASE}/vault`);
    await settle(page.locator(".play-card"));
    const card = page.getByRole("button", { name: `Open ${playName} in the designer` });
    await card.first().scrollIntoViewIfNeeded();
    await card.first().click();
    await settle(page.locator(".stage-frame svg"));
    await quiet(800);
  };
  const focus = [];
  /** Zooms the footage onto a box (CSS px, any shape; widened to 16:9) over `sec`, or back to the whole screen with null. */
  const zoom = (rect, sec = 0.6) => {
    let r = null;
    if (rect) {
      let { x, y, width: w, height: hh } = rect;
      const cx = x + w / 2, cy = y + hh / 2;
      if (w / hh > W / H) hh = (w * H) / W; else w = (hh * W) / H;
      w = Math.min(W, Math.max(w, W / 2.2)); hh = (w * H) / W;
      r = { x: Math.min(Math.max(cx - w / 2, 0), W - w), y: Math.min(Math.max(cy - hh / 2, 0), H - hh), w, h: hh };
    }
    focus.push({ frame: n, sec, rect: r });
  };
  const zoomOn = async (locator, pad = 24, sec = 0.6) => {
    const b = await locator.first().boundingBox();
    if (b) zoom({ x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad }, sec);
  };
  const h = { page, zoom, zoomOn, roll, glide, press, click, type, cut, goto, settle, quiet, tick, spots, player, openDesigner, dress, get frame() { return n; }, setMouse: (p) => (mouse = p) };

  await setup(h);
  await quiet(600);
  await dress();
  await page.mouse.move(mouse.x, mouse.y);
  const overruns = [];
  for (let i = 0; i < scenes.length; i++) {
    const until = i + 1 < lines.length ? lines[i + 1].start : lines[i].end + 0.5;
    const target = Math.round(until * FPS);
    await scenes[i](h);
    if (n > target) overruns.push({ scene: i, over: +((n - target) / FPS).toFixed(2) });
    while (n < target) { await tick(); await shot(); }
  }
  await browser.close();
  const meta = { name, frames: n, fps: FPS, seconds: +(n / FPS).toFixed(2), css: { w: W, h: H, scale: SCALE }, focus, overruns, errors, dir: raw };
  writeFileSync(join(raw, "meta.json"), JSON.stringify(meta, null, 1));
  console.log(JSON.stringify(meta));
  return meta;
}
