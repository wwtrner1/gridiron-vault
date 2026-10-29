import type { PlayMeta, Scene } from "./types";

/**
 * The Designer's unsaved changes, kept a moment after each edit so a closed
 * tab, a dead phone battery or a crash doesn't throw away a play the coach
 * hadn't saved yet. One draft per browser: the play it belongs to (or `null`
 * for a new play), its details and its drawing. Saving or discarding clears it.
 */
export type DesignerDraft = { playId: string | null; meta: PlayMeta; scene: Scene; at: string };

const KEY = "grid1ronvault.draft.v1";

export function loadDraft(): DesignerDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as DesignerDraft | null;
    return d && d.scene && Array.isArray(d.scene.nodes) && d.meta && typeof d.at === "string" ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: DesignerDraft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage full or blocked: the play still saves the normal way */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The draft to offer for this play, if it is newer than what's saved. */
export function draftFor(playId: string | null, savedAt?: string): DesignerDraft | null {
  const d = loadDraft();
  if (!d || d.playId !== playId) return null;
  if (savedAt && new Date(d.at) <= new Date(savedAt)) return null;
  return d.scene.nodes.length || d.meta.name ? d : null;
}
