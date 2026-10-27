import { jsPDF } from "jspdf";
import { placeDiagram } from "./export";
import { playerNoteLines } from "./notes";
import { CARD_LOOK, FULL_LOOK, lettersFit, type PrintLook } from "./printLook";
import type { Scene, StoredPlay } from "./types";

/**
 * Wristband cards from the Grid1ron Design canvas (Wristbands · print
 * builder): numbered cells that match the Call Sheet, laid out in a grid on
 * each card, printed as quarterback and center cards plus a coach sheet.
 */
export type BandEntry = {
  number: string;
  name: string;
  scene: Scene | null;
  /** For the coach's call sheet; blank when the call has no linked play. */
  formation?: string;
  type?: string;
};
export type CellShows = { diagram: boolean; name: boolean; numberOnly: boolean };
export type BandCopies = { qb: number; center: number; coach: number };
export type BandGrid = { cols: number; rows: number };

/** Plays per card, as columns × rows. */
export const BAND_GRIDS: BandGrid[] = [
  { cols: 1, rows: 1 },
  { cols: 2, rows: 1 },
  { cols: 3, rows: 1 },
  { cols: 2, rows: 2 },
  { cols: 3, rows: 2 },
  { cols: 4, rows: 2 },
  { cols: 3, rows: 3 },
  { cols: 5, rows: 2 },
  { cols: 4, rows: 3 },
];
export const gridKey = (g: BandGrid) => `${g.cols}x${g.rows}`;

/**
 * Printed card sizes: the insert window of the wristbands coaches actually
 * buy. Window sizes come from each maker's product listing (measured inside
 * the clear window); "Custom" takes the coach's own measurement. Ids are
 * saved in the browser, so never rename one.
 */
export const BAND_SIZES = [
  { id: "flag", label: "NFL FLAG", w: 4.5, h: 2.02, note: "Fits the standard NFL FLAG wristband window." },
  { id: "large", label: "Teen / 3-window", w: 4.75, h: 2.5, note: "Fits a 4.75 × 2.50 in window: Football Play Card Teen and most 3-window teen bands." },
  { id: "fpc-youth", label: "Youth 3-window", w: 3.75, h: 2.25, note: "Fits a 3.75 × 2.25 in youth window (Football Play Card Youth). Best at 4 to 6 plays a card." },
  { id: "youth-wide", label: "Youth wide", w: 4.5, h: 2.25, note: "Fits a 4.50 × 2.25 in youth insert, the common youth 3-window size." },
  { id: "small", label: "Small", w: 4, h: 2.5, note: "Fits the 4 × 2.5 in insert of small 4.75 in multi-window bands." },
  { id: "varsity", label: "Varsity", w: 4.75, h: 2.75, note: "Fits a 4.75 × 2.75 in varsity insert." },
  { id: "pro-athletics", label: "4.5 × 2.75", w: 4.5, h: 2.75, note: "Fits a 4.50 × 2.75 in window (Pro Athletics 3-compartment bands)." },
  { id: "index", label: "Adult single / Index", w: 5, h: 3, note: "A 5 × 3 in card: Champro adult single window, an index card, or the sideline." },
  { id: "fpc-adult", label: "Adult 3-window", w: 5.25, h: 3.25, note: "Fits a 5.25 × 3.25 in adult window (Football Play Card Adult). Room for 12 to 20 plays." },
  { id: "custom", label: "Custom", w: 4.5, h: 2.5, note: "Measure the inside of your wristband window, edge to edge, and type it in." },
] as const;
export type BandSizeId = (typeof BAND_SIZES)[number]["id"];
export const BAND_CUSTOM_LIMITS = { min: 1.5, max: 8 };

/** Where the cards go: laid up on a sheet with cut lines, or one card per page for a print shop. */
export const BAND_PAPERS = [
  { id: "letter", label: "Letter", w: 8.5, h: 11 },
  { id: "legal", label: "Legal", w: 8.5, h: 14 },
  { id: "a4", label: "A4", w: 8.27, h: 11.69 },
  { id: "card", label: "One card per page", w: 0, h: 0 },
] as const;
export type BandPaperId = (typeof BAND_PAPERS)[number]["id"];

/**
 * How calls are numbered. "source" keeps the Call Sheet's # column (or the
 * playbook order); "order" counts up from `start` in print order; "card" makes
 * the first digits the card and the last the box (card A 11–18, card B 21–28),
 * so the call tells the quarterback which panel to look at.
 */
export type BandNumbering = { mode: "source" | "order" | "card" | "spot"; start: number };
export const NUMBERING_MODES = [
  { id: "source", label: "Keep my numbers", hint: "The Call Sheet's # column, or the playbook order." },
  { id: "order", label: "1, 2, 3 in print order", hint: "Counts up from the start number as the boxes sit on the cards." },
  { id: "card", label: "By card", hint: "Card A is 11, 12, 13…, card B is 21, 22, 23…, so the first digit names the panel." },
  { id: "spot", label: "A1, A2, B1…", hint: "The card letter, then the box: call \"B3\" and the player looks at card B, third box." },
] as const;
export const DEFAULT_NUMBERING: BandNumbering = { mode: "source", start: 1 };

/** Number entries already in print order. Pure, so the preview, the cards and the call sheet agree. */
export function numberEntries(entries: BandEntry[], n: BandNumbering, perCard: number): BandEntry[] {
  if (n.mode === "source") return entries;
  const start = Math.max(0, Math.floor(n.start) || 0);
  if (n.mode === "order") return entries.map((e, i) => ({ ...e, number: String(start + i) }));
  if (n.mode === "spot") return entries.map((e, i) => ({ ...e, number: cardSpot(i, perCard) }));
  // Ten per card while the box number stays one digit, a hundred once a card holds ten or more.
  const step = perCard < 10 ? 10 : 100;
  const first = Math.max(1, start);
  return entries.map((e, i) => ({ ...e, number: String((Math.floor(i / perCard) + first) * step + (i % perCard) + 1) }));
}

/** Numbers printed on more than one box, so the page can warn before game day. */
export function duplicateNumbers(entries: BandEntry[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const e of entries) (seen.has(e.number) ? dup : seen).add(e.number);
  return [...dup];
}

/** Where a call sits: card letter and box, counted left to right, top to bottom ("B3"). */
export const cardSpot = (index: number, perCard: number) => `${cardLetter(Math.floor(index / perCard))}${(index % perCard) + 1}`;

const TYPE_LABEL: Record<string, string> = { pass: "Pass", run: "Run", defense: "Defense", special: "Special" };
export const playTypeLabel = (t?: string) => (t ? TYPE_LABEL[t] ?? t : "");

export type CallSheetRow = { number: string; name: string; formation: string; type: string; spot: string };

/** The coach's call sheet: every call sorted by number, with its spot on the wristband. */
export function callSheetRows(entries: BandEntry[], perCard: number): CallSheetRow[] {
  return entries
    .map((e, i) => ({ number: e.number, name: e.name, formation: e.formation ?? "", type: playTypeLabel(e.type), spot: cardSpot(i, perCard) }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

/** What the coach copy holds: the number list, a diagram per call, or the list followed by the diagrams. */
export type CoachSheet = "list" | "diagrams" | "both";
export const COACH_SHEETS = [
  { id: "list", label: "Call list" },
  { id: "diagrams", label: "Diagrams" },
  { id: "both", label: "Both" },
] as const;

export const NUMBER_SIZES = { s: 8, m: 11, l: 15 } as const;
export type NumberSize = keyof typeof NUMBER_SIZES;

/** How each box shows its number: a dark tab at the left, or a gray strip across the top. */
export type NumberStyle = "tab" | "band";

/** Words in the header and border text that fill in per card. */
export const BAND_TOKENS = ["{role}", "{card}", "{source}", "{count}"] as const;

export type BandOptions = {
  card: { w: number; h: number };
  grid: BandGrid;
  shows: CellShows;
  look: PrintLook;
  numberSize: NumberSize;
  numberStyle: NumberStyle;
  header: { show: boolean; left: string; right: string };
  /** Text printed along the bottom border, e.g. the team name. Empty for none. */
  footer: string;
  paper: BandPaperId;
  cutMarks: boolean;
  copies: BandCopies;
  coachSheet: CoachSheet;
  source: string;
  watermark: string | null;
  dpi: number;
  vector: boolean;
};

export const defaultBandText = {
  left: "{role} · Card {card} · {source}",
  right: "{count} plays",
};

export const DEFAULT_BAND_LOOK = CARD_LOOK;

export function entriesFromPlays(plays: StoredPlay[], numbers?: string[]): BandEntry[] {
  return plays.map((p, i) => ({ ...entryFromPlay(p), number: numbers?.[i] ?? String(i + 1) }));
}

export function entryFromPlay(p: StoredPlay, number = ""): BandEntry {
  return { number, name: p.name || "Untitled play", scene: p.scene, formation: p.formation, type: p.playType };
}

/** Fill the {tokens} in a header or footer line. */
export function fillBandText(text: string, vars: { role: string; card: string; source: string; count: number }) {
  return text
    .replace(/\{role\}/gi, vars.role)
    .replace(/\{card\}/gi, vars.card)
    .replace(/\{source\}/gi, vars.source)
    .replace(/\{count\}/gi, String(vars.count));
}

/** Header and footer band heights, in inches, shared by the PDF and the preview. */
export function bandChrome(opts: Pick<BandOptions, "header" | "footer">) {
  return { headH: opts.header.show ? 0.2 : 0, footH: opts.footer.trim() ? 0.16 : 0 };
}

/** Fill of the "band" number strip, also used by the preview. */
export const BAND_GRAY: [number, number, number] = [217, 222, 227];

/** Number strip at the top of each cell, in inches, for a number printed at `pt`. */
export const stripHeight = (pt: number) => (pt * 1.3) / 72;

/** The number strip may take at most this share of a box's height; the diagram keeps the rest. */
const STRIP_SHARE = 0.22;
/** Below this the number stops reading at arm's length, so it holds here and the diagram gives way. */
const MIN_NUMBER_PT = 6;

/**
 * Type sizes for one box, scaled to the box like Football Play Card does: the
 * coach's number size is the most it prints at, and a small box (a dense grid
 * or a youth window) takes it down so the strip never crowds out the play.
 * Shared by the cards, the preview and the fit checks so they always agree.
 */
export function cellType(o: Pick<BandOptions, "card" | "grid" | "header" | "footer" | "numberSize">) {
  const { headH, footH } = bandChrome(o);
  const cellW = o.card.w / o.grid.cols;
  const cellH = (o.card.h - headH - footH) / o.grid.rows;
  const chosen = NUMBER_SIZES[o.numberSize];
  const numPt = Math.max(MIN_NUMBER_PT, Math.min(chosen, (cellH * 72 * STRIP_SHARE) / 1.3));
  // A number-only box: as big as the box allows, up to 40 pt, leaving room for the name under it.
  const bigPt = Math.max(numPt, Math.min(40, chosen * 2.4, cellH * 72 * 0.5, cellW * 72 * 0.45));
  return { cellW, cellH, numPt, strip: stripHeight(numPt), bigPt, namePt: Math.max(6, Math.min(numPt * 0.62, cellH * 72 * 0.14)) };
}

/** Card letter for the nth card: A … Z, then AA, AB … */
export function cardLetter(n: number): string {
  return n < 26 ? String.fromCharCode(65 + n) : cardLetter(Math.floor(n / 26) - 1) + cardLetter(n % 26);
}

async function drawCard(doc: jsPDF, x: number, y: number, entries: BandEntry[], vars: Parameters<typeof fillBandText>[1], o: BandOptions) {
  const { cols, rows } = o.grid;
  const { w: CARD_W, h: CARD_H } = o.card;
  const { headH, footH } = bandChrome(o);
  const perCard = cols * rows;

  doc.setDrawColor(11, 21, 36);
  doc.setLineWidth(0.01);
  doc.rect(x, y, CARD_W, CARD_H);
  if (headH) {
    doc.setFillColor(11, 21, 36);
    doc.rect(x, y, CARD_W, headH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(22, 200, 232);
    doc.text(fillBandText(o.header.left, vars).toUpperCase(), x + 0.06, y + 0.135);
    doc.text(fillBandText(o.header.right, vars).toUpperCase(), x + CARD_W - 0.06, y + 0.135, { align: "right" });
  }
  if (footH) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(11, 21, 36);
    doc.text(fillBandText(o.footer, vars).toUpperCase(), x + CARD_W / 2, y + CARD_H - 0.05, { align: "center" });
    doc.setDrawColor(11, 21, 36);
    doc.line(x, y + CARD_H - footH, x + CARD_W, y + CARD_H - footH);
  }

  const { cellW, cellH, numPt, strip, bigPt, namePt } = cellType(o);
  for (let i = 0; i < perCard; i++) {
    const cx = x + (i % cols) * cellW;
    const cy = y + headH + Math.floor(i / cols) * cellH;
    doc.setDrawColor(150, 164, 178);
    doc.setLineWidth(0.008);
    doc.rect(cx, cy, cellW, cellH);
    const e = entries[i];
    if (!e) continue;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 21, 36);
    if (o.shows.numberOnly || !e.scene || !o.shows.diagram) {
      doc.setFontSize(bigPt);
      doc.text(e.number, cx + cellW / 2, cy + cellH / 2 + 0.05, { align: "center", baseline: "middle" });
      if (o.shows.name) {
        doc.setFontSize(namePt);
        doc.text(doc.splitTextToSize(e.name.toUpperCase(), cellW - 0.08).slice(0, 2), cx + cellW / 2, cy + cellH - 0.12, { align: "center" });
      }
      continue;
    }
    doc.setFontSize(numPt);
    if (o.numberStyle === "band") {
      // Gray strip across the top with the number centred, like most printed wristbands.
      doc.setFillColor(...BAND_GRAY);
      doc.rect(cx, cy, cellW, strip, "F");
      doc.setDrawColor(150, 164, 178);
      doc.line(cx, cy + strip, cx + cellW, cy + strip);
      doc.setTextColor(11, 21, 36);
      const label = o.shows.name ? `${e.number} · ${e.name.toUpperCase()}` : e.number;
      fitSize(doc, label, cellW - 0.08, numPt, numPt * 0.7);
      doc.text(fitText(doc, label, cellW - 0.08), cx + cellW / 2, cy + strip / 2, { align: "center", baseline: "middle" });
    } else {
      // Number in a solid tab, name beside it, diagram filling the rest of the cell.
      const tabW = Math.max(strip, doc.getTextWidth(e.number) + 0.08);
      doc.setFillColor(11, 21, 36);
      doc.rect(cx, cy, tabW, strip, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(e.number, cx + tabW / 2, cy + strip / 2, { align: "center", baseline: "middle" });
      if (o.shows.name) {
        const name = e.name.toUpperCase();
        const room = cellW - tabW - 0.08;
        // Shrink a long name before cutting it, and cut with an ellipsis, never mid-phrase at a dash.
        fitSize(doc, name, room, Math.max(5.5, numPt * 0.66), 5);
        doc.setTextColor(11, 21, 36);
        doc.text(fitText(doc, name, room), cx + tabW + 0.04, cy + strip / 2, { baseline: "middle" });
      }
    }
    const art = diagramBox(o);
    await placeDiagram(doc, e.scene, cx + DIAGRAM_PAD, cy + strip + DIAGRAM_PAD / 2, art.w, art.h, {
      look: o.look,
      watermark: o.watermark,
      vector: o.vector,
      dpi: o.dpi,
    });
  }
}

/** Gap between a box's border and its diagram, in inches. */
const DIAGRAM_PAD = 0.03;

/** The diagram's printed size inside one box, in inches. Shared by the cards and the fit check. */
export function diagramBox(o: Pick<BandOptions, "card" | "grid" | "header" | "footer" | "numberSize">) {
  const { cellW, cellH, strip } = cellType(o);
  return { w: cellW - DIAGRAM_PAD * 2, h: cellH - strip - DIAGRAM_PAD * 1.5 };
}

/** A diagram reads on a wristband from about this tall and this wide, in inches. */
export const READABLE_BOX = { w: 1.0, h: 0.55 };

/**
 * Whether each box is big enough for a diagram to read, and when it is not, the
 * densest grid on this card whose boxes are (null when no grid on the card fits,
 * so a bigger card is the only fix). Scaling a drawing down cannot save a box that
 * is too short, so the Wristbands page tells the coach before they print.
 */
export function boxCheck(o: Pick<BandOptions, "card" | "grid" | "header" | "footer" | "numberSize">): {
  art: { w: number; h: number };
  readable: boolean;
  better: (BandGrid & { art: { w: number; h: number } }) | null;
} {
  const art = diagramBox(o);
  const readable = art.w >= READABLE_BOX.w && art.h >= READABLE_BOX.h;
  if (readable) return { art, readable, better: null };
  const fits = BAND_GRIDS.map((g) => ({ ...g, art: diagramBox({ ...o, grid: g }) })).filter(
    (g) => g.art.w >= READABLE_BOX.w && g.art.h >= READABLE_BOX.h,
  );
  fits.sort((a, b) => b.cols * b.rows - a.cols * a.rows);
  return { art, readable, better: fits[0] ?? null };
}

/** Numbers of the boxes whose diagram is too small to keep its player letters, for a warning before printing. */
export function tightBoxes(entries: BandEntry[], o: Pick<BandOptions, "card" | "grid" | "header" | "footer" | "numberSize" | "look" | "shows">): string[] {
  if (!o.shows.diagram || o.shows.numberOnly) return [];
  const art = diagramBox(o);
  return entries.filter((e) => e.scene && !lettersFit(e.scene, o.look, art.w, art.h)).map((e) => e.number);
}

/**
 * A 1-inch bar and a reminder in the page margin. If the bar doesn't measure
 * an inch, the printer scaled the page and the cards won't fit the window.
 */
function scaleCheck(doc: jsPDF, paperW: number, paperH: number) {
  const x = 0.4;
  const y = paperH - 0.22;
  doc.setDrawColor(11, 21, 36);
  doc.setLineWidth(0.012);
  doc.line(x, y, x + 1, y);
  for (const t of [0, 0.5, 1]) doc.line(x + t, y - (t === 0.5 ? 0.04 : 0.07), x + t, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(60, 72, 90);
  doc.text("1 in", x + 1.06, y + 0.02);
  doc.text("Print at Actual size (100%). If this bar isn't 1 inch, turn off \"Fit to page\" and print again.", x + 1.32, y + 0.02);
}

/** Short corner ticks just outside a card, so it can be trimmed without a printed border. */
function cutMarks(doc: jsPDF, x: number, y: number, w: number, h: number) {
  const gap = 0.04;
  const len = 0.14;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.005);
  for (const [px, sx] of [[x, -1], [x + w, 1]] as const)
    for (const [py, sy] of [[y, -1], [y + h, 1]] as const) {
      doc.line(px + sx * gap, py, px + sx * (gap + len), py);
      doc.line(px, py + sy * gap, px, py + sy * (gap + len));
    }
}

/** Cards in rows and columns on the paper, or one per page. */
function sheetSlots(o: BandOptions) {
  const paper = BAND_PAPERS.find((p) => p.id === o.paper) ?? BAND_PAPERS[0];
  if (paper.id === "card") return { paper: { w: o.card.w, h: o.card.h }, slots: [{ x: 0, y: 0 }] };
  const margin = 0.4;
  const gap = o.cutMarks ? 0.36 : 0.12;
  const across = Math.max(1, Math.floor((paper.w - margin * 2 + gap) / (o.card.w + gap)));
  const down = Math.max(1, Math.floor((paper.h - margin * 2 + gap) / (o.card.h + gap)));
  const usedW = across * o.card.w + (across - 1) * gap;
  const left = (paper.w - usedW) / 2;
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < down; r++)
    for (let c = 0; c < across; c++) slots.push({ x: left + c * (o.card.w + gap), y: margin + r * (o.card.h + gap) });
  return { paper: { w: paper.w, h: paper.h }, slots };
}

/** How many cards land on each printed page, for the summary line. */
export const cardsPerPage = (o: BandOptions) => sheetSlots(o).slots.length;

/** Call list columns on a letter page, in inches from the left margin. */
const LIST_COLS = { number: 0.5, name: 1.35, formation: 4.55, type: 6.35, spot: 7.45 };
const LIST_ROW = 0.3;

/**
 * The coach's call sheet: number, play, formation, type and card spot, sorted
 * by number in rows big enough to read on the sideline.
 */
function drawCallList(doc: jsPDF, rows: CallSheetRow[], source: string) {
  const top = 1.15;
  const perPage = Math.floor((11 - top - 0.5) / LIST_ROW);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let p = 0; p < pages; p++) {
    if (p > 0) doc.addPage("letter", "portrait");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(11, 21, 36);
    doc.text(`Call sheet · ${source}`, 0.5, 0.62);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 72, 90);
    doc.text(`${rows.length} ${rows.length === 1 ? "call" : "calls"}${pages > 1 ? ` · page ${p + 1} of ${pages}` : ""}`, 8, 0.62, { align: "right" });

    // Column heads on a dark band.
    doc.setFillColor(11, 21, 36);
    doc.rect(0.4, top - 0.27, 7.7, 0.27, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    const headY = top - 0.09;
    doc.text("#", LIST_COLS.number, headY);
    doc.text("PLAY", LIST_COLS.name, headY);
    doc.text("FORMATION", LIST_COLS.formation, headY);
    doc.text("TYPE", LIST_COLS.type, headY);
    doc.text("CARD", LIST_COLS.spot, headY);

    rows.slice(p * perPage, (p + 1) * perPage).forEach((r, i) => {
      const y = top + i * LIST_ROW;
      if (i % 2) {
        doc.setFillColor(236, 241, 246);
        doc.rect(0.4, y, 7.7, LIST_ROW, "F");
      }
      const mid = y + LIST_ROW / 2;
      doc.setTextColor(11, 21, 36);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(r.number, LIST_COLS.number, mid, { baseline: "middle" });
      doc.setFontSize(11);
      doc.text(fitText(doc, r.name, LIST_COLS.formation - LIST_COLS.name - 0.15), LIST_COLS.name, mid, { baseline: "middle" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(fitText(doc, r.formation, LIST_COLS.type - LIST_COLS.formation - 0.15), LIST_COLS.formation, mid, { baseline: "middle" });
      doc.text(r.type, LIST_COLS.type, mid, { baseline: "middle" });
      doc.setFont("helvetica", "bold");
      doc.text(r.spot, LIST_COLS.spot, mid, { baseline: "middle" });
    });
    doc.setDrawColor(150, 164, 178);
    doc.setLineWidth(0.01);
    doc.rect(0.4, top - 0.27, 7.7, 0.27 + Math.min(perPage, rows.length - p * perPage) * LIST_ROW);
  }
}

/** Set the largest font size from `max` down to `min` points at which the text fits the width. */
function fitSize(doc: jsPDF, text: string, width: number, max: number, min: number) {
  let size = max;
  doc.setFontSize(size);
  while (size > min && doc.getTextWidth(text) > width) doc.setFontSize((size = Math.max(min, size - 0.5)));
}

/** Trim text with an ellipsis to fit a width at the current font. */
function fitText(doc: jsPDF, text: string, width: number) {
  if (doc.getTextWidth(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Sheet(s) of wristband cards, then the coach sheet. */
export async function wristbandSheets(entries: BandEntry[], o: BandOptions): Promise<jsPDF> {
  const perCard = o.grid.cols * o.grid.rows;
  const { paper, slots } = sheetSlots(o);
  const orient = paper.w > paper.h ? "landscape" : "portrait";
  const doc = new jsPDF({ unit: "in", format: [paper.w, paper.h], orientation: orient, compress: true });
  const cards: BandEntry[][] = [];
  for (let i = 0; i < entries.length; i += perCard) cards.push(entries.slice(i, i + perCard));
  const roles = [
    ...Array.from({ length: o.copies.qb }, () => "QB wristband"),
    ...Array.from({ length: o.copies.center }, () => "Center wristband"),
  ];

  let slot = 0;
  let first = true;
  for (const role of roles) {
    for (let c = 0; c < cards.length; c++) {
      if (slot === slots.length || first) {
        if (!first) doc.addPage([paper.w, paper.h], orient);
        first = false;
        slot = 0;
        if (o.paper !== "card") scaleCheck(doc, paper.w, paper.h);
      }
      const { x, y } = slots[slot];
      const vars = { role, card: cardLetter(c), source: o.source, count: cards[c].length };
      await drawCard(doc, x, y, cards[c], vars, o);
      if (o.cutMarks && o.paper !== "card") cutMarks(doc, x, y, o.card.w, o.card.h);
      slot++;
    }
  }

  // Coach copy: the call list, then (or instead) every call with a bigger diagram and player notes. Always on letter.
  for (let n = 0; n < o.copies.coach; n++) {
    if (o.coachSheet !== "diagrams") {
      if (!first) doc.addPage("letter", "portrait");
      first = false;
      drawCallList(doc, callSheetRows(entries, perCard), o.source);
      if (o.coachSheet === "list") continue;
    }
    if (!first) doc.addPage("letter", "portrait");
    first = false;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(11, 21, 36);
    doc.text(`Coach sheet · ${o.source}`, 0.5, 0.6);
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
      if (e.scene && !o.shows.numberOnly) {
        const h = 1.7;
        await placeDiagram(doc, e.scene, cx, cy + 0.25, colW, h, {
          look: o.look.fit === "play" ? { ...o.look, weight: "auto" } : FULL_LOOK,
          watermark: o.watermark,
          vector: o.vector,
          dpi: o.dpi,
        });
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

  doc.setProperties({ title: `Wristbands · ${o.source}` });
  return doc;
}

/** Card settings a preset can set in one click; anything left out stays as the coach had it. */
export type BandPresetPrefs = {
  grid?: string;
  sizeId?: BandSizeId;
  shows?: CellShows;
  look?: PrintLook;
  numberSize?: NumberSize;
  numberStyle?: NumberStyle;
  header?: BandOptions["header"];
};

export const BAND_PRESETS: { id: string; label: string; hint: string; prefs: BandPresetPrefs }[] = [
  {
    id: "sideline",
    label: "Sideline 2×4",
    hint: "Eight plays to a card: gray number strip, solid colored dots, bold routes, no field. The classic wristband look.",
    prefs: {
      grid: "4x2",
      shows: { diagram: true, name: false, numberOnly: false },
      look: { fit: "play", weight: "auto", field: "none", dots: true, icons: 1, lines: 1, zoom: 1 },
      numberSize: "m",
      numberStyle: "band",
      header: { show: false, ...defaultBandText },
    },
  },
  {
    id: "bold",
    label: "Wristband bold",
    hint: "Six plays to a card with extra-thick routes, big lettered players and large numbers, for players who read on the run.",
    prefs: {
      grid: "3x2",
      shows: { diagram: true, name: false, numberOnly: false },
      look: { fit: "play", weight: "auto", field: "yards", dots: false, icons: 1.3, lines: 1.5, zoom: 1 },
      numberSize: "l",
      numberStyle: "tab",
      header: { show: true, ...defaultBandText },
    },
  },
];

/** Boxes this big keep player letters and bold routes, in inches. */
const ROOMY_BOX = { w: 1.15, h: 0.75 };

/**
 * The layout that reads best on a card of this size: the most plays a card can
 * hold while every box stays roomy (letters and bold routes), else the most
 * that stay readable (Sideline's solid dots), else the biggest boxes the card
 * allows. Pure, so the Wristbands page can offer it and tests can pin it down.
 */
export function bestLayout(card: { w: number; h: number }): { grid: string; prefs: BandPresetPrefs; why: string } {
  const at = (g: BandGrid) => diagramBox({ card, grid: g, header: { show: true, ...defaultBandText }, footer: "", numberSize: "m" });
  // Fewer than four plays a card is a poor wristband, so a card that only manages that falls through to the denser dot layout.
  const multi = BAND_GRIDS.filter((g) => g.cols * g.rows >= 4);
  const densest = (ok: (a: { w: number; h: number }) => boolean) =>
    multi.filter((g) => ok(at(g))).sort((a, b) => b.cols * b.rows - a.cols * a.rows)[0];
  const roomy = densest((a) => a.w >= ROOMY_BOX.w && a.h >= ROOMY_BOX.h);
  const bold = BAND_PRESETS.find((p) => p.id === "bold")!.prefs;
  const side = BAND_PRESETS.find((p) => p.id === "sideline")!.prefs;
  if (roomy) {
    const n = roomy.cols * roomy.rows;
    return { grid: gridKey(roomy), prefs: { ...bold, grid: gridKey(roomy) }, why: `${n} plays a card with lettered players and bold routes` };
  }
  const readable = densest((a) => a.w >= READABLE_BOX.w && a.h >= READABLE_BOX.h);
  if (readable) {
    const n = readable.cols * readable.rows;
    return { grid: gridKey(readable), prefs: { ...side, grid: gridKey(readable) }, why: `${n} plays a card as solid dots, the most that stay readable on this card` };
  }
  const biggest = [...BAND_GRIDS].sort((a, b) => at(b).w * at(b).h - at(a).w * at(a).h)[0];
  return { grid: gridKey(biggest), prefs: { ...side, grid: gridKey(biggest) }, why: "this card is small; one play to a box is as big as it gets" };
}

/** Where the Wristbands page keeps its card settings in this browser. */
export const BAND_PREFS_KEY = "grid1ronvault.wristbands.v1";

/** Fired when something other than the Wristbands page changes its saved settings. */
export const BAND_PREFS_EVENT = "grid1ronvault:wristband-prefs";

/** Sets the Wristbands page to a one-click card layout (Griddy's wristband change); false if storage is blocked. */
export function chooseBandPreset(id: string): boolean {
  const preset = BAND_PRESETS.find((p) => p.id === id);
  if (!preset) return false;
  try {
    const saved = JSON.parse(localStorage.getItem(BAND_PREFS_KEY) ?? "null") ?? {};
    localStorage.setItem(BAND_PREFS_KEY, JSON.stringify({ ...saved, ...preset.prefs }));
    // The Wristbands page, if it's open behind Griddy's panel, picks the new layout up.
    window.dispatchEvent(new Event(BAND_PREFS_EVENT));
    return true;
  } catch {
    return false;
  }
}
