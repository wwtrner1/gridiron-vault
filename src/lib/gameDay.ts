import type { SheetDoc, SheetRow } from "./store";

/**
 * Game Day: the Call Sheet read from the sideline. Which calls fit the
 * situation, what's been called, and what is working. Pure, so the page and
 * any print share one answer.
 */

/** One call the coach made: the grid row, when, and how it went (if marked). */
export type Call = { id: string; rowId: string; at: number; ok?: boolean };

export const cell = (sheet: SheetDoc, row: SheetRow, label: string) => {
  const col = sheet.columns.find((c) => c.label.toLowerCase() === label.toLowerCase());
  return col ? (row.cells[col.id] ?? "").trim() : "";
};

const norm = (s: string) => s.trim().toLowerCase();

/** The values a column takes in this grid, most used first, for the situation chips. */
export function choicesFor(sheet: SheetDoc, label: string, limit = 6): string[] {
  const seen = new Map<string, { text: string; n: number }>();
  for (const r of sheet.rows) {
    for (const part of cell(sheet, r, label).split(/[,/]/)) {
      const text = part.trim();
      if (!text) continue;
      const hit = seen.get(norm(text));
      if (hit) hit.n++;
      else seen.set(norm(text), { text, n: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.n - a.n).slice(0, limit).map((v) => v.text);
}

export type Situation = { down: string; distance: string; hash: string; text: string };
export const ANY: Situation = { down: "", distance: "", hash: "", text: "" };

const matches = (have: string, want: string) => {
  if (!want) return true;
  // A blank cell means "any" for that column: the coach didn't restrict the call.
  if (!have.trim()) return true;
  return have.split(/[,/]/).some((p) => norm(p) === norm(want));
};

/** Rows with a play name that fit the situation, in grid order. */
export function callable(sheet: SheetDoc, s: Situation): SheetRow[] {
  const q = norm(s.text);
  return sheet.rows.filter((r) => {
    const name = cell(sheet, r, "Play Name");
    if (!name) return false;
    if (q && ![name, cell(sheet, r, "Group"), cell(sheet, r, "Route")].some((t) => norm(t).includes(q))) return false;
    return (
      matches(cell(sheet, r, "Down"), s.down) &&
      matches(cell(sheet, r, "Distance"), s.distance) &&
      matches(cell(sheet, r, "Hash"), s.hash)
    );
  });
}

export type Tally = { calls: number; ok: number; marked: number };

/** How often each row was called and how often it was marked as working. */
export function tally(calls: Call[]): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const c of calls) {
    const t = out.get(c.rowId) ?? { calls: 0, ok: 0, marked: 0 };
    t.calls++;
    if (c.ok !== undefined) t.marked++;
    if (c.ok) t.ok++;
    out.set(c.rowId, t);
  }
  return out;
}

/** Run/pass split of the calls so far, off the grid's Run and Pass columns. */
export function mix(sheet: SheetDoc, calls: Call[]): { run: number; pass: number } {
  const byId = new Map(sheet.rows.map((r) => [r.id, r]));
  let run = 0;
  let pass = 0;
  for (const c of calls) {
    const r = byId.get(c.rowId);
    if (!r) continue;
    if (cell(sheet, r, "Run")) run++;
    else if (cell(sheet, r, "Pass")) pass++;
  }
  return { run, pass };
}

const KEY = "grid1ronvault.game.v1";
type Saved = Record<string, Call[]>;

export function loadCalls(sheetId: string): Call[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved;
    return Array.isArray(all[sheetId]) ? all[sheetId] : [];
  } catch {
    return [];
  }
}

export function saveCalls(sheetId: string, calls: Call[]) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved;
    all[sheetId] = calls.slice(-200);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: the log still holds this visit */
  }
}
