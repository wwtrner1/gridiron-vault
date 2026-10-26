/**
 * Size matrix for wristband PDFs: builds one PDF per card size and layout with
 * the app's own code, then checks page count and page size against what the
 * settings promise, prints the readability warnings, and renders each page at
 * 200 dpi so a human can look at the real size.
 *
 *   npm run bands:matrix              # writes to out/wristband-matrix/
 *   npm run bands:matrix -- --out /tmp/bands
 */
import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outArg = process.argv.indexOf("--out");
const out = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(root, "out/wristband-matrix"));
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require("/opt/node22/lib/node_modules/playwright"); }

const server = await createServer({ root: path.join(root, "scripts/wristband-matrix"), configFile: path.join(root, "vite.config.ts"), server: { port: 5199, fs: { allow: [root] } }, logLevel: "error" });
await server.listen();
const browser = await playwright.chromium.launch();
let failed = 0;
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto("http://localhost:5199/");
  await page.waitForFunction(() => window.ready);
  const ids = await page.evaluate(() => window.caseIds);
  for (const id of ids) {
    const r = await page.evaluate((i) => window.runCase(i), id);
    const pdf = path.join(out, `${id}.pdf`);
    writeFileSync(pdf, Buffer.from(r.b64, "base64"));
    const info = execFileSync("pdfinfo", [pdf]).toString();
    const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
    const [, pw, ph] = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info).map(Number);
    const problems = [];
    if (pages !== r.pages) problems.push(`expected ${r.pages} pages, got ${pages}`);
    if (Math.abs(pw / 72 - r.page.w) > 0.02 || Math.abs(ph / 72 - r.page.h) > 0.02)
      problems.push(`page is ${(pw / 72).toFixed(2)}×${(ph / 72).toFixed(2)} in, expected ${r.page.w}×${r.page.h}`);
    for (const i of r.issues) if (i.level === "error") problems.push(i.message);
    execFileSync("pdftoppm", ["-r", "200", "-png", pdf, path.join(out, id)]);
    console.log(`${problems.length ? "FAIL" : "ok  "} ${id.padEnd(18)} ${pages} page(s), ${r.card.w}×${r.card.h} in card`);
    for (const p of problems) console.log(`       ✗ ${p}`);
    for (const i of r.issues.filter((x) => x.level === "warn")) console.log(`       ! ${i.message}`);
    if (problems.length) failed++;
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\nPDFs and 200 dpi pages are in ${out}`);
process.exit(failed ? 1 : 0);
