import { playToImage } from "./export";
import { playerNoteLines } from "./notes";
import type { PrintLook } from "./printLook";
import type { StoredPlay } from "./types";

type Slideable = Pick<StoredPlay, "name" | "formation" | "playType" | "description" | "scene">;

/** 16:9 slide, in inches. */
const SLIDE = { w: 13.333, h: 7.5 };

/**
 * One slide per play for install meetings: name and formation across the
 * top, the diagram as large as the slide allows, coaching notes underneath and
 * in the speaker notes. pptxgenjs loads only when a coach asks for a deck.
 */
export async function playsToPptx(
  plays: Slideable[],
  opts: { look: PrintLook; dpi: number; watermark: string | null; includeNotes: boolean; includeName: boolean; title: string },
): Promise<{ save: (fileName: string) => Promise<unknown> }> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const deck = new PptxGenJS();
  deck.layout = "LAYOUT_WIDE";
  deck.title = opts.title;
  deck.company = "GridIronVault";

  const margin = 0.4;
  for (const play of plays) {
    const slide = deck.addSlide();
    slide.background = { color: "FFFFFF" };
    const notes = opts.includeNotes ? [play.description?.trim(), ...playerNoteLines(play.scene, "print")].filter(Boolean).join("\n") : "";
    const titleH = opts.includeName ? 0.7 : 0;
    const notesH = notes ? 1.1 : 0;
    if (opts.includeName) {
      slide.addText(play.name || "Untitled play", {
        x: margin, y: 0.25, w: 8.5, h: 0.6, fontFace: "Arial", fontSize: 28, bold: true, color: "0B1524",
      });
      const meta = [play.formation, play.playType].filter(Boolean).join(" · ").toUpperCase();
      if (meta)
        slide.addText(meta, {
          x: SLIDE.w - margin - 4, y: 0.3, w: 4, h: 0.5, fontFace: "Arial", fontSize: 14, color: "6B7F91", align: "right",
        });
    }
    const w = SLIDE.w - margin * 2;
    const h = SLIDE.h - titleH - notesH - margin * 1.5;
    const data = await playToImage(play, { look: opts.look, widthIn: w, heightIn: h, inches: w, dpi: opts.dpi, watermark: opts.watermark });
    slide.addImage({ data, x: margin, y: titleH + margin * 0.75, w, h });
    if (notes) {
      slide.addText(notes, {
        x: margin, y: SLIDE.h - notesH - margin * 0.5, w, h: notesH, fontFace: "Arial", fontSize: 14, color: "3C4840", valign: "top",
      });
      slide.addNotes(notes);
    }
  }
  return { save: (fileName: string) => deck.writeFile({ fileName, compression: true }) };
}
