import { renderToStaticMarkup } from "react-dom/server";
import { jsPDF } from "jspdf";
import { FieldBackground } from "./field";
import { DepthLayer, drawOrder, MarkerDefs, NodeLayer, strokeColors } from "./render";
import { DEPTH_SIZE } from "./depth";
import { playerNoteLines } from "./notes";
import { FULL_LOOK, frameScene, type PrintLook } from "./printLook";
import type { Scene, StoredPlay } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";
import { EXPORT_SIZES, type ExportSizeId } from "./tools";

const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** A preset size, or the coach's own width and height. */
export type SizeChoice = ExportSizeId | "custom";

export type SheetOptions = {
  size: SizeChoice;
  /** Width and height in inches when `size` is "custom". */
  custom?: { w: number; h: number };
  perPage: number;
  includeNotes: boolean;
  includeName: boolean;
  transparent: boolean;
  /** Raster resolution, already capped by the coach's plan. */
  dpi: number;
  /** Diagonal stamp applied to free-tier output. */
  watermark?: string | null;
  /** Wristband cards print only the player notes marked for the wristband. */
  wristband?: boolean;
  /** Framing and line weight for the printed diagram. */
  look?: PrintLook;
  /** Draw diagrams as vector lines instead of pictures. Off on watermarked plans. */
  vector?: boolean;
};

export const defaultSheetOptions: SheetOptions = {
  size: "letter-p",
  perPage: 1,
  includeNotes: true,
  includeName: true,
  transparent: false,
  dpi: 300,
  watermark: null,
  look: FULL_LOOK,
  vector: true,
};

/** Smallest and largest custom page, in inches. */
export const CUSTOM_LIMITS = { min: 1, max: 17 };

export function sheetSize(options: Pick<SheetOptions, "size" | "custom">): { w: number; h: number } {
  if (options.size === "custom" && options.custom) {
    const clamp = (v: number) => Math.min(CUSTOM_LIMITS.max, Math.max(CUSTOM_LIMITS.min, v || CUSTOM_LIMITS.min));
    return { w: clamp(options.custom.w), h: clamp(options.custom.h) };
  }
  return EXPORT_SIZES.find((s) => s.id === options.size) ?? EXPORT_SIZES.find((s) => s.id === "letter-p")!;
}

export type DiagramOptions = {
  transparent?: boolean;
  watermark?: string | null;
  /** With a printed size, crop and weight the diagram for that size. */
  look?: PrintLook;
  widthIn?: number;
  heightIn?: number;
};

/**
 * The play as it prints: the same renderer as the Designer, framed and
 * weighted for the printed size. Used for every export and the print previews.
 */
export function PrintDiagram({
  scene,
  transparent,
  watermark,
  look,
  widthIn,
  heightIn,
  label,
  standalone = false,
}: DiagramOptions & { scene: Scene; label?: string; standalone?: boolean }) {
  const framed =
    look && widthIn && heightIn
      ? frameScene(scene, look, widthIn, heightIn)
      : { scene, box: { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }, weight: 1, ptPerUnit: undefined };
  const { box, weight, ptPerUnit } = framed;
  // White token rings and route casings; left off a transparent export, where they'd show as white.
  const print = !!ptPerUnit && !transparent;
  const ordered = drawOrder(framed.scene.nodes);
  const field = look?.field ?? "full";
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return (
    <svg
      xmlns={standalone ? "http://www.w3.org/2000/svg" : undefined}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      width={standalone ? box.w : undefined}
      height={standalone ? box.h : undefined}
      role={standalone ? undefined : "img"}
      aria-label={standalone ? undefined : label ? `${label} diagram` : "Play diagram"}
    >
      {standalone && <style>{`text { font-family: ${FONT_STACK}; }`}</style>}
      <MarkerDefs colors={strokeColors(ordered)} />
      {transparent || field === "none" ? null : (
        <FieldBackground
          view={scene.view}
          losY={scene.losY}
          lite={field === "lite"}
          yards={field === "yards"}
          weight={weight}
          ptPerUnit={ptPerUnit}
          frame={ptPerUnit ? box : undefined}
        />
      )}
      {ordered.map((n) => (
        <NodeLayer key={n.id} node={n} print={print} />
      ))}
      {look?.depths && !transparent ? (
        <DepthLayer scene={framed.scene} scale={ptPerUnit ? Math.min(4, Math.max(1, 5.5 / (DEPTH_SIZE * ptPerUnit))) : 1} />
      ) : null}
      {watermark ? (
        <g transform={`rotate(-22 ${cx} ${cy})`} opacity={0.12}>
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={(78 * box.w) / CANVAS_W}
            fontWeight={800}
            letterSpacing="7"
            fill="#0B1524"
          >
            {watermark}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/** Render a scene to a standalone SVG string — the source for every export. */
export function sceneToSvg(scene: Scene, opts: DiagramOptions = {}): string {
  return renderToStaticMarkup(<PrintDiagram scene={scene} standalone {...opts} />);
}

/** The view box size an SVG string was framed at, for raster exports. */
function viewBoxSize(svg: string): { w: number; h: number } {
  const m = svg.match(/viewBox="[-\d.e]+ [-\d.e]+ ([\d.e]+) ([\d.e]+)"/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: CANVAS_W, h: CANVAS_H };
}

/** Rasterise an SVG string at an arbitrary pixel size. */
export function svgToPng(
  svg: string,
  width: number,
  height: number,
  background = "#FFFFFF",
  type: "image/png" | "image/jpeg" = "image/png",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("This browser could not create the image canvas."));
      if (background !== "transparent" || type === "image/jpeg") {
        ctx.fillStyle = background === "transparent" ? "#FFFFFF" : background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(type, 0.95));
    };
    image.onerror = () => reject(new Error("The play diagram could not be converted to an image."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * One play as a PNG or JPEG `inches` wide. With a look, the image takes the
 * shape of `heightIn` and is cropped and weighted for that printed size.
 */
export async function playToImage(
  play: { scene: Scene },
  opts: DiagramOptions & { dpi: number; inches: number; type?: "image/png" | "image/jpeg" },
) {
  const svg = sceneToSvg(play.scene, opts);
  const box = viewBoxSize(svg);
  const w = opts.inches * opts.dpi;
  const h = (w * box.h) / box.w;
  return svgToPng(svg, w, h, opts.transparent ? "transparent" : "#FFFFFF", opts.type);
}

export async function playToPng(
  play: { scene: Scene },
  dpi = 300,
  inches = 8,
  transparent = false,
  watermark: string | null = null,
) {
  return playToImage(play, { dpi, inches, transparent, watermark });
}

/** SVG text as svg2pdf can draw it: PDF base fonts, and centred letters shifted onto the baseline. */
const forPdf = (svg: string) =>
  svg
    .replace(/font-family="[^"]*"/g, 'font-family="helvetica"')
    .replace(/font-family:[^;}]*/g, "font-family: helvetica")
    // Helvetica comes in normal and bold only; any other weight would fall back to Times.
    .replace(/font-weight="(\d+)"/g, (_, w) => `font-weight="${Number(w) >= 600 ? "bold" : "normal"}"`)
    .replace(/<text([^>]*?)font-size="([\d.]+)"([^>]*?)dominant-baseline="central"/g, (_, a, size, b) => `<text${a}font-size="${size}"${b}dy="${Number(size) * 0.35}"`)
    .replace(/<text([^>]*?)dominant-baseline="central"([^>]*?)font-size="([\d.]+)"/g, (_, a, b, size) => `<text${a}dy="${Number(size) * 0.35}"${b}font-size="${size}"`);

/** Draw an SVG string into the PDF as real vector paths. */
async function svgIntoPdf(doc: jsPDF, svg: string, x: number, y: number, w: number, h: number) {
  const { svg2pdf } = await import("svg2pdf.js");
  const parsed = new DOMParser().parseFromString(forPdf(svg), "image/svg+xml").documentElement;
  // svg2pdf reads computed styles, so the element has to be in the page while it draws.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden";
  host.appendChild(document.importNode(parsed, true));
  document.body.appendChild(host);
  try {
    await svg2pdf(host.firstElementChild as Element, doc, { x, y, width: w, height: h });
  } finally {
    host.remove();
  }
}

export type PlaceOptions = DiagramOptions & { vector?: boolean; dpi: number };

/**
 * Put one diagram in a `w` × `h` inch box on the current page. Vector when
 * the plan allows it (sharp at any size); otherwise a picture at the plan's DPI.
 */
export async function placeDiagram(doc: jsPDF, scene: Scene, x: number, y: number, w: number, h: number, opts: PlaceOptions) {
  const svg = sceneToSvg(scene, { ...opts, widthIn: w, heightIn: h });
  if (opts.vector) {
    try {
      await svgIntoPdf(doc, svg, x, y, w, h);
      return;
    } catch {
      // Fall through to a picture rather than fail the whole export.
    }
  }
  const dpi = Math.max(72, opts.dpi || 300);
  const png = await svgToPng(svg, Math.max(240, w * dpi), Math.max(120, h * dpi), opts.transparent ? "transparent" : "#FFFFFF");
  doc.addImage(png, "PNG", x, y, w, h, undefined, "FAST");
}

export function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "play";

type PdfPlay = Pick<StoredPlay, "name" | "formation" | "playType" | "description" | "scene">;

/** Where one play sits on its page, in inches. Shared by the PDF and the export preview. */
export type PdfSlot = {
  x: number;
  y: number;
  cellW: number;
  cellH: number;
  titleH: number;
  notes: string;
  notesH: number;
  art: { x: number; y: number; w: number; h: number };
  small: boolean;
};

/** Lay out the plays of one page: grid cells, title strip, diagram box and notes. */
export function pdfSlots(plays: PdfPlay[], options: SheetOptions): PdfSlot[] {
  const size = sheetSize(options);
  const look = options.look ?? FULL_LOOK;
  const small = size.w < 5.5 && size.h < 5.5;
  const margin = small ? 0.1 : 0.4;
  const cols = options.perPage >= 4 ? 2 : 1;
  const rows = Math.ceil(options.perPage / cols);
  const cellW = (size.w - margin * 2) / cols;
  const cellH = (size.h - margin * 2) / rows;
  return plays.map((play, i) => {
    const slotIndex = i % options.perPage;
    const x = margin + (slotIndex % cols) * cellW;
    const y = margin + Math.floor(slotIndex / cols) * cellH;
    const titleH = options.includeName ? Math.min(small ? 0.24 : 0.32, cellH * 0.14) : 0;
    // Coaching notes plus the player notes marked to print (Player notes panel).
    const notes = options.wristband
      ? playerNoteLines(play.scene, "wristband").join("\n")
      : options.includeNotes
        ? [play.description?.trim(), ...playerNoteLines(play.scene, "print")].filter(Boolean).join("\n")
        : "";
    const notesH = notes ? Math.min(1.35, cellH * (options.wristband || small ? 0.2 : 0.26)) : 0;
    const boxH = cellH - titleH - notesH - (small ? 0.04 : 0.08);
    // Zoomed plays fill the whole box; the whole field keeps the Designer's shape.
    const w = look.fit === "play" ? cellW : Math.min(cellW, (boxH * CANVAS_W) / CANVAS_H);
    const h = look.fit === "play" ? boxH : (w * CANVAS_H) / CANVAS_W;
    return { x, y, cellW, cellH, titleH, notes, notesH, art: { x: x + (cellW - w) / 2, y: y + titleH, w, h }, small };
  });
}

/** Note text size, in points, for a slot. */
export const noteSize = (slot: PdfSlot) => (slot.small ? 7 : 9.5);

/** Build a print-ready PDF holding one or many plays. */
export async function playsToPdf(plays: PdfPlay[], options: SheetOptions, title = "Playbook"): Promise<jsPDF> {
  const size = sheetSize(options);
  const look = options.look ?? FULL_LOOK;
  const landscape = size.w > size.h;
  const doc = new jsPDF({
    unit: "in",
    format: [size.w, size.h],
    orientation: landscape ? "landscape" : "portrait",
    compress: true,
  });
  const slots = pdfSlots(plays, options);

  for (let i = 0; i < plays.length; i++) {
    const play = plays[i];
    const slot = slots[i];
    const { x, y, cellW, cellH, titleH, art, small } = slot;
    if (i > 0 && i % options.perPage === 0) doc.addPage([size.w, size.h], landscape ? "landscape" : "portrait");

    if (options.includeName) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(small ? 10 : 13);
      doc.setTextColor(22, 33, 28);
      doc.text(play.name || "Untitled play", x, y + titleH * 0.72);
      const meta = [play.formation, play.playType].filter(Boolean).join(" · ").toUpperCase();
      if (meta) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(small ? 6.5 : 8);
        doc.setTextColor(120, 132, 124);
        doc.text(meta, x + cellW, y + titleH * 0.72, { align: "right" });
      }
    }

    await placeDiagram(doc, play.scene, art.x, art.y, art.w, art.h, {
      look,
      transparent: options.transparent,
      watermark: options.watermark,
      vector: options.vector,
      dpi: options.dpi,
    });

    if (slot.notesH > 0) {
      doc.setFont("helvetica", "normal");
      const fontSize = noteSize(slot);
      doc.setFontSize(fontSize);
      doc.setTextColor(60, 72, 64);
      const lines = doc.splitTextToSize(slot.notes, cellW);
      const lineH = (fontSize * 1.2) / 72;
      doc.text(lines.slice(0, Math.max(1, Math.floor(slot.notesH / lineH))), x, art.y + art.h + lineH + 0.02);
    }

    if (options.perPage > 1) {
      doc.setDrawColor(215, 222, 214);
      doc.setLineWidth(0.006);
      doc.rect(x - 0.06, y - 0.06, cellW + 0.02, cellH + 0.02);
    }
  }

  doc.setProperties({ title });
  return doc;
}

/** Wristband strips: 6, 8 or 10 plays to a card, laid up on a letter sheet. */
export const WRISTBAND_COUNTS = [6, 8, 10] as const;
