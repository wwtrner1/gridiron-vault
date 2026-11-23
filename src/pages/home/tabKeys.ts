import type { KeyboardEvent } from "react";

/**
 * Arrow keys, Home and End move through a row or column of tabs (the WAI-ARIA tabs pattern).
 * Returns the tab to select, or null when the key isn't one of those.
 */
export function tabKey(e: KeyboardEvent, index: number, count: number): number | null {
  let next: number | null = null;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % count;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + count) % count;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = count - 1;
  if (next !== null) e.preventDefault();
  return next;
}
