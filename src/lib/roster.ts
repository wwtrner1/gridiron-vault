/**
 * The team roster: which player wears which letter. Kept in this browser so
 * position sheets print with the player's name on them. Letters are the
 * playbook's own (X, Y, Z, H, S...), so one roster serves every playbook.
 */
export type Slot = { name: string; number: string };
export type Roster = Record<string, Slot>;

const KEY = "grid1ronvault.roster.v1";

export function loadRoster(): Roster {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Roster;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function saveRoster(roster: Roster) {
  try {
    localStorage.setItem(KEY, JSON.stringify(roster));
  } catch {
    /* storage blocked: the names still hold this visit */
  }
}

/** "Marcus #12" for a letter, or "" when nobody is named. */
export function who(roster: Roster, letter: string): string {
  const s = roster[letter];
  if (!s) return "";
  return [s.name.trim(), s.number.trim() ? `#${s.number.trim()}` : ""].filter(Boolean).join(" ");
}
