// Teaching tapes (2026-11-28): finished social videos with coaching points, one per play, from the real 3D Film Room.
//   TAPE=smash|flood|mesh BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/20-teaching-tape.mjs   (DRY=1 for a timing check)
// The lines and their start times are in ../source/timings.json under 20-tape-<tape> (the teaching-tape-writer agent's script, Glenn's take).
// Same recorder and 1440x868 screen as the camera clip (15-lib.mjs). Plays are the Ready-to-Go 5v5 pack's.
import { record } from "./15-lib.mjs";

const TAPES = {
  smash: { play: "07 · Smash", camera: "qb" },
  flood: { play: "08 · Flood", camera: "qb" },
  mesh: { play: "03 · Mesh", camera: "overhead" },
};
const key = process.env.TAPE ?? "smash";
const tape = TAPES[key];
if (!tape) throw new Error(`TAPE must be one of ${Object.keys(TAPES).join(", ")}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIELD = { x: 0, y: 66, width: 1200, height: 675 };
const TOP = { x: 0, y: 0, width: 1260, height: 709 };

const fr = (h) => h.page.locator(".fr");
const camSel = (h) => fr(h).locator('label[data-fr-tip="camera"] select');
const stepBtn = (h, n) => h.page.locator(".fr-steps button").nth(n);
const playBtn = (h) => h.page.getByRole("button", { name: /^Play (the lesson|it again)$/ });
const view = (h, name) => h.page.locator(".fr-views button", { hasText: new RegExp(`^${name}$`) });

async function modelReady(h) {
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    await h.tick(60);
    const v = await h.page.locator(".fr-3d canvas").first().getAttribute("data-athlete", { timeout: 500 }).catch(() => null);
    if (v === "model") return;
    await sleep(40);
  }
  throw new Error("The 3D players never loaded");
}
async function skip(h, ms) { await h.page.clock.fastForward(ms); await h.tick(34); await sleep(60); }
async function snapAndPlay(h) {
  await stepBtn(h, 3).click();
  await playBtn(h).click();
  await h.tick(34);
  await sleep(150);
}

let throwAt = 2;
await record(`20-tape-${key}`, async (h) => {
  await h.openDesigner(tape.play);
  await h.page.locator('button[aria-controls="dz-menu-teach"]').click();
  await h.page.locator("#dz-menu-teach").getByRole("button", { name: "Film Room: teach this play" }).click();
  await h.settle(h.page.locator(".fr-steps button"));
  await stepBtn(h, 3).click();
  const cap = (await h.page.locator(".fr-cap p").textContent()) ?? "";
  const m = cap.match(/due out at ([\d.]+)/);
  if (m) throwAt = parseFloat(m[1]);
  console.log("throwAt", throwAt);
  await stepBtn(h, 0).click();
  await view(h, "3D").click();
  await modelReady(h);
  for (const c of [tape.camera, "behind"]) { await camSel(h).selectOption(c); await h.tick(34); await sleep(120); }
  await camSel(h).selectOption("auto");
  await h.quiet(300);
  await view(h, "Flat").click();
  await h.quiet(500);
  await fr(h).locator(".fr-top > button").last().click();
  await h.quiet(800);
  h.setMouse({ x: 760, y: 330 });
}, [
  // 1 hook: open the Film Room in 3D
  async (h) => {
    h.zoom({ x: 0, y: 0, width: 760, height: 428 }, 0);
    await h.press(h.page.locator('button[aria-controls="dz-menu-teach"]'), 0.4);
    await h.press(h.page.locator("#dz-menu-teach").getByRole("button", { name: "Film Room: teach this play" }), 0.4);
    await h.settle(h.page.locator(".fr-steps button"));
    h.zoom(TOP, 0);
    await h.quiet(300);
    await h.press(view(h, "3D"), 0.45);
    await modelReady(h);
    await h.quiet(300);
    await h.roll(0.4);
  },
  // 2 the concept: the look, then the tape's camera
  async (h) => { h.zoom(FIELD, 0.6); await camSel(h).selectOption(tape.camera); await h.quiet(200); await h.roll(1.2); },
  // 3 snap, play runs
  async (h) => { await snapAndPlay(h); await skip(h, 1150); await h.roll(1.5); },
  async (h) => { await h.roll(Math.max(0.5, throwAt - 1.2)); },
  // 5 the read: jump over the held throw
  async (h) => { await skip(h, 3300); await h.roll(1.0); },
  async (h) => { await h.roll(1.2); },
  // 7 close: the whole field, tape's camera still running
  async (h) => { h.zoom(TOP, 0.8); await h.roll(1.0); },
]);
