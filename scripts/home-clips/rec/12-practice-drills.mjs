// 12-practice-drills: "Practice & Drill Vault" (take 19.8 s). Six lines (../source/timings.json):
//   1 "A good practice is planned to the minute."                               Practice page: the hero, a start time typed, the clock fills in (Ends tile)
//   2 "Build your script in timed periods, and watch the clock add up."         + on Warm-up and Individual: Total, Ends, the clocks and the timeline follow; a period renamed
//   3 "Drop in plays from your Vault, one at a time, or a whole playbook."      Add a play (Skelly) twice, Add a playbook (Team): the plays appear
//   4 "Open the Drill Vault for animated drills with coaching points."          Drill Vault tab, Trail Technique opened: the diagram plays, Coaching points beside it
//   5 "Add a drill to tonight's practice, right from the Drill Vault."          Add to practice… in the drill's footer, the toast, then Practice with the drill in Individual
//   6 "Then print the script, and the scout cards."                             Print script preview, then Print scout cards preview
// Everything is the real app over sample data: the Ready-to-Go 5v5 Playbook plus a small "Trips Package" playbook (six of its plays, written into the
// browser's workspace the way the app saves a playbook, so the printouts stay short), and a script named for the night. The "Add to practice…" and "+ Add a
// play…" lists are native selects, so the footage shows the pointer going to them and the result landing (a browser draws a select's open list outside the page).
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/12-practice-drills.mjs   (DRY=1 for timing only, SNAPS=1 for stills in /tmp/home-clips/12)
import { mkdirSync } from "node:fs";
import { record, BASE } from "./lib.mjs";

const SNAPS = !!process.env.SNAPS;
if (SNAPS) mkdirSync("/tmp/home-clips/12", { recursive: true });
const snap = async (h, name) => {
  if (process.env.MARKS) console.log("mark", name, (h.frame / 30).toFixed(2));
  if (SNAPS) await h.page.screenshot({ path: `/tmp/home-clips/12/${name}.png`, scale: "css" });
};

const NOW = "2026-11-20T00:00:00.000Z";
const SCRIPT = {
  name: "Tuesday: install Trips",
  start: "",
  periods: [
    { id: "per_warm", title: "Warm-up", minutes: 10, note: "Dynamic stretch, throwing", playIds: [], drillIds: [], kind: "warmup" },
    { id: "per_ind", title: "Individual", minutes: 15, note: "Routes on air, QB and center exchanges", playIds: [], drillIds: [], kind: "individual" },
    { id: "per_skelly", title: "Skelly", minutes: 15, note: "Offense vs. no defense", playIds: [], drillIds: [], kind: "group" },
    { id: "per_team", title: "Team", minutes: 20, note: "Full speed vs. scout look", playIds: [], drillIds: [], kind: "team" },
    { id: "per_sit", title: "Situational", minutes: 10, note: "Red zone, third down, last play", playIds: [], drillIds: [], kind: "team" },
  ],
  updatedAt: NOW,
};
const TRIPS = ["07 · Smash", "08 · Flood", "09 · Spot", "10 · Scissors", "11 · Trips Bubble Screen", "12 · Trips Cross Go"];

/** The pointer's click ring for a control a mouse press can't drive (a native select), so the footage reads as a click. */
const ring = (p, x, y, down) =>
  p.evaluate(([x, y, down]) => {
    const t = document.elementFromPoint(x, y) ?? document.body;
    t.dispatchEvent(new MouseEvent(down ? "mousedown" : "mouseup", { bubbles: true, clientX: x, clientY: y, view: window }));
  }, [x, y, down]);

/** Glides to a native select and chooses an option by its label. */
async function pick(h, select, label, sec = 0.4) {
  await h.glide(select, sec);
  const b = await select.first().boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await ring(h.page, x, y, true);
  await h.roll(0.08);
  await select.selectOption({ label });
  await ring(h.page, x, y, false);
  await h.roll(0.12);
}

const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f));
/** Scrolls the page smoothly (one step per frame) to `to`. */
async function scrollGlide(h, to, sec) {
  const from = await h.page.evaluate(() => window.scrollY);
  await h.roll(sec, async (f) => {
    await h.page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), from + (to - from) * ease(f));
  });
  await h.page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), to);
}
/** Types two characters a frame. */
async function typeFast(h, text) {
  for (let i = 0; i < text.length; i += 2) {
    await h.page.keyboard.type(text.slice(i, i + 2));
    await h.roll(1 / 30);
  }
}

await record(
  "12-practice-drills",
  async (h) => {
    const p = h.page;
    // The Ask Griddy launcher sits over the corner of these screens; this clip is about practice, so it stays out of the picture.
    await p.context().addInitScript(() => {
      const css = ".gd-launch{display:none !important}";
      const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); };
      if (document.head) add(); else addEventListener("DOMContentLoaded", add);
    });
    // A second, small playbook beside the Ready-to-Go one, and the night's script (saved the way the Practice page saves it).
    await p.evaluate(([script, trips]) => {
      const ws = JSON.parse(localStorage.getItem("snapline.workspace.v1"));
      const ids = trips.map((n) => ws.plays.find((x) => x.name === n)?.id).filter(Boolean);
      if (ids.length !== trips.length) throw new Error("A Trips play is missing from the Vault");
      ws.playbooks.push({ id: "book_trips_package", name: "Trips Package", description: "The Trips sets and the routes that go with them.", color: "#16C8E8", isPublic: false, updatedAt: new Date().toISOString(), playIds: ids });
      localStorage.setItem("snapline.workspace.v1", JSON.stringify(ws));
      localStorage.setItem("grid1ronvault.practice.v1", JSON.stringify(script));
    }, [SCRIPT, TRIPS]);
    await h.goto("/practice", p.locator(".pr-period"));
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await h.quiet(400);
    h.setMouse({ x: 1100, y: 420 });
  },
  [
    // 1: A good practice is planned to the minute.
    async (h) => {
      const p = h.page;
      h.zoom({ x: 254, y: 100, width: 1164, height: 655 }, 0);
      await h.roll(0.3);
      const time = p.getByLabel("Start time", { exact: true });
      const tb = await time.boundingBox();
      await h.press({ x: tb.x + 17, y: tb.y + tb.height / 2 }, 0.45);
      await typeFast(h, "0600P");
      await p.evaluate(() => document.activeElement?.blur());
      await h.roll(0.35);
      await snap(h, "s1a");
      await h.glide(p.locator(".pr-stats div").nth(1), 0.9);
      await h.roll(0.15);
      await snap(h, "s1b");
      await snap(h, "end1");
    },
    // 2: Build your script in timed periods, and watch the clock add up.
    async (h) => {
      const p = h.page;
      await h.press(p.getByRole("button", { name: "Five minutes more for Warm-up" }), 0.5);
      await h.roll(0.2);
      await h.press(p.getByRole("button", { name: "Five minutes more for Individual" }), 0.45);
      await h.roll(0.15);
      await snap(h, "s2a");
      await h.press(p.getByRole("button", { name: "Five minutes more for Individual" }), 0.12);
      await h.roll(0.2);
      await snap(h, "s2b");
      const name = p.getByRole("region", { name: "Warm-up" }).getByLabel("Period name");
      await h.press(name, 0.4);
      await p.keyboard.press("Control+a");
      await typeFast(h, "Dynamic warm-up");
      await h.roll(0.3);
      await snap(h, "s2c");
      await snap(h, "end2");
    },
    // 3: Drop in plays from your Vault, one at a time, or a whole playbook.
    async (h) => {
      const p = h.page;
      h.zoom({ x: 254, y: 104, width: 1164, height: 655 }, 0.5);
      await scrollGlide(h, 718, 0.5);
      const skelly = p.getByRole("region", { name: "Skelly" });
      await pick(h, skelly.getByLabel("Add a play to Skelly"), "03 · Mesh", 0.6);
      await snap(h, "s3a");
      await h.roll(0.3);
      await pick(h, skelly.getByLabel("Add a play to Skelly"), "06 · Four Verticals", 0.45);
      await snap(h, "s3b");
      // Scroll on so the playbook lands in the upper part of the picture, clear of the caption bar.
      await scrollGlide(h, 890, 0.45);
      const team = p.getByRole("region", { name: "Team" });
      await pick(h, team.getByLabel("Add a playbook to Team"), "Trips Package (6)", 0.35);
      await snap(h, "s3c");
      await scrollGlide(h, 950, 0.9);
      await snap(h, "end3");
    },
    // 4: Open the Drill Vault for animated drills with coaching points.
    async (h) => {
      const p = h.page;
      h.zoom(null, 0.4);
      await h.press(p.getByRole("navigation", { name: "Practice tabs" }).getByRole("link", { name: "Drill Vault" }), 0.5);
      await h.cut(async () => {
        await h.settle(p.locator(".dr-card").first());
        await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      });
      await h.roll(0.15);
      await snap(h, "s4a");
      await h.press(p.getByRole("button", { name: "Open Wave Drill" }), 0.5);
      await h.settle(p.getByRole("dialog", { name: "Wave Drill" }));
      h.zoom({ x: 100, y: 70, width: 1240, height: 698 }, 0.45);
      await h.roll(0.5);
      await snap(h, "s4b");
      await h.glide(p.getByRole("heading", { name: "Coaching points" }), 0.5);
      await h.roll(0.2);
      await snap(h, "s4c");
      await snap(h, "end4");
    },
    // 5: Add a drill to tonight's practice, right from the Drill Vault.
    async (h) => {
      const p = h.page;
      await p.keyboard.press("Escape");
      h.zoom(null, 0.4);
      await h.roll(0.1);
      await pick(h, p.getByLabel("Add Wave Drill to a practice period", { exact: true }), "Individual (25 min)", 0.55);
      await snap(h, "s5a");
      await h.press(p.getByRole("navigation", { name: "Practice tabs" }).getByRole("link", { name: "Practice plan" }), 0.55);
      await h.cut(async () => {
        await h.settle(p.locator(".pr-period").first());
        await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      });
      await scrollGlide(h, 330, 0.4);
      await h.glide(p.getByRole("link", { name: "Wave Drill", exact: true }), 0.4);
      await snap(h, "s5b");
      await scrollGlide(h, 400, 0.8);
      await snap(h, "end5");
    },
    // 6: Then print the script, and the scout cards.
    async (h) => {
      const p = h.page;
      await h.press(p.getByRole("button", { name: "Print script" }), 0.45);
      await h.settle(p.getByRole("dialog", { name: "Print preview: Practice script" }));
      h.zoom({ x: 312, y: 66, width: 816, height: 459 }, 0.35);
      await h.roll(0.5);
      await snap(h, "s6a");
      await p.keyboard.press("Escape");
      h.zoom(null, 0.2);
      await h.press(p.getByRole("button", { name: "Print scout cards" }), 0.3);
      await h.settle(p.getByRole("dialog", { name: "Print preview: Scout cards" }));
      h.zoom({ x: 340, y: 100, width: 760, height: 428 }, 0.3);
      await h.roll(0.2);
      await snap(h, "s6b");
      await scrollGlide(h, 280, 0.8);
      await snap(h, "s6c");
      await snap(h, "end6");
    },
  ],
);
