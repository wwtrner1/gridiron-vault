/**
 * Which screens' "?" help the coach has opened (the dot shows until then).
 * Kept apart from lib/guides.ts so the help button can read it without
 * loading every guide's text up front.
 */

const KEY = "grid1ronvault.guides.v1";

export function guidesSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markGuideSeen(id: string) {
  try {
    const seen = guidesSeen();
    if (!seen.includes(id)) localStorage.setItem(KEY, JSON.stringify([...seen, id]));
  } catch {
    /* storage blocked: the ? keeps its dot */
  }
}
