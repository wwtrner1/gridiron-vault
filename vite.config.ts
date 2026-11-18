import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * PDF.js decodes scanned pages (JBIG2, JPEG 2000) with wasm and reads
 * non-embedded fonts from data files it fetches by URL. Serve them from our
 * own origin at /pdfjs/ (the CSP allows only 'self'), straight from the
 * package so they always match its version.
 */
function pdfjsAssets(): Plugin {
  const root = join("node_modules", "pdfjs-dist");
  const folders = ["wasm", "standard_fonts"];
  const files = () => folders.flatMap((f) => readdirSync(join(root, f)).filter((n) => !n.startsWith("LICENSE")).map((n) => `${f}/${n}`));
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs/", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\//, "");
        if (!files().includes(name)) return next();
        if (name.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
        else if (name.endsWith(".js")) res.setHeader("Content-Type", "text/javascript");
        res.end(readFileSync(join(root, name)));
      });
    },
    generateBundle() {
      for (const name of files()) this.emitFile({ type: "asset", fileName: `pdfjs/${name}`, source: readFileSync(join(root, name)) });
    },
  };
}

/**
 * The Film Room voice runs a speech model with onnxruntime's WebAssembly
 * build. Its two runtime files are served from /ort/ on our own origin (the
 * CSP allows nothing else) and only fetched when a coach asks for a step to
 * be read.
 */
function ortAssets(): Plugin {
  const root = join("node_modules", "onnxruntime-web", "dist");
  const files = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
  return {
    name: "ort-assets",
    configureServer(server) {
      server.middlewares.use("/ort/", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\//, "");
        if (!files.includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(readFileSync(join(root, name)));
      });
    },
    generateBundle() {
      for (const name of files) this.emitFile({ type: "asset", fileName: `ort/${name}`, source: readFileSync(join(root, name)) });
    },
  };
}

/**
 * The Film Room voice's speech model is about 325 MB: too big for the
 * repository and for one file on the CDN. `node scripts/voice-model.mjs`
 * fetches it into voice-model/ (git-ignored) and the build cuts it into parts
 * of `VOICE_PART` bytes, served as /voice-model/kokoro-v1.0.<n>.part, which
 * the reader's worker puts back together. Keep the size and part length in
 * step with `READER` in src/lib/readAloud.ts. With no model file the build
 * emits nothing and the reader says the voice isn't set up.
 */
const VOICE_FILE = join("voice-model", "kokoro-v1.0.onnx");
const VOICE_PART = 8 * 1024 * 1024;
function voicePart(n: number): Buffer | null {
  if (!existsSync(VOICE_FILE)) return null;
  const size = statSync(VOICE_FILE).size;
  const from = n * VOICE_PART;
  if (!Number.isInteger(n) || n < 0 || from >= size) return null;
  const out = Buffer.alloc(Math.min(VOICE_PART, size - from));
  const fd = openSync(VOICE_FILE, "r");
  readSync(fd, out, 0, out.length, from);
  closeSync(fd);
  return out;
}
function voiceModel(): Plugin {
  const serve = (req: { url?: string }, res: { setHeader(k: string, v: string): void; end(b: Buffer): void }, next: () => void) => {
    const m = /^\/kokoro-v1\.0\.(\d+)\.part$/.exec((req.url ?? "").split("?")[0]);
    const part = m && voicePart(Number(m[1]));
    if (!part) return next();
    res.setHeader("Content-Type", "application/octet-stream");
    res.end(part);
  };
  return {
    name: "voice-model",
    configureServer: (server) => void server.middlewares.use("/voice-model/", serve),
    generateBundle() {
      for (let n = 0, part = voicePart(0); part; part = voicePart(++n)) this.emitFile({ type: "asset", fileName: `voice-model/kokoro-v1.0.${n}.part`, source: part });
    },
  };
}

/**
 * Stamps public/sw.js (copied to dist/sw.js) with this release's id and the
 * list of /assets/ files it ships, so the service worker changes with every
 * release and can drop the chunks of earlier ones from its cache.
 */
function swRelease(): Plugin {
  let shipped: string[] = [];
  return {
    name: "sw-release",
    apply: "build",
    generateBundle(_options, bundle) {
      shipped = Object.keys(bundle)
        .filter((name) => name.startsWith("assets/"))
        .map((name) => `/${name}`)
        .sort();
    },
    closeBundle() {
      const file = join("dist", "sw.js");
      const release = createHash("sha1").update(shipped.join("\n")).digest("hex").slice(0, 10);
      const source = readFileSync(file, "utf8").replace("__RELEASE__", release).replace("__ASSETS__", JSON.stringify(shipped));
      writeFileSync(file, source);
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets(), ortAssets(), voiceModel(), swRelease()],
  worker: { format: "es" },
  build: { outDir: "dist", sourcemap: false },
});
