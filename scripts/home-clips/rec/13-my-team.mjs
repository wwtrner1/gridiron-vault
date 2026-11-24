// 13-my-team: "My Team" (take 20 s). Six lines (../source/timings.json):
//   1 "Your roster, your depth chart, and your colors, all in one place."   the My team page, top to the roster
//   2 "Import your roster from a spreadsheet, parents and all."             Import spreadsheet: the file, the preview with the parents, the players land
//   3 "Set your depth chart right on the field."                           Depth chart, On the field: Line up from a formation, a spot dragged
//   4 "Add your logo and colors, and they show up on the field, the wristbands, and the PDFs."   Team branding: the logo, its colors pulled out; then the Wristbands cards
//   5 "Then text the whole team from your own phone."                      Text the team: a message, Parents & guardians, the groups
//   6 "Your team. Your Vault."                                              My team again, the card at the top
// Everything is the real app over sample data: Sample Team, Sample Player 1..12 with Sample Dad / Sample Mom, an original "ST" logo
// (13-my-team-assets.py makes the CSV and the PNG). The coach's depth chart starters and the "OK to text" ticks on the guardians are
// written to the browser's saved team between scenes (the import does not set either), the same data the app writes when a coach
// fills the chart and ticks the boxes.
//
//   BASE=http://localhost:4174 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/rec/13-my-team.mjs   (DRY=1 for timing only, SNAPS=1 for stills in /tmp/home-clips/13)
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { record, BASE } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV = join(HERE, "13-my-team-roster.csv");
const LOGO = join(HERE, "13-my-team-logo.png");
const SNAPS = !!process.env.SNAPS;
if (SNAPS) mkdirSync("/tmp/home-clips/13", { recursive: true });
const snap = async (h, name) => { if (SNAPS) await h.page.screenshot({ path: `/tmp/home-clips/13/${name}.png`, scale: "css" }); };

const NOW = "2026-11-01T00:00:00.000Z";
const TEAM = { teams: [{ id: "my-team", name: "Sample Team", level: "12U", season: "Fall 2026", players: [], charts: [], updatedAt: NOW }], updatedAt: NOW };
const BRAND = { name: "Sample Team", logo: null, primary: "#0B1524", secondary: "#16C8E8", logoOnField: true, endZones: true, prints: true, updatedAt: NOW };
const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f));

/** Scrolls the page smoothly (one step per frame) to `to`. */
async function scrollGlide(h, to, sec) {
  const from = await h.page.evaluate(() => window.scrollY);
  await h.roll(sec, async (f) => {
    await h.page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), from + (to - from) * ease(f));
  });
  await h.page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), to);
}
/** Drags with the real mouse (pointer events), frame by frame. */
async function drag(h, from, to, sec) {
  await h.glide(from, 0.3);
  await h.page.mouse.down();
  await h.roll(sec, async (f) => {
    const e = ease(f);
    await h.page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
  });
  await h.page.mouse.move(to.x, to.y);
  await h.page.mouse.up();
  h.setMouse(to);
  await h.roll(0.1);
}
/** Types two characters a frame. */
async function typeFast(h, text) {
  for (let i = 0; i < text.length; i += 2) {
    await h.page.keyboard.type(text.slice(i, i + 2));
    await h.roll(1 / 30);
  }
}
const center = async (locator) => {
  const b = await locator.first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// The starters of a 5-on-5 offense (by jersey number: first string, then the backups), filed the way the depth chart saves them.
const CHART = [
  ["o1", "QB", "Q", [1, 11]],
  ["o2", "Center", "C", [2, 12]],
  ["o3", "X", "X", [3, 7, 21]],
  ["o4", "Y", "Y", [4, 8]],
  ["o5", "Z", "Z", [5, 10, 23]],
];

await record(
  "13-my-team",
  async (h) => {
    const p = h.page;
    // The Ask Griddy launcher sits over the corner of these screens; this clip is about the team, so it stays out of the picture.
    await p.context().addInitScript(() => {
      const css = ".gd-launch{display:none !important}";
      const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); };
      if (document.head) add(); else addEventListener("DOMContentLoaded", add);
    });
    await p.evaluate(([team, brand]) => {
      localStorage.setItem("grid1ronvault.myteams.v1", JSON.stringify(team));
      localStorage.setItem("grid1ronvault.brand.v1", JSON.stringify(brand));
      localStorage.setItem("grid1ronvault.depthview.v1", "field");
      localStorage.removeItem("grid1ronvault.texts.v1");
    }, [TEAM, BRAND]);
    await h.goto("/roster", p.locator(".tt-entry"));
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await h.quiet(400);
    h.setMouse({ x: 1180, y: 300 });
  },
  [
    // 1: Your roster, your depth chart, and your colors, all in one place.
    async (h) => {
      h.zoom(null, 0);
      await h.roll(0.45);
      await scrollGlide(h, 765, 3.6);
      await h.roll(0.5);
      await snap(h, "s1");
    },
    // 2: Import your roster from a spreadsheet, parents and all.
    async (h) => {
      const p = h.page;
      await h.press(p.getByRole("button", { name: "Import spreadsheet" }), 0.4);
      const dlg = p.getByRole("dialog", { name: "Import players from a spreadsheet" });
      await h.settle(dlg);
      await dlg.getByLabel("Open a spreadsheet (Excel or CSV)").setInputFiles(CSV);
      await h.settle(dlg.locator(".hub-preview"));
      await h.roll(0.1);
      h.zoom({ x: 300, y: 330, width: 840, height: 473 }, 0.4);
      await h.roll(0.65);
      await snap(h, "s2a");
      await h.press(dlg.getByRole("button", { name: /^Add 12 players/ }), 0.3);
      h.zoom(null, 0.3);
      await h.settle(p.getByRole("button", { name: "Open Sample Player 1" }));
      await h.roll(0.15);
      await scrollGlide(h, 1050, 0.45);
      await snap(h, "s2b");
    },
    // 3: Set your depth chart right on the field.
    async (h) => {
      const p = h.page;
      await h.cut(async () => {
        await p.evaluate((chart) => {
          const doc = JSON.parse(localStorage.getItem("grid1ronvault.myteams.v1"));
          const t = doc.teams[0];
          const by = (j) => t.players.find((x) => x.jersey === String(j)).id;
          t.charts = [{ unit: "offense", slots: chart.map(([key, label, letter, js]) => ({ key, label, letter, playerIds: js.map(by) })), updatedAt: "2026-11-02T00:00:00.000Z" }];
          localStorage.setItem("grid1ronvault.myteams.v1", JSON.stringify(doc));
        }, CHART);
        await p.goto(`${BASE}/roster?tab=depth`);
        await h.settle(p.locator(".hub-field"));
        await p.getByRole("tablist", { name: "My team sections" }).evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 70 + 185));
      });
      h.zoom({ x: 270, y: 62, width: 1130, height: 636 }, 0);
      await h.roll(0.15);
      await snap(h, "s3a");
      const select = p.getByLabel("Line up from a formation");
      // The pointer rests on the select's left edge, so it is still on it when "Line them up by position" appears beside it and the select slides left.
      const sb = await select.boundingBox();
      await h.glide({ x: sb.x + 14, y: sb.y + sb.height / 2 }, 0.3);
      await select.selectOption("Trips Right");
      await h.roll(0.45);
      await snap(h, "s3b");
      const qb = await center(p.getByRole("button", { name: /^QB: / }));
      await drag(h, qb, { x: qb.x - 62, y: qb.y + 38 }, 0.4);
      await h.roll(0.1);
      await snap(h, "s3c");
    },
    // 4: Add your logo and colors, and they show up on the field, the wristbands, and the PDFs.
    async (h) => {
      const p = h.page;
      await h.cut(async () => {
        await p.goto(`${BASE}/roster`);
        await h.settle(p.locator(".brand-panel"));
        await p.evaluate(() => { const el = document.querySelector(".brand-panel"); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 78, behavior: "instant" }); });
        await h.quiet(300);
      });
      h.zoom(null, 0);
      const panel = p.getByRole("region", { name: "Team branding" });
      const chooser = p.waitForEvent("filechooser");
      await h.press(panel.getByRole("button", { name: "Add logo" }), 0.4);
      await (await chooser).setFiles(LOGO);
      await h.settle(panel.getByRole("img", { name: "Team logo" }));
      await h.roll(0.55);
      await snap(h, "s4a");
      await h.glide(p.locator(".brand-preview svg"), 0.5);
      await h.roll(0.55);
      await snap(h, "s4b");
      await h.cut(async () => {
        await p.goto(`${BASE}/wristbands`);
        const source = p.locator('[data-tour="wb-source"] select');
        await h.settle(source);
        await source.selectOption({ label: "Playbook · Ready-to-Go 5v5 Playbook" });
        await h.settle(p.locator(".wb-preview"));
        // The card header says who the team is: {team} fills in the name from Team branding.
        await p.getByLabel("Header, left").fill("{team} · Card {card}");
        await h.quiet(900);
        await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      });
      h.zoom({ x: 560, y: 236, width: 760, height: 428 }, 0);
      await h.roll(0.4);
      await snap(h, "s4c");
      const preview = p.getByRole("button", { name: "Print preview" }).first();
      await h.press(preview, 0.45);
      // The PDF is built and drawn page by page (untimed), then the printed card shows with the team header.
      await h.cut(async () => {
        await h.settle(p.getByRole("dialog", { name: /Print preview/ }).locator("img").first(), 60000);
        await h.quiet(500);
      });
      h.zoom({ x: 393, y: 150, width: 654, height: 368 }, 0);
      await h.glide({ x: 1060, y: 520 }, 0.4);
      await h.roll(0.8);
      await snap(h, "s4d");
    },
    // 5: Then text the whole team from your own phone.
    async (h) => {
      const p = h.page;
      await h.cut(async () => {
        await p.goto(`${BASE}/roster/text`);
        await h.settle(p.locator("#tt-msg"));
        // The coach ticks "OK to text" on a parent; here every parent has been ticked.
        await p.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem("grid1ronvault.myteams.v1"));
          for (const pl of doc.teams[0].players) for (const g of pl.guardians) g.text = true;
          localStorage.setItem("grid1ronvault.myteams.v1", JSON.stringify(doc));
        });
        await p.reload();
        await h.settle(p.locator("#tt-msg"));
        await h.quiet(300);
      });
      h.zoom(null, 0);
      await h.press(p.locator("#tt-msg"), 0.25);
      await typeFast(h, "Practice moved to 6 PM Thursday.");
      await snap(h, "s5a");
      await h.press(p.getByRole("button", { name: /^Parents & guardians/ }), 0.3);
      await h.press(p.getByRole("button", { name: "Next: send from my phone" }), 0.3);
      await h.settle(p.locator(".tt-groups"));
      h.zoom(null, 0);
      await h.roll(0.4);
      await snap(h, "s5b");
    },
    // 6: Your team. Your Vault.
    async (h) => {
      const p = h.page;
      await h.cut(async () => {
        await p.goto(`${BASE}/roster`);
        await h.settle(p.locator(".tt-entry"));
        await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await h.quiet(300);
      });
      h.zoom(null, 0);
      await h.roll(0.5);
      await h.zoomOn(p.locator(".tt-entry"), 28, 0.9);
      await h.glide(p.locator(".tt-cta"), 0.7);
      await h.roll(0.4);
      await snap(h, "s6");
    },
  ],
);
