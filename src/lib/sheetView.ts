import { useCallback, useEffect, useState } from "react";

/**
 * How a coach has folded up a Call Sheet: which columns and rows are minimized,
 * whether the table is compact, and what the filter box says. It is a view, not
 * part of the sheet, so it stays in this browser (per sheet) and never syncs.
 */
export type SheetView = { cols: string[]; rows: string[]; compact: boolean; hideEmpty: boolean };

const KEY = "grid1ronvault.sheetview.v1";
const EMPTY: SheetView = { cols: [], rows: [], compact: false, hideEmpty: false };

function readAll(): Record<string, SheetView> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, SheetView>;
  } catch {
    return {};
  }
}

export function useSheetView(sheetId: string | undefined) {
  const [view, setView] = useState<SheetView>(EMPTY);

  useEffect(() => {
    const saved = sheetId ? readAll()[sheetId] : undefined;
    setView({ ...EMPTY, ...saved });
  }, [sheetId]);

  const change = useCallback(
    (patch: Partial<SheetView> | ((v: SheetView) => Partial<SheetView>)) => {
      setView((current) => {
        const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
        if (sheetId) {
          try {
            localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [sheetId]: next }));
          } catch {
            /* private mode: the fold-up lasts until the page closes */
          }
        }
        return next;
      });
    },
    [sheetId],
  );

  const toggle = (list: "cols" | "rows", id: string) =>
    change((v) => ({ [list]: v[list].includes(id) ? v[list].filter((x) => x !== id) : [...v[list], id] }));

  return { view, change, toggle };
}
