// 07-precision-drawing: "Precision Drawing" (take 22.9 s). Six lines (../source/timings.json):
//   1 "Clean plays read faster. Here's how to draw them clean."               the Designer on 17 · Stick, the camera on the play; the pointer traces X, then each route
//   2 "Open Field controls. Snap to the grid, and every player lines up."     Field → Field controls; Snap to grid Medium then Coarse; Escape; X dragged with a wobbling hand and stepping in grid steps
//   3 "Pick your hash marks, and turn the yard lines up or down."             Field controls opened again; Hash marks College then Pro, Yard lines Soft then High (the field changes at each pick)
//   4 "Right click any route to change the line, the weight, the color, or the end."   right-click C's route; the Selected element menu; Dashed, Thick, Red, Arrow at the end off
//   5 "Turn on route depths, and every break shows its yards."                Edit → Route depths; the yard label on every break, the pointer pointing at each
//   6 "Sharp on the screen. Sharp on the wristband."                          the field, then the Wristbands page of the same playbook at 4 plays a card (2x2), Yards at each route break ticked, card E with 17 · Stick
// Everything is the real app over sample data (the Ready-to-Go 5v5 playbook the recorder adds). One setup change: the starter's five players are one group, so the
// play is ungrouped in the saved workspace (a coach who has ungrouped a play), so that dragging X moves only X. Nothing needs an account, so there are no mocks.
// The Ask Griddy launcher is kept out of the picture. The Designer is left with unsaved changes on purpose, and the Wristbands page is opened by address, so the card
// shows the play as saved.
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/07-precision-drawing.mjs   (DRY=1 for timing only, SNAPS=1 for stills in /tmp/home-clips/07)
import { mkdirSync } from "node:fs";
import { record, BASE } from "./lib.mjs";

const SNAPS = !!process.env.SNAPS;
if (SNAPS) mkdirSync("/tmp/home-clips/07", { recursive: true });
const snap = async (h, name) => {
  if (process.env.DRY) console.log(`  ${name} at frame ${h.frame} (${(h.frame / 30).toFixed(2)} s)`);
  if (SNAPS) await h.page.screenshot({ path: `/tmp/home-clips/07/${name}.png`, scale: "css" });
};

const STICK = "17 · Stick";
const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f));

// Camera boxes (CSS px of the 1440x810 screen). The caption bar covers the bottom quarter of whatever the camera shows, so the action stays in the top three quarters.
const POSE = {
  play: { x: 330, y: 330, width: 760, height: 428 },
  top: { x: 250, y: 0, width: 780, height: 439 },
  panel: { x: 620, y: 50, width: 820, height: 461 },
  field: { x: 290, y: 330, width: 700, height: 394 },
  wide: { x: 330, y: 0, width: 1110, height: 625 },
  hash: { x: 520, y: 190, width: 920, height: 518 },
  route: { x: 420, y: 392, width: 700, height: 394 },
  edit: { x: 260, y: 0, width: 700, height: 394 },
  depths: { x: 400, y: 350, width: 670, height: 377 },
  depths2: { x: 410, y: 360, width: 654, height: 368 },
  card: { x: 270, y: 120, width: 920, height: 518 },
  stick: { x: 520, y: 190, width: 700, height: 394 },
};
// Where each scene must end (frames), from the line starts in timings.json: 118, 257, 364, 503, 602, 701.
const TARGETS = [118, 257, 364, 503, 602, 701];
const timed = (scenes) => scenes.map((fn, i) => async (h) => {
  await fn(h);
  if (process.env.DRY) console.log(`scene ${i + 1} ends at frame ${h.frame} of ${TARGETS[i]} (${((TARGETS[i] - h.frame) / 30).toFixed(2)} s spare)`);
});
/** Rolls frames until the clip reaches frame `f` (a cue). */
const until = async (h, f) => { while (h.frame < f) await h.roll(1 / 30); };

// The pointer, tracked here because the recorder keeps its own copy private.
let cur = { x: 1200, y: 330 };
const centerOf = async (target) => {
  if (typeof target.boundingBox !== "function") return target;
  const b = await target.first().boundingBox();
  if (!b) throw new Error(`No box for ${target}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function glide(h, target, sec, off = { x: 0, y: 0 }) {
  const c = await centerOf(target);
  const to = { x: c.x + off.x, y: c.y + off.y };
  await h.glide(to, sec);
  cur = to;
  return to;
}
/** A quick click: glide there, press and let go, a beat to see it land. */
async function tap(h, target, sec = 0.25, hold = 0.07) {
  await glide(h, target, sec);
  await h.page.mouse.down();
  await h.tick(40);
  await h.page.mouse.up();
  await h.roll(hold);
}
/** Moves the pointer by hand over `sec`, calling `each(eased)` every frame (a drag, a scroll). `wob` adds a hand's wobble (px) that dies away at the end. */
async function sweep(h, to, sec, each, wob = 0) {
  const from = { ...cur };
  await h.roll(sec, async (f) => {
    const e = ease(f);
    if (each) await each(e);
    const w = wob * Math.sin(f * Math.PI * 5) * (1 - f);
    await h.page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e + w);
  });
  await h.page.mouse.move(to.x, to.y);
  h.setMouse(to);
  cur = to;
}
/** The middle of the longest route on the field, on screen (C's cross on Stick). */
const routeSpot = (p) => p.evaluate(() => {
  let best = null;
  Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=path]")).forEach((g) => {
    if (g.getAttribute("pointer-events") === "none") return;
    const el = g.querySelector('path[fill="none"]');
    const len = el.getTotalLength();
    if (!best || len > best.len) { const q = el.getPointAtLength(len / 2).matrixTransform(el.getScreenCTM()); best = { len, x: q.x, y: q.y }; }
  });
  return best;
});
const click = async (h) => {
  await h.page.mouse.down();
  await h.tick(40);
  await h.page.mouse.up();
};

await record(
  "07-precision-drawing",
  async (h) => {
    const p = h.page;
    await p.context().addInitScript(() => {
      const css = ".gd-launch{display:none !important}";
      const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); };
      if (document.head) add(); else addEventListener("DOMContentLoaded", add);
    });
    // The starter's players are one group; ungroup the play so a drag moves one player.
    await p.evaluate(() => {
      const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1"));
      const play = ws.plays.find((x) => /Stick/.test(x.name));
      play.scene.nodes.forEach((n) => { n.groupId = null; });
      localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
    });
    await h.openDesigner(STICK);
    await h.quiet(400);
    h.setMouse(cur);
    await p.mouse.move(cur.x, cur.y);
  },
  timed([
    // 1: Clean plays read faster. Here's how to draw them clean.
    async (h) => {
      const p = h.page;
      const routes = await p.evaluate(() =>
        Array.from(document.querySelectorAll(".stage-frame svg g[data-kind=path]"))
          .filter((g) => g.getAttribute("pointer-events") !== "none")
          .map((g) => {
            const el = g.querySelector('path[fill="none"]');
            const len = el.getTotalLength();
            const m = el.getScreenCTM();
            const end = el.getPointAtLength(len).matrixTransform(m);
            return { len, ex: end.x, ey: end.y, stroke: el.getAttribute("stroke") };
          }));
      // Stick: Y's cyan first read, Z's black corner-out, C's black cross (the longest).
      const byColor = routes.filter((r) => r.stroke !== "#0FA8C4");
      const cRoute = [...byColor].sort((a, b) => b.len - a.len)[0];
      const zRoute = byColor.find((r) => r !== cRoute);
      const yRoute = routes.find((r) => r.stroke === "#0FA8C4");
      h.zoom(null, 0);
      await h.roll(0.3);
      h.zoom(POSE.play, 0.9);
      await glide(h, await h.player("X"), 0.95);
      await glide(h, await h.player("C"), 0.35);
      await glide(h, { x: cRoute.ex + 6, y: cRoute.ey + 10 }, 0.3);
      await glide(h, await h.player("Y"), 0.3);
      await glide(h, { x: yRoute.ex + 6, y: yRoute.ey + 10 }, 0.25);
      await glide(h, await h.player("Z"), 0.3);
      await glide(h, { x: zRoute.ex + 6, y: zRoute.ey + 10 }, 0.25);
      await snap(h, "s1a");
      h.zoom(POSE.top, 0.65);
      await glide(h, p.locator('button[aria-controls="dz-menu-field"]'), 0.85);
    },
    // 2: Open Field controls. Snap to the grid, and every player lines up.
    async (h) => {
      const p = h.page;
      const dlg = p.getByRole("dialog", { name: "Field controls" });
      const chip = (group, name) => dlg.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: true });
      await click(h);
      await h.roll(0.07);
      h.zoom(POSE.panel, 0.7);
      await tap(h, p.locator("#dz-menu-field").getByRole("button", { name: "Field controls: grid, hashes, rule lines" }), 0.3);
      await dlg.waitFor();
      await h.roll(0.2);
      await snap(h, "s2a");
      await tap(h, chip("Snap to grid", "Medium"), 0.4, 0.2);
      await snap(h, "s2b");
      await tap(h, chip("Snap to grid", "Coarse"), 0.2, 0.3);
      await snap(h, "s2c");
      // Close the panel, then drag X with a shaky hand: he steps from grid point to grid point and the shake never shows.
      await p.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden" });
      h.zoom(POSE.field, 0.45);
      const x = await h.player("X");
      await glide(h, x, 0.4);
      await p.mouse.down();
      await h.tick(40);
      await sweep(h, { x: x.x - 78, y: x.y + 2 }, 0.85, null, 9);
      await snap(h, "s2d");
      await p.mouse.up();
      await h.roll(0.25);
      // Back to the Field menu for the next picks.
      h.zoom(POSE.wide, 0.5);
      await glide(h, p.locator('button[aria-controls="dz-menu-field"]'), 0.45);
      await click(h);
      await h.roll(0.07);
      await snap(h, "s2e");
      await tap(h, p.locator("#dz-menu-field").getByRole("button", { name: "Field controls: grid, hashes, rule lines" }), 0.2, 0.05);
      await dlg.waitFor();
      h.zoom(POSE.hash, 0.6);
      await glide(h, chip("Hash marks", "College"), 0.4);
    },
    // 3: Pick your hash marks, and turn the yard lines up or down.
    async (h) => {
      const p = h.page;
      const dlg = p.getByRole("dialog", { name: "Field controls" });
      const chip = (group, name) => dlg.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: true });
      await click(h);
      await h.roll(0.45);
      await snap(h, "s3a");
      await tap(h, chip("Hash marks", "Pro"), 0.2, 0.45);
      await snap(h, "s3b");
      await tap(h, chip("Yard lines", "Soft"), 0.25, 0.45);
      await snap(h, "s3c");
      await tap(h, chip("Yard lines", "High"), 0.2, 0.5);
      await snap(h, "s3d");
      await p.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden" });
      // Already on the way to the route for the next line.
      h.zoom(POSE.route, 0.7);
      const route = await routeSpot(p);
      await glide(h, route, 0.7);
    },
    // 4: Right click any route to change the line, the weight, the color, or the end.
    async (h) => {
      const p = h.page;
      const route = await routeSpot(p);
      const menu = p.getByRole("menu", { name: "Selected element" });
      const item = (name) => menu.getByRole("menuitemcheckbox", { name, exact: true });
      /** Right-click the route, scroll the menu `scrollBy` px so the pick sits high in the picture, and click it. */
      const pick = async (name, scrollBy, glideSec, look = 0) => {
        await glide(h, route, glideSec);
        await p.mouse.click(route.x, route.y, { button: "right" });
        await h.roll(0.14);
        await menu.waitFor();
        await h.roll(look);
        if (look) await snap(h, "s4menu");
        const b = await item(name).boundingBox();
        const to = { x: b.x + b.width / 2 - 30, y: b.y + b.height / 2 - scrollBy };
        const from = await menu.evaluate((el) => el.scrollTop);
        await sweep(h, to, 0.32, async (e) => { await menu.evaluate((el, y) => { el.scrollTop = y; }, from + scrollBy * e); });
        await click(h);
        await h.roll(0.27);
      };
      await pick("Dashed", 0, 0.04, 0.5);
      await snap(h, "s4a");
      await pick("Thick", 80, 0.2);
      await snap(h, "s4b");
      await pick("Red", 160, 0.2);
      await snap(h, "s4c");
      await pick("Arrow at the end", 240, 0.2);
      await snap(h, "s4d");
      // Click empty field to put the selection away.
      await tap(h, { x: 900, y: 300 }, 0.2, 0.05);
    },
    // 5: Turn on route depths, and every break shows its yards.
    async (h) => {
      const p = h.page;
      h.zoom(POSE.edit, 0.5);
      await glide(h, p.locator('button[aria-controls="dz-menu-edit"]'), 0.35);
      await click(h);
      await h.roll(0.07);
      await tap(h, p.locator("#dz-menu-edit").getByRole("button", { name: "Route depths: off" }), 0.22, 0.05);
      h.zoom(POSE.depths, 0.6);
      await h.roll(0.3);
      const labels = p.locator(".stage-frame svg g[pointer-events=none][aria-hidden=true] text");
      const n = await labels.count();
      if (process.env.DRY) console.log(`  ${n} depth labels`);
      await snap(h, "s5a");
      // Point at each yard label from below and to the right, so the number stays clear.
      for (let i = 0; i < n; i++) await glide(h, labels.nth(i), 0.62, { x: 22, y: 26 });
      await snap(h, "s5b");
    },
    // 6: Sharp on the screen. Sharp on the wristband.
    async (h) => {
      const p = h.page;
      const bookId = await p.evaluate(() => JSON.parse(localStorage.getItem("snapline.workspace.v1")).playbooks[0].id);
      // "Sharp on the screen": a slow push in on the labelled routes.
      h.zoom(POSE.depths2, 1.0);
      const labels = p.locator(".stage-frame svg g[pointer-events=none][aria-hidden=true] text");
      await glide(h, labels.nth(1), 0.55, { x: 22, y: 26 });
      await glide(h, labels.nth(0), 0.5, { x: 22, y: 26 });
      await glide(h, labels.nth(2), 0.4, { x: 22, y: 26 });
      await snap(h, "s6a");
      // "Sharp on the wristband": the Wristbands page at 4 plays a card, so each box is big, card E with 17 · Stick.
      await h.cut(async () => {
        await p.goto(`${BASE}/wristbands?source=book:${bookId}`);
        await h.settle(p.locator(".wb-card").first());
        await p.getByLabel("Actual size").uncheck();
        await p.getByRole("button", { name: /^4 2×2/ }).first().click();
        await h.quiet(500);
        await p.evaluate(() => document.querySelectorAll(".wb-card")[4].scrollIntoView({ block: "center" }));
        await h.quiet(500);
      });
      h.zoom(POSE.card, 0);
      cur = { x: 330, y: 560 };
      h.setMouse(cur);
      await p.mouse.move(cur.x, cur.y);
      await h.roll(0.2);
      await snap(h, "s6b");
      // Tick "Yards at each route break": the same yards, now on every card.
      await tap(h, p.getByLabel("Yards at each route break"), 0.4, 0.15);
      h.zoom(POSE.stick, 1.1);
      await glide(h, { x: 450, y: 600 }, 0.45);
      await snap(h, "s6c");
    },
  ]),
);
