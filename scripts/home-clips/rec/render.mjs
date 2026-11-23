// Renders overlay PNGs from a JSON list [{file, w, h, html}] (html is a full body; fonts from the app's /fonts).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(new URL("../../../", import.meta.url).pathname);
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:4173";
const specs = JSON.parse(readFileSync(process.argv[2], "utf8"));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
await page.goto(`${BASE}/fonts/fonts.css`);
for (const s of specs) {
  await page.setViewportSize({ width: s.w, height: s.h });
  await page.setContent(`<!doctype html><html><head><base href="${BASE}/"><link rel="stylesheet" href="${BASE}/fonts/fonts.css"><style>html,body{margin:0;background:transparent}*{box-sizing:border-box}</style></head><body>${s.html}</body></html>`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: s.file, omitBackground: true });
}
await browser.close();
console.log(`${specs.length} overlays`);
