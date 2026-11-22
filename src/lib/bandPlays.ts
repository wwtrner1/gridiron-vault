/**
 * Changing the plays behind the wristband cards from the Wristbands page
 * (Wes, 2026-11-22: add, delete or edit plays from this page). Every change
 * is written to where the cards come from, through the store, so playbook and
 * Call Sheet sync carry it to the account:
 *
 * - a playbook source: its play list (a play is only taken off the playbook,
 *   never deleted from the Vault);
 * - a Call Sheet source: its rows (a row is the call, so removing one takes
 *   the call off the sheet too);
 * - plays picked by hand: nothing is stored, the page keeps the list.
 *
 * Each removal hands back an `undo` that puts the play or row back at the
 * same spot, for the toast's Undo button.
 */
import { api } from "./api";
import { filePlays } from "./filePlays";
import { markUnsynced } from "./playSync";
import { blankRow } from "./sheet";
import { store, type SheetRow } from "./store";
import type { Scene, StoredPlay } from "./types";

export type SourceKind = "book" | "grid" | "hand";

export const sourceKind = (sourceId: string): SourceKind => (sourceId.startsWith("book:") ? "book" : sourceId.startsWith("grid:") ? "grid" : "hand");
export const sourceKey = (sourceId: string) => sourceId.slice(sourceId.indexOf(":") + 1);

/** A Call Sheet row for a Vault play, filled the way linking the play on the Call Sheet fills it. */
function rowFor(columns: { id: string; label: string }[], play: StoredPlay, index: number): SheetRow {
  const row = blankRow(columns as Parameters<typeof blankRow>[0], index);
  const byLabel = (label: string) => columns.find((c) => c.label.trim().toLowerCase() === label)?.id;
  const set = (label: string, value: string) => {
    const id = byLabel(label);
    if (id && value) row.cells[id] = value;
  };
  set("play name", play.name);
  set("group", play.formation);
  if (play.playType === "pass") set("pass", "Yes");
  if (play.playType === "run") set("run", "Yes");
  if (play.tags.length) set("route", play.tags[0]);
  row.playId = play.id;
  return row;
}

/** Put plays on the end of the source. Returns how many went on (plays already there are skipped). */
export function addPlaysToSource(sourceId: string, plays: StoredPlay[]): number {
  const key = sourceKey(sourceId);
  if (sourceKind(sourceId) === "book") return filePlays(plays.map((p) => p.id), { id: key })?.added ?? 0;
  if (sourceKind(sourceId) === "grid") {
    const sheet = store.get().sheets.find((s) => s.id === key);
    if (!sheet) return 0;
    const have = new Set(sheet.rows.map((r) => r.playId).filter(Boolean));
    const fresh = plays.filter((p) => !have.has(p.id));
    if (!fresh.length) return 0;
    // A sheet starts with blank rows laid out ready to fill: new calls take those first, then more rows follow.
    const numberIds = sheet.columns.filter((c) => c.label.trim() === "#").map((c) => c.id);
    const isBlank = (r: SheetRow) => !r.playId && Object.entries(r.cells).every(([id, v]) => !v || numberIds.includes(id));
    const rows = [...sheet.rows];
    for (const play of fresh) {
      const at = rows.findIndex(isBlank);
      const filled = rowFor(sheet.columns, play, at >= 0 ? at : rows.length);
      if (at < 0) {
        rows.push(filled);
        continue;
      }
      // The blank row keeps its id and its number.
      const number = Object.fromEntries(numberIds.filter((id) => rows[at].cells[id]).map((id) => [id, rows[at].cells[id]]));
      rows[at] = { ...filled, id: rows[at].id, cells: { ...filled.cells, ...number } };
    }
    store.patchSheet(sheet.id, { rows, updatedAt: new Date().toISOString() });
    return fresh.length;
  }
  return 0;
}

/**
 * Take a call off a playbook or Call Sheet source. Null when it isn't there
 * (already gone), else an `undo` that puts it back where it was.
 */
export function removeFromSource(sourceId: string, entry: { playId?: string; rowId?: string }): { undo: () => void } | null {
  const key = sourceKey(sourceId);
  if (sourceKind(sourceId) === "book") {
    const book = store.get().playbooks.find((b) => b.id === key);
    const at = book && entry.playId ? book.playIds.indexOf(entry.playId) : -1;
    if (!book || at < 0 || !entry.playId) return null;
    const playId = entry.playId;
    store.upsertPlaybook({ ...book, playIds: book.playIds.filter((id) => id !== playId) });
    return {
      undo: () => {
        const now = store.get().playbooks.find((b) => b.id === key);
        if (!now || now.playIds.includes(playId)) return;
        const ids = [...now.playIds];
        ids.splice(Math.min(at, ids.length), 0, playId);
        store.upsertPlaybook({ ...now, playIds: ids });
      },
    };
  }
  if (sourceKind(sourceId) === "grid") {
    const sheet = store.get().sheets.find((s) => s.id === key);
    const at = sheet && entry.rowId ? sheet.rows.findIndex((r) => r.id === entry.rowId) : -1;
    if (!sheet || at < 0) return null;
    const row = sheet.rows[at];
    store.patchSheet(sheet.id, { rows: sheet.rows.filter((r) => r.id !== row.id), updatedAt: new Date().toISOString() });
    return {
      undo: () => {
        const now = store.get().sheets.find((s) => s.id === key);
        if (!now || now.rows.some((r) => r.id === row.id)) return;
        const rows = [...now.rows];
        rows.splice(Math.min(at, rows.length), 0, row);
        store.patchSheet(now.id, { rows, updatedAt: new Date().toISOString() });
      },
    };
  }
  return null;
}

/**
 * Put a new drawing on a Vault play (the cut-off fix, and its Undo). The local
 * copy changes first; a signed-in coach's account copy follows, and with no
 * signal the play is marked for the next sync round.
 */
export async function saveScene(play: StoredPlay, scene: Scene, signedIn: boolean): Promise<void> {
  store.upsertPlay({ ...play, scene, updatedAt: new Date().toISOString() });
  if (!signedIn || !play.remote) return;
  try {
    await api.updatePlay(play.id, { scene });
  } catch {
    markUnsynced(play.id); // the local copy is already updated; it goes to the account once the signal is back
  }
}
