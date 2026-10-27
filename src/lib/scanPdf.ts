import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * PDF pages to canvases with PDF.js, kept in its own module so the library
 * (about 2 MB with its worker) loads only when a coach uploads a PDF. The
 * wasm decoders and font data are served from /pdfjs/ (see vite.config.ts).
 */
GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderPdf(data: Uint8Array, maxPages: number, edge: number) {
  const task = getDocument({
    data,
    wasmUrl: "/pdfjs/wasm/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    enableXfa: false,
  });
  const doc = await task.promise;
  try {
    const pages: HTMLCanvasElement[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, edge / Math.max(base.width, base.height)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: "#FFFFFF" }).promise;
      page.cleanup();
      pages.push(canvas);
    }
    return { pages, total: doc.numPages };
  } finally {
    await task.destroy();
  }
}
