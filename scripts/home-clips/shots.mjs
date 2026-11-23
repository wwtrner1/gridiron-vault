#!/usr/bin/env node
// Takes the picture of each screen for the home page's every-tool grid: public/shots/<name>.webp (the names are
// SHOT_OF_ROUTE in src/pages/home/tools.ts). The app runs with sample data (the Ready-to-Go playbook added to the Vault,
// a practice script, a roster) so no screen is empty, on the Head Coach plan so no tool is held back, with the tour
// bubbles and tips already seen.
//
//   npm run build && npx vite preview --port 4173 &
//   BASE=http://localhost:4173 PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/home-clips/shots.mjs [designer vault ...]
//
// Needs ffmpeg (PNG to a 960 px wide WebP). Names on the command line limit it to those pictures.
import { createRequire } from "node:module";
import { mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const p of [undefined, "/opt/node-tools/node_modules", "/opt/node22/lib/node_modules", join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules")]) {
    try { return p ? require(require.resolve("playwright", { paths: [p] })) : require("playwright"); } catch {}
  }
  throw new Error("playwright not found");
})();

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "public", "shots");
const TMP = process.env.SHOTS_TMP ?? "/tmp/home-clips/shots";
const BASE = process.env.BASE ?? "http://localhost:4173";
const only = process.argv.slice(2);

const NAMES = ["Alex Rivera", "Sam Carter", "Jordan Lee", "Riley Brooks", "Casey Morgan", "Taylor Reed", "Drew Hayes", "Jamie Ortiz", "Cameron Price", "Devon Shaw", "Morgan Ellis", "Quinn Foster"];
const POSITIONS = ["Q", "C", "X", "Y", "Z", "H", "S", "X", "Z", "Y", "H", "C"];
const at = "2026-11-22T12:00:00.000Z";
const players = NAMES.map((n, i) => ({
  id: `p${i + 1}`, teamId: "my-team", firstName: n.split(" ")[0], middleName: "", lastName: n.split(" ")[1], jersey: String(i + 2), positions: POSITIONS[i],
  grade: "", gradYear: "", birthDate: "", height: "", weight: "", status: "active", updatedAt: at,
}));
const roster = { teams: [{ id: "my-team", name: "Riverside Rockets", level: "U12 flag", season: "Fall 2026", players, charts: [], updatedAt: at }], updatedAt: at };
const script = {
  name: "Tuesday practice", start: "17:30", updatedAt: at,
  periods: [
    { id: "w", title: "Warm-up and stretch", minutes: 10, note: "Dynamic only, no static stretching", playIds: [], kind: "warmup" },
    { id: "i", title: "Individual: routes and flag pulls", minutes: 20, note: "", playIds: [], kind: "individual" },
    { id: "g", title: "Group: pass concepts", minutes: 25, note: "Smash and Mesh against zone", playIds: [], kind: "group" },
    { id: "t", title: "Team: 5-on-5 scrimmage", minutes: 25, note: "", playIds: [], kind: "team" },
    { id: "c", title: "Finish and talk", minutes: 10, note: "Name one thing each player did well", playIds: [], kind: "walkthrough" },
  ],
};

/** name → { path, ready, prep? }. `ready` is what must be on screen before the picture. */
const SHOTS = {
  vault: { path: "/vault", ready: ".play-card" },
  designer: { open: true },
  upload: { path: "/upload", ready: "main" },
  playbooks: { path: "/playbooks", ready: "main" },
  "my-team": { path: "/roster", ready: "main" },
  assignments: { path: "/assignments", ready: "main" },
  "call-sheet": { path: "/grid", ready: "main", prep: "sheet" },
  coverage: { path: "/coverage", ready: "main" },
  practice: { path: "/practice", ready: "main", before: "practice" },
  drills: { path: "/drills", ready: "main" },
  library: { path: "/library", ready: "main" },
  "film-room": { path: "/concepts", ready: "main" },
  wristbands: { path: "/wristbands", ready: "main", book: true },
  starters: { path: "/starters", ready: "main" },
  language: { path: "/language", ready: "main" },
  "more-tools": { path: "/tools", ready: "main" },
};

mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
  storageState: {
    cookies: [],
    origins: [{
      origin: BASE,
      localStorage: [
        { name: "nextplay.tier.v1", value: "solo" },
        { name: "grid1ronvault.tour.v1", value: "1" },
        { name: "grid1ronvault.filmtips.v1", value: "seen" },
        { name: "grid1ronvault.tips.v1", value: JSON.stringify({ off: true }) },
        { name: "grid1ronvault.guides.v1", value: JSON.stringify({ seen: ["designer", "vault", "wristbands", "grid", "coverage", "practice", "drills", "roster", "playbooks", "upload", "assignments", "library", "starters", "language", "concepts", "tools", "front-office"] }) },
        { name: "grid1ronvault.myteams.v1", value: JSON.stringify(roster) },
        { name: "grid1ronvault.onboarding.v1", value: JSON.stringify({ done: {}, hidden: true }) },
      ],
    }],
  },
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("dialog", (d) => d.accept().catch(() => undefined));

// The Vault first, so the Ready-to-Go playbook and its plays are on every screen.
await page.goto(`${BASE}/vault`);
const ready = page.getByRole("button", { name: /^Add all \d+/ });
await ready.first().waitFor({ timeout: 20000 });
await ready.first().click();
await page.locator(".play-card").first().waitFor({ timeout: 20000 });

// What the Vault holds now: play names (for the call sheet and the practice script) and the first playbook's id.
const vault = await page.evaluate(() => {
  const w = JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}");
  return { plays: (w.plays ?? []).map((p) => ({ id: p.id, name: p.name })), book: (w.playbooks ?? [])[0]?.id ?? null };
});
await page.addStyleTag({ content: ".gd-launch,.toast-wrap{display:none!important}" });
await page.addInitScript(() => {
  const css = document.createElement("style");
  css.textContent = ".gd-launch,.toast-wrap{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.append(css));
});

const made = [];
for (const [name, spec] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  try {
    if (spec.open) {
      await page.goto(`${BASE}/vault`);
      await page.locator(".play-card").first().waitFor({ timeout: 20000 });
      await page.locator(".play-card").first().getByRole("button", { name: /^Open .* in the designer$/ }).first().click();
      await page.locator(".stage-frame svg").first().waitFor({ timeout: 20000 });
    } else {
      if (spec.before === "practice") {
        const ids = vault.plays.map((p) => p.id);
        const periods = script.periods.map((p, i) => ({ ...p, playIds: p.kind === "group" ? ids.slice(0, 3) : p.kind === "team" ? ids.slice(3, 7) : [], drillIds: i === 0 ? ["drill-w-drill"] : i === 1 ? ["drill-trail-technique", "drill-wave"] : [] }));
        await page.evaluate((s) => localStorage.setItem("grid1ronvault.practice.v1", JSON.stringify(s)), { ...script, periods });
      }
      const path = spec.book && vault.book ? `${spec.path}?source=${encodeURIComponent(`book:${vault.book}`)}` : spec.path;
      await page.goto(`${BASE}${path}`);
      await page.locator(spec.ready).first().waitFor({ timeout: 20000 });
      if (spec.prep === "sheet") {
        for (let r = 1; r <= 9 && r <= vault.plays.length; r++) {
          const cell = page.getByRole("combobox", { name: `Play Name, row ${r}`, exact: true });
          await cell.click();
          await cell.fill(vault.plays[r - 1].name);
          await cell.press("Tab");
          await page.waitForTimeout(250);
        }
      }
    }
    await page.waitForTimeout(1200); // fonts, lazy thumbnails
    const png = join(TMP, `${name}.png`);
    await page.screenshot({ path: png });
    const webp = join(OUT, `${name}.webp`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-vf", "scale=960:-1:flags=lanczos", "-c:v", "libwebp", "-quality", "80", webp]);
    made.push(`${name} ${Math.round(statSync(webp).size / 1024)} KB`);
  } catch (e) {
    console.warn(`${name}: ${String(e).split("\n")[0]}`);
  }
}
await browser.close();
console.log(made.join("\n"));
if (errors.length) console.warn("page errors:", [...new Set(errors)].join("\n"));
console.log(`${readdirSync(OUT).filter((f) => f.endsWith(".webp")).length} pictures in public/shots`);
