import type { HubPlayer } from "./teamHub";

/**
 * Text the team (My team → Text the team): the coach writes one message, picks
 * who it is for, and sends it from their own phone in groups. Pure helpers
 * here so the page and its test use the same rules; the page is
 * `pages/TextTeam.tsx`.
 */

/** Groups of 8 keep group texts reliable across mixed iPhone and Android phones. */
export const GROUP_SIZE = 8;
/** One text, signature included. */
export const TEXT_MAX = 300;

export type Audience = "all" | "families" | "players";
export type TextContact = { label: string; phone: string };

export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "families", label: "Parents & guardians" },
  { id: "players", label: "Players" },
];

/** Starters with the facts left in [brackets] for the coach to fill in; a text can't go out while one is open. */
export const TEMPLATES: { id: string; label: string; body: string }[] = [
  { id: "moved", label: "Practice moved", body: "Practice moved to [TIME] [DAY] at [PLACE]. Bring water and both jerseys." },
  { id: "game", label: "Game day", body: "Game day [DAY]: arrive [TIME], kickoff [TIME] at [PLACE]. [JERSEY COLOR] jerseys." },
  { id: "weather", label: "Weather call", body: "Lightning in the area. [PRACTICE OR GAME] is canceled. Stay safe, see you [DAY]." },
  { id: "blank", label: "Blank", body: "" },
];

/** True while a template's [FILL IN] is still in the text. */
export const hasPlaceholder = (body: string) => /\[[^\]]+\]/.test(body);

const digits = (phone: string) => phone.replace(/\D/g, "");

/**
 * The numbers a coach may text: only ones marked OK to text on the roster
 * (the same rule as the Front Office's Messages), once each, for the
 * audience picked. Inactive players are skipped.
 */
export function textContacts(players: HubPlayer[], audience: Audience): TextContact[] {
  const seen = new Set<string>();
  const out: TextContact[] = [];
  const add = (phone: string, label: string) => {
    const key = digits(phone);
    if (key.length < 7 || seen.has(key)) return;
    seen.add(key);
    out.push({ label, phone: phone.replace(/[^\d+]/g, "") });
  };
  for (const p of players) {
    if (p.status === "inactive") continue;
    const first = p.firstName || "Player";
    if (audience !== "players") for (const g of p.guardians) if (g.text && g.phone) add(g.phone, `${first}'s ${g.relation.trim().toLowerCase() || "guardian"}`);
    if (audience !== "families" && p.text && p.phone) add(p.phone, first);
  }
  return out;
}

/** Sequential groups, so 23 contacts are 8, 8 and 7. */
export function inGroups<T>(list: T[], size = GROUP_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Opens the phone's Messages app with the numbers and text filled in (`?&body=` works on iPhone and Android). */
export const smsHref = (phones: string[], body: string) => `sms:${phones.join(",")}?&body=${encodeURIComponent(body)}`;

/** What goes out: the coach's words and their name. */
export const signed = (body: string, who: string) => `${body.trim()} — ${who}`;

/* -------------------------------------------------------------- History --- */

export type SentText = { id: string; at: string; body: string; contacts: number; groups: number };

const KEY = "grid1ronvault.texts.v1";
const KEEP = 20;

export function loadTexts(): SentText[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((t): t is SentText => !!t && typeof t === "object" && typeof (t as SentText).body === "string" && typeof (t as SentText).at === "string")
      .slice(0, KEEP);
  } catch {
    return [];
  }
}

/** Newest first, this browser only. Returns the saved entry, or null when the browser refuses the write. */
export function logText(entry: Omit<SentText, "id" | "at">): SentText | null {
  const saved: SentText = { ...entry, id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify([saved, ...loadTexts()].slice(0, KEEP)));
    return saved;
  } catch {
    return null;
  }
}
