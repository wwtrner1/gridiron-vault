// Home clip 15: "Film Room: Twelve Cameras" (the lines are in ../source/timings.json under 15-film-room-cameras).
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/15-film-room-cameras.mjs   (DRY=1 for a timing check only)
//
// The Film Room is the real one on "17 · Stick" (Ready-to-Go 5v5 playbook), flipped to 3D, with its real Camera and Player selects.
// A native <select> popup is not drawn in a screenshot, so a camera is chosen with selectOption (the select's own change event) and the
// last line shows the same select with its twelve options laid out as a list (openList), where a real click picks one.
// The lesson holds each picture still before it moves (1.2 s before the snap, 3.4 s on the throw). Those dead holds are jumped over with
// the page clock's fastForward (skip), which moves the lesson's clock and the camera's ease in one step and draws no frames.
import { record } from "./15-lib.mjs"; // lib.mjs on a 1440x868 screen (see the note at its top)

const STICK = "17 · Stick";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Crops (CSS px of the 1440x868 screen, always 16:9). The caption bar covers the bottom fifth of the picture (its middle half), so each crop
// keeps what matters above it. At 868 tall the Film Room's 3D picture is a full 16:9 inside its frame: the field is at (19,75) 974x548,
// the Camera select at (546,721) and the Snap to pass clock in the field's bottom-left corner.
const TOP = { x: 0, y: 0, width: 1260, height: 709 }; // the Film Room's top bar (View) and the whole field
const FIELD = { x: 0, y: 66, width: 1200, height: 675 }; // the whole 3D field with its clock, and the start of the steps list
const SEL = { x: 470, y: 553, width: 560, height: 315 }; // the control bar close up: Camera, Player
const LIST = { x: 380, y: 380, width: 800, height: 450 }; // the Camera select opened as a list, over the lower field

const fr = (h) => h.page.locator(".fr");
const camSel = (h) => fr(h).locator('label[data-fr-tip="camera"] select');
const playerSel = (h) => fr(h).locator(".fr-bar label", { has: h.page.locator("span", { hasText: /^Player$/ }) }).locator("select");
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

/** Jumps the page's clock forward with no frames: the lesson's clock and the camera's ease both move, then one frame is drawn. */
async function skip(h, ms) {
  await h.page.clock.fastForward(ms);
  await h.tick(34);
  await sleep(60);
}

/** Goes to the Snap step and presses Play (its 1.2 s hold, the dropback to the throw at throwAt, then The read). */
async function snapAndPlay(h) {
  await stepBtn(h, 3).click();
  await playBtn(h).click();
  await h.tick(34); // the play loop takes its first frame, so a jump after this counts from here
  await sleep(150);
}

/** The Camera select's twelve options laid out as a list just above the select, standing in for the native popup a screenshot can't show. */
async function openList(h) {
  await h.page.evaluate(() => {
    const sel = document.querySelector('label[data-fr-tip="camera"] select');
    const r = sel.getBoundingClientRect();
    sel.size = sel.options.length;
    Object.assign(sel.style, { position: "fixed", left: r.left + "px", top: "0px", width: r.width + "px", height: "auto", zIndex: "50", boxShadow: "0 12px 40px rgba(0,0,0,.6)" });
    sel.style.top = r.top - sel.getBoundingClientRect().height - 6 + "px";
  });
}
/** Where option i of the opened list sits on screen. */
const optionAt = (h, i) =>
  h.page.evaluate((k) => {
    const sel = document.querySelector('label[data-fr-tip="camera"] select');
    const r = sel.getBoundingClientRect();
    return { x: r.left + r.width * 0.45, y: r.top + ((k + 0.5) * r.height) / sel.options.length };
  }, i);

let throwAt = 2;
let reader = "Y";
const t0 = Date.now();
/** Logs when a scene starts and ends, in real seconds and in footage frames, so a slow run shows where the time goes. */
const logged = (i, fn) => async (h) => {
  console.log(`scene ${i + 1} start: frame ${h.frame}, ${((Date.now() - t0) / 1000).toFixed(0)} s in`);
  await fn(h);
  console.log(`scene ${i + 1} done:  frame ${h.frame} (${(h.frame / 30).toFixed(2)} s of footage), ${((Date.now() - t0) / 1000).toFixed(0)} s in`);
};

await record("15-film-room-cameras", async (h) => {
  await h.openDesigner(STICK);
  // Warm the Film Room, three.js and the players once (and a few cameras), then put everything back.
  await h.page.locator('button[aria-controls="dz-menu-teach"]').click();
  await h.page.locator("#dz-menu-teach").getByRole("button", { name: "Film Room: teach this play" }).click();
  await h.settle(h.page.locator(".fr-steps button"));
  await stepBtn(h, 3).click();
  const cap = (await h.page.locator(".fr-cap p").textContent()) ?? "";
  const m = cap.match(/due out at ([\d.]+)/);
  if (m) throwAt = parseFloat(m[1]);
  const who = cap.match(/eyes on (\w)/);
  if (who) reader = who[1];
  console.log("throwAt", throwAt, "first read", reader);
  await stepBtn(h, 0).click();
  await view(h, "3D").click();
  await modelReady(h);
  for (const c of ["behind", "qb", "zoom", "eyes", "overhead", "sideline", "all22", "wide"]) {
    await camSel(h).selectOption(c);
    await h.tick(34);
    await sleep(120);
  }
  console.log("players", JSON.stringify(await playerSel(h).locator("option").allTextContents().catch(() => [])));
  await camSel(h).selectOption("auto");
  await h.quiet(200);
  await view(h, "Flat").click();
  await h.quiet(500);
  await fr(h).locator(".fr-top > button").last().click();
  await h.quiet(800);
  h.setMouse({ x: 760, y: 330 });
}, [

  // 1. Teach any play in the Film Room, now from twelve different cameras.
  async (h) => {
    const teach = h.page.locator('button[aria-controls="dz-menu-teach"]');
    const t = await teach.boundingBox();
    h.zoom({ x: t.x - 300, y: 0, width: 760, height: 428 }, 0);
    await h.press(teach, 0.4);
    await h.roll(0.2);
    await h.press(h.page.locator("#dz-menu-teach").getByRole("button", { name: "Film Room: teach this play" }), 0.4);
    await h.settle(h.page.locator(".fr-steps button"));
    h.zoom(TOP, 0); // the Film Room is open: its first frame is already framed
    await h.quiet(300);
    await h.roll(0.3);
    await h.press(view(h, "3D"), 0.45);
    await modelReady(h);
    await h.quiet(400);
    await h.roll(0.5);
    h.zoom(SEL, 0.5);
    await h.glide(camSel(h), 0.55);
    await h.roll(0.3);
  },
  // 2. Start behind the offense, and watch the whole play unfold.
  async (h) => {
    h.zoom(FIELD, 0.6);
    await camSel(h).selectOption("behind");
    await snapAndPlay(h);
    await skip(h, 200);
    await h.roll(1.0); // the camera glides in behind the line, the rest of the hold
    await h.roll(throwAt); // the dropback and the routes, to the throw
    await skip(h, 3300); // The read holds the throw still: jumped over
    await h.roll(0.4); // the ball leaves his hand
  },
  // 3. Jump to the quarterback cam, and ride with him to the throw.
  async (h) => {
    await camSel(h).selectOption("qb");
    await snapAndPlay(h);
    await skip(h, 1150); // the hold: a jump cut to the quarterback
    await h.roll(throwAt); // he drops back and the camera rides with him; the Snap to pass clock runs
    await skip(h, 3300); // the throw holds still: the camera swings to the ball meanwhile
    await h.roll(0.9); // the ball in the air
  },
  // 4. Go wide, high above the end zone, to the sideline, or straight overhead.
  async (h) => {
    await camSel(h).selectOption("wide");
    await snapAndPlay(h);
    await skip(h, 1150);
    await h.roll(1.0);
    await camSel(h).selectOption("all22");
    await h.roll(1.0);
    await camSel(h).selectOption("sideline");
    await skip(h, 3300);
    await h.roll(1.1);
    await camSel(h).selectOption("overhead");
    await h.roll(1.2);
  },
  // 5. Follow any one player, or look through his helmet.
  async (h) => {
    h.zoom(SEL, 0.35);
    await camSel(h).selectOption("zoom");
    await h.quiet(150);
    const pick = await playerSel(h).locator("option").evaluateAll((os, letter) => os.find((o) => o.textContent.trim() === letter)?.value ?? "", reader);
    await h.glide(playerSel(h), 0.4);
    await playerSel(h).selectOption(pick); // the first read, picked by name
    await h.roll(0.1);
    h.zoom(FIELD, 0.4);
    await snapAndPlay(h);
    await skip(h, 1150);
    await h.roll(0.8); // the camera follows him up the field
    await camSel(h).selectOption("eyes");
    await h.roll(0.25); // and now through his helmet
    await h.press(h.page.getByRole("button", { name: "Turn right" }), 0.4); // turned with the buttons on the field
    await h.roll(0.1);
  },
  // 6. One play. Twelve ways to teach it.
  async (h) => {
    h.zoom(LIST, 0.5);
    await camSel(h).selectOption("behind");
    await snapAndPlay(h);
    await skip(h, 800);
    await openList(h);
    await h.roll(0.35);
    await h.glide(await optionAt(h, 1), 0.45);
    await h.press(await optionAt(h, 8), 0.6); // a click on "Coach cam (press box)" in the list
    if ((await camSel(h).inputValue()) !== "coach") {
      console.log("the click on the list did not pick; the same change through selectOption");
      await camSel(h).selectOption("coach");
    }
    await h.roll(0.4);
  },
].map((fn, i) => logged(i, fn)));
