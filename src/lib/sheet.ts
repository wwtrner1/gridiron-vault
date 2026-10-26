import type { SheetColumn, SheetDoc, SheetRow } from "./store";
import type { StoredPlay } from "./types";
import { uid } from "./types";

/**
 * Call Sheet sheets: the default layout, and a grid built from Vault plays
 * (what Griddy's call sheets use). Shared so a grid Griddy builds is the
 * same as one made on the Call Sheet page.
 */
export const DEFAULT_HEADERS = ["#", "Play Name", "Group", "Run", "Pass", "Down", "Distance", "Hash", "YL", "Route", "Position"];

export const newColumn = (label: string): SheetColumn => ({ id: uid("col"), label, width: label === "Play Name" ? 220 : 96, type: "text" });

export const blankRow = (columns: SheetColumn[], index: number): SheetRow => ({
  id: uid("row"),
  cells: Object.fromEntries(columns.map((c) => [c.id, c.label === "#" ? String(index + 1) : ""])),
  colors: {},
  playId: null,
});

export const DEFAULT_SHEET_NAME = "Call Sheet";

export function freshSheet(name = DEFAULT_SHEET_NAME): SheetDoc {
  const columns = DEFAULT_HEADERS.map(newColumn);
  return {
    id: uid("sheet"),
    name,
    columns,
    rows: Array.from({ length: 12 }, (_, i) => blankRow(columns, i)),
    updatedAt: new Date().toISOString(),
    remoteId: null,
  };
}

/** One line of a call sheet: a Vault play and, optionally, when to call it. */
export type CallLine = { play: StoredPlay; group?: string; down?: string; distance?: string; hash?: string };

/**
 * A grid with one linked row per play, filled the way linking a play on the
 * grid fills it (name, group, run/pass, first tag as the route), plus the
 * situation Griddy was given.
 */
export function gridFromPlays(name: string, lines: CallLine[]): SheetDoc {
  const sheet = freshSheet(name);
  const col = (label: string) => sheet.columns.find((c) => c.label === label)!.id;
  sheet.rows = lines.map((l, i) => {
    const row = blankRow(sheet.columns, i);
    row.playId = l.play.id;
    row.cells[col("Play Name")] = l.play.name;
    row.cells[col("Group")] = l.group || l.play.formation;
    if (l.play.playType === "run") row.cells[col("Run")] = "Yes";
    if (l.play.playType === "pass") row.cells[col("Pass")] = "Yes";
    if (l.down) row.cells[col("Down")] = l.down;
    if (l.distance) row.cells[col("Distance")] = l.distance;
    if (l.hash) row.cells[col("Hash")] = l.hash;
    if (l.play.tags.length) row.cells[col("Route")] = l.play.tags[0];
    return row;
  });
  return sheet;
}
