import type { LocalPlaybook } from "./store";

/**
 * Copies of a playbook left by the old sync (the same name more than once).
 * Pure, so the tree's "Tidy up" and its test agree.
 *
 * In each group of playbooks with the same name, the one with the most plays
 * stays (the first listed on a tie). Another copy goes only when it holds
 * nothing the kept one doesn't: no plays, or only plays the kept one already
 * has. A copy with plays of its own is never touched, so tidying can't lose a
 * coach's filing; and plays are never deleted, only the extra folder.
 */
export type Dupes = {
  /** Copies safe to remove. */
  remove: LocalPlaybook[];
  /** Same-name copies left alone because they hold plays the kept one doesn't. */
  differ: number;
};

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export function findDuplicateBooks(books: LocalPlaybook[]): Dupes {
  const groups = new Map<string, LocalPlaybook[]>();
  for (const b of books) {
    const k = key(b.name);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const remove: LocalPlaybook[] = [];
  let differ = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.reduce((best, b) => (b.playIds.length > best.playIds.length ? b : best), group[0]);
    const kept = new Set(keep.playIds);
    for (const b of group) {
      if (b === keep) continue;
      if (b.playIds.every((p) => kept.has(p))) remove.push(b);
      else differ++;
    }
  }
  return { remove, differ };
}
