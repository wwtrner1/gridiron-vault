import { MAX_EDGE } from "./photo";

/**
 * Scanned pages and PDFs: a binder page or playbook PDF often holds several
 * plays. Claude first finds each play on the page (one cheap look at the
 * whole page), then every play the coach keeps is cropped at full resolution
 * and read by the whiteboard photo reader (`/api/ai/photo`), so each one gets
 * the same review before it saves. Shared by the browser and the function.
 */
export type ScanBox = {
  /** Top-left corner and size, 0–1 of the page. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The play's title as printed, or "". */
  title: string;
  /** Coaching notes printed with the play, or "". */
  notes: string;
};

export type ScanRequest = { image: string };
export type ScanFind = { plays: ScanBox[]; reason?: string };

/** Most plays read from one page; a wristband sheet with more is better as a PDF of single plays. */
export const MAX_SCAN_PLAYS = 16;
/** Pages read from one PDF. */
export const MAX_PDF_PAGES = 20;

export const SCAN_TOOL = {
  name: "find_plays",
  description: "Record where each football play diagram is on the page.",
  input_schema: {
    type: "object",
    properties: {
      plays: {
        type: "array",
        description: "Every separate play diagram, in reading order (left to right, top to bottom). Empty if there are none.",
        items: {
          type: "object",
          properties: {
            x: { type: "number", description: "Left edge of the play's box, fraction of image width." },
            y: { type: "number", description: "Top edge, fraction of image height." },
            w: { type: "number", description: "Width, fraction of image width." },
            h: { type: "number", description: "Height, fraction of image height." },
            title: { type: "string", description: "The play's name or number as printed with it, else empty." },
            notes: { type: "string", description: "Coaching notes printed with this play (not the page header), else empty." },
          },
          required: ["x", "y", "w", "h", "title"],
        },
      },
      reason: { type: "string", description: "When there are no plays, what the page shows instead." },
    },
    required: ["plays"],
  },
};

export const SCAN_SYSTEM = `You look at pages from football playbooks — scanned binder pages, PDF pages, wristband cards, call sheets and photos of them — for GridIronVault, a playbook app, and record where each play diagram is with the tool.

A play diagram is one drawing of players (circles, letters, Xs) with their routes or blocks. Give each diagram its own box, covering every player mark, every line and arrow tip, and the play's own title and number if printed right beside it. Don't include neighbouring diagrams, page headers, logos or tables. Boxes should not overlap. A page with one play gets one box. Play cards in a grid (wristband or call sheet) are separate plays. A table of play names with no drawings has no plays.`;

/** Keeps a box inside the page and at least a little bigger than a mark. */
export function cleanBoxes(raw: unknown): ScanBox[] {
  const unit = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0));
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((b) => {
      const x = unit(b?.x);
      const y = unit(b?.y);
      return {
        x,
        y,
        w: Math.min(1 - x, unit(b?.w)),
        h: Math.min(1 - y, unit(b?.h)),
        title: String(b?.title ?? "").trim().slice(0, 80),
        notes: String(b?.notes ?? "").trim().slice(0, 600),
      };
    })
    .filter((b) => b.w >= 0.05 && b.h >= 0.04)
    .slice(0, MAX_SCAN_PLAYS);
}

/* ------------------------------------------------------------ in the browser */

/** Longest side a page is kept at, so each cropped play still has detail to read. */
const PAGE_EDGE = 3200;

export type Jpeg = { data: string; url: string; aspect: number };

/** A canvas as base64 JPEG no longer than `edge` on its longest side. */
export function canvasJpeg(source: HTMLCanvasElement | ImageBitmap, edge = MAX_EDGE): Jpeg {
  const scale = Math.min(1, edge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { data: url.split(",")[1], url, aspect: canvas.height / canvas.width };
}

/** One play cut from its page, with a little margin so arrow tips on the box edge survive. */
export function cropPlay(page: HTMLCanvasElement, box: ScanBox): HTMLCanvasElement {
  const padX = 0.02;
  const padY = 0.02 * (page.width / page.height);
  const x0 = Math.max(0, box.x - padX) * page.width;
  const y0 = Math.max(0, box.y - padY) * page.height;
  const x1 = Math.min(1, box.x + box.w + padX) * page.width;
  const y1 = Math.min(1, box.y + box.h + padY) * page.height;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(x1 - x0));
  out.height = Math.max(1, Math.round(y1 - y0));
  out.getContext("2d")!.drawImage(page, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
  return out;
}

/** A photo or scan as a page canvas. Throws if the browser can't open it (HEIC outside Safari). */
export async function imagePage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Every page of a PDF (up to MAX_PDF_PAGES) as canvases; PDF.js loads only when a PDF arrives. */
export async function pdfPages(file: File): Promise<{ pages: HTMLCanvasElement[]; total: number }> {
  const { renderPdf } = await import("./scanPdf");
  return renderPdf(new Uint8Array(await file.arrayBuffer()), MAX_PDF_PAGES, PAGE_EDGE);
}

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
