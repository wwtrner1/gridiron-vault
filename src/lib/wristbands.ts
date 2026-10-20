import { jsPDF } from "jspdf";
import { sceneToSvg, svgToPng } from "./export";
import { playerNoteLines } from "./notes";
import { CANVAS_H, CANVAS_W } from "./types";
import type { Scene, StoredPlay } from "./types";

/**
 * Wristband cards from the Grid1ron Design canvas (Wristbands · print
 * builder): numbered cells that match the Season Grid, 6, 8 or 10 to a
 * card, printed as quarterback and center cards plus a coach sheet.
 */
export type BandEntry = { number: string; name: string; scene: Scene | null };
export type CellShows = { diagram: boolean; name: boolean; numberOnly: boolean };
export type BandCopies = { qb: number; center: number; coach: number };

/** Card grid for each size: columns × rows. */
export const BAND_LAYOUT: Record<6 | 8 | 10, { cols: number; rows: number }> = {
  6: { cols: 3, rows: 2 },
  8: { cols: 4, rows: 2 },
  10: { cols: 5, rows: 2 },
};

/**
 * Printed card sizes. The NFL FLAG card (4.5 × 2.02 in) is the default; the
 * large card fits wristband windows of 4.75 × 2.50 in. `perPage` is how many
 * stack in one column on a letter sheet.
 */
export const BAND_SIZES = [
  { id: "flag", label: "NFL FLAG", w: 4.5, h: 2.02, perPage: 5, note: "Fits the standard NFL FLAG wristband window." },
  { id: "large", label: "Large", w: 4.75, h: 2.5, perPage: 4, note: "Fits a 4.75 × 2.50 in wristband window." },
] as const;
export type BandSize = (typeof BAND_SIZES)[number];
export type BandSizeId = BandSize["id"];

export function entriesFromPlays(plays: StoredPlay[], numbers?: string[]): BandEntry[] {
  return plays.map((p, i) => ({ number: numbers?.[i] ?? String(i + 1), name: p.name || "Untitled play", scene: p.scene }));
}

async function diagram(scene: Scene, watermark: string | null, dpi: number, wIn: number) {
  const px = Math.max(240, Math.round(wIn * dpi));
  return svgToPng(sceneToSvg(scene, { watermark }), px, Math.round((px * CANVAS_H) / CANVAS_W));
}

async function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  entries: BandEntry[],
  perCard: 6 | 8 | 10,
  shows: CellShows,
  label: string,
  card: BandSize,
  opts: { watermark: string | null; dpi: number },
) {
  const { cols, rows } = BAND_LAYOUT[perCard];
  const { w: CARD_W, h: CARD_H } = card;
  const headH = 0.2;
  doc.setDrawColor(11, 21, 36);
  doc.setLineWidth(0.01);
  doc.rect(x, y, CARD_W, CARD_H);
  doc.setFillColor(11, 21, 36);
  doc.rect(x, y, CARD_W, headH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(22, 200, 232);
  doc.text(label.toUpperCase(), x + 0.06, y + 0.135);
  doc.text(`${entries.length} PLAYS`, x + CARD_W - 0.06, y + 0.135, { align: "right" });

  const cellW = CARD_W / cols;
  const cellH = (CARD_H - headH) / rows;
  for (let i = 0; i < perCard; i++) {
    const cx = x + (i % cols) * cellW;
    const cy = y + headH + Math.floor(i / cols) * cellH;
    doc.setDrawColor(221, 229, 236);
    doc.rect(cx, cy, cellW, cellH);
    const e = entries[i];
    if (!e) continue;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 21, 36);
    if (shows.numberOnly || !e.scene) {
      doc.setFontSize(22);
      doc.text(e.number, cx + cellW / 2, cy + cellH / 2 + 0.06, { align: "center" });
      if (shows.name) {
        doc.setFontSize(5.5);
        doc.text(doc.splitTextToSize(e.name.toUpperCase(), cellW - 0.08).slice(0, 2), cx + cellW / 2, cy + cellH - 0.12, { align: "center" });
      }
      continue;
    }
    doc.setFontSize(8);
    doc.text(e.number, cx + 0.05, cy + 0.12);
    if (shows.name) {
      doc.setFontSize(5);
      doc.setTextColor(60, 72, 90);
      doc.text(doc.splitTextToSize(e.name.toUpperCase(), cellW - 0.3)[0] ?? "", cx + 0.25, cy + 0.115);
    }
    if (shows.diagram) {
      const top = cy + 0.16;
      const availH = cellH - 0.2;
      const w = Math.min(cellW - 0.08, (availH * CANVAS_W) / CANVAS_H);
      const h = (w * CANVAS_H) / CANVAS_W;
      const png = await diagram(e.scene, opts.watermark, opts.dpi, w);
      doc.addImage(png, "PNG", cx + (cellW - w) / 2, top, w, h);
    }
  }
}

/** Letter sheet(s) of wristband cards, then the coach sheet. */
export async function wristbandSheets(
  entries: BandEntry[],
  perCard: 6 | 8 | 10,
  shows: CellShows,
  copies: BandCopies,
  source: string,
  opts: { watermark: string | null; dpi: number },
  card: BandSize = BAND_SIZES[0],
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  const cards: BandEntry[][] = [];
  for (let i = 0; i < entries.length; i += perCard) cards.push(entries.slice(i, i + perCard));
  const labels = [
    ...Array.from({ length: copies.qb }, () => "QB wristband"),
    ...Array.from({ length: copies.center }, () => "Center wristband"),
  ];

  // Cards: one column per letter page (five standard, four large), cut along the borders.
  const { perPage } = card;
  const x = (8.5 - card.w) / 2;
  let slot = 0;
  let first = true;
  for (const label of labels) {
    for (let c = 0; c < cards.length; c++) {
      if (slot === perPage || first) {
        if (!first) doc.addPage("letter", "portrait");
        first = false;
        slot = 0;
      }
      const letter = String.fromCharCode(65 + c);
      await drawCard(doc, x, 0.4 + slot * (card.h + 0.1), cards[c], perCard, shows, `${label} · Card ${letter} · ${source}`, card, opts);
      slot++;
    }
  }

  // Coach sheet: every call with its number, a bigger diagram and player notes.
  for (let n = 0; n < copies.coach; n++) {
    if (!first) doc.addPage("letter", "portrait");
    first = false;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(11, 21, 36);
    doc.text(`Coach sheet · ${source}`, 0.5, 0.6);
    const colW = 3.6;
    const rowH = 2.35;
    let i = 0;
    for (const e of entries) {
      const slotOnPage = i % 8;
      if (i > 0 && slotOnPage === 0) doc.addPage("letter", "portrait");
      const cx = 0.5 + (slotOnPage % 2) * (colW + 0.3);
      const cy = 0.85 + Math.floor(slotOnPage / 2) * rowH;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(11, 21, 36);
      doc.text(`${e.number}  ${e.name}`, cx, cy + 0.15);
      if (e.scene && !shows.numberOnly) {
        const w = colW;
        const h = Math.min(1.7, (w * CANVAS_H) / CANVAS_W);
        const png = await diagram(e.scene, opts.watermark, opts.dpi, w);
        doc.addImage(png, "PNG", cx, cy + 0.25, (h * CANVAS_W) / CANVAS_H, h);
        const notes = playerNoteLines(e.scene, "print");
        if (notes.length) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(60, 72, 90);
          doc.text(doc.splitTextToSize(notes.join("  ·  "), colW).slice(0, 2), cx, cy + 0.25 + h + 0.14);
        }
      }
      i++;
    }
  }

  doc.setProperties({ title: `Wristbands · ${source}` });
  return doc;
}
