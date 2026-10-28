import type { SheetDoc, SheetRow } from "./store";

/**
 * Game Day: the Call Sheet read from the sideline. Which calls fit the
 * situation (down, distance, hash, field zone), grouped by the sheet's own
 * sections, plus an optional log of what was called. Pure, so the page and
 * any print share one answer.
 */

/** One call the coach made: the grid row, when, and how it went (if marked). */
export type Call = { id: string; rowId: string; at: number; ok?: boolean };

/** Other headings coaches use for the same column, so a renamed column still reads. */
const ALIASES: Record<string, string[]> = {
  "play name": ["play", "call", "name"],
  group: ["section", "situation", "category"],
  yl: ["field", "zone", "field zone", "yard line"],
  distance: ["dist", "to go"],
};

const column = (sheet: SheetDoc, label: string) => {
  const want = label.toLowerCase();
  const names = [want, ...(ALIASES[want] ?? [])];
  for (const n of names) {
    const col = sheet.columns.find((c) => c.label.trim().toLowerCase() === n);
    if (col) return col;
  }
  return undefined;
};

export const cell = (sheet: SheetDoc, row: SheetRow, label: string) => {
  const col = column(sheet, label);
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

export type Situation = { down: string; distance: string; hash: string; field: string; text: string };
export const ANY: Situation = { down: "", distance: "", hash: "", field: "", text: "" };

/** The situation chips: which Situation key reads which call sheet column. */
export const SITUATION: { key: "down" | "distance" | "hash" | "field"; label: string; column: string }[] = [
  { key: "down", label: "Down", column: "Down" },
  { key: "distance", label: "Distance", column: "Distance" },
  { key: "hash", label: "Hash", column: "Hash" },
  { key: "field", label: "Field", column: "YL" },
];

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
    if (q && ![name, cell(sheet, r, "Group"), cell(sheet, r, "Route"), cell(sheet, r, "#")].some((t) => norm(t).includes(q))) return false;
    return (
      matches(cell(sheet, r, "Down"), s.down) &&
      matches(cell(sheet, r, "Distance"), s.distance) &&
      matches(cell(sheet, r, "Hash"), s.hash) &&
      matches(cell(sheet, r, "YL"), s.field)
    );
  });
}

/** Rows with a play name: the calls on this sheet. */
export const namedRows = (sheet: SheetDoc) => sheet.rows.filter((r) => cell(sheet, r, "Play Name"));

/**
 * The sheet Game Day opens with no id: the one with the most calls on it,
 * newest first on a tie, so a blank "Call Sheet" never wins over a filled one.
 */
export function pickSheet(sheets: SheetDoc[]): SheetDoc | undefined {
  return [...sheets].sort((a, b) => namedRows(b).length - namedRows(a).length || b.updatedAt.localeCompare(a.updatedAt))[0];
}

export const NO_SECTION = "Other calls";

export type Section = { name: string; rows: SheetRow[] };

/** Rows grouped by the sheet's Group column, sections in the order the sheet first uses them. */
export function sections(sheet: SheetDoc, rows: SheetRow[]): Section[] {
  const out = new Map<string, Section>();
  for (const r of rows) {
    const name = cell(sheet, r, "Group") || NO_SECTION;
    const key = norm(name);
    const hit = out.get(key);
    if (hit) hit.rows.push(r);
    else out.set(key, { name, rows: [r] });
  }
  return [...out.values()];
}

/** What the sheet says about when to call a row, for the little tags under its name. */
export function planned(sheet: SheetDoc, row: SheetRow): string[] {
  const out: string[] = [];
  if (cell(sheet, row, "Run")) out.push("Run");
  else if (cell(sheet, row, "Pass")) out.push("Pass");
  const list = (v: string) => v.split(/\s*[,/]\s*/).filter(Boolean).join(" / ");
  const down = list(cell(sheet, row, "Down"));
  const dist = list(cell(sheet, row, "Distance"));
  if (down || dist) out.push([down && `${down} down`, dist && `${dist} to go`].filter(Boolean).join(" · "));
  const hash = cell(sheet, row, "Hash");
  if (hash) out.push(`${hash} hash`);
  const yl = cell(sheet, row, "YL");
  if (yl) out.push(yl);
  return out;
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

const PREFS = "grid1ronvault.gameday.v1";

/** Whether the coach has put away the "What Game Day is" card on this browser. */
export function introSeen(): boolean {
  try {
    return (JSON.parse(localStorage.getItem(PREFS) ?? "{}") as { intro?: boolean }).intro === false;
  } catch {
    return false;
  }
}

export function setIntroSeen(seen: boolean) {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ intro: !seen }));
  } catch {
    /* storage blocked: the card shows again next visit */
  }
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
