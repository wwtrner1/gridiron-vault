// 10-sets-and-defense: "Formations & Defenses" (take 21 s). Six lines (../source/timings.json):
//   1 "Line up faster. Formations and defenses are one click away."   the finished picture first (a set and the defense that fits it, tags on every defender) with the Sets section open in the tools
//                                                                      panel: the pointer rests on Formations and Defense (their tooltips), the camera pushes onto the tags and back out
//   2 "Open Sets, pick a formation, and drop it on the ball."          cut to a blank field: Sets opens, Formations, Trips Right picked in the list, Drop: the set lands on the ball, picked
//   3 "Flip it left or right with one switch."                        the Flip left/right switch (As drawn / Flipped): the preview mirrors, the drop is Trips Left, on the other side
//   4 "Need a look to beat? Pick a front and a coverage, and every defender gets a job."   Defense: a front, a coverage, Drop: the defense lines up with a technique, gap or coverage tag under each
//   5 "Or turn your offense into a defense, matched to the formation."  Edit → Turn this offense into a defense: the stock look is replaced by the one that fits the set (strength turned to the trips side)
//   6 "Set it. Flip it. Coach it."                                    the whole field, offense and defense, tags readable
// Everything is the real app (the Formation library and Defense library in the Designer's Sets section, the Edit menu) on a blank field, as a coach who has switched New play setup off
// opens it. It is 11-man on purpose: the Defense library's fronts are 11-man ones (4-3, 4-4, 3-4, 5-2, 3-3), so an 11-man set is the one they line up against. The line of scrimmage is
// slid up the field a little first (the LOS slider on the field) so the whole set and the defense sit above the caption bar. The camera crops are chosen so nothing that matters is under it.
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/10-sets-and-defense.mjs   (DRY=1 for timing only, SNAPS=1 for stills in /tmp/home-clips/10)
import { mkdirSync } from "node:fs";
import { record } from "./lib.mjs";

const SNAPS = !!process.env.SNAPS;
if (SNAPS) mkdirSync("/tmp/home-clips/10", { recursive: true });
const snap = async (h, name) => {
  if (process.env.MARKS) console.log("mark", name, (h.frame / 30).toFixed(2));
  if (SNAPS) await h.page.screenshot({ path: `/tmp/home-clips/10/${name}.png`, scale: "css" });
};

const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f));
// Camera crops (CSS px of the 1440x810 screen). The caption bar covers the middle half of the picture's width and the bottom 19 to 29% of its height (a longer line is a taller bar),
// so each crop keeps the set, the defense and what is being clicked out of that box (the tools panel is at the left edge, clear of it).
const C_A = { x: 0, y: 150, width: 1060, height: 596 }; // the tools panel and the field's set
const FIELD = { x: 358, y: 262, width: 655, height: 368 }; // the defense's tags (the tightest crop the recorder allows, so they read)
const FIELD2 = { x: 358, y: 272, width: 655, height: 368 }; // a little lower, to take in the empty spot clicked to clear the selection
const MENU = { x: 0, y: 0, width: 860, height: 484 }; // the Edit button and its list
const WIDE = { x: 358, y: 300, width: 655, height: 368 }; // the closing shot: the whole set, X to Z, with the defense above it
const EMPTY = { x: 905, y: 548 }; // an empty spot on the field (clicking it puts the selection down)

/** The pointer's click ring for a native select a mouse press can't drive, so the footage reads as a click. */
const ring = (p, x, y, down) =>
  p.evaluate(([x, y, down]) => {
    const t = document.elementFromPoint(x, y) ?? document.body;
    t.dispatchEvent(new MouseEvent(down ? "mousedown" : "mouseup", { bubbles: true, clientX: x, clientY: y, view: window }));
  }, [x, y, down]);
/** Glides to a native select and chooses an option by its label. */
async function pick(h, select, label, sec = 0.35) {
  await h.glide(select, sec);
  const b = await select.first().boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await ring(h.page, x, y, true);
  await h.roll(0.06);
  await select.selectOption({ label });
  await ring(h.page, x, y, false);
  await h.roll(0.1);
}
/** A token on the field by its letter (the tag letters on the defense are the real ones), else a fallback spot. */
const spot = async (h, label, fallback) => (await h.player(label).catch(() => fallback));
/** Where the pointer is now (the recorder's drawn pointer follows the real one). */
const pointer = (p) =>
  p.evaluate(() => {
    const e = document.getElementById("reel-ptr");
    const x = e ? parseFloat(e.style.left) : NaN, y = e ? parseFloat(e.style.top) : NaN;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  });
/** Scrolls the tools panel while the pointer glides to a control that will be where it is once the scroll is done; then clicks it. */
async function railMove(h, target, scrollEnd, sec, click = true) {
  const p = h.page;
  const rail = p.locator("#dz-tools");
  const set = (y) => rail.evaluate((el, y) => (el.scrollTop = y), y);
  const start = await rail.evaluate((el) => el.scrollTop);
  const max = await rail.evaluate((el) => el.scrollHeight - el.clientHeight);
  const end = Math.max(0, Math.min(scrollEnd, max));
  await set(end);
  const b = await target.first().boundingBox();
  await set(start);
  if (!b) throw new Error(`No box for ${target}`);
  const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const from = (await pointer(p)) ?? to;
  await h.dress();
  await h.roll(sec, async (f) => {
    const e = ease(f);
    await set(start + (end - start) * e);
    await p.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
  });
  await set(end);
  h.setMouse(to);
  await p.mouse.move(to.x, to.y);
  if (click) {
    await h.roll(0.07);
    await p.mouse.down();
    await h.tick(60);
    await p.mouse.up();
    await h.roll(0.1);
  }
}

await record(
  "10-sets-and-defense",
  async (h) => {
    const p = h.page;
    const sets = p.locator("#dz-tabpanel-sets");
    await h.goto("/build", p.locator(".stage-frame svg"));
    // The line of scrimmage up the field a little, so the set and its defense sit high on the screen (the slider is on the field).
    await p.locator(".dz-los input").fill("355");
    await h.quiet(300);
    // The finished picture line 1 starts on: Sets open on the Formation library, Trips Left on the ball, the defense that fits it, nothing picked.
    await p.locator("#dz-tab-sets").click();
    await sets.getByRole("button", { name: "Formations", exact: true }).click();
    await p.locator(".fl-field:has(.fl-label:text-is('Formation')) select").selectOption("Trips Right");
    await p.getByRole("group", { name: "Flip left/right" }).getByRole("button", { name: "Flipped" }).click();
    await p.getByRole("button", { name: "Drop Trips Left" }).scrollIntoViewIfNeeded();
    await p.getByRole("button", { name: "Drop Trips Left" }).click();
    await h.quiet(300);
    await p.locator('button[aria-controls="dz-menu-edit"]').click();
    await p.locator("#dz-menu-edit").getByRole("button", { name: "Turn this offense into a defense" }).click();
    await h.quiet(300);
    await p.mouse.click(EMPTY.x, EMPTY.y);
    await p.locator("#dz-tools").evaluate((el) => (el.scrollTop = 300));
    await h.quiet(400);
    await snap(h, "teaser");
    h.setMouse({ x: 760, y: 300 });
  },
  [
    // 1: Line up faster. Formations and defenses are one click away.
    async (h) => {
      const p = h.page;
      const sets = p.locator("#dz-tabpanel-sets");
      h.zoom(C_A, 0.7);
      // In from above the buttons (over the "Libraries" label), so the pointer never crosses "Your sets" and flashes its tooltip on the way to Formations.
      const fb = await sets.getByRole("button", { name: "Formations", exact: true }).first().boundingBox();
      await h.glide({ x: fb.x + fb.width / 2, y: fb.y - 34 }, 0.45);
      await railMove(h, sets.getByRole("button", { name: "Formations", exact: true }), 300, 0.25, false);
      await h.roll(0.7);
      await snap(h, "s1a");
      await railMove(h, sets.getByRole("button", { name: "Defense", exact: true }), 300, 0.4, false);
      await h.roll(0.5);
      await snap(h, "s1b");
      h.zoom(FIELD, 0.9);
      await h.glide({ x: 760, y: 330 }, 0.8);
      await h.roll(0.6);
      await snap(h, "s1c");
      h.zoom(C_A, 0.5);
      await railMove(h, sets.getByRole("button", { name: "Defense", exact: true }), 300, 0.5, false);
    },
    // 2: Open Sets, pick a formation, and drop it on the ball.
    async (h) => {
      const p = h.page;
      const sets = p.locator("#dz-tabpanel-sets");
      // Back to a blank field (untimed): the two drops undone, the library and Sets closed, the panel scrolled to the top.
      await h.cut(async () => {
        await p.keyboard.press("Control+z");
        await p.keyboard.press("Control+z");
        await p.evaluate(() => localStorage.setItem("grid1ronvault.formationLib.v1", JSON.stringify({ game: "11", personnel: "11", formation: "Doubles", flip: false })));
        // Plain clicks with no mouse events, so no click ring is left hanging on the screen when the line starts.
        await sets.getByRole("button", { name: "Formations", exact: true }).evaluate((el) => el.click());
        await p.locator("#dz-tab-sets").evaluate((el) => el.click());
        // Players is open when the line starts: opening Sets folds it (the tools panel is one accordion, one section open at a time).
        await p.locator("#dz-tab-players").evaluate((el) => el.click());
        await p.locator("#dz-tools").evaluate((el) => (el.scrollTop = 0));
      });
      await snap(h, "s2a");
      await h.press(p.locator("#dz-tab-sets"), 0.4);
      await railMove(h, sets.getByRole("button", { name: "Formations", exact: true }), 300, 0.4);
      await snap(h, "s2b");
      await pick(h, p.locator(".fl-field:has(.fl-label:text-is('Formation')) select"), "Trips Right", 0.3);
      await snap(h, "s2c");
      await railMove(h, p.getByRole("button", { name: "Drop Trips Right" }), 545, 0.4);
      await h.roll(0.25);
      await snap(h, "s2d");
      // "On the ball": the pointer goes to the center, where the set is lined up.
      await h.glide(await h.player("C"), 0.7);
    },
    // 3: Flip it left or right with one switch.
    async (h) => {
      const p = h.page;
      await h.press(p.getByRole("group", { name: "Flip left/right" }).getByRole("button", { name: "Flipped" }), 0.35);
      await snap(h, "s3a");
      await h.roll(0.2);
      // The first drop goes (Ctrl+Z) in the very instant the flipped one lands on the other side: no frame is shot in between, so the field never blinks empty.
      const drop = p.getByRole("button", { name: "Drop Trips Left" });
      await h.glide(drop, 0.3);
      await h.roll(0.07);
      await p.mouse.down();
      await h.tick(60);
      await p.keyboard.press("Control+z");
      await h.tick(60);
      await p.mouse.up();
      await h.roll(0.25);
      await snap(h, "s3b");
      await h.glide(await h.player("X"), 0.6);
    },
    // 4: Need a look to beat? Pick a front and a coverage, and every defender gets a job.
    async (h) => {
      const p = h.page;
      const sets = p.locator("#dz-tabpanel-sets");
      await railMove(h, sets.getByRole("button", { name: "Defense", exact: true }), 300, 0.4);
      await snap(h, "s4a");
      await pick(h, p.locator(".fl-field:has(.fl-label:text-is('Front')) select"), "3-4", 0.3);
      await pick(h, p.locator(".fl-field:has(.fl-label:text-is('Coverage')) select"), "Cover 2", 0.3);
      await snap(h, "s4b");
      await railMove(h, p.getByRole("button", { name: /^Drop 3-4 Cover 2/ }), 640, 0.4);
      h.zoom(FIELD2, 0.7);
      await h.roll(0.5);
      await snap(h, "s4c");
      await h.press(EMPTY, 0.5);
      await h.roll(0.2);
      await snap(h, "s4d");
      // The pointer walks the tags: the deep safety, then the line.
      await h.glide(await spot(h, "FS", { x: 685, y: 335 }), 0.6);
      await h.roll(0.15);
      await h.glide(await spot(h, "N", { x: 685, y: 440 }), 0.45);
    },
    // 5: Or turn your offense into a defense, matched to the formation.
    async (h) => {
      const p = h.page;
      h.zoom(MENU, 0.5);
      await h.press(p.locator('button[aria-controls="dz-menu-edit"]'), 0.5);
      await h.roll(0.15);
      await snap(h, "s5a");
      const item = p.locator("#dz-menu-edit").getByRole("button", { name: "Turn this offense into a defense" });
      await h.press(item, 0.35);
      h.zoom(FIELD2, 0.7);
      await h.roll(0.6);
      await snap(h, "s5b");
      await h.press(EMPTY, 0.45);
      await h.roll(0.2);
      await snap(h, "s5c");
      await h.glide(await spot(h, "FS", { x: 685, y: 335 }), 0.5);
    },
    // 6: Set it. Flip it. Coach it.
    async (h) => {
      h.zoom(WIDE, 1.0);
      // Set, flip, coach: the pointer walks the offense, then the defense's line and its deep safety, and leaves the tags clear.
      await h.glide(await h.player("C"), 0.6);
      await snap(h, "s6a");
      await h.glide(await spot(h, "N", { x: 685, y: 440 }), 0.45);
      await h.glide(await spot(h, "FS", { x: 685, y: 335 }), 0.4);
      await h.glide({ x: 950, y: 600 }, 0.5);
      await h.roll(0.3);
    },
  ],
  {
    storage: [
      { name: "grid1ronvault.newplay.v1", value: JSON.stringify({ ask: false }) },
      { name: "grid1ronvault.formationLib.v1", value: JSON.stringify({ game: "11", personnel: "11", formation: "Doubles", flip: false }) },
    ],
  },
);
