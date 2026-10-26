import {
  BAND_PAPERS,
  boxCheck,
  cardsPerPage,
  duplicateNumbers,
  tightBoxes,
  type BandEntry,
  type BandOptions,
} from "./wristbands";

export type BandIssue = { level: "error" | "warn"; code: string; message: string };

/** Pages `wristbandSheets` should produce for these settings, excluding the coach copy. */
export function expectedCardPages(entries: BandEntry[], o: BandOptions): number {
  const cards = Math.ceil(entries.length / (o.grid.cols * o.grid.rows));
  const printed = cards * (o.copies.qb + o.copies.center);
  return o.paper === "card" ? printed : Math.ceil(printed / cardsPerPage(o));
}

/** Page size in inches the wristband pages should have: the card itself, or the paper. */
export function expectedPageSize(o: BandOptions): { w: number; h: number } {
  const paper = BAND_PAPERS.find((p) => p.id === o.paper) ?? BAND_PAPERS[0];
  return paper.id === "card" ? { ...o.card } : { w: paper.w, h: paper.h };
}

/**
 * Problems a coach should hear about before printing, from the settings alone
 * (no PDF needed), so the Wristbands page and the size-matrix script agree.
 * "error" means the print will be wrong; "warn" means it will be hard to read.
 */
export function checkBands(entries: BandEntry[], o: BandOptions): BandIssue[] {
  const issues: BandIssue[] = [];
  const paper = expectedPageSize(o);
  if (o.paper !== "card" && (o.card.w > paper.w - 0.8 || o.card.h > paper.h - 0.8))
    issues.push({ level: "error", code: "card-too-big", message: "This card doesn't fit on the paper with a margin. Pick a larger paper or One card per page." });

  const art = boxCheck(o);
  if (!art.readable)
    issues.push({
      level: "warn",
      code: "box-small",
      message: `Each box draws ${art.art.w.toFixed(2)} × ${art.art.h.toFixed(2)} in${art.better ? `. ${art.better.cols}×${art.better.rows} reads on this card.` : ", too small on this card. Use a bigger card."}`,
    });

  const tight = tightBoxes(entries, o);
  if (tight.length) issues.push({ level: "warn", code: "dots", message: `Boxes ${tight.join(", ")} print players as plain dots.` });

  const dup = duplicateNumbers(entries);
  if (dup.length) issues.push({ level: "error", code: "duplicate-numbers", message: `Number ${dup.join(", ")} appears on more than one box.` });

  return issues;
}
