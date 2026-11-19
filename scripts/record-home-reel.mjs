// Records the home page's tools reel (public/clips/home-reel.webm + .mp4 + .jpg poster): the app itself, one play
// drawn, run, taught in the Film Room, checked against a coverage, printed on wristbands and put on a call sheet.
//
//   npm run build && npx vite preview --port 4173 &   then   node scripts/record-home-reel.mjs [outDir]
//
// The page's clock is driven by hand (Playwright's clock), one frame at a time, so the clip is smooth however slow
// the machine is. Needs Playwright (with a Chromium) and ffmpeg on the PATH. Re-record after a big layout change.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return require("playwright");
  } catch {
    return require(require.resolve("playwright", { paths: [process.env.NODE_PATH ?? "", "/opt/node-tools/node_modules", "/opt/node22/lib/node_modules"] }));
  }
})();

const BASE = process.env.BASE ?? "http://localhost:4173";
const OUT = process.argv[2] ?? "public/clips";
const FPS = 24;
const W = 1280;
const H = 720;
const PLAY = process.env.REEL_PLAY ?? "17 · Stick";

mkdirSync(OUT, { recursive: true });
const raw = mkdtempSync(join(tmpdir(), "gv-reel-"));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  storageState: {
    cookies: [],
    origins: [
      {
        origin: BASE,
        localStorage: [
          { name: "nextplay.tier.v1", value: "solo" },
          { name: "grid1ronvault.tour.v1", value: "1" },
          { name: "grid1ronvault.filmtips.v1", value: "seen" },
          { name: "grid1ronvault.tips.v1", value: JSON.stringify({ off: true }) },
        ],
      },
    ],
  },
});
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept().catch(() => undefined));

// The Vault first, in real time, so the Ready-to-Go playbook is there for every scene.
await page.goto(`${BASE}/vault`);
await page.locator(".vault-ready button").click();
await page.locator(".play-card").first().waitFor();

await page.clock.install();
await page.clock.pauseAt(new Date(Date.now() + 2000));

let n = 0;
let mouse = { x: W / 2, y: H / 2 };
const shot = async () => page.screenshot({ path: join(raw, `f${String(n++).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
const tick = async (ms = 1000 / FPS) => page.clock.runFor(ms);
/** Records `sec` seconds, one frame at a time. */
const roll = async (sec, each) => {
  const count = Math.round(sec * FPS);
  for (let i = 0; i < count; i++) {
    if (each) await each(i / count);
    await tick();
    await shot();
  }
};
/** Lets the page load or settle without recording: its clock still has to move for anything to happen. */
const settle = async (locator, ms = 15000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await tick(60);
    if (!locator || (await locator.first().isVisible().catch(() => false))) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`Never showed: ${locator}`);
};
const quiet = async (ms = 500) => {
  for (let i = 0; i < ms / 50; i++) {
    await tick(50);
    await new Promise((r) => setTimeout(r, 15));
  }
};

/** The caption bar and the pointer, drawn into the page so they are in every frame. */
const dress = async () =>
  page.evaluate(() => {
    if (document.getElementById("reel-cap")) return;
    const style = document.createElement("style");
    style.textContent = `
      #reel-cap{position:fixed;left:50%;bottom:26px;z-index:99999;transform:translateX(-50%);display:flex;align-items:center;gap:14px;max-width:86vw;padding:12px 22px 12px 16px;border-left:8px solid #16C8E8;border-radius:12px;background:rgba(1,22,40,.96);box-shadow:0 14px 40px rgba(0,0,0,.5);color:#fff;font:800 30px/1.1 "Saira Condensed",system-ui,sans-serif;letter-spacing:.03em;text-transform:uppercase;pointer-events:none;transition:opacity .25s}
      #reel-cap b{font:600 13px "IBM Plex Mono",monospace;letter-spacing:.14em;color:#5fd6ea}
      #reel-cap:empty{opacity:0}
      #reel-ptr{position:fixed;z-index:100000;width:26px;height:26px;margin:-3px 0 0 -3px;pointer-events:none;transition:transform .12s}
      #reel-ptr.down{transform:scale(.82)}
      #reel-end{position:fixed;inset:0;z-index:99998;display:grid;place-items:center;background:#010c18;background-image:linear-gradient(#0b1b30 1px,transparent 1px),linear-gradient(90deg,#0b1b30 1px,transparent 1px);background-size:64px 64px;color:#fff;text-align:center;opacity:0;transition:opacity .5s;pointer-events:none}
      #reel-end.on{opacity:1}
      #reel-end img{width:200px;height:200px}
      #reel-end h1{margin:10px 0 6px;font:800 64px/1 "Saira Condensed",system-ui,sans-serif;letter-spacing:.02em;text-transform:uppercase}
      #reel-end h1 span{color:#16C8E8}
      #reel-end p{margin:0;font:600 22px "IBM Plex Mono",monospace;letter-spacing:.08em;color:#9fb6c9}`;
    document.head.append(style);
    const cap = document.createElement("div");
    cap.id = "reel-cap";
    const ptr = document.createElement("div");
    ptr.id = "reel-ptr";
    ptr.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9-7 1.6L8.6 20z" fill="#fff" stroke="#011628" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const end = document.createElement("div");
    end.id = "reel-end";
    end.innerHTML = `<div><img src="/brand/shield-440.webp" alt=""><h1>Your playbook. <span>Anywhere.</span></h1><p>GRIDIRON-VAULT.COM</p></div>`;
    document.body.append(cap, ptr, end);
    addEventListener("mousemove", (e) => ((ptr.style.left = e.clientX + "px"), (ptr.style.top = e.clientY + "px")), true);
    addEventListener("mousedown", () => ptr.classList.add("down"), true);
    addEventListener("mouseup", () => ptr.classList.remove("down"), true);
  });
const caption = async (k, text) => {
  await dress();
  await page.evaluate(([k, text]) => {
    const cap = document.getElementById("reel-cap");
    cap.innerHTML = text ? `<b>${k}</b>${text}` : "";
  }, [k, text]);
  await page.mouse.move(mouse.x, mouse.y);
};
/** Glides the pointer to a spot (or the middle of an element) while recording. */
const glide = async (target, sec = 0.6) => {
  let to = target;
  if (typeof target.boundingBox === "function") {
    const b = await target.first().boundingBox();
    to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  const from = { ...mouse };
  await roll(sec, async (f) => {
    const e = f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);
    mouse = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
    await page.mouse.move(mouse.x, mouse.y);
  });
  mouse = to;
  await page.mouse.move(to.x, to.y);
};
const press = async (locator, sec = 0.55) => {
  await glide(locator, sec);
  await roll(0.1);
  await locator.first().click();
};
/** Closes the dialog on top and waits for it to go. */
const close = async (dialog) => {
  await page.keyboard.press("Escape");
  for (let i = 0; i < 100 && (await dialog.isVisible().catch(() => false)); i++) {
    await tick(50);
    await new Promise((r) => setTimeout(r, 20));
  }
  await quiet(300);
};

// 1. The Vault.
await caption("01", "Every play in one Vault");
await roll(1.6);
const card = page.getByRole("button", { name: `Open ${PLAY} in the designer` });
await card.scrollIntoViewIfNeeded();
await roll(0.4);
await press(card);
await settle(page.locator(".stage-frame svg"));
await quiet();

// 2. The Designer.
await caption("02", "Draw it with real tools");
await roll(1.2);
const tokens = page.locator(".stage-frame svg g[data-kind='player']");
await glide(tokens.nth(2), 0.7);
await roll(0.5);
await glide(tokens.nth(4), 0.7);
await roll(0.8);

// 3. Run play.
await press(page.getByRole("button", { name: "Run play" }).first());
const run = page.getByRole("dialog", { name: /Run play/ });
await settle(run);
await caption("03", "Run it");
await roll(0.5);
await press(run.getByRole("button", { name: "Run play" }));
await roll(4.2);
await close(run);

// 4. The Film Room.
await caption("04", "Teach it in the Film Room");
await press(page.getByRole("button", { name: /^Extras/ }), 0.5);
await roll(0.4);
await press(page.getByRole("button", { name: "Film Room: teach this play" }), 0.5);
const room = page.getByRole("dialog", { name: /Film Room/ });
await settle(room.locator(".fr-steps"));
await roll(1.3);
const steps = room.locator(".fr-steps button");
await press(steps.nth(1), 0.5);
await roll(2.0);
await press(steps.nth(2), 0.4);
await roll(1.8);
await press(steps.nth(3), 0.4);
await press(room.getByRole("button", { name: "Play the lesson" }), 0.5);
await roll(7.5);
await close(room);

// 5. The Coverage check.
await caption("05", "Check it against any coverage");
await press(page.getByRole("button", { name: /^Extras/ }), 0.5);
await roll(0.3);
await press(page.getByRole("button", { name: /Coverage check/ }).first(), 0.5);
const check = page.getByRole("dialog", { name: /Coverage check/ });
await settle(check);
await roll(4.2);
await close(check);

// 6. Wristbands.
await page.goto(`${BASE}/wristbands`);
await settle(page.locator("main h1, .band-preview, .wb-preview").first());
await quiet(900);
await caption("06", "Print the wristbands");
await roll(1.4);
await roll(2.4, async () => page.mouse.wheel(0, 3));

// 7. The Call Sheet.
await page.goto(`${BASE}/grid`);
await settle(page.locator("main table, .grid-table, main h1").first());
await quiet(900);
await caption("07", "Build the call sheet");
await roll(0.8);
// A typed play name links the row to its play.
for (const [row, name] of [[1, PLAY], [2, "16 · Hitch and Go"], [3, "13 · Out and Up"]]) {
  const box = page.getByRole("combobox", { name: `Play Name, row ${row}`, exact: true });
  if (!(await box.count())) break;
  await press(box, 0.35);
  for (const ch of name) {
    await page.keyboard.type(ch);
    await roll(1 / FPS);
  }
  await page.keyboard.press("Tab");
  await roll(0.25);
}
await roll(1.0);

// 8. Every game.
await page.goto(`${BASE}/concepts?game=5`);
await settle(page.locator("main h1").first());
await quiet(900);
await caption("08", "5v5 · 7v7 · 11-man");
await roll(1.6);
const seven = page.getByRole("button", { name: /7v7|7-on-7/ }).first();
if (await seven.count()) {
  await press(seven, 0.5);
  await roll(1.6);
}

// The end card.
await caption("", "");
await page.evaluate(() => document.getElementById("reel-end").classList.add("on"));
await roll(3.0);

await browser.close();
console.log(`${n} frames, ${(n / FPS).toFixed(1)} s`);

const frames = join(raw, "f%05d.jpg");
const ff = (...args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
// The narration and music bed (scripts/home-reel-sound.m4a) are timed to this storyboard: after changing a scene's
// length, make the sound again or delete that file to save a silent clip.
const SOUND = new URL("./home-reel-sound.m4a", import.meta.url).pathname;
const sound = existsSync(SOUND);
const soundIn = sound ? ["-i", SOUND] : [];
const soundOut = (...codec) => (sound ? ["-map", "0:v", "-map", "1:a", "-c:a", ...codec, "-shortest"] : ["-an"]);
ff("-framerate", String(FPS), "-i", frames, ...soundIn, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", "-pix_fmt", "yuv420p", ...soundOut("libopus", "-b:a", "96k"), join(OUT, "home-reel.webm"));
ff("-framerate", String(FPS), "-i", frames, ...soundIn, "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", ...soundOut("copy"), join(OUT, "home-reel.mp4"));
// The poster is the Film Room, mid-lesson.
ff("-framerate", String(FPS), "-i", frames, "-vf", `select=eq(n\\,${Math.round(n * 0.42)})`, "-frames:v", "1", "-q:v", "4", join(OUT, "home-reel.jpg"));
if (!process.env.KEEP_FRAMES) rmSync(raw, { recursive: true, force: true });
else console.log(raw);
