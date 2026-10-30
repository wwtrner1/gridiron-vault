import { store, type LocalPlaybook } from "./store";
import { uid } from "./types";
import { gatePlaybook, type Gate, type Tier } from "./plan";

/** Where plays go: a playbook the coach has, or a new one by name. */
export type BookTarget = { id: string } | { name: string };

export type Filed = { book: LocalPlaybook; added: number; created: boolean };

/** The coach's playbook with this name (any case), if there is one. */
export const bookNamed = (name: string) => store.get().playbooks.find((b) => b.name.trim().toLowerCase() === name.trim().toLowerCase());

/** May the coach start one more playbook? A name they already have never needs a new one. */
export function newBookGate(tier: Tier, name: string): Gate {
  if (name.trim() && bookNamed(name)) return { ok: true };
  return gatePlaybook(tier, store.get().playbooks.length);
}

/**
 * Adds plays to the end of a playbook, skipping any already in it, and makes
 * the playbook first when it is new (a name the coach already uses goes into
 * that playbook instead of a twin). Writes through the store, so playbook
 * sync carries it to the account. Returns null for an unknown id or a blank name.
 */
export function filePlays(ids: string[], target: BookTarget): Filed | null {
  const found = "id" in target ? store.get().playbooks.find((b) => b.id === target.id) : bookNamed(target.name);
  if (!found && ("id" in target || !target.name.trim())) return null;
  const book: LocalPlaybook = found ?? {
    id: uid("book"),
    name: "name" in target ? target.name.trim() : "",
    description: "",
    color: "#16C8E8",
    isPublic: false,
    playIds: [],
  };
  const fresh = [...new Set(ids)].filter((id) => !book.playIds.includes(id));
  const next = { ...book, playIds: [...book.playIds, ...fresh] };
  store.upsertPlaybook(next);
  return { book: next, added: fresh.length, created: !found };
}

/** What the coach reads after filing: "3 plays added to Red Zone." */
export function filedMessage({ book, added, created }: Filed): string {
  if (!added) return `${created ? `${book.name} created. ` : ""}Those plays were already in ${book.name}.`;
  const what = `${added} ${added === 1 ? "play" : "plays"}`;
  return created ? `${book.name} created with ${what}.` : `${what} added to ${book.name}.`;
}
