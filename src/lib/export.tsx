import { renderToStaticMarkup } from "react-dom/server";
import { jsPDF } from "jspdf";
import { FieldBackground } from "./field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "./render";
import { playerNoteLines } from "./notes";
import type { Scene, StoredPlay } from "./types";
import { CANVAS_H, CANVAS_W } from "./types";
import { EXPORT_SIZES, type ExportSizeId } from "./tools";

const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export type SheetOptions = {
  size: ExportSizeId;
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
};

export const defaultSheetOptions: SheetOptions = {
  size: "letter-p",
  perPage: 1,
  includeNotes: true,
  includeName: true,
  transparent: false,
  dpi: 300,
  watermark: null,
};

/** Render a scene to a standalone SVG string — the source for every export. */
export function sceneToSvg(
  scene: Scene,
  opts: { transparent?: boolean; watermark?: string | null } = {},
): string {
  const ordered = drawOrder(scene.nodes);
  const body = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      width={CANVAS_W}
      height={CANVAS_H}
    >
      <style>{`text { font-family: ${FONT_STACK}; }`}</style>
      <MarkerDefs colors={strokeColors(ordered)} />
      {opts.transparent ? null : <FieldBackground view={scene.view} losY={scene.losY} />}
      {ordered.map((n) => (
        <NodeLayer key={n.id} node={n} />
      ))}
      {opts.watermark ? (
        <g transform={`rotate(-22 ${CANVAS_W / 2} ${CANVAS_H / 2})`} opacity={0.12}>
          <text
            x={CANVAS_W / 2}
            y={CANVAS_H / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={78}
            fontWeight={800}
            letterSpacing="7"
            fill="#0B1524"
          >
            {opts.watermark}
          </text>
        </g>
      ) : null}
    </svg>,
  );
  return body;
}

/** Rasterise an SVG string at an arbitrary pixel size. */
export function svgToPng(svg: string, width: number, height: number, background = "#FFFFFF"): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("This browser could not create the image canvas."));
      if (background !== "transparent") {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("The play diagram could not be converted to an image."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function playToPng(
  play: { scene: Scene },
  dpi = 300,
  inches = 8,
  transparent = false,
  watermark: string | null = null,
) {
  const svg = sceneToSvg(play.scene, { transparent, watermark });
  const w = inches * dpi;
  const h = (w * CANVAS_H) / CANVAS_W;
  return svgToPng(svg, w, h, transparent ? "transparent" : "#FFFFFF");
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

/** Build a print-ready PDF holding one or many plays. */
export async function playsToPdf(
  plays: Pick<StoredPlay, "name" | "formation" | "playType" | "description" | "scene">[],
  options: SheetOptions,
  title = "Playbook",
): Promise<jsPDF> {
  const size = EXPORT_SIZES.find((s) => s.id === options.size) ?? EXPORT_SIZES[4];
  const landscape = size.w > size.h;
  const doc = new jsPDF({
    unit: "in",
    format: [size.w, size.h],
    orientation: landscape ? "landscape" : "portrait",
  });

  const margin = size.w < 5 ? 0.12 : 0.4;
  const cols = options.perPage >= 4 ? 2 : 1;
  const rows = Math.ceil(options.perPage / cols);
  const cellW = (size.w - margin * 2) / cols;
  const cellH = (size.h - margin * 2) / rows;

  for (let i = 0; i < plays.length; i++) {
    const play = plays[i];
    const slotIndex = i % options.perPage;
    if (i > 0 && slotIndex === 0) doc.addPage([size.w, size.h], landscape ? "landscape" : "portrait");

    const col = slotIndex % cols;
    const row = Math.floor(slotIndex / cols);
    const x = margin + col * cellW;
    const y = margin + row * cellH;

    const titleH = options.includeName ? Math.min(0.32, cellH * 0.12) : 0;
    // Coaching notes plus the player notes marked to print (Player notes panel).
    const noteText = options.wristband
      ? playerNoteLines(play.scene, "wristband").join("\n")
      : options.includeNotes
        ? [play.description?.trim(), ...playerNoteLines(play.scene, "print")].filter(Boolean).join("\n")
        : "";
    const notesH = noteText ? Math.min(1.35, cellH * (options.wristband ? 0.2 : 0.26)) : 0;
    const artH = cellH - titleH - notesH - 0.08;
    const artW = Math.min(cellW, (artH * CANVAS_W) / CANVAS_H);
    const artX = x + (cellW - artW) / 2;
    const artY = y + titleH;

    if (options.includeName) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size.w < 5 ? 9 : 13);
      doc.setTextColor(22, 33, 28);
      doc.text(play.name || "Untitled play", x, y + titleH * 0.72);
      const meta = [play.formation, play.playType].filter(Boolean).join(" · ").toUpperCase();
      if (meta) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(size.w < 5 ? 6 : 8);
        doc.setTextColor(120, 132, 124);
        doc.text(meta, x + cellW, y + titleH * 0.72, { align: "right" });
      }
    }

    const dpi = Math.max(72, options.dpi || 300);
    const png = await svgToPng(
      sceneToSvg(play.scene, { transparent: options.transparent, watermark: options.watermark }),
      Math.max(600, artW * dpi),
      Math.max(380, ((artW * dpi) * CANVAS_H) / CANVAS_W),
      options.transparent ? "transparent" : "#FFFFFF",
    );
    doc.addImage(png, "PNG", artX, artY, artW, (artW * CANVAS_H) / CANVAS_W);

    if (notesH > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size.w < 5 ? 6.5 : 9.5);
      doc.setTextColor(60, 72, 64);
      const lines = doc.splitTextToSize(noteText, cellW);
      doc.text(lines.slice(0, Math.floor(notesH / 0.16)), x, artY + (artW * CANVAS_H) / CANVAS_W + 0.22);
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

export async function wristbandPdf(
  plays: Pick<StoredPlay, "name" | "formation" | "playType" | "description" | "scene">[],
  perCard: 6 | 8 | 10 = 8,
  title = "Wristband cards",
  watermark: string | null = null,
) {
  return playsToPdf(
    plays,
    {
      size: "letter-p",
      perPage: perCard,
      includeNotes: false,
      includeName: true,
      transparent: false,
      dpi: 300,
      watermark,
      wristband: true,
    },
    title,
  );
}
