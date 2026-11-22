import { canon } from "./live";
import { isStockSheetName, isUntouchedSheet } from "./sheet";
import type { SheetDoc } from "./store";

/**
 * Copies of a Call Sheet left by the old sync. Pure, so the page's "Tidy up"
 * and its test agree.
 *
 * Two kinds of copy go, and nothing else:
 *  - a sheet nobody ever touched: still the starting headers, no typing, no
 *    linked play, no paint, and a name the app gave it ("Call Sheet",
 *    "Call Sheet 3"). It goes when any other sheet is left; if every sheet is
 *    like that, one stays.
 *  - an exact repeat: same name, same headers, same cells, links and colors,
 *    row for row. The one already on the account stays (else the newest).
 *
 * A sheet with calls of its own is never touched, even when it shares a name
 * with another, so tidying can't lose a coach's work.
 */
export type SheetDupes = {
  /** Copies safe to remove. */
  remove: SheetDoc[];
  /** Same-name sheets left alone because their calls differ. */
  differ: number;
};

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** What a sheet says, without the ids a copy gets made with (column and row ids are random per copy). */
function signature(sheet: SheetDoc): string {
  return canon([
    norm(sheet.name),
    sheet.columns.map((c) => c.label),
    sheet.rows.map((r) => [
      r.playId ?? null,
      sheet.columns.map((c) => r.cells[c.id] ?? ""),
      sheet.columns.map((c) => r.colors?.[c.id] ?? ""),
    ]),
  ]);
}

const newer = (a: SheetDoc, b: SheetDoc) => new Date(a.updatedAt).getTime() > new Date(b.updatedAt).getTime();

export function findDuplicateSheets(sheets: SheetDoc[]): SheetDupes {
  const remove = new Set<SheetDoc>();

  // Untouched starter sheets.
  const blanks = sheets.filter((s) => isUntouchedSheet(s) && isStockSheetName(s.name));
  const keepOne = blanks.length === sheets.length ? (blanks.find((s) => s.remoteId) ?? blanks[0]) : undefined;
  for (const s of blanks) if (s !== keepOne) remove.add(s);

  // Exact repeats of a sheet with calls on it.
  const groups = new Map<string, SheetDoc[]>();
  for (const s of sheets) {
    if (remove.has(s) || blanks.includes(s)) continue;
    const key = signature(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.reduce((best, s) => {
      if (!!s.remoteId !== !!best.remoteId) return s.remoteId ? s : best;
      return newer(s, best) ? s : best;
    }, group[0]);
    for (const s of group) if (s !== keep) remove.add(s);
  }

  // Same-name sheets that stay and hold different calls.
  const names = new Map<string, number>();
  for (const s of sheets) if (!remove.has(s)) names.set(norm(s.name), (names.get(norm(s.name)) ?? 0) + 1);
  let differ = 0;
  for (const [name, n] of names) if (n > 1 && !isStockSheetName(name)) differ += n - 1;

  return { remove: sheets.filter((s) => remove.has(s)), differ };
}
