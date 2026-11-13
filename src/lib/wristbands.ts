// jsPDF is loaded only when a sheet is made, so it stays out of the first download.
import type { jsPDF } from "jspdf";
import { brandStore, hasBrand, hexToRgb, inkOn, luminance, type TeamBrand } from "./brand";
import { placeDiagram } from "./export";
import { playerNoteLines } from "./notes";
import { CARD_LOOK, FULL_LOOK, cutOffs, lettersFit, type PrintLook } from "./printLook";
import type { Scene, StoredPlay } from "./types";
import { traceCode } from "./activity";

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
  personnel?: string;
  /** The play's coaching notes (Play intel), for the call sheet's Notes column. */
  notes?: string;
};
export type CellShows = { diagram: boolean; name: boolean; numberOnly: boolean };
export type BandCopies = { qb: number; center: number; coach: number };
/**
 * Plays per card as columns × rows. `count` is set when the last row is short
 * (5 as 3 over 2, 7 as 4 over 3): its boxes keep the same size and sit in the
 * middle, so every play still prints at one scale.
 */
export type BandGrid = { cols: number; rows: number; count?: number };

/** Plays per card: every count from 1 to 10, then 12. */
export const BAND_GRIDS: BandGrid[] = [
  { cols: 1, rows: 1 },
  { cols: 2, rows: 1 },
  { cols: 3, rows: 1 },
  { cols: 2, rows: 2 },
  { cols: 3, rows: 2, count: 5 },
  { cols: 3, rows: 2 },
  { cols: 4, rows: 2, count: 7 },
  { cols: 4, rows: 2 },
  { cols: 3, rows: 3 },
  { cols: 5, rows: 2 },
  { cols: 4, rows: 3 },
];
/** Boxes on one card. */
export const perCardOf = (g: BandGrid) => Math.min(g.cols * g.rows, g.count ?? g.cols * g.rows);
const shortRow = (g: BandGrid) => perCardOf(g) < g.cols * g.rows;
/** Saved in the browser, so a full grid keeps its old "3x2" key. */
export const gridKey = (g: BandGrid) => (shortRow(g) ? `${g.cols}x${g.rows}-${perCardOf(g)}` : `${g.cols}x${g.rows}`);
/** How the grid reads to a coach: "3×2", or "3 + 2" when the last row is short. */
export const gridLabel = (g: BandGrid) => {
  if (!shortRow(g)) return `${g.cols}×${g.rows}`;
  const n = perCardOf(g);
  return Array.from({ length: g.rows }, (_, r) => Math.min(g.cols, n - r * g.cols)).join(" + ");
};
export const gridByKey = (key: string): BandGrid | undefined => BAND_GRIDS.find((g) => gridKey(g) === key);

/**
 * Where box `i` sits on a card, in box widths across and box heights down.
 * A short last row is centred, so its boxes keep the same size as the rest.
 * Shared by the PDF and the preview so they always place boxes alike.
 */
export function cellAt(i: number, g: BandGrid): { col: number; row: number } {
  const row = Math.floor(i / g.cols);
  const inRow = Math.min(g.cols, perCardOf(g) - row * g.cols);
  return { col: (i % g.cols) + (g.cols - inRow) / 2, row };
}

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

export type CallSheetRow = {
  number: string;
  name: string;
  formation: string;
  personnel: string;
  type: string;
  spot: string;
  notes: string;
};

/** The coach's call sheet: every call sorted by number, with its spot on the wristband. */
export function callSheetRows(entries: BandEntry[], perCard: number): CallSheetRow[] {
  return entries
    .map((e, i) => ({
      number: e.number,
      name: e.name,
      formation: e.formation ?? "",
      personnel: e.personnel ?? "",
      type: playTypeLabel(e.type),
      spot: cardSpot(i, perCard),
      notes: (e.notes ?? "").replace(/\s+/g, " ").trim(),
    }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

/** What the coach copy holds: the number list, a diagram per call, both, or every call's diagram on one page. */
export type CoachSheet = "list" | "diagrams" | "both" | "onepage";
export const COACH_SHEETS = [
  { id: "list", label: "Call list" },
  { id: "diagrams", label: "Diagrams" },
  { id: "both", label: "Both" },
  { id: "onepage", label: "One page with diagrams" },
] as const;

/** A column the coach can put on the call sheet. `weight` shares out the page width among the columns that print. */
export type SheetColumn = keyof CallSheetRow;
export const SHEET_COLUMNS: { id: SheetColumn; label: string; head: string; weight: number }[] = [
  { id: "number", label: "#", head: "#", weight: 0.8 },
  { id: "name", label: "Play", head: "PLAY", weight: 3 },
  { id: "formation", label: "Formation", head: "FORMATION", weight: 1.9 },
  { id: "personnel", label: "Personnel", head: "PERSONNEL", weight: 1.3 },
  { id: "type", label: "Type", head: "TYPE", weight: 1 },
  { id: "spot", label: "Card spot", head: "CARD", weight: 0.75 },
  { id: "notes", label: "Notes", head: "NOTES", weight: 3.2 },
];

/** What the coach's printout carries: its title, columns, and the extras around the diagrams. */
export type SheetPrint = {
  /** Printed at the top; {source}, {team} and {count} fill in. */
  title: string;
  columns: SheetColumn[];
  /** Today's date beside the title. */
  date: boolean;
  /** Player notes under each diagram (Diagrams and One page). */
  playerNotes: boolean;
  /** Write-in lines under the call list for game-day notes. */
  blankRows: number;
};
export const DEFAULT_SHEET_PRINT: SheetPrint = {
  title: "Call sheet · {source}",
  columns: ["number", "name", "formation", "type", "spot"],
  date: false,
  playerNotes: true,
  blankRows: 0,
};

/** The chosen columns in page order; the number is always kept so a call can be found. */
export const sheetColumns = (sheet: Pick<SheetPrint, "columns"> | undefined) => {
  const want = new Set<SheetColumn>(sheet?.columns ?? DEFAULT_SHEET_PRINT.columns);
  want.add("number");
  return SHEET_COLUMNS.filter((c) => want.has(c.id));
};

/** The printout's title with its {tokens} filled in. */
export function sheetTitle(sheet: SheetPrint | undefined, source: string, count: number) {
  const t = (sheet?.title ?? DEFAULT_SHEET_PRINT.title).trim() || DEFAULT_SHEET_PRINT.title;
  return fillBandText(t, { role: "Coach", card: "", source, count });
}

/**
 * The one-page sheet's grid: the columns × rows that give every call the
 * biggest box on a letter page (diagrams are wider than tall, about 1.6 : 1).
 */
export function onePageGrid(n: number, area = { w: 7.5, h: 9.6 }, aspect = 1.6, label = 0.24) {
  let best = { cols: 1, rows: Math.max(1, n), w: area.w, h: area.h / Math.max(1, n), score: 0 };
  for (let cols = 1; cols <= Math.max(1, Math.min(n, 8)); cols++) {
    const rows = Math.max(1, Math.ceil(n / cols));
    const w = area.w / cols;
    const h = area.h / rows;
    // The diagram is whatever fits the box below its label at the diagram's own shape.
    const dh = Math.max(0, h - label);
    const score = Math.min(w, dh * aspect);
    if (score > best.score) best = { cols, rows, w, h, score };
  }
  return best;
}

export const NUMBER_SIZES = { s: 8, m: 11, l: 15 } as const;
export type NumberSize = keyof typeof NUMBER_SIZES;

/** How each box shows its number: a dark tab at the left, or a gray strip across the top. */
export type NumberStyle = "tab" | "band";

/** Words in the header and border text that fill in per card. */
export const BAND_TOKENS = ["{role}", "{card}", "{source}", "{count}", "{team}"] as const;

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
  /** The coach printout's title, columns and extras. Left out: the standard call sheet. */
  sheet?: SheetPrint;
  source: string;
  watermark: string | null;
  dpi: number;
  vector: boolean;
  /** The coach's own card colors; anything left out follows team branding or the GridIronVault look. */
  colors?: Partial<BandColors> | null;
  /** "card": each card's numbers print in its own color (A red, B blue, C green…), so a player grabs the right card. */
  numberInk?: NumberInk;
  /** "bold": a heavy black card edge and darker box lines, like a print-shop play card. */
  border?: CardBorder;
};

export type NumberInk = "one" | "card";
export type CardBorder = "thin" | "bold";

/** Number colors per card in "card" ink: red, blue, green, then orange, purple and black. Bright enough to tell apart at arm's length. */
export const CARD_INKS = ["#E0201B", "#1F47E0", "#14912F", "#E07B00", "#7B2CBF", "#0B1524"] as const;

/** The number color for card `n`, or null to keep the palette's number color. */
export const cardInk = (o: Pick<BandOptions, "numberInk">, n: number): string | null =>
  o.numberInk === "card" ? CARD_INKS[n % CARD_INKS.length] : null;

/** Card edge and box line widths in inches, shared by the PDF and the preview. */
export function cardLines(o: Pick<BandOptions, "border">) {
  return o.border === "bold" ? { edge: 0.035, box: 0.012 } : { edge: 0.01, box: 0.008 };
}

/** Every color on a printed card, as hex. */
export type BandColors = {
  /** Header band fill and its words. */
  head: string;
  headText: string;
  /** Number tab (or the gray strip in the "band" style) and its number. */
  tab: string;
  tabText: string;
  /** Card border and box lines. */
  line: string;
};

/** One-click card colors on the Wristbands page; "Team colors" comes from branding instead. */
export const BAND_COLOR_PRESETS: { id: string; label: string; colors: BandColors | null }[] = [
  { id: "auto", label: "GridIronVault", colors: null },
  { id: "mono", label: "Black and white", colors: { head: "#000000", headText: "#FFFFFF", tab: "#000000", tabText: "#FFFFFF", line: "#000000" } },
  { id: "navy", label: "Navy and gold", colors: { head: "#14213D", headText: "#FCA311", tab: "#14213D", tabText: "#FCA311", line: "#14213D" } },
  { id: "red", label: "Red", colors: { head: "#B3202A", headText: "#FFFFFF", tab: "#B3202A", tabText: "#FFFFFF", line: "#5A1015" } },
  { id: "green", label: "Green", colors: { head: "#1E6B3A", headText: "#FFFFFF", tab: "#1E6B3A", tabText: "#FFFFFF", line: "#123F22" } },
  { id: "purple", label: "Purple", colors: { head: "#4B2A85", headText: "#FFFFFF", tab: "#4B2A85", tabText: "#FFFFFF", line: "#2B184D" } },
  { id: "orange", label: "Orange", colors: { head: "#E0620D", headText: "#0B1524", tab: "#E0620D", tabText: "#0B1524", line: "#0B1524" } },
];

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/**
 * The card's colors as they print: the coach's picks first, then team branding
 * on the header, then the GridIronVault ink and cyan. Shared by the PDF and the
 * preview, so the screen shows the colors the printer gets.
 */
export function bandPalette(
  o: Pick<BandOptions, "colors" | "numberStyle">,
  brand: TeamBrand = brandStore.get(),
): BandColors & { strip: string; grid: string; logo: string | null } {
  const head = bandHead(brand);
  const c = o.colors ?? {};
  const tab = isHex(c.tab) ? c.tab : o.numberStyle === "band" ? "#D9DEE3" : "#0B1524";
  return {
    head: isHex(c.head) ? c.head : head.fill,
    headText: isHex(c.headText) ? c.headText : head.ink,
    tab,
    tabText: isHex(c.tabText) ? c.tabText : o.numberStyle === "band" ? "#0B1524" : "#FFFFFF",
    line: isHex(c.line) ? c.line : "#0B1524",
    grid: isHex(c.line) ? boxLine(c.line) : "#96A4B2",
    // The gray strip style keeps its gray unless the coach picks a tab color.
    strip: tab,
    logo: head.logo,
  };
}

/** Box lines a shade lighter than the border, so the card edge still reads as the cut line. */
export function boxLine(line: string, lighten = 0.45): string {
  const [r, g, b] = hexToRgb(line);
  const mix = (v: number) => Math.round(v + (255 - v) * lighten);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export const defaultBandText = {
  left: "{role} · Card {card} · {source}",
  right: "{count} plays",
};

export const DEFAULT_BAND_LOOK = CARD_LOOK;

export function entriesFromPlays(plays: StoredPlay[], numbers?: string[]): BandEntry[] {
  return plays.map((p, i) => ({ ...entryFromPlay(p), number: numbers?.[i] ?? String(i + 1) }));
}

export function entryFromPlay(p: StoredPlay, number = ""): BandEntry {
  return {
    number,
    name: p.name || "Untitled play",
    scene: p.scene,
    formation: p.formation,
    type: p.playType,
    personnel: p.personnel,
    notes: p.description,
  };
}

/** Fill the {tokens} in a header or footer line. */
export function fillBandText(text: string, vars: { role: string; card: string; source: string; count: number; team?: string }) {
  return text
    .replace(/\{team\}/gi, vars.team ?? (brandStore.get().name.trim() || "My team"))
    .replace(/\{role\}/gi, vars.role)
    .replace(/\{card\}/gi, vars.card)
    .replace(/\{source\}/gi, vars.source)
    .replace(/\{count\}/gi, String(vars.count));
}

/** The card header's fill, text color and logo: team branding when it is on for prints. Shared with the preview. */
export function bandHead(brand: TeamBrand = brandStore.get()): { fill: string; ink: string; logo: string | null } {
  if (!brand.prints || !hasBrand(brand)) return { fill: "#0B1524", ink: "#16C8E8", logo: null };
  const ink = inkOn(brand.primary);
  // The secondary color for the words when it reads on the primary, else plain white or ink.
  const words = Math.abs(luminance(brand.secondary) - luminance(brand.primary)) > 0.35 ? brand.secondary : ink;
  return { fill: brand.primary, ink: words, logo: brand.logo };
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

async function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  entries: BandEntry[],
  vars: Parameters<typeof fillBandText>[1],
  o: BandOptions,
  cardIndex = 0,
) {
  const { w: CARD_W, h: CARD_H } = o.card;
  const { headH, footH } = bandChrome(o);
  const perCard = perCardOf(o.grid);
  // The coach's card colors, then team branding, then GridIronVault ink and cyan.
  const pal = bandPalette(o);
  const lines = cardLines(o);
  const grid = hexToRgb(o.border === "bold" ? boxLine(pal.line, 0.25) : pal.grid);
  const ink = cardInk(o, cardIndex);
  if (headH) {
    const head = { fill: pal.head, ink: pal.headText, logo: pal.logo };
    doc.setFillColor(...hexToRgb(head.fill));
    doc.rect(x, y, CARD_W, headH, "F");
    let textX = x + 0.06;
    if (head.logo) {
      const s = headH - 0.03;
      doc.addImage(head.logo, "PNG", x + 0.04, y + 0.015, s, s, "team-logo", "FAST");
      textX += s + 0.02;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...hexToRgb(head.ink));
    doc.text(fillBandText(o.header.left, vars).toUpperCase(), textX, y + 0.135);
    doc.text(fillBandText(o.header.right, vars).toUpperCase(), x + CARD_W - 0.06, y + 0.135, { align: "right" });
  }
  if (footH) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...hexToRgb(pal.line));
    doc.text(fillBandText(o.footer, vars).toUpperCase(), x + CARD_W / 2, y + CARD_H - 0.05, { align: "center" });
    doc.setDrawColor(...hexToRgb(pal.line));
    doc.line(x, y + CARD_H - footH, x + CARD_W, y + CARD_H - footH);
  }

  const { cellW, cellH, numPt, strip, bigPt, namePt } = cellType(o);
  for (let i = 0; i < perCard; i++) {
    const at = cellAt(i, o.grid);
    const cx = x + at.col * cellW;
    const cy = y + headH + at.row * cellH;
    doc.setDrawColor(...grid);
    doc.setLineWidth(lines.box);
    doc.rect(cx, cy, cellW, cellH);
    const e = entries[i];
    if (!e) continue;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 21, 36);
    if (o.shows.numberOnly || !e.scene || !o.shows.diagram) {
      doc.setFontSize(bigPt);
      if (ink) doc.setTextColor(...hexToRgb(ink));
      doc.text(e.number, cx + cellW / 2, cy + cellH / 2 + 0.05, { align: "center", baseline: "middle" });
      if (o.shows.name) {
        doc.setTextColor(11, 21, 36);
        doc.setFontSize(namePt);
        doc.text(doc.splitTextToSize(e.name.toUpperCase(), cellW - 0.08).slice(0, 2), cx + cellW / 2, cy + cellH - 0.12, { align: "center" });
      }
      continue;
    }
    doc.setFontSize(numPt);
    if (o.numberStyle === "band") {
      // Gray strip across the top with the number centred, like most printed wristbands.
      doc.setFillColor(...hexToRgb(pal.strip));
      doc.rect(cx, cy, cellW, strip, "F");
      doc.setDrawColor(...grid);
      doc.line(cx, cy + strip, cx + cellW, cy + strip);
      doc.setTextColor(...hexToRgb(ink ?? pal.tabText));
      const label = o.shows.name ? `${e.number} · ${e.name.toUpperCase()}` : e.number;
      fitSize(doc, label, cellW - 0.08, numPt, numPt * 0.7);
      doc.text(fitText(doc, label, cellW - 0.08), cx + cellW / 2, cy + strip / 2, { align: "center", baseline: "middle" });
    } else {
      // Number in a solid tab, name beside it, diagram filling the rest of the cell.
      const tabW = Math.max(strip, doc.getTextWidth(e.number) + 0.08);
      // In card ink the tab takes the card's color, so the white number stands out on it.
      doc.setFillColor(...hexToRgb(ink ?? pal.tab));
      doc.rect(cx, cy, tabW, strip, "F");
      doc.setTextColor(...hexToRgb(pal.tabText));
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
  // The card edge goes on last, over the box lines, so a bold edge stays one clean cut line.
  doc.setDrawColor(...hexToRgb(pal.line));
  doc.setLineWidth(lines.edge);
  doc.rect(x + lines.edge / 2, y + lines.edge / 2, CARD_W - lines.edge, CARD_H - lines.edge);
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
  fits.sort((a, b) => perCardOf(b) - perCardOf(a));
  return { art, readable, better: fits[0] ?? null };
}

/** Numbers of the boxes whose diagram is too small to keep its player letters, for a warning before printing. */
export function tightBoxes(entries: BandEntry[], o: Pick<BandOptions, "card" | "grid" | "header" | "footer" | "numberSize" | "look" | "shows">): string[] {
  if (!o.shows.diagram || o.shows.numberOnly) return [];
  const art = diagramBox(o);
  return entries.filter((e) => e.scene && !lettersFit(e.scene, o.look, art.w, art.h)).map((e) => e.number);
}

/** A box whose play loses something on paper: its number, name and what gets cut. */
export type BandCut = { number: string; name: string; parts: string[] };

/**
 * Boxes whose diagram runs past its printed frame (a player or route dragged
 * off the field) or has to leave a label off, so the coach hears about it
 * before printing rather than on the sideline.
 */
export function bandCutOffs(entries: BandEntry[], o: Pick<BandOptions, "card" | "grid" | "header" | "footer" | "numberSize" | "look" | "shows">): BandCut[] {
  if (!o.shows.diagram || o.shows.numberOnly) return [];
  const art = diagramBox(o);
  return entries.flatMap((e) => {
    const parts = e.scene ? cutOffs(e.scene, o.look, art.w, art.h) : [];
    return parts.length ? [{ number: e.number, name: e.name, parts }] : [];
  });
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

const LIST_ROW = 0.3;
const PAGE_L = 0.4;
const PAGE_W = 7.7;

/** The title line every coach page starts with: title at the left, count, date and page at the right. */
function sheetHead(doc: jsPDF, title: string, right: string) {
  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 21, 36);
  fitSize(doc, title, 5.6, 16, 10);
  doc.text(fitText(doc, title, 5.6), 0.5, 0.62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 72, 90);
  doc.text(right, 8, 0.62, { align: "right" });
}

const today = () => new Date().toLocaleDateString("en-US");

/** "24 calls · 11/13/2026 · page 1 of 2", from what the coach turned on. */
function headRight(sheet: SheetPrint | undefined, count: number, page: number, pages: number) {
  return [
    `${count} ${count === 1 ? "call" : "calls"}`,
    (sheet?.date ?? DEFAULT_SHEET_PRINT.date) ? today() : "",
    pages > 1 ? `page ${page + 1} of ${pages}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The coach's call sheet: the columns the coach picked (number, play,
 * formation, personnel, type, card spot, notes), sorted by number in rows big
 * enough to read on the sideline, then any write-in lines.
 */
function drawCallList(doc: jsPDF, rows: CallSheetRow[], o: Pick<BandOptions, "sheet" | "source">) {
  const cols = sheetColumns(o.sheet);
  const total = cols.reduce((t, c) => t + c.weight, 0);
  const xs: number[] = [];
  let at = PAGE_L + 0.1;
  for (const c of cols) {
    xs.push(at);
    at += ((PAGE_W - 0.2) * c.weight) / total;
  }
  const width = (i: number) => (i + 1 < xs.length ? xs[i + 1] : PAGE_L + PAGE_W - 0.1) - xs[i] - 0.12;
  const notesAt = cols.findIndex((c) => c.id === "notes");
  const top = 1.15;
  const bottom = 10.5;

  // Each row's height: one line, or up to three lines of notes.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const noteLines = rows.map((r) => {
    if (notesAt < 0 || !r.notes) return [];
    const all = doc.splitTextToSize(r.notes, width(notesAt)) as string[];
    if (all.length <= 3) return all;
    return [...all.slice(0, 2), fitText(doc, `${all[2]} ${all[3]}`, width(notesAt))];
  });
  const heights = noteLines.map((l) => Math.max(LIST_ROW, 0.1 + l.length * 0.13));
  const blank = Math.max(0, Math.min(40, o.sheet?.blankRows ?? 0));

  // Lay the rows (then the write-in lines) out on pages.
  type Slot = { row: number; y: number; h: number };
  const pages: Slot[][] = [[]];
  let y = top;
  const place = (row: number, h: number) => {
    if (y + h > bottom && pages[pages.length - 1].length) {
      pages.push([]);
      y = top;
    }
    pages[pages.length - 1].push({ row, y, h });
    y += h;
  };
  heights.forEach((h, i) => place(i, h));
  for (let i = 0; i < blank; i++) place(-1, LIST_ROW);

  const title = sheetTitle(o.sheet, o.source, rows.length);
  pages.forEach((slots, p) => {
    if (p > 0) doc.addPage("letter", "portrait");
    sheetHead(doc, title, headRight(o.sheet, rows.length, p, pages.length));

    // Column heads on a dark band.
    doc.setFillColor(11, 21, 36);
    doc.rect(PAGE_L, top - 0.27, PAGE_W, 0.27, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    cols.forEach((c, i) => doc.text(fitText(doc, c.head, width(i) + 0.1), xs[i], top - 0.09));

    slots.forEach((s, i) => {
      if (i % 2) {
        doc.setFillColor(236, 241, 246);
        doc.rect(PAGE_L, s.y, PAGE_W, s.h, "F");
      }
      if (s.row < 0) {
        doc.setDrawColor(190, 200, 210);
        doc.setLineWidth(0.008);
        doc.line(PAGE_L, s.y + s.h, PAGE_L + PAGE_W, s.y + s.h);
        return;
      }
      const r = rows[s.row];
      const mid = s.y + Math.min(s.h, LIST_ROW) / 2;
      doc.setTextColor(11, 21, 36);
      cols.forEach((c, ci) => {
        const x = xs[ci];
        if (c.id === "number") {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(14);
          doc.text(fitText(doc, r.number, width(ci) + 0.1), x, mid, { baseline: "middle" });
        } else if (c.id === "name") {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text(fitText(doc, r.name, width(ci)), x, mid, { baseline: "middle" });
        } else if (c.id === "notes") {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(40, 52, 70);
          const lines = noteLines[s.row];
          if (lines.length) doc.text(lines, x, s.y + 0.17);
          doc.setTextColor(11, 21, 36);
        } else {
          doc.setFont("helvetica", c.id === "spot" ? "bold" : "normal");
          doc.setFontSize(10);
          doc.text(fitText(doc, r[c.id], width(ci)), x, mid, { baseline: "middle" });
        }
      });
    });
    const last = slots[slots.length - 1];
    doc.setDrawColor(150, 164, 178);
    doc.setLineWidth(0.01);
    doc.rect(PAGE_L, top - 0.27, PAGE_W, (last ? last.y + last.h : top) - top + 0.27);
  });
}

/** One call's small label for the diagram pages: number and name, then the other picked columns. */
function callLabel(r: CallSheetRow | undefined, cols: ReturnType<typeof sheetColumns>) {
  if (!r) return "";
  return cols
    .filter((c) => c.id !== "number" && c.id !== "name" && c.id !== "notes")
    .map((c) => r[c.id])
    .filter(Boolean)
    .join(" · ");
}

type DiagramPrint = Pick<BandOptions, "look" | "watermark" | "vector" | "dpi" | "shows">;
const diagramLook = (o: DiagramPrint) => (o.look.fit === "play" ? { ...o.look, weight: "auto" as const } : FULL_LOOK);

/** The call sheet's row for each entry, by its place in the print order. */
function rowsByEntry(entries: BandEntry[], perCard: number) {
  return entries.map((e, i) => ({
    number: e.number,
    name: e.name,
    formation: e.formation ?? "",
    personnel: e.personnel ?? "",
    type: playTypeLabel(e.type),
    spot: cardSpot(i, perCard),
    notes: (e.notes ?? "").replace(/\s+/g, " ").trim(),
  }));
}

/** Most calls one page holds before the boxes get too small to read; past it the sheet runs on. */
export const ONE_PAGE_MAX = 48;

/**
 * Every call's diagram on one letter page, in print order, each box labelled
 * with its number, name and the other columns the coach picked.
 */
async function drawOnePager(doc: jsPDF, entries: BandEntry[], perCard: number, o: BandOptions) {
  const rows = rowsByEntry(entries, perCard);
  const cols = sheetColumns(o.sheet);
  const showNotes = o.sheet?.playerNotes ?? DEFAULT_SHEET_PRINT.playerNotes;
  const title = sheetTitle(o.sheet, o.source, entries.length);
  const pages = Math.max(1, Math.ceil(entries.length / ONE_PAGE_MAX));
  for (let p = 0; p < pages; p++) {
    if (p > 0) doc.addPage("letter", "portrait");
    sheetHead(doc, title, headRight(o.sheet, entries.length, p, pages));
    const chunk = entries.slice(p * ONE_PAGE_MAX, (p + 1) * ONE_PAGE_MAX);
    const area = { x: 0.5, y: 0.85, w: 7.5, h: 9.75 };
    const g = onePageGrid(chunk.length, area);
    const big = g.h >= 2;
    for (let i = 0; i < chunk.length; i++) {
      const e = chunk[i];
      const r = rows[p * ONE_PAGE_MAX + i];
      const x = area.x + (i % g.cols) * g.w;
      const y = area.y + Math.floor(i / g.cols) * g.h;
      const pad = Math.min(0.06, g.w * 0.04);
      doc.setDrawColor(150, 164, 178);
      doc.setLineWidth(0.01);
      doc.rect(x, y, g.w, g.h);
      // Label: the number big, the name bold, then the other columns small.
      const size = Math.max(6, Math.min(11, g.w * 5));
      doc.setTextColor(11, 21, 36);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size + 2);
      const num = `${e.number}`;
      doc.text(num, x + pad, y + 0.06, { baseline: "top" });
      const numW = doc.getTextWidth(num) + 0.06;
      doc.setFontSize(size);
      doc.text(fitText(doc, e.name, g.w - numW - pad * 2), x + pad + numW, y + 0.08, { baseline: "top" });
      const extra = callLabel(r, cols);
      let below = y + 0.08 + (size + 2) / 72 + 0.02;
      if (extra) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(Math.max(5.5, size - 2.5));
        doc.setTextColor(60, 72, 90);
        doc.text(fitText(doc, extra, g.w - pad * 2), x + pad, below, { baseline: "top" });
        below += Math.max(5.5, size - 2.5) / 72 + 0.03;
      }
      const notes = showNotes && big && e.scene ? playerNoteLines(e.scene, "print") : [];
      const notesH = notes.length ? 0.26 : 0;
      const dh = y + g.h - below - pad - notesH;
      if (e.scene && !o.shows.numberOnly && dh > 0.2) {
        await placeDiagram(doc, e.scene, x + pad, below, g.w - pad * 2, dh, {
          look: diagramLook(o),
          watermark: o.watermark,
          vector: o.vector,
          dpi: o.dpi,
        });
      }
      if (notes.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(60, 72, 90);
        doc.text((doc.splitTextToSize(notes.join("  ·  "), g.w - pad * 2) as string[]).slice(0, 2), x + pad, y + g.h - pad - notesH + 0.1);
      }
    }
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
  const perCard = perCardOf(o.grid);
  const { paper, slots } = sheetSlots(o);
  const orient = paper.w > paper.h ? "landscape" : "portrait";
  const { jsPDF } = await import("jspdf");
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
      await drawCard(doc, x, y, cards[c], vars, o, c);
      if (o.cutMarks && o.paper !== "card") cutMarks(doc, x, y, o.card.w, o.card.h);
      slot++;
    }
  }

  // Coach copy: the call list, every call with a bigger diagram, both, or all the diagrams on one page. Always on letter.
  const cols = sheetColumns(o.sheet);
  const showNotes = o.sheet?.playerNotes ?? DEFAULT_SHEET_PRINT.playerNotes;
  const labels = rowsByEntry(entries, perCard);
  for (let n = 0; n < o.copies.coach; n++) {
    if (o.coachSheet === "onepage") {
      if (!first) doc.addPage("letter", "portrait");
      first = false;
      await drawOnePager(doc, entries, perCard, o);
      continue;
    }
    if (o.coachSheet !== "diagrams") {
      if (!first) doc.addPage("letter", "portrait");
      first = false;
      drawCallList(doc, callSheetRows(entries, perCard), o);
      if (o.coachSheet === "list") continue;
    }
    if (!first) doc.addPage("letter", "portrait");
    first = false;
    const title = sheetTitle(o.sheet, o.source, entries.length);
    const pageCount = Math.max(1, Math.ceil(entries.length / 8));
    sheetHead(doc, title, headRight(o.sheet, entries.length, 0, pageCount));
    const colW = 3.6;
    const rowH = 2.35;
    let i = 0;
    for (const e of entries) {
      const slotOnPage = i % 8;
      if (i > 0 && slotOnPage === 0) {
        doc.addPage("letter", "portrait");
        sheetHead(doc, title, headRight(o.sheet, entries.length, i / 8, pageCount));
      }
      const cx = 0.5 + (slotOnPage % 2) * (colW + 0.3);
      const cy = 0.85 + Math.floor(slotOnPage / 2) * rowH;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(11, 21, 36);
      const head = `${e.number}  ${e.name}`;
      const shown = fitText(doc, head, colW);
      doc.text(shown, cx, cy + 0.15);
      const room = colW - doc.getTextWidth(shown) - 0.2;
      const extra = callLabel(labels[i], cols);
      if (extra && room > 0.5) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(60, 72, 90);
        doc.text(fitText(doc, extra, room), cx + colW, cy + 0.15, { align: "right" });
      }
      if (e.scene && !o.shows.numberOnly) {
        const h = 1.7;
        await placeDiagram(doc, e.scene, cx, cy + 0.25, colW, h, {
          look: diagramLook(o),
          watermark: o.watermark,
          vector: o.vector,
          dpi: o.dpi,
        });
        const notes = showNotes ? playerNoteLines(e.scene, "print") : [];
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

  // The account's trace code, so the owner can tell whose file a leaked PDF is (Admin → Activity → Find a PDF's owner).
  const trace = await traceCode().catch(() => "");
  doc.setProperties({ title: `Wristbands · ${o.source}`, ...(trace ? { keywords: trace } : {}) });
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
  numberInk?: NumberInk;
  border?: CardBorder;
  sameSize?: boolean;
  colors?: Partial<BandColors> | null;
};

export const BAND_PRESETS: { id: string; label: string; hint: string; prefs: BandPresetPrefs }[] = [
  {
    // The print-shop play card coaches order (Football Play Card's layout): it keeps the coach's plays-per-card pick, 3 to 10.
    id: "playcard",
    label: "Play card",
    hint:
      "The print-shop play card: gray number strip with each card's numbers in its own color, a bold black edge, yard lines, lettered players, and every play at one scale with the line of scrimmage lined up. Works at 3 to 10 plays a card.",
    prefs: {
      shows: { diagram: true, name: false, numberOnly: false },
      look: { fit: "play", weight: "auto", field: "yards", dots: false, icons: 1.3, lines: 1.25, zoom: 1, lineUp: true },
      numberSize: "m",
      numberStyle: "band",
      numberInk: "card",
      border: "bold",
      header: { show: false, ...defaultBandText },
      sameSize: true,
      colors: { line: "#000000" },
    },
  },
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
      numberInk: "one",
      border: "thin",
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
      numberInk: "one",
      border: "thin",
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
  // Full grids only: a short last row leaves card space unused, so it is the coach's pick, never the suggestion.
  const multi = BAND_GRIDS.filter((g) => perCardOf(g) >= 4 && !shortRow(g));
  const densest = (ok: (a: { w: number; h: number }) => boolean) =>
    multi.filter((g) => ok(at(g))).sort((a, b) => perCardOf(b) - perCardOf(a))[0];
  const roomy = densest((a) => a.w >= ROOMY_BOX.w && a.h >= ROOMY_BOX.h);
  const bold = BAND_PRESETS.find((p) => p.id === "bold")!.prefs;
  const side = BAND_PRESETS.find((p) => p.id === "sideline")!.prefs;
  if (roomy) {
    const n = perCardOf(roomy);
    return { grid: gridKey(roomy), prefs: { ...bold, grid: gridKey(roomy) }, why: `${n} plays a card with lettered players and bold routes` };
  }
  const readable = densest((a) => a.w >= READABLE_BOX.w && a.h >= READABLE_BOX.h);
  if (readable) {
    const n = perCardOf(readable);
    return { grid: gridKey(readable), prefs: { ...side, grid: gridKey(readable) }, why: `${n} plays a card as solid dots, the most that stay readable on this card` };
  }
  const biggest = [...BAND_GRIDS].filter((g) => !shortRow(g)).sort((a, b) => at(b).w * at(b).h - at(a).w * at(a).h)[0];
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
