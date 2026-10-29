// Records the how-to clips on /tutorials (public/clips/<id>.webm + <id>.jpg poster).
// Each clip is the guided tour itself, played on the built app with the Ready-to-Go playbook in the Vault.
//
//   npm run build && npx vite preview --port 4173 &   then   npm run tutorials:record [-- designer,vault]
//
// Needs Playwright (with a Chromium) and ffmpeg on the PATH. Re-record after a big layout change.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Playwright isn't a project dependency: use a local install, else the machine's global one.
const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return require("playwright");
  } catch {
    return require(require.resolve("playwright", { paths: [process.env.NODE_PATH ?? "", "/opt/node-tools/node_modules", "/opt/node22/lib/node_modules"] }));
  }
})();

const BASE = process.env.BASE ?? "http://localhost:4173";
const OUT = "public/clips";
// guide id (lib/guides.ts), steps to show, ms per step
const CLIPS = [
  ["designer", 14, 2600],
  ["coverage-check", 5, 3000],
  ["griddy", 5, 2800],
  ["vault", 6, 2600],
  ["playbooks", 7, 2400],
  ["callsheet", 12, 2400],
  ["wristbands", 11, 2400],
];
const only = process.argv[2]?.split(",");

mkdirSync(OUT, { recursive: true });
const raw = mkdtempSync(join(tmpdir(), "gv-clips-"));
const browser = await chromium.launch();
for (const [id, steps, dwell] of CLIPS.filter((c) => !only || only.includes(c[0]))) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: join(raw, id), size: { width: 1280, height: 720 } } });
  // The Designer's animated slides stay out of the way.
  await ctx.addInitScript(() => localStorage.setItem("grid1ronvault.tour.v1", "1"));
  const page = await ctx.newPage();
  const began = Date.now();
  await page.goto(`${BASE}/vault`);
  await page.waitForTimeout(700);
  const ready = page.locator(".vault-ready button");
  if (await ready.count()) {
    await ready.click();
    await page.waitForTimeout(1200);
  }
  if (id === "designer" || id === "coverage-check") {
    // A real play, so the tour has routes, Prev/Next and a Coverage check to show.
    await page.locator('.play-card button[aria-label^="Open"]').nth(3).click();
    await page.waitForTimeout(1500);
    await page.evaluate((g) => {
      const u = new URL(location.href);
      u.searchParams.set("tour", g);
      history.pushState(history.state, "", u);
      dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    }, id);
  } else {
    await page.goto(`${BASE}/tutorials`);
    await page.waitForTimeout(500);
    await page.locator(`article[aria-labelledby="tut-${id}"] a.btn-primary`).click();
  }
  await page.locator(".tour-card").waitFor({ timeout: 8000 });
  const lead = Math.max(0, (Date.now() - began) / 1000 - 0.2);
  await page.waitForTimeout(600);
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(dwell);
    if (i < steps - 1) await page.locator(".tour-card .btn-primary").click().catch(() => {});
  }
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  const webm = join(OUT, `${id}.webm`);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(lead), "-i", src, "-an", "-r", "24", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", webm]);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "3.2", "-i", webm, "-frames:v", "1", "-vf", "scale=960:-1", "-q:v", "4", join(OUT, `${id}.jpg`)]);
  console.log(`${webm}`);
}
await browser.close();
rmSync(raw, { recursive: true, force: true });
