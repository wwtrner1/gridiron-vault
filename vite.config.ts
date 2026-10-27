import { readdirSync, readFileSync } from "node:fs";
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

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  build: { outDir: "dist", sourcemap: false },
});
