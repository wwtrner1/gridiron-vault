#!/usr/bin/env node
// Builds src/pages/home/clips.json: what the home page's video pop-out knows about each clip (its title, length, size,
// poster, and one entry per voiceover line with the second it starts and a still of it). The words are the voiceover's
// own lines, cleaned for reading (the narrator says "Grid Iron Vault" so the voice says it right; the page says
// GridIronVault, and "five on five" becomes 5-on-5).
//
//   node scripts/home-clips/manifest.mjs
//
// Reads scripts/home-clips/source/{timings,lines,headlines}.json and public/clips/home/*. A clip with no .mp4 yet is left out.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "public", "clips", "home");
const read = (f) => JSON.parse(readFileSync(join(HERE, "source", f), "utf8"));
const timings = read("timings.json");
const lines = read("lines.json");
const heads = read("headlines.json");

/** One voiceover line as the page prints it. */
const plain = (s) =>
  s
    .replace(/^\[[a-z ]+\]\s*/i, "")
    .replace(/\s*(Grid Iron Vault dot com|gridiron-vault\.com)\.?\s*$/i, "")
    .replace(/Grid Iron Vault/g, "GridIronVault")
    .replace(/\bfive on five\b/gi, "5-on-5")
    .replace(/\bseven on seven\b/gi, "7-on-7")
    .trim();

const seconds = (file) => {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Math.round(parseFloat(out) * 10) / 10;
};

const clips = {};
for (const name of Object.keys(timings).sort()) {
  const mp4 = join(OUT, `${name}.mp4`);
  if (!existsSync(mp4)) {
    console.warn(`skipped ${name}: no mp4 yet`);
    continue;
  }
  const steps = lines[name].map((text, i) => {
    const still = `${name}-s${i + 1}.webp`;
    if (!existsSync(join(OUT, still))) console.warn(`${name}: missing ${still}`);
    return {
      title: (heads[name]?.lines?.[i] ?? "").replace(/\*/g, "").trim(),
      text: plain(text),
      at: Math.round(timings[name][i].start * 100) / 100,
      still: `/clips/home/${still}`,
    };
  });
  clips[name] = {
    title: heads[name]?.title ?? name,
    seconds: seconds(mp4),
    kb: Math.round(statSync(mp4).size / 1024),
    src: `/clips/home/${name}.mp4`,
    poster: `/clips/home/${name}.jpg`,
    steps,
  };
}

writeFileSync(join(ROOT, "src", "pages", "home", "clips.json"), JSON.stringify(clips, null, 1) + "\n");
console.log(`${Object.keys(clips).length} clips, ${Object.values(clips).reduce((n, c) => n + c.steps.length, 0)} steps, ${Object.values(clips).reduce((n, c) => n + c.kb, 0)} KB`);
