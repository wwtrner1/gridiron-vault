import type { LocalPlaybook, SheetDoc } from "./store";

/**
 * The work tabs (Designer · Playbook · Wristbands · Call Sheet)
 * carry one context between pages: the play and playbook last open in the
 * Designer and the Call Sheet last open. Kept per browser, like the other prefs.
 */
export type WorkContext = { playId: string | null; bookId: string | null; sheetId: string | null };
export type WorkTabId = "designer" | "playbook" | "wristbands" | "sheet";

const KEY = "grid1ronvault.worktabs.v1";
const EMPTY: WorkContext = { playId: null, bookId: null, sheetId: null };

export function loadWork(): WorkContext {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") {
      const str = (v: unknown) => (typeof v === "string" && v ? v : null);
      return { playId: str(raw.playId), bookId: str(raw.bookId), sheetId: str(raw.sheetId) };
    }
  } catch {
    /* storage blocked: the tabs fall back to each page's own default */
  }
  return EMPTY;
}

export function rememberWork(patch: Partial<WorkContext>) {
  const next = { ...loadWork(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the tabs still work for this page */
  }
}

/** The Call Sheet a tab opens: the one last open, else the one with the most calls from this playbook. */
export function sheetFor(ctx: WorkContext, sheets: SheetDoc[], book: LocalPlaybook | undefined): SheetDoc | undefined {
  const last = sheets.find((s) => s.id === ctx.sheetId);
  if (last) return last;
  if (book) {
    const ids = new Set(book.playIds);
    const scored = sheets
      .map((s) => ({ s, n: s.rows.filter((r) => r.playId && ids.has(r.playId)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    if (scored.length) return scored[0].s;
  }
  return sheets[0];
}

export type WorkTab = { id: WorkTabId; label: string; href: string; hint: string };

/** Where each tab goes, keeping the playbook (and play) the coach is working on. */
export function workTabs(ctx: WorkContext, books: LocalPlaybook[], sheets: SheetDoc[], playIds: Set<string>): WorkTab[] {
  const book = books.find((b) => b.id === ctx.bookId);
  const sheet = sheetFor(ctx, sheets, book);
  const bookQ = book ? `?book=${encodeURIComponent(book.id)}` : "";
  const play = ctx.playId && playIds.has(ctx.playId) ? ctx.playId : null;
  return [
    {
      id: "designer",
      label: "Designer",
      href: play ? `/build/${play}${bookQ}` : `/build${bookQ}`,
      hint: play ? "Back to the play you were drawing." : "Draw a play.",
    },
    {
      id: "playbook",
      label: "Playbook",
      href: `/playbooks${bookQ}`,
      hint: book ? `Opens ${book.name}: order, add and print its plays.` : "Your playbooks: group plays the way you install them.",
    },
    {
      id: "wristbands",
      label: "Wristbands",
      href: book ? `/wristbands?source=${encodeURIComponent(`book:${book.id}`)}` : "/wristbands",
      hint: book ? `Wristband cards for ${book.name}.` : "Print wristband cards from a playbook or Call Sheet.",
    },
    {
      id: "sheet",
      label: "Call Sheet",
      href: sheet ? `/grid?sheet=${encodeURIComponent(sheet.id)}` : "/grid",
      hint: sheet ? `Opens ${sheet.name}.` : "Plan the game: calls by down, distance and hash.",
    },
  ];
}
