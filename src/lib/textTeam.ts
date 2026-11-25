import type { TierId } from "./plan";
import type { HubPlayer, TextSignup } from "./teamHub";

/**
 * Text the team (My team → Text the team): the coach writes one message, picks
 * who it is for, and sends it. With texting from GridIronVault switched on
 * (`TEAM_SMS`, netlify/front-office/send.ts) and the coach signed in, one tap
 * sends it from GridIronVault's number to every family that signed up on the
 * team's link, and each recipient's status comes back. Otherwise the coach
 * sends it from their own phone in groups. Pure helpers here so the page, the
 * server (netlify/front-office/myTeamTexts.ts) and the tests use the same
 * rules; the page is `pages/TextTeam.tsx`.
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

/**
 * A template's fill-ins, exactly as the templates write them ([TIME], [JERSEY COLOR]). Only these hold a send back:
 * a coach who types over the word and leaves the brackets ("[5pm]") has filled it in.
 */
const FILL_INS = new Set(TEMPLATES.flatMap((t) => t.body.match(/\[[^\]]+\]/g) ?? []));

/** The fill-ins still open, once each, for the warning under the message. */
export const openPlaceholders = (body: string) => [...new Set((body.match(/\[[^\]]+\]/g) ?? []).filter((b) => FILL_INS.has(b)))];

/** True while a template's [FILL IN] is still in the text. */
export const hasPlaceholder = (body: string) => openPlaceholders(body).length > 0;

/** What goes out: brackets the coach typed around a filled-in value come off, so "[5pm]" reads "5pm". */
export const tidy = (body: string) => body.replace(/\[([^\]]*)\]/g, (all, inner: string) => (FILL_INS.has(all) ? all : inner)).trim();

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
export const signed = (body: string, who: string) => `${tidy(body)} — ${who}`;

/** The name a text is signed with: the coach's account name, or "<team> coaches" when the account only has an email. */
export const signer = (accountName: string | undefined | null, teamName: string) =>
  accountName && !accountName.includes("@") ? accountName.trim() : `${teamName.trim() || "My team"} coaches`;

/* ------------------------------------------- Texting from GridIronVault --- */

/**
 * Who a one-tap send reaches, from the people who signed up on the team's link. The sign-up page asks for the
 * player's name and says to leave it blank when the one signing up is the player, so a blank player means a player.
 */
export function signupsFor(list: TextSignup[], audience: Audience): TextSignup[] {
  if (audience === "families") return list.filter((s) => s.player.trim());
  if (audience === "players") return list.filter((s) => !s.player.trim());
  return list;
}

/** Twilio's message states, plus "stopped" (the number replied STOP, so it came off the list) and "error" (never reached Twilio). */
export type TextStatus = "queued" | "accepted" | "scheduled" | "sending" | "sent" | "delivered" | "read" | "undelivered" | "failed" | "stopped" | "error";

export type TeamTextRecipient = { name: string; player: string; phone: string; sid: string; status: TextStatus; code: number | null };
export type TeamText = { id: string; at: string; body: string; recipients: TeamTextRecipient[] };

/** States Twilio can still move on from; the page asks again while any recipient sits in one. */
export const PENDING: TextStatus[] = ["queued", "accepted", "scheduled", "sending"];
/** States that will never change: the server stops asking Twilio about these. */
export const SETTLED: TextStatus[] = ["delivered", "read", "undelivered", "failed", "stopped", "error"];

export type Outcome = "sending" | "sent" | "delivered" | "failed";

/** One word per recipient for the coach. "Sent" is a carrier that took it without reporting delivery yet. */
export function outcome(status: TextStatus): Outcome {
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "sent") return "sent";
  if (PENDING.includes(status)) return "sending";
  return "failed";
}

/** Why a text didn't arrive, in a coach's words (Twilio error codes; anything else gets the general line). */
export function failReason(status: TextStatus, code: number | null): string {
  if (status === "stopped" || code === 21610) return "Replied STOP, so they're off the list";
  switch (code) {
    case 30034:
    case 30032:
      return "GridIronVault's texting number isn't approved by the carriers yet";
    case 30005:
    case 21211:
    case 21614:
      return "Not a working mobile number";
    case 30006:
      return "That number is a landline";
    case 30003:
      return "Phone was off or out of service";
    case 30004:
      return "Their carrier blocked it";
    case 30007:
      return "Their carrier filtered it as spam";
    case 21608:
      return "GridIronVault's Twilio account can't text this number yet";
    case 20003:
      return "GridIronVault's texting service turned the send away";
    default:
      return status === "error" ? "Couldn't reach the texting service" : "Not delivered";
  }
}

/** Counts for the result screen and the history: every recipient lands in exactly one bucket. */
export function tally(recipients: TeamTextRecipient[]): Record<Outcome, number> {
  const out: Record<Outcome, number> = { sending: 0, sent: 0, delivered: 0, failed: 0 };
  for (const r of recipients) out[outcome(r.status)]++;
  return out;
}

/**
 * The plans that can text the team at all (one tap, the sign-up link, Sent texts, and the phone groups while one-tap
 * sending is switched off). Wes 2026-11-25: "Free sideline shouldn't benefit from this feature" and "Free users do
 * not have access for texting. They need to upgrade to use those services." So every plan but Sideline, the Head
 * Coach trial included; Sideline and signed-out visitors see an upgrade prompt instead.
 */
export const TEAM_TEXT_PLANS: TierId[] = ["solo", "crew", "program", "trial", "beta", "master"];
export const teamTextsOn = (tier: TierId) => TEAM_TEXT_PLANS.includes(tier);
/** What a Sideline coach reads, from the server and on the page. */
export const TEAM_TEXTS_LOCKED = "Texting your team comes with Head Coach and up. Upgrade to text every family in one tap.";

/** Most texts a coach can send from GridIronVault's number in a day, counting every recipient. */
export const TEAM_TEXTS_PER_DAY = 300;

/* -------------------------------------------------------------- History --- */

/** A text the coach opened in their own Messages app. The site can't see whether they pressed send, so it records "opened". */
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
