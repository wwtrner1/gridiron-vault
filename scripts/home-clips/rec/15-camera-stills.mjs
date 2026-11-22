// One 640x360 still per Film Room camera, for the site's camera gallery (public/shots/cameras/<id>.webp, FILM_CAMERAS order).
// Plain Playwright against the frozen build, set up like the clip (Solo plan, tours off, the Ready-to-Go playbook, "17 · Stick"
// opened in the Film Room in 3D) with the page's clock paused, so every still is the same moment of the same play:
//   The read, the ball in the air (0.3 s after the throw). Two cameras pick their own shot by the lesson, so each is
//   shown where it does something its neighbours don't: "Follow the lesson" on The zones (the high end-zone shot with the zones painted in)
//   and "A camera for each moment" once the ball is caught (it cuts to the sideline).
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/15-camera-stills.mjs [id,id]
import { createRequire } from "node:module";
import { mkdirSync, rmSync, statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const p of [undefined, "/opt/node-tools/node_modules", "/opt/node22/lib/node_modules", join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "node_modules")]) {
    try { return p ? require(require.resolve("playwright", { paths: [p] })) : require("playwright"); } catch {}
  }
  throw new Error("playwright not found");
})();

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:4174";
const OUT = join(HERE, "..", "..", "..", "public", "shots", "cameras");
const RAW = "/tmp/home-clips/stills";
const IDS = ["auto", "behind", "wide", "all22", "qb", "zoom", "eyes", "sideline", "coach", "overhead", "modular", "free"];
const only = process.argv[2] ? process.argv[2].split(",") : IDS;
const MAX_KB = 44;

mkdirSync(OUT, { recursive: true });
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: Number(process.env.STILL_H ?? 868) }, // a little taller than the clip's 810 so the 3D picture is a full 16:9 inside its frame
  deviceScaleFactor: 2,
  storageState: {
    cookies: [],
    origins: [{
      origin: BASE,
      localStorage: [
        { name: "nextplay.tier.v1", value: "solo" },
        { name: "grid1ronvault.tour.v1", value: "1" },
        { name: "grid1ronvault.filmtips.v1", value: "seen" },
        { name: "grid1ronvault.tips.v1", value: JSON.stringify({ off: true }) },
        { name: "grid1ronvault.guides.v1", value: JSON.stringify({ seen: ["designer", "vault"] }) },
      ],
    }],
  },
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
if (process.env.DEBUG) {
  page.on("console", (m) => console.log("console", m.type(), m.text().slice(0, 200)));
  page.on("requestfailed", (r) => console.log("failed", r.url()));
  page.on("response", (r) => { if (/\.(js|glb)/.test(r.url())) console.log("resp", r.status(), r.url().split("/").slice(-1)[0]); });
}

await page.goto(`${BASE}/vault`);
const ready = page.getByRole("button", { name: /^Add all \d+/ });
await ready.first().waitFor({ timeout: 15000 });
await ready.first().click();
await page.locator(".play-card").first().waitFor({ timeout: 20000 });
await page.clock.install();
await page.clock.pauseAt(new Date(Date.now() + 2000));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (ms) => page.clock.runFor(ms);
// Runs the page's clock `ms` in small steps with a breath of real time between, so a software renderer keeps up.
const run = async (ms, step = 100) => { for (let t = 0; t < ms; t += step) { await tick(step); await sleep(25); } };
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { await run(100); if (await fn()) return; } throw new Error("timed out"); };

await page.goto(`${BASE}/vault`);
await until(() => page.locator(".play-card").first().isVisible());
await page.getByRole("button", { name: "Open 17 · Stick in the designer" }).first().click();
await until(() => page.locator(".stage-frame svg").first().isVisible());
await run(600);
await page.locator('button[aria-controls="dz-menu-teach"]').click();
await page.locator("#dz-menu-teach").getByRole("button", { name: "Film Room: teach this play" }).click();
await until(() => page.locator(".fr-steps button").first().isVisible());
await page.locator(".fr-views button", { hasText: /^3D$/ }).click();
const canvas = page.locator(".fr-3d canvas");
await until(async () => (await canvas.getAttribute("data-athlete").catch(() => null)) === "model", 240000).catch(async (e) => {
  console.log("athlete", await canvas.evaluate((c) => JSON.stringify(c.dataset)).catch(() => "no canvas"), errors);
  await page.screenshot({ path: "/tmp/home-clips/stills/debug.png" });
  throw e;
});
await run(800);

const camera = page.locator('label[data-fr-tip="camera"] select');
const step = (n) => page.locator(".fr-steps button").nth(n);
const clock = async () => parseFloat(((await page.locator(".fr-clock").textContent()) ?? "0").split(" ")[0]);
// Lets the camera finish its ease: the stage stops drawing when it arrives, so its frame count stops moving.
const settle = async () => {
  let last = -1, same = 0;
  for (let i = 0; i < 80 && same < 3; i++) {
    await run(100);
    const n = Number(await canvas.getAttribute("data-frames"));
    same = n === last ? same + 1 : 0;
    last = n;
  }
};
const pause = () => page.getByRole("button", { name: "Pause" }).click();
const play = () => page.getByRole("button", { name: /^Play (the lesson|it again)$/ }).click();

const hashes = new Map();
const results = [];
async function shoot(id, detail) {
  await settle();
  const png = join(RAW, `${id}.png`);
  // The field's frame, inside its border: what a coach sees of the 3D picture (the canvas itself can be taller than its frame).
  const fb = await page.locator(".fr-field").boundingBox();
  await page.screenshot({ path: png, clip: { x: fb.x + 1, y: fb.y + 1, width: fb.width - 2, height: fb.height - 2 } });
  const webp = join(OUT, `${id}.webp`);
  // 640x360 from the 16:9 canvas (centre-cropped if the field's box is a hair off 16:9), quality stepped down to fit the budget.
  const py = `
import sys
from PIL import Image
src, dst, maxkb = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert("RGB")
w, h = im.size
want = 16 / 9
if abs(w / h - want) > 0.004:
    if w / h > want: nw = round(h * want); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = round(w / want); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
im = im.resize((640, 360), Image.LANCZOS)
import os
for q in range(84, 30, -4):
    im.save(dst, "WEBP", quality=q, method=6)
    if os.path.getsize(dst) <= maxkb * 1024: break
print(q, os.path.getsize(dst))
`;
  const out = execFileSync("python3", ["-I", "-c", py, png, webp, String(MAX_KB)]).toString().trim();
  const sig = createHash("md5").update(readFileSync(webp)).digest("hex");
  const dup = [...hashes].find(([, v]) => v === sig)?.[0];
  hashes.set(id, sig);
  const dataset = await canvas.evaluate((c) => ({ camera: c.dataset.camera, shot: c.dataset.shot, side: c.dataset.side, follow: c.dataset.follow }));
  results.push({ id, frame: `${Math.round(fb.width - 2)}x${Math.round(fb.height - 2)}`, kb: Math.round(statSync(webp).size / 1024), q: out, ...dataset, clock: await clock(), detail, dup });
  console.log(JSON.stringify(results.at(-1)));
}

// "Follow the lesson" first, on The zones.
if (only.includes("auto")) {
  await camera.selectOption("auto");
  await step(1).click();
  await run(200);
  await shoot("auto", "The zones step (the lesson's own camera: the high end-zone shot with the zones painted in)");
}

// The read, the ball in the air: ride the lesson to 0.3 s after the throw, then hold it there.
await step(4).click();
await camera.selectOption("behind");
await play();
// The read holds still for 3.4 s on the throw, then runs at half speed: 4.0 s in is 0.3 s of play after the throw.
await run(4000);
await pause();
console.log("The read paused at", await clock(), "s after the snap");
if (process.env.LAYOUT) {
  // Where the Film Room's parts sit on the 1440x810 screen (for choosing the clip's crops), and one full screenshot.
  await camera.selectOption("behind");
  await settle();
  const boxes = await page.evaluate(() => Object.fromEntries([".fr", ".fr-field", ".fr-top", ".fr-views", ".fr-body", ".fr-main", ".fr-3d", ".fr-cap", ".fr-bar", 'label[data-fr-tip="camera"]', ".fr-steps", ".fr-side-panel", ".fr-clock"].map((q) => {
    const e = document.querySelector(q); if (!e) return [q, null];
    const r = e.getBoundingClientRect(); return [q, [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]];
  })));
  console.log("LAYOUT", JSON.stringify(boxes));
  await page.screenshot({ path: join(RAW, "_full.png") });
}

for (const id of only) {
  if (id === "auto" || id === "modular") continue;
  await camera.selectOption(id);
  await shoot(id, "The read, ball in the air");
}

if (only.includes("modular")) {
  // Let the play run on to the catch: the moment-by-moment camera has cut to the sideline by then.
  await camera.selectOption("modular");
  await play();
  await run(1400); // 0.7 s of play at half speed: the ball is in the receiver's hands
  await pause();
  await shoot("modular", `after the catch (the moment camera cuts to the sideline) at ${await clock()} s`);
}

await browser.close();
const dups = results.filter((r) => r.dup);
console.log(JSON.stringify({ made: results.length, errors, dups: dups.map((d) => `${d.id}=${d.dup}`), over: results.filter((r) => r.kb > MAX_KB).map((r) => r.id) }));
